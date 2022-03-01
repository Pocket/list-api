import { Knex } from 'knex';
import { knexPaginator as paginate } from '@pocket-tools/apollo-cursor-pagination';
import { IContext } from '../../server/context';
import { cleanAndValidateTag, mysqlTimeString } from '../utils';
import {
  Pagination,
  SavedItem,
  SavedItemConnection,
  SavedItemEdge,
  SavedItemsContentType,
  SavedItemsFilter,
  SavedItemsSort,
  SavedItemStatus,
} from '../../types';
import config from '../../config';

type DbResult = {
  user_id?: number;
  item_id?: number;
  resolved_id?: number;
  given_url?: string;
  title?: string;
  time_added?: Date;
  time_updated?: Date;
  time_read?: Date;
  time_favorited?: Date;
  api_id?: number;
  status?: number;
  favorite?: boolean;
  api_id_updated?: number;
};

export class SavedItemDataService {
  private static statusMap = {
    [SavedItemStatus.UNREAD]: 'UNREAD',
    [SavedItemStatus.ARCHIVED]: 'ARCHIVED',
    [SavedItemStatus.DELETED]: 'DELETED',
    [SavedItemStatus.HIDDEN]: 'HIDDEN',
  };
  private readDb: Knex;
  private readonly userId: string;
  private sortMap = {
    CREATED_AT: '_createdAt',
    UPDATED_AT: '_updatedAt',
    FAVORITED_AT: 'favoritedAt',
    ARCHIVED_AT: 'archivedAt', // this is a derived field
  };

  constructor(context: IContext) {
    this.readDb = context.db.readClient;
    this.userId = context.userId;
  }

  public static convertDbResultStatus(dbResult: DbResult): DbResult;
  public static convertDbResultStatus(dbResult: DbResult[]): DbResult[];
  /**
   * Convert the `status` field in the list table to the expected
   * GraphQL ENUM string
   * @param dbResult
   */
  public static convertDbResultStatus(
    dbResult: DbResult | DbResult[]
  ): DbResult | DbResult[] {
    if (dbResult == null) {
      return dbResult;
    }
    const statusConvert = (row: DbResult) => {
      if (row.status != null) {
        row.status = SavedItemDataService.statusMap[row.status];
      }
      return row;
    };
    if (dbResult instanceof Array) {
      return dbResult.map((row) => statusConvert(row));
    }
    return statusConvert(dbResult);
  }

  /**
   * Helper function to build repeated queries, for DRY savedItem and savedItems fetches.
   * Will eventually be extended for building filter, sorts, etc. for different pagination, etc.
   * For now just to reuse the same query and reduce testing burden :)
   */
  public buildQuery(conn?: Knex, table?: string): any {
    const db = conn ?? this.readDb;
    const from = table ?? 'list';
    return db(from).select(
      'given_url AS url',
      'item_id AS id',
      'resolved_id AS resolvedId', // for determining if an item is pending
      'favorite as isFavorite',
      this.readDb.raw(
        'CASE WHEN favorite = 1 THEN UNIX_TIMESTAMP(time_favorited) ELSE null END as favoritedAt '
      ),
      'time_favorited', // for pagination sort
      'status',
      this.readDb.raw(
        `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN true ELSE false END as isArchived`
      ),
      this.readDb.raw('UNIX_TIMESTAMP(time_added) as _createdAt'),
      'time_added', // for pagination sort
      'item_id',
      this.readDb.raw('UNIX_TIMESTAMP(time_updated) as _updatedAt'),
      'time_updated', // for pagination sort
      this.readDb.raw(
        `CASE WHEN status = ${SavedItemStatus.DELETED} THEN UNIX_TIMESTAMP(time_updated) ELSE null END as _deletedAt`
      ),
      this.readDb.raw(
        `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN UNIX_TIMESTAMP(time_updated) ELSE null END as archivedAt`
      )
    );
  }

  /**
   * Fetch a single SavedItem from a User's list
   * @param itemId the savedItem ID to fetch
   */
  public getSavedItemById(itemId: string): Promise<SavedItem> {
    const query = this.buildQuery()
      .where({ user_id: this.userId, item_id: itemId })
      .first();

    return query.then(SavedItemDataService.convertDbResultStatus);
  }

  /**
   * Fetch paginated list of saved items for the list of Item Ids.
   * @param itemIds the savedItem ID to fetch
   * @param pagination pagination inputs
   * @param filter filter options for savedItems
   * @param sort sort options for savedItems
   */
  public async getPaginatedSavedItemsForListOfIds(
    itemIds: string[],
    pagination: Pagination,
    filter: SavedItemsFilter,
    sort: SavedItemsSort
  ): Promise<SavedItemConnection> {
    const query = this.buildQuery()
      .where({ user_id: this.userId })
      .whereIn('item_id', itemIds);

    return this.getPaginatedItemsForQuery(query, pagination, filter, sort);
  }

  /**
   * Fetch paginated list of savedItems for the given query
   * @param query baseQuery for fetching savedItems
   * @param pagination pagination inputs
   * @param filter filter options for savedItems
   * @param sort sort options for savedItems
   */
  private async getPaginatedItemsForQuery(
    query: any,
    pagination: Pagination,
    filter: SavedItemsFilter,
    sort: SavedItemsSort
  ): Promise<SavedItemConnection> {
    if (pagination == null) {
      pagination = { first: config.pagination.defaultPageSize };
    }

    const sortOrder = sort?.sortOrder ?? 'DESC';
    const sortColumn = this.sortMap[sort?.sortBy] ?? '_createdAt';

    query = query.orderBy(
      sortColumn,
      sortOrder.toLowerCase(),
      'item_id',
      'asc'
    ); // item_id sort is to resolve ties with stable sort (e.g. null sort field)

    if (filter != null) {
      query = this.buildFilterQuery(query, filter);
    }
    return await paginate(
      // Need to use a subquery in order to order by derived fields ('archivedAt')
      this.readDb.select('*').from(query.as('page_query')),
      {
        first: pagination?.first,
        last: pagination?.last,
        before: pagination?.before,
        after: pagination?.after,
        orderBy: sortColumn,
        orderDirection: sortOrder,
      },
      {
        primaryKey: 'item_id',
        modifyEdgeFn: (edge): SavedItemEdge => ({
          ...edge,
          //Format the node to conform to our SavedItem type.
          node: {
            ...edge.node,
            status: SavedItemDataService.statusMap[edge.node.status],
          },
        }),
      }
    );
  }

  /**
   * Fetch a single SavedItem via its unique URL from a user's list
   * @param givenUrl the URL of the item to fetch
   */
  public getSavedItemByGivenUrl(givenUrl: string): Promise<SavedItem> {
    const query = this.buildQuery()
      .where({ user_id: this.userId, given_url: givenUrl })
      .first();

    return query.then(SavedItemDataService.convertDbResultStatus);
  }

  /**
   * Fetch all SavedItems via a list of unique ids from a user's list
   * @param itemIds the id of the items to fetch
   */
  public batchGetSavedItemsByGivenIds(itemIds: string[]): Promise<SavedItem[]> {
    const query = this.buildQuery()
      .where({ user_id: this.userId })
      .whereIn('item_id', itemIds);

    return query.then(SavedItemDataService.convertDbResultStatus);
  }

  /**
   * Fetch all SavedItems via a list of unique URLs from a user's list
   * @param urls the URLs of the items to fetch
   */
  public batchGetSavedItemsByGivenUrls(urls: string[]): Promise<SavedItem[]> {
    const query = this.buildQuery()
      .where({ user_id: this.userId })
      .whereIn('given_url', urls);

    return query.then(SavedItemDataService.convertDbResultStatus);
  }

  /**
   * Fetch all SavedItems in a User's list
   * @param filter PARTIALLY IMPLEMENTED: tagIds is not implemented
   * @param sort instructions for sorting; impacts pagination
   * @param pagination: instructions for how to paginate the data
   */
  public getSavedItems(
    filter?: SavedItemsFilter,
    sort?: SavedItemsSort,
    pagination?: Pagination
  ): Promise<SavedItemConnection> {
    const baseQuery = this.buildQuery().where('user_id', this.userId);
    return this.getPaginatedItemsForQuery(baseQuery, pagination, filter, sort);
  }

  public async getSavedItemsTempPaginator(
    filter?: SavedItemsFilter,
    sort?: SavedItemsSort,
    pagination?: Pagination
  ) {
    this.readDb.raw(
      'COUNT(*) as count ' +
        'FROM list l IGNORE INDEX (time_updated) ' +
        'JOIN readitla_b.items_extended e ON (l.resolved_id = e.extended_item_id) ' +
        `WHERE l.user_id = ? AND l.status IN (0,1) AND e.is_article = 1 and time_added = ('${createdAt}')` +
        'ORDER BY l.time_added DESC, l.item_id ASC '
    );
    const res = await this.readDb.transaction(async (trx) => {
      await trx.raw(
        'CREATE TEMPORARY TABLE `temp_getlist` ' +
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
      if (pagination.first && pagination.after == null) {
        await trx.raw(
          'INSERT INTO `temp_getlist` (item_id, resolved_id, given_url, given_title, favorite, status, time_added, time_updated, time_read, time_favorited) ' +
            'SELECT l.item_id, l.resolved_id, l.given_url, l.title, l.favorite, l.status, UNIX_TIMESTAMP(l.time_added) AS time_added, UNIX_TIMESTAMP(l.time_updated) AS time_updated, UNIX_TIMESTAMP(l.time_read) AS time_read, UNIX_TIMESTAMP(l.time_favorited) AS time_favorited ' +
            'FROM list l IGNORE INDEX (time_updated, time_added) ' +
            'JOIN readitla_b.items_extended e ON (l.resolved_id = e.extended_item_id) ' +
            `WHERE l.user_id = ? AND l.status IN (0,1) AND e.is_article = 1 ` +
            'ORDER BY l.time_added DESC, l.item_id ASC ' +
            'LIMIT 0, 30 ',
          this.userId
        );
      } else {
        const [itemId, createdAtStr] = pagination.after.split('|');
        const createdAt = mysqlTimeString(
          new Date(parseInt(createdAtStr) * 1000),
          config.database.tz
        );
        // This gets the old cursor element + any colliding keys
        // No limit on this since it's hopefully unusual for time_added collisions...
        await trx.raw(
          'INSERT INTO `temp_getlist` (item_id, resolved_id, given_url, given_title, favorite, status, time_added, time_updated, time_read, time_favorited) ' +
            'SELECT l.item_id, l.resolved_id, l.given_url, l.title, l.favorite, l.status, UNIX_TIMESTAMP(l.time_added) AS time_added, UNIX_TIMESTAMP(l.time_updated) AS time_updated, UNIX_TIMESTAMP(l.time_read) AS time_read, UNIX_TIMESTAMP(l.time_favorited) AS time_favorited ' +
            'FROM list l IGNORE INDEX (time_updated) ' +
            'JOIN readitla_b.items_extended e ON (l.resolved_id = e.extended_item_id) ' +
            `WHERE l.user_id = ? AND l.status IN (0,1) AND e.is_article = 1 and time_added = ('${createdAt}')` +
            'ORDER BY l.time_added DESC, l.item_id ASC ',
          this.userId
        );
        // Remove anything before the item_id
        const prevCursorSeq = (
          await trx('temp_getlist').where('item_id', itemId).pluck('seq')
        )[0];
        await trx('temp_getlist').where('seq', '<=', prevCursorSeq).del();
        const currCount = (await trx('temp_getlist')
          .count('* as count')
          .first()
          .then((_) => _?.count ?? 0)) as number;
        // worry about fetching extra ones for hasNextPage later
        const limit = 30 - currCount;
        if (limit > 0) {
          // Now we insert more with a limit
          await trx.raw(
            'INSERT INTO `temp_getlist` (item_id, resolved_id, given_url, given_title, favorite, status, time_added, time_updated, time_read, time_favorited) ' +
              'SELECT l.item_id, l.resolved_id, l.given_url, l.title, l.favorite, l.status, UNIX_TIMESTAMP(l.time_added) AS time_added, UNIX_TIMESTAMP(l.time_updated) AS time_updated, UNIX_TIMESTAMP(l.time_read) AS time_read, UNIX_TIMESTAMP(l.time_favorited) AS time_favorited ' +
              'FROM list l IGNORE INDEX (time_updated) ' +
              'JOIN readitla_b.items_extended e ON (l.resolved_id = e.extended_item_id) ' +
              `WHERE l.user_id = ? AND l.status IN (0,1) AND e.is_article = 1 and time_added < ('${createdAt}')` +
              'ORDER BY l.time_added DESC, l.item_id ASC ' +
              `LIMIT ${limit}`,
            this.userId
          );
        }
      }
      const res = await trx('temp_getlist').select(
        'given_url AS url',
        'item_id AS id',
        'resolved_id AS resolvedId', // for determining if an item is pending
        'favorite as isFavorite',
        this.readDb.raw(
          'CASE WHEN favorite = 1 THEN time_favorited ELSE null END as favoritedAt '
        ),
        'status',
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN true ELSE false END as isArchived`
        ),
        'time_added as _createdAt',
        'time_updated as _updatedAt',
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.DELETED} THEN time_updated ELSE null END as _deletedAt`
        ),
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN time_updated ELSE null END as archivedAt`
        )
      );
      return res.map((_) => SavedItemDataService.convertDbResultStatus(_));
    });
    const edges: SavedItemEdge[] = res.map((_: any) => {
      return {
        node: _,
        cursor: _.id + '|' + _._createdAt,
      };
    });
    return {
      edges: edges,
      pageInfo: {
        endCursor: edges[edges.length - 1].cursor,
        startCursor: edges[0].cursor,
        hasNextPage: true,
        hasPreviousPage: false,
      },
      totalCount: 120,
    };
  }

  public async getSavedItemsTemp() {
    const res = await this.readDb.transaction(async (trx) => {
      await trx.raw(
        'CREATE TEMPORARY TABLE `temp_getlist` ' +
          '(' +
          '`item_id` int(10) unsigned NOT NULL, ' +
          '        `resolved_id` int(10) unsigned NOT NULL, ' +
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
      await trx.raw(
        'INSERT INTO `temp_getlist` SELECT l.item_id, l.resolved_id, l.given_url, l.title, l.favorite, l.status, UNIX_TIMESTAMP(l.time_added) AS time_added, UNIX_TIMESTAMP(l.time_updated) AS time_updated, UNIX_TIMESTAMP(l.time_read) AS time_read, UNIX_TIMESTAMP(l.time_favorited) AS time_favorited ' +
          'FROM list l IGNORE INDEX (time_updated, time_added) ' +
          'JOIN readitla_b.items_extended e ON (l.resolved_id = e.extended_item_id) ' +
          'WHERE l.user_id = ? AND l.status IN (0,1) AND e.is_article = 1 ' +
          'ORDER BY l.time_added DESC ' +
          'LIMIT 0, 30 ',
        this.userId
      );
      const res = await trx('temp_getlist').select(
        'given_url AS url',
        'item_id AS id',
        'resolved_id AS resolvedId', // for determining if an item is pending
        'favorite as isFavorite',
        this.readDb.raw(
          'CASE WHEN favorite = 1 THEN time_favorited ELSE null END as favoritedAt '
        ),
        'status',
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN true ELSE false END as isArchived`
        ),
        'time_added as _createdAt',
        'time_updated as _updatedAt',
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.DELETED} THEN time_updated ELSE null END as _deletedAt`
        ),
        this.readDb.raw(
          `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN time_updated ELSE null END as archivedAt`
        )
      );
      return res.map((_) => SavedItemDataService.convertDbResultStatus(_));
    });
    const edges: SavedItemEdge[] = res.map((_) => {
      return { node: _ as unknown as SavedItem, cursor: 'abcfakecursor' };
    });
    return {
      edges: edges,
      pageInfo: {
        endCursor: 'fake',
        startCursor: 'fake2',
        hasNextPage: true,
        hasPreviousPage: false,
      },
      totalCount: 120,
    };
  }

  /**
   * Get time read for a saved item
   * @param itemId
   */
  public async getSavedItemTimeRead(itemId: string): Promise<any> {
    return this.readDb('list')
      .select(this.readDb.raw('SQL_NO_CACHE time_read'))
      .where({ item_id: itemId, user_id: this.userId })
      .first();
  }

  /**
   * Build filter statements from SavedItemsFilter for pagination
   * The database entities don't nicely map onto the GraphQL objects
   * so this very explicit way may be the most clear and maintainable.
   * @param baseQuery the base query for selecting a user's list
   * @param filter a SavedItemsFilter object containing instructions for filtering
   * a user's list
   */
  private buildFilterQuery(baseQuery: Knex, filter: SavedItemsFilter): any {
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
      if (filter.status.toString() === 'VISIBLE') {
        baseQuery.andWhere(function () {
          this.whereIn('status', [
            SavedItemStatus['UNREAD'],
            SavedItemStatus['ARCHIVED'],
          ]);
        });
      } else {
        baseQuery.andWhere('status', SavedItemStatus[filter.status]);
      }
    }
    if (filter.isHighlighted != null) {
      this.isHighlightedFilter(baseQuery, filter.isHighlighted);
    }
    if (filter.contentType != null) {
      this.contentTypeFilter(baseQuery, filter.contentType);
    }
    // Tags has to go last due to select distinct
    if (filter.tagNames != null && filter.tagNames.length > 0) {
      const cleanTags = filter.tagNames.map(cleanAndValidateTag);
      return this.tagNameFilter(baseQuery, cleanTags);
    }
    return baseQuery;
  }

  /**
   * Update the user list query to filter to highlighted/not-highlighted items.
   * to only highlighted items.
   * NOTE: Due to the way the final pagination subquery is created,
   * we can't rely on aliases to identify the `orderBy` and `primaryKey`
   * columns in the paginated query. So all queries that will be paginated need
   * to ensure that there are no name collisions (that is, that every
   * column has a unique name). This is why the columns used to join
   * `user_annotations` to `list` are prefixed with `hl_`, despite not
   * being returned in the final query.
   * @param baseQuery the base query for selecting a user's list
   * @param isHighlighted boolean to filter either highlighted or not highlighted items
   */
  private isHighlightedFilter(
    baseQuery: Knex,
    isHighlighted: boolean
  ): Promise<any> {
    const highlightSubquery = this.readDb('user_annotations')
      .select('user_id as hl_user_id', 'item_id as hl_item_id')
      .where('user_id', this.userId)
      .andWhere('status', 1)
      .groupBy('hl_user_id', 'hl_item_id')
      .as('highlights');

    if (isHighlighted) {
      return baseQuery.innerJoin(highlightSubquery, function () {
        this.on('highlights.hl_user_id', '=', 'list.user_id').andOn(
          'highlights.hl_item_id',
          '=',
          'list.item_id'
        );
      });
    } else {
      return baseQuery
        .leftJoin(highlightSubquery, function () {
          this.on('highlights.hl_user_id', '=', 'list.user_id').andOn(
            'highlights.hl_item_id',
            '=',
            'list.item_id'
          );
        })
        .andWhere(this.readDb.raw('highlights.hl_item_id is null'));
    }
  }

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
   * Update the user list query to filter for items with specific tags.
   * In order to get untagged items, use the string "_untagged_".
   * An item will be included in the filter if it has any tags that
   * match any values in `tagNames` (or if it is untagged, if "_untagged_"
   * is included)
   * NOTE: Due to the way the final pagination subquery is created,
   * we can't rely on aliases to identify the `orderBy` and `primaryKey`
   * columns in the paginated query. So all queries that will be paginated need
   * to ensure that there are no name collisions (that is, that every
   * column has a unique name). This is why the columns used to join
   * `item_tags` to `list` are prefixed with `tag_`, despite not
   * being returned in the final query.
   * @param baseQuery the base query for selecting a user's list
   * @param tagNames the desired tags to filter on; for untagged items,
   * include the string '_untagged_'
   */
  private tagNameFilter(baseQuery: Knex, tagNames: string[]): any {
    if (tagNames.length === 0) {
      return baseQuery;
    }

    const tagsSubQuery = this.readDb('item_tags')
      .select(
        'tag as tag_tag',
        'user_id as tag_user_id',
        'item_id as tag_item_id'
      )
      .where('user_id', this.userId);

    baseQuery.leftJoin(tagsSubQuery.as('tags_subquery'), {
      'list.item_id': 'tags_subquery.tag_item_id',
      'list.user_id': 'tags_subquery.tag_user_id',
    });
    // Can't do a straight inner join since we may have "untagged" items
    // that we need to find
    const untaggedIndex = tagNames.indexOf('_untagged_', 0);
    if (untaggedIndex > -1) {
      tagNames.splice(untaggedIndex, 1); // remove _untagged_
      if (tagNames.length > 0) {
        baseQuery.where((builder) => {
          // This is where you want untagged items plus an item with a specific tag(s)
          builder.andWhere('tag_tag', 'in', tagNames).orWhereNull('tag_tag');
        });
      } else {
        // Untagged items only
        baseQuery.whereNull('tag_tag');
      }
    } else {
      // Specific tagged items
      baseQuery.andWhere('tag_tag', 'in', tagNames);
    }
    // Tags are a many-to-one relationship with item, so need
    // to take distinct results after performing this join
    return this.readDb.select('*').from(baseQuery.as('base')).distinct();
  }
}
