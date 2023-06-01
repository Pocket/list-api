import { Knex } from 'knex';
import { IContext } from '../server/context';
import { mysqlTimeString } from './utils';
import { SavedItem, SavedItemStatus, SavedItemUpsertInput } from '../types';
import config from '../config';
import { ItemResponse } from '../externalCaller/parserCaller';
import * as Sentry from '@sentry/node';
import { setTimeout } from 'timers/promises';
import { chunk } from 'lodash';

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

/***
 * class that handles the read and write from `readitla-temp.list` table
 * note: for mutations, please pass the writeClient, otherwise there will be replication lags.
 */
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

  constructor(context: Pick<IContext, 'dbClient' | 'userId' | 'apiId'>) {
    this.db = context.dbClient;
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
   * Format a date to the configured database timezone
   * @param date
   * @private
   */
  private static formatDate(date: Date): string {
    return mysqlTimeString(date, config.database.tz);
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
      'title',
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
        `CASE WHEN status = ${SavedItemStatus.ARCHIVED} THEN UNIX_TIMESTAMP(time_read) ELSE null END as archivedAt`
      )
    );
  }

  /**
   * Fetch a single SavedItem from a User's list
   * @param itemId the savedItem ID to fetch
   */
  public getSavedItemById(itemId: string): Promise<SavedItem | null> {
    const query = this.buildQuery()
      .where({ user_id: this.userId, item_id: itemId })
      .first();

    return query.then(SavedItemDataService.convertDbResultStatus);
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
   * @param updatedAt optional timestamp for when the mutation occured
   * (defaults to current server time)
   * @returns savedItem savedItem that got updated
   */
  public async updateSavedItemArchiveProperty(
    itemId: string,
    archived: boolean,
    updatedAt?: Date
  ): Promise<SavedItem | null> {
    const timestamp = updatedAt ?? SavedItemDataService.formatDate(new Date());
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
   * Delete a saved item. Since we delete from multiple tables,
   * we perform the entire operation as a single transaction
   * to allow us to fully rollback should any on of the
   * database statements fail.
   * @param itemId the itemId to delete
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
   * For a given itemId, deletes one row at a time from list related tables and sleeps for X times.
   * Note: we are not wrapping the deletes in a transactions as the deletes are un-related and
   * and we don't want the transaction to get session lock for longer time.
   * If a single deletion fails, log error and move on to the next record.
   * @param itemIds: the ids of the items to delete from the user's list, along with tags
   * and accompanying metadata
   * @param requestId: optional unique request ID for tracing
   */
  public async batchDeleteSavedItems(itemIds: number[], requestId?: string) {
    const tables = [...config.batchDelete.tablesWithPii];

    for (const table of tables) {
      try {
        await this.db(table)
          .delete()
          .whereIn('item_id', itemIds)
          .andWhere({ user_id: this.userId });

        if (requestId) {
          console.log(`BatchDelete: Processing request ID=${requestId}`);
        }
        console.log(
          `BatchDelete: deleted row from table: ${table} for user: ${
            this.userId
          } and itemIds: ${JSON.stringify(itemIds)}`
        );
        await setTimeout(config.batchDelete.deleteDelayInMilliSec);
      } catch (error) {
        const message =
          `BatchDelete: Error deleting from table ${table}` +
          `for itemId:  ${JSON.stringify(itemIds)} for (userId=${
            this.userId
          }, requestId=${requestId}).`;
        Sentry.addBreadcrumb({ message });
        Sentry.captureException(error);
        console.log(message);
        console.log(error);
      }
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
  public updateListItemMany(
    itemIds: string[],
    timestamp?: Date
  ): Knex.QueryBuilder[] {
    const itemBatches = chunk(itemIds, config.database.maxTransactionSize);
    return itemBatches.map((ids) =>
      this.listItemUpdateBuilder(timestamp).whereIn('item_id', ids)
    );
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
   * Get saved item IDs for a given user.
   * @param offset
   * @param limit
   */
  public getSavedItemIds(offset: number, limit: number) {
    return this.db('list')
      .where('user_id', this.userId)
      .orderBy('time_added', 'ASC')
      .limit(limit)
      .offset(offset)
      .pluck('item_id');
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
  private listItemUpdateBuilder(timestamp?: Date): Knex.QueryBuilder {
    return this.db('list')
      .update({
        time_updated: SavedItemDataService.formatDate(timestamp ?? new Date()),
        api_id_updated: this.apiId,
      })
      .andWhere('user_id', this.userId);
  }
}
