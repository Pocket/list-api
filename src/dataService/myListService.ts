import { Knex } from 'knex';
import { IContext } from '../server/context';
import {
  SavedItemStatus,
  SavedItem,
  SavedItemsFilter,
  SavedItemsSort,
  Pagination,
  SavedItemConnection,
} from '../types';
import { SavedItemDataService } from './savedItemsService';
import { mysqlTimeString } from './utils';
import config from '../config';
import { PaginationInput } from '@pocket-tools/apollo-utils';

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

type SavedItemResult = Omit<SavedItem, 'item' | 'tags'>;

/**
 * A read-only data service for retrieving `SavedItems`
 * in a User's list, optionally with filters/sort/pagination.
 * This duplicates some behavior from `SavedItemsDataService`,
 * and is separated simply for clarity. The methods for fetching
 * a user's list must be updated, but other methods inside of
 * the data service (e.g. resolving a `SavedItem` by ID or list of IDs)
 * don't need to be touched.
 * All this is going to go away when we migrate away from the legacy
 * data storage anyway.
 */
export class MyListService extends SavedItemDataService {
  private tempTable = 'temp_getlist_clientapi';
  constructor(private readonly context: IContext) {
    super(context, context.db.readClient);
  }

  // Transformer from DB result to GraphQL Schema
  private static toGraphql(entity: ListEntity[]): SavedItemResult[];
  private static toGraphql(entity: ListEntity): SavedItemResult;
  private static toGraphql(
    entity: ListEntity | ListEntity[]
  ): SavedItemResult | SavedItemResult[] {
    if (Array.isArray(entity)) {
      return entity.map((row) => MyListService._toGraphql(row));
    } else {
      return MyListService._toGraphql(entity);
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
      favoritedAt: entity.time_favorited,
      status: statusMap[entity.status],
      isArchived: entity.status === SavedItemStatus.ARCHIVED ? true : false,
      archivedAt: entity.time_read,
      _createdAt: entity.time_added,
      _updatedAt: entity.time_updated,
      _deletedAt:
        entity.status === SavedItemStatus.DELETED ? entity.time_updated : null,
    };
  }
  private createTempTable(trx: Knex.Transaction): any {
    return trx.raw(
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
  }
  private filteredSortedView(
    trx: Knex.Transaction,
    filter: SavedItemsFilter,
    sort: SavedItemsSort
  ) {
    let query = trx('list').where('user_id', this.context.userId);
    query = super.buildFilterQuery(query, filter, trx);
    const sortOrder = sort?.sortOrder.toLowerCase() ?? 'desc';
    const sortColumn = this.sortMap[sort?.sortBy];
    query.orderBy([
      { column: `list.${sortColumn}`, order: sortOrder },
      { column: 'list.item_id' },
    ]);
    return query;
  }
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
    const sortOrder = sort?.sortOrder.toLowerCase() ?? 'desc';
    const sortColumn = this.sortMap[sort?.sortBy];
    // Pagination is validated, so `first` or `last` is always set if `after`/`before` is, respectively
    if (pagination.after) {
      await this.pageFirstAfter(
        trx,
        queryBuilder,
        insertStatement,
        pagination.after,
        pagination.first,
        sortColumn,
        sortOrder
      );
    } else {
      await this.pageFirst(
        trx,
        queryBuilder,
        insertStatement,
        pagination.first
      );
    }
    // The temp table should have the complete page, perhaps with an additional value
    // if next page is true
    return await trx(this.tempTable).select();
  }

  private async pageFirst(
    trx: Knex.Transaction,
    query: Knex.QueryBuilder,
    insertStatement: string,
    pageSize: number
  ) {
    const queryString = query
      .clone()
      .limit(pageSize + 1)
      .toString();
    const res = await trx.raw(`${insertStatement} ${queryString}`);
    return res;
  }
  private async pageFirstAfter(
    trx: Knex.Transaction,
    query: Knex.QueryBuilder,
    insertStatement: string,
    cursor: string,
    pageSize: number,
    sortColumn: string,
    sortOrder: string
  ) {
    // Since we don't have a unique sequential column for cursor-based pagination
    // We have to get the old cursor element + any colliding keys
    // Set a high (default of 5000 from the web repo) on this, but hopefully
    // collisions on timestamp fields are unusual enough that it will be much
    // less in practice
    const [itemId, timeCursorStr] = this.decodeCursor(cursor);
    const timeCursor = mysqlTimeString(
      new Date(parseInt(timeCursorStr) * 1000),
      config.database.tz
    );
    // Get the old cursor element + any colliding keys
    const queryString = query
      .clone()
      .andWhere(sortColumn, timeCursor)
      .limit(5000)
      .toString();
    await trx.raw(`${insertStatement} ${queryString}`);
    // Remove anything before the item_id
    const prevCursorSeq = (
      await trx(this.tempTable).where('item_id', itemId).pluck('seq')
    )[0];
    await trx(this.tempTable).where('seq', '<=', prevCursorSeq).del();
    const currCount = (await trx(this.tempTable)
      .count('* as count')
      .first()
      .then((_) => _?.count ?? 0)) as number;
    // For hasNextPage, try to retrieve 1 additional value
    const limit = pageSize + 1 - currCount;
    if (limit > 0) {
      // Now we insert more with a limit
      // If the timestamp is sorted by descending, the 'next' page is < time cursor
      // If the timestamp is sorted by ascending, the 'next' page is > time cursor
      const restOfQuery = query
        .clone()
        .andWhere(sortColumn, sortOrder === 'desc' ? '<' : '>', timeCursor)
        .limit(limit)
        .toString();
      await trx.raw(`${insertStatement} ${restOfQuery}`);
    }
  }
  private decodeCursor(cursor: string) {
    return Buffer.from(cursor, 'base64').toString('utf8').split('|');
  }
  private encodeCursor(itemId: number | string, epoch: number) {
    return Buffer.from(`${itemId}|${epoch}`).toString('base64');
  }
  public async getSavedItems(
    filter: SavedItemsFilter,
    sort: SavedItemsSort,
    pagination: Pagination
  ): Promise<SavedItemConnection> {
    // return {} as unknown as SavedItemConnection;
    const pageResult = await this.context.db.readClient.transaction(
      async (trx) => {
        await this.createTempTable(trx);
        const queryBuilder = this.filteredSortedView(trx, filter, sort);
        const pageResult = await this.paginatedResult(
          queryBuilder as any,
          trx,
          pagination,
          sort
        );
        return pageResult;
      }
    );
    // worry about before/last later
    const pageInfo: any = this.hydratePageInfo(pageResult, pagination);
    let nodes: SavedItemResult[];
    if (pagination.first) {
      nodes = MyListService.toGraphql(
        pageResult
          // strip off sentinel row; this can be unconditional
          .slice(0, pagination.first)
      );
    } else {
      // conditionally strip off sentinel row if it exists (hasPreviousPage)
      const startIx = pageInfo.hasPreviousPage ? 1 : 0;
      nodes = MyListService.toGraphql(
        pageResult.slice(startIx, pagination.last + startIx)
      );
    }
    const sortColumn = this.sortMap[sort?.sortBy];
    const edges = nodes.map((node) => {
      return {
        node: node as SavedItem,
        cursor: this.encodeCursor(node.id, node[sortColumn]),
      };
    });
    pageInfo['startCursor'] = edges[0].cursor;
    pageInfo['endCursor'] = edges[edges.length - 1].cursor;
    return {
      edges,
      pageInfo,
      totalCount: 5000, // TODO
    };
  }
  public hydratePageInfo(
    pagedResult: ListEntity[],
    pagination: PaginationInput
  ) {
    const pageInfo = {};
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
