import { Knex } from 'knex';
import { knexPaginator as paginate } from '@pocket-tools/apollo-cursor-pagination';
import { IContext } from '../server/context';
import { cleanAndValidateTag, mysqlTimeString } from './utils';
import {
  Pagination,
  SavedItem,
  SavedItemConnection,
  SavedItemEdge,
  SavedItemsContentType,
  SavedItemsFilter,
  SavedItemsSort,
  SavedItemStatus,
  SavedItemUpsertInput,
} from '../types';
import config from '../config';
import { ItemResponse } from '../externalCaller/parserCaller';

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
  private db: Knex;
  private readonly userId: string;
  private readonly apiId: string;

  private sortMap = {
    CREATED_AT: '_createdAt',
    UPDATED_AT: '_updatedAt',
    FAVORITED_AT: 'favoritedAt',
    ARCHIVED_AT: 'archivedAt', // this is a derived field
  };

  constructor(
    context: IContext,
    db: Knex = context.db.readClient
    //note: for mutations, please pass the writeClient,
    //otherwise there will be replication lags.
  ) {
    this.db = db;
    this.userId = context.userId;
    this.apiId = context.apiId;
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
  public buildQuery(): any {
    return this.db('list').select(
      'given_url AS url',
      'item_id AS id',
      'resolved_id AS resolvedId', // for determining if an item is pending
      'favorite as isFavorite',
      this.db.raw(
        'CASE WHEN favorite = 1 THEN UNIX_TIMESTAMP(time_favorited) ELSE null END as favoritedAt '
      ),
      'time_favorited', // for pagination sort
      'status',
      this.db.raw(
        `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN true ELSE false END as isArchived`
      ),
      this.db.raw('UNIX_TIMESTAMP(time_added) as _createdAt'),
      'time_added', // for pagination sort
      'item_id',
      this.db.raw('UNIX_TIMESTAMP(time_updated) as _updatedAt'),
      'time_updated', // for pagination sort
      this.db.raw(
        `CASE WHEN status = ${SavedItemStatus.DELETED} THEN UNIX_TIMESTAMP(time_updated) ELSE null END as _deletedAt`
      ),
      this.db.raw(
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
      this.db.select('*').from(query.as('page_query')),
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

  /**
   * Get time read for a saved item
   * @param itemId
   */
  public async getSavedItemTimeRead(itemId: string): Promise<any> {
    return this.db('list')
      .select(this.db.raw('SQL_NO_CACHE time_read'))
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
      baseQuery.andWhere('status', SavedItemStatus[filter.status]);
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
    const highlightSubquery = this.db('user_annotations')
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
        .andWhere(this.db.raw('highlights.hl_item_id is null'));
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

    const tagsSubQuery = this.db('item_tags')
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
    return this.db.select('*').from(baseQuery.as('base')).distinct();
  }

  /**
   * Format a date to the configured database timezone
   * @param date
   * @private
   */
  private static formatDate(date: Date): string {
    return mysqlTimeString(date, config.database.tz);
  }

  /**
   * Update the 'favorite' attribute of an item, and the auditing fields
   * in the table ('time_updated', etc.)
   * @param itemId the item ID to update
   * @param favorite whether the item is a favorite or not
   * @returns savedItem savedItem that got updated
   */
  public async updateSavedItemFavoriteProperty(
    itemId: string,
    favorite: boolean
  ): Promise<SavedItem> {
    const timestamp = SavedItemDataService.formatDate(new Date());
    const timeFavorited = favorite ? timestamp : '0000-00-00 00:00:00';
    await this.db('list')
      .update({
        favorite: +favorite,
        time_favorited: timeFavorited,
        time_updated: timestamp,
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });

    return await this.getSavedItemById(itemId);
  }

  /**
   * Update the 'status' attribute of an item, for archive/unarchive,
   * and the auditing fields in the table ('time_updated', etc.)
   * @param itemId the item ID to update
   * @param archived whether the item is a favorite or not
   * @returns savedItem savedItem that got updated
   */
  public async updateSavedItemArchiveProperty(
    itemId: string,
    archived: boolean
  ): Promise<SavedItem> {
    const timestamp = SavedItemDataService.formatDate(new Date());
    const timeArchived = archived ? timestamp : '0000-00-00 00:00:00';
    const status = archived ? 1 : 0;
    // TODO: Do we care if this makes an update that doesn't change the status?
    // e.g. archiving an already archived item will update
    //    time_read, time_upated, api_id_updated; but not status
    await this.db('list')
      .update({
        status: status,
        time_read: timeArchived,
        time_updated: timestamp,
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });

    return await this.getSavedItemById(itemId);
  }

  /**
   * Soft delete a saved item. Since we delete from multiple tables,
   * we perform the entire operation as a single transaction
   * to allow us to fully rollback should any on of the
   * database statements fail.
   * @param itemId
   */
  public async deleteSavedItem(itemId) {
    const transaction = await this.db.transaction();
    try {
      // remove tags for saved item
      await transaction('item_tags').delete().where({
        user_id: this.userId,
        item_id: itemId,
      });

      // remove attribution for saved item
      await transaction('item_attribution').delete().where({
        user_id: this.userId,
        item_id: itemId,
      });

      // remove scroll position for saved item
      await transaction('items_scroll').delete().where({
        user_id: this.userId,
        item_id: itemId,
      });

      // update status for saved item to soft delete
      await transaction('list')
        .update({
          status: SavedItemStatus.DELETED,
          time_updated: SavedItemDataService.formatDate(new Date()),
          api_id_updated: this.apiId,
        })
        .where({ item_id: itemId, user_id: this.userId });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /**
   * Undelete a saved item. Check the time_read for the saved item to determine
   * which status the item is assigned when moved from the deleted state.
   * @param itemId
   */
  public async updateSavedItemUnDelete(itemId): Promise<SavedItem> {
    const query: any = await this.getSavedItemTimeRead(itemId);

    // This is a check to determine if the saved item was previously archived. Fun, right?
    const status =
      query.time_read === '0000-00-00 00:00:00'
        ? SavedItemStatus.UNREAD
        : SavedItemStatus.ARCHIVED;

    await this.db('list')
      .update({
        status,
        time_updated: SavedItemDataService.formatDate(new Date()),
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });

    return await this.getSavedItemById(itemId);
  }

  /**
   * @param item
   * @param savedItemUpsertInput
   * @returns savedItem
   */
  public async upsertSavedItem(
    item: ItemResponse,
    savedItemUpsertInput: SavedItemUpsertInput
  ): Promise<SavedItem> {
    const currentDate = SavedItemDataService.formatDate(new Date());
    const givenTimestamp = new Date(savedItemUpsertInput.timestamp * 1000);
    const givenDate = savedItemUpsertInput.timestamp
      ? SavedItemDataService.formatDate(givenTimestamp)
      : currentDate;
    //`returning` is not supported for mysql in knex
    await this.db('list')
      .insert({
        user_id: parseInt(this.userId),
        item_id: item.itemId,
        given_url: savedItemUpsertInput.url,
        status: 0,
        resolved_id: item.resolvedId,
        title: item.title,
        time_added: givenDate,
        time_updated: currentDate,
        time_read: '0000-00-00 00:00:00',
        time_favorited: savedItemUpsertInput.isFavorite
          ? givenDate
          : '0000-00-00 00:00:00',
        favorite: savedItemUpsertInput.isFavorite ? 1 : 0,
        api_id: parseInt(this.apiId),
        api_id_updated: parseInt(this.apiId),
      })
      .onConflict()
      .merge();

    return await this.getSavedItemById(item.itemId.toString());
  }

  /**
   * Build a query to update the `time_updated` field of many items
   * the list table, by item id.
   * @param itemIds The item IDS to update the `time_Updated` to now.
   */
  public updateListItemMany(itemIds: string[]): Knex.QueryBuilder {
    return this.listItemUpdateBuilder().whereIn('item_id', itemIds);
  }

  /**
   * Build a query to update the `time_updated` field of one item in
   * the list table, by item id.
   * @param itemId
   */
  public updateListItemOne(itemId: string): Knex.QueryBuilder {
    return this.listItemUpdateBuilder().where('item_id', itemId);
  }

  /**
   * Helper function to build updates to a user's list.
   * Used to mark updates that affect the list item (e.g. a new tag
   * association) but are not direct updates to the list table.
   * Does not include the necessary `join` or `where` statement
   * to properly execute this query.
   * Do not run this query as-is. Should only be used to compose other
   * queries. That's why it's private :)
   */
  private listItemUpdateBuilder(): Knex.QueryBuilder {
    return this.db('list')
      .update({
        time_updated: SavedItemDataService.formatDate(new Date()),
        api_id_updated: this.apiId,
      })
      .andWhere('user_id', this.userId);
  }
}
