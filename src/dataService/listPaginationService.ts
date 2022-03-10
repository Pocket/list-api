import { Knex } from 'knex';
import { IContext } from '../server/context';
import {
  SavedItemStatus,
  SavedItem,
  SavedItemsFilter,
  SavedItemsSort,
  SavedItemsContentType,
  Pagination,
  SavedItemConnection,
} from '../types';
import { cleanAndValidateTag, mysqlTimeString } from './utils';
import config from '../config';
import { PaginationInput } from '@pocket-tools/apollo-utils';
import { UserInputError } from 'apollo-server-express';

interface ListEntity {
  user_id?: number;
  item_id?: number;
  resolved_id?: number;
  given_url?: string;
  title?: string;
  time_added?: number;
  time_updated?: number;
  time_read?: number;
  time_favorited?: number;
  status?: number;
  favorite?: boolean;
}

const statusMap = {
  [SavedItemStatus.UNREAD]: 'UNREAD',
  [SavedItemStatus.ARCHIVED]: 'ARCHIVED',
  [SavedItemStatus.DELETED]: 'DELETED',
  [SavedItemStatus.HIDDEN]: 'HIDDEN',
};

const sortMap = {
  CREATED_AT: '_createdAt',
  ARCHIVED_AT: '_archivedAt',
  FAVORITED_AT: 'favoritedAt',
  UPDATED_AT: '_updatedAt',
};

type SavedItemResult = Omit<SavedItem, 'item' | 'tags'>;

class Sort {
  public readonly order;
  public readonly column;
  constructor(sort: SavedItemsSort) {
    this.order = sort?.sortOrder.toLowerCase() ?? 'desc';
    this.column = sort?.sortBy ?? 'CREATED_AT';
  }
  get opposite() {
    return this.order === 'desc' ? 'asc' : 'desc';
  }
}

/**
 * A read-only data service for retrieving `SavedItems`
 * in a User's list, optionally with filters/sort/pagination.
 * This duplicates some behavior from `SavedItemsDataService`,
 * and is separated simply for clarity, since this is a significant
 * refactor. This is *just* for fetching paginated items.
 * All this is going to go away when we migrate away from the legacy
 * data storage anyway.
 */
export class ListPaginationService {
  private tempTable = 'temp_getlist_clientapi';
  private highlightsTempTable = 'temp_getlist_clientapi_hl';
  private tagsTempTable = 'temp_getlist_clientapi_tags';

  // Mutable state store for which temp tables were created,
  // so they can be dropped
  // Use this.createTempTable to automatically push to this
  private tablesCreated = [];

  public sortMap = {
    CREATED_AT: 'time_added',
    UPDATED_AT: 'time_updated',
    FAVORITED_AT: 'time_favorited',
    ARCHIVED_AT: 'time_read',
  };

  constructor(private readonly context: IContext) {}

  /**
   * Transformer from DB result to GraphQL Schema
   * @param entity ListEntity
   */
  private static toGraphql(entity: ListEntity[]): SavedItemResult[];
  private static toGraphql(entity: ListEntity): SavedItemResult;
  private static toGraphql(
    entity: ListEntity | ListEntity[]
  ): SavedItemResult | SavedItemResult[] {
    if (Array.isArray(entity)) {
      return entity.map((row) => ListPaginationService._toGraphql(row));
    } else {
      return ListPaginationService._toGraphql(entity);
    }
  }
  private static _toGraphql(
    entity: ListEntity
  ): Omit<SavedItem, 'item' | 'tags'> {
    return {
      url: entity.given_url,
      id: entity.item_id.toString(),
      resolvedId: entity.resolved_id.toString(),
      isFavorite: entity.favorite,
      favoritedAt: entity.time_favorited > 0 ? entity.time_favorited : null,
      status: statusMap[entity.status],
      isArchived: entity.status === SavedItemStatus.ARCHIVED ? true : false,
      archivedAt: entity.time_read > 0 ? entity.time_read : null,
      _createdAt: entity.time_added,
      _updatedAt: entity.time_updated,
      _deletedAt:
        entity.status === SavedItemStatus.DELETED ? entity.time_updated : null,
    };
  }

  /**
   * Utility method to create the list temp table within a transaction
   * @param trx Open transaction object
   * @returns Knex.Raw -- await this to create the table within a transaction
   */
  private listTempTableQuery = (trx: Knex.Transaction): Knex.Raw =>
    trx.raw(
      `CREATE TEMPORARY TABLE \`${this.tempTable}\` ` +
        '(' +
        '`seq` int NOT NULL AUTO_INCREMENT PRIMARY KEY, ' +
        '`item_id` int(10) unsigned NOT NULL, ' +
        '`resolved_id` int(10) unsigned NOT NULL, ' +
        /*
         * Setting VARCHAR length for given_url to 5,000. This is a hack to get it
         * reasonably high to prevent url from getting truncated since the
         * corresponding column in the db has a TEXT data type, and mysql
         * temporary tables do not support BLOB/TEXT
         */
        '`given_url` varchar(5000) COLLATE utf8_unicode_ci NOT NULL, ' +
        '`given_title` varchar(75) COLLATE utf8_unicode_ci NOT NULL, ' +
        '`favorite` tinyint(3) unsigned NOT NULL, ' +
        '`status` tinyint(3) unsigned NOT NULL, ' +
        '`time_added` int(10), ' +
        '`time_updated` int(10), ' +
        '`time_read` int(10), ' +
        '`time_favorited` int(10) ' +
        ') ENGINE = MEMORY'
    );

  /**
   * Utility method to create the highlights temp table within a transaction
   * @param trx Open transaction object
   * @returns Knex.Raw -- await this to create the table within a transaction
   */
  private hlTempTableQuery = (trx) =>
    trx.raw(
      `CREATE TEMPORARY TABLE \`${this.highlightsTempTable}\` ` +
        '(' +
        '`item_id` int(10) unsigned NOT NULL PRIMARY KEY' +
        ') ENGINE = MEMORY'
    );

  /**
   * Utility method to create the tags temp table within a transaction
   * @param trx Open transaction object
   * @returns Knex.Raw -- await this to create the table within a transaction
   */
  private tagsTempQuery = (trx) =>
    trx.raw(
      `CREATE TEMPORARY TABLE \`${this.tagsTempTable}\` ` +
        '(' +
        '`item_id` int(10) unsigned NOT NULL PRIMARY KEY' +
        ') ENGINE = MEMORY'
    );

  /**
   * Wrapper for creating temp tables; call this to make sure that the temp
   * tables created are pushed into the the instance value for `tablesCreated`,
   * so they can be cleaned up before the transaction exits.
   * @param trx Open transaction object
   * @param tableName the name of the temp table created
   */
  private async createTempTable(trx: any, tableName: string): Promise<any> {
    this.tablesCreated.push(tableName);
    const res = await trx;
    return res;
  }
  /**
   * Returns a promise to clean up all temp tables created using `this.createTempTable`
   * within a transaction
   * @param trx Open transaction object
   * @returns Promise to delete all tables created; await this to perform deletion
   */
  private dropTempTables(trx: Knex.Transaction): any {
    return Promise.all(
      this.tablesCreated.map((tableName) =>
        trx.raw(`DROP TEMPORARY TABLE \`${tableName}\``)
      )
    );
  }
  /**
   * Private function to determine which pagination methods to call, and set up
   * some shared temp table logic.
   */
  private async paginatedResult(
    query: Knex.QueryBuilder,
    trx: Knex.Transaction,
    pagination: PaginationInput,
    sort: SavedItemsSort
  ) {
    const queryBuilder = query.select(
      'list.item_id',
      'list.resolved_id',
      'list.given_url',
      'list.title',
      'list.favorite',
      'list.status',
      trx.raw('UNIX_TIMESTAMP(list.time_added) as time_added'),
      trx.raw('UNIX_TIMESTAMP(list.time_updated) AS time_updated'),
      trx.raw('UNIX_TIMESTAMP(list.time_read) AS time_read'),
      trx.raw('UNIX_TIMESTAMP(list.time_favorited) AS time_favorited')
    );
    // needs to be same order as above
    const insertStatement = `INSERT INTO \`${this.tempTable}\` (item_id, resolved_id, given_url, given_title, favorite, status, time_added, time_updated, time_read, time_favorited) `;
    const cursor = pagination.after ?? pagination.before ?? null;
    if (cursor) {
      return this.pageAfterorBefore(
        trx,
        queryBuilder,
        insertStatement,
        cursor,
        pagination,
        sort
      );
    } else {
      return this.pageFirstLast(
        trx,
        queryBuilder,
        insertStatement,
        sort,
        pagination
      );
    }
  }

  /**
   * Handle first/last pagination.
   */
  private async pageFirstLast(
    trx: Knex.Transaction,
    query: Knex.QueryBuilder,
    insertStatement: string,
    sort: SavedItemsSort,
    pagination: PaginationInput
  ) {
    const pageSize = pagination.first ?? pagination.last;
    const sortOrder = new Sort(sort);
    let order;
    if (pagination.first) {
      order = sortOrder.order;
    } else {
      order = sortOrder.opposite;
    }
    const sortColumn = this.sortMap[sortOrder.column];
    const queryString = query
      .clone()
      .orderBy([
        { column: `list.${sortColumn}`, order: order },
        { column: 'list.item_id' },
      ])
      .limit(pageSize + 1)
      .toString();
    await trx.raw(`${insertStatement} ${queryString}`);
    const returnQuery = trx(this.tempTable).select();
    if (pagination.last) {
      // Need to reorder for last
      returnQuery.orderBy([
        { column: `${sortColumn}`, order: sortOrder.order },
        { column: 'item_id' },
      ]);
    }
    return await returnQuery;
  }

  /**
   * Handle before/after pagination.
   * If the provided cursor does not exist, throws UserInputError.
   */
  private async pageAfterorBefore(
    trx: Knex.Transaction,
    baseQuery: Knex.QueryBuilder,
    insertStatement: string,
    cursor: string,
    pagination: PaginationInput,
    sort: SavedItemsSort
  ) {
    const pageSize = pagination.first ?? pagination.last;
    // Since we don't have a unique sequential column for cursor-based pagination
    // We have to get the old cursor element + any colliding keys
    // Set a high (default of 5000 from the web repo) on this, but hopefully
    // collisions on timestamp fields are unusual enough that it will be much
    // less in practice
    const [itemId, timeStr] = this.decodeCursor(cursor);
    const timeCursor = timeStr
      ? mysqlTimeString(new Date(parseInt(timeStr) * 1000), config.database.tz)
      : null;
    // The trick to before pagination is to do after pagination with opposite sort
    // then reverse the ordering before returning result
    const sortOrder = new Sort(sort);
    let order;
    if (pagination.first) {
      order = sortOrder.order;
    } else {
      order = sortOrder.opposite;
    }
    const sortColumn = this.sortMap[sortOrder.column];
    // Add the sort to the filter query
    baseQuery.orderBy([
      { column: `list.${sortColumn}`, order: order },
      { column: 'list.item_id' },
    ]);
    // Get the old cursor element + any colliding keys
    const initialCursorQuery = baseQuery
      .clone()
      .andWhere(sortColumn, timeCursor)
      .limit(5000)
      .toString();
    await trx.raw(`${insertStatement} ${initialCursorQuery}`);
    // Get location (index) of previous cursor
    const prevCursorSeq = (
      await trx(this.tempTable).where('item_id', itemId).pluck('seq')
    )[0];
    // Remove anything prior and up to the cursor (inclusive)
    // Note that the reverse ordering from 'before' pagination
    // means that we don't have to change the direction of our removal
    if (prevCursorSeq == null) {
      throw new UserInputError('Cursor not found.');
    }
    await trx(this.tempTable).where('seq', '<=', prevCursorSeq).del();
    // Compute how many we have in the table; if there are a lot of
    // collisions we may not even need to fetch more
    const currCount = (await trx(this.tempTable)
      .count('* as count')
      .first()
      .then((_) => _?.count ?? 0)) as number;
    const limit = pageSize + 1 - currCount;
    if (limit > 0) {
      // Now we insert more with a limit
      // If the timestamp is sorted by descending, the 'next' page is < time cursor
      // If the timestamp is sorted by ascending, the 'next' page is > time cursor
      const restOfQuery = baseQuery
        .clone()
        .andWhere(sortColumn, order === 'desc' ? '<' : '>', timeCursor)
        .limit(limit)
        .toString();
      await trx.raw(`${insertStatement} ${restOfQuery}`);
    }
    const returnQuery = trx(this.tempTable)
      .select()
      .limit(pageSize + 1);
    if (pagination.last) {
      returnQuery.orderBy([
        { column: sortColumn, order: sortOrder.order },
        { column: 'item_id' },
      ]);
    }
    return await returnQuery;
  }

  /**
   * Decode the pagination cursor
   * @param cursor cursor (_*_ separated string of itemId and cursor value)
   * @returns [itemId, cursorValue]
   */
  private decodeCursor(cursor: string) {
    const [id, val] = Buffer.from(cursor, 'base64')
      .toString('utf8')
      .split('_*_');
    return [id, val === 'null' || val === 'undefined' ? null : val];
  }
  /**
   * Encode the pagination cursor
   * @param itemId The itemId
   * @param epoch The value of the timestamp field used for cursor, in seconds since epoch,
   * or null/undefined if the value is null in the database (bad cursor!)
   * @returns
   */
  private encodeCursor(itemId: number | string, epoch: number | null) {
    return Buffer.from(`${itemId}_*_${epoch}`).toString('base64');
  }

  /**
   * Build a filter query. If filtering by highlights or tags, will create
   * temporary tables as a side effect, which is why this needs to be awaited.
   */
  private async buildFilterQuery(
    baseQuery: any,
    trx: Knex.Transaction,
    filter: SavedItemsFilter
  ): Promise<any> {
    // The base query will always have a 'where' statement selecting
    // the user ID, so use andWhere for all additional methods
    if (filter.updatedSince != null) {
      baseQuery.andWhere(
        'time_updated',
        '>',
        mysqlTimeString(
          new Date(filter.updatedSince * 1000),
          config.database.tz
        )
      );
    }
    if (filter.isFavorite != null) {
      baseQuery.andWhere('favorite', +filter.isFavorite);
    }
    if (filter.isArchived != null) {
      if (filter.isArchived) {
        baseQuery.andWhere('status', 1);
      } else {
        baseQuery.andWhere('status', '!=', 1);
      }
    }
    if (filter.status != null) {
      baseQuery.andWhere('status', SavedItemStatus[filter.status]);
    }
    if (filter.states != null) {
      const states = filter.states.map((state) => SavedItemStatus[state]);
      baseQuery.andWhere((builder) => {
        builder.whereIn('status', states);
      });
    }
    if (filter.isHighlighted != null) {
      await this.isHighlightedFilter(baseQuery, trx, filter.isHighlighted);
    }
    if (filter.contentType != null) {
      this.contentTypeFilter(baseQuery, filter.contentType);
    }
    // Tags has to go last due to select distinct
    if (filter.tagNames != null && filter.tagNames.length > 0) {
      const cleanTags = filter.tagNames.map(cleanAndValidateTag);
      await this.tagNameFilter(baseQuery, trx, cleanTags);
    }
  }

  /**
   * Filter by highlighted/not highlighted. Creates a temporary table as
   * a side effect to optimize join.
   */
  private async isHighlightedFilter(
    baseQuery: Knex,
    trx: Knex.Transaction,
    isHighlighted: boolean
  ) {
    // Don't want to do aggregate functions inside our pagination query,
    // So use a temp table and simplify so it's just a join
    await this.createTempTable(
      this.hlTempTableQuery(trx),
      this.highlightsTempTable
    );
    const insertStatement = `INSERT INTO \`${this.highlightsTempTable}\` (item_id) `;
    const highlightsQuery = trx('user_annotations')
      .select(trx.raw(`distinct item_id as item_id`))
      .where('user_id', this.context.userId)
      .andWhere('status', 1)
      .toString();
    await trx.raw(`${insertStatement} ${highlightsQuery}`);
    if (isHighlighted) {
      baseQuery.innerJoin(
        this.highlightsTempTable,
        'list.item_id',
        `${this.highlightsTempTable}.item_id`
      );
    } else {
      baseQuery
        .leftJoin(
          this.highlightsTempTable,
          'list.item_id',
          `${this.highlightsTempTable}.item_id`
        )
        .andWhere(trx.raw(`${this.highlightsTempTable}.item_id is null`));
    }
  }
  /**
   * Filter by specific tags, untagged items, or a combination of these.
   * Creates a temporary table as a side effect to optimize join.
   */
  private async tagNameFilter(
    baseQuery: Knex.QueryBuilder,
    trx: Knex.Transaction,
    tagNames: string[]
  ) {
    if (tagNames.length === 0) {
      return baseQuery;
    }
    // Can't do a straight inner join since we may have "untagged" items
    // that we need to find
    const untaggedIndex = tagNames.indexOf('_untagged_');
    await this.createTempTable(this.tagsTempQuery(trx), this.tagsTempTable);
    const insertStatement = `INSERT INTO \`${this.tagsTempTable}\` (item_id) `;
    const tagsSubQuery = trx('item_tags')
      .select('tag', 'item_id', 'user_id')
      .where('user_id', this.context.userId);
    const listTags = baseQuery
      .clone()
      .leftJoin(tagsSubQuery.as('t'), {
        'list.item_id': 't.item_id',
        'list.user_id': 't.user_id',
      })
      .select('t.tag', 'list.item_id');
    if (untaggedIndex > -1) {
      tagNames.splice(untaggedIndex, 1);
      if (tagNames.length) {
        listTags.andWhere((builder) => {
          // untagged items plus an item with specific tag(s)
          builder.andWhere('tag', 'in', tagNames).orWhereNull('tag');
        });
      } else {
        // untagged items only
        listTags.whereNull('tag');
      }
    } else {
      // specific tagged items
      listTags.andWhere('tag', 'in', tagNames);
    }
    const insertQuery = trx
      .select(trx.raw(`distinct lt.item_id as item_id`))
      .from(listTags.as('lt'))
      .toString();
    await trx.raw(`${insertStatement} ${insertQuery}`);
    baseQuery.join(
      this.tagsTempTable,
      'list.item_id',
      `${this.tagsTempTable}.item_id`
    );
  }

  /**
   * Add content type filter via cross-db join to base query.
   */
  private contentTypeFilter(
    baseQuery: Knex,
    contentType: SavedItemsContentType
  ): Knex {
    baseQuery.join(
      `readitla_b.items_extended`,
      'list.resolved_id',
      'readitla_b.items_extended.extended_item_id'
    );
    if (contentType == 'VIDEO') {
      baseQuery.where('readitla_b.items_extended.video', 1);
    } else {
      baseQuery.where('readitla_b.items_extended.is_article', 1);
    }
    return baseQuery;
  }

  /**
   * Get a page of SavedItems
   * @param filter filter rules for SavedItems
   * @param sort how the SavedItems should be sorted;
   * this has pagination implications
   * @param pagination how the SavedItems should be paginated
   * @param savedItemIds optionally, provide a list of savedItem IDs
   * to limit the responses to. Used when resolving SavedItems on tags,
   * since there may be many SavedItems associated to a single tag.
   * @returns Promise<SavedItemConnection>
   */
  public async getSavedItems(
    filter: SavedItemsFilter,
    sort: SavedItemsSort,
    pagination: Pagination,
    savedItemIds?: string[]
  ): Promise<SavedItemConnection> {
    if (pagination == null) {
      pagination = { first: config.pagination.defaultPageSize };
    }
    const { totalCount, pageResult } =
      await this.context.db.readClient.transaction(async (trx) => {
        await this.createTempTable(
          this.listTempTableQuery(trx),
          this.tempTable
        );
        const baseQuery = trx('list').where(
          'list.user_id',
          this.context.userId
        );
        if (savedItemIds?.length) {
          baseQuery.whereIn('list.item_id', savedItemIds);
        }
        if (filter != null) {
          await this.buildFilterQuery(baseQuery, trx, filter);
        }
        const totalCount = (await trx
          .count('* as count')
          .from(baseQuery.clone().select('list.*').limit(5000).as('countQuery'))
          .first()
          .then((_) => _?.count ?? 0)) as number;
        const pageResult = await this.paginatedResult(
          baseQuery as any,
          trx,
          pagination,
          sort
        );
        await this.dropTempTables(trx);
        return { totalCount, pageResult };
      });
    const pageInfo: any = this.hydratePageInfo(pageResult, pagination);
    let nodes: SavedItemResult[];
    if (pagination.first) {
      nodes = ListPaginationService.toGraphql(
        pageResult
          // strip off sentinel row; this can be unconditional
          .slice(0, pagination.first)
      );
    } else {
      // conditionally strip off sentinel row if it exists (hasPreviousPage)
      const startIx = pageInfo.hasPreviousPage ? 1 : 0;
      nodes = ListPaginationService.toGraphql(
        pageResult.slice(startIx, pagination.last + startIx)
      );
    }
    const sortColumn = sortMap[sort?.sortBy ?? 'CREATED_AT'];
    const edges = nodes.map((node) => {
      return {
        node: node as SavedItem,
        cursor: this.encodeCursor(node.id, node[sortColumn]),
      };
    });
    if (edges.length) {
      pageInfo['startCursor'] = edges[0].cursor;
      pageInfo['endCursor'] = edges[edges.length - 1].cursor;
    }
    return {
      edges,
      pageInfo,
      totalCount: totalCount,
    };
  }
  public hydratePageInfo(
    pagedResult: ListEntity[],
    pagination: PaginationInput
  ) {
    const pageInfo = { startCursor: null, endCursor: null };
    if (pagination.first) {
      pageInfo['hasNextPage'] = pagedResult.length > pagination.first;
      if (pagination.after) {
        // 'after' isn't inclusive, so there is always a previous page
        pageInfo['hasPreviousPage'] = true;
      } else {
        // first result not after cursor means no before
        pageInfo['hasPreviousPage'] = false;
      }
    } else if (pagination.last) {
      pageInfo['hasPreviousPage'] = pagedResult.length > pagination.last;
      if (pagination.before) {
        // 'before' isn't inclusive, so there is always a next page
        pageInfo['hasNextPage'] = true;
      } else {
        // last result not after cursor means no after
        pageInfo['hasNextPage'] = false;
      }
    }
    return pageInfo;
  }
}
