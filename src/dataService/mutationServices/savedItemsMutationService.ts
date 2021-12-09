import { Knex } from 'knex';
import { IContext } from '../../server/context';
import { SavedItemStatus, SavedItemUpsertInput } from '../../types';
import { ItemResponse } from '../../externalCaller/parserCaller';
import { SavedItemDataService } from '../queryServices/savedItemsService';
import { mysqlTimeString } from '../utils';
import config from '../../config';

export class SavedItemMutationService {
  private writeDb: Knex;
  private readonly userId: string;
  private readonly apiId: string;

  constructor(private readonly context: IContext) {
    this.writeDb = context.db.writeClient;
    this.userId = context.userId;
    this.apiId = context.apiId;
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
   */
  public async updateSavedItemFavoriteProperty(
    itemId: string,
    favorite: boolean
  ): Promise<void> {
    const timestamp = SavedItemMutationService.formatDate(new Date());
    const timeFavorited = favorite ? timestamp : '0000-00-00 00:00:00';
    await this.writeDb('list')
      .update({
        favorite: +favorite,
        time_favorited: timeFavorited,
        time_updated: timestamp,
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });
  }

  /**
   * Update the 'status' attribute of an item, for archive/unarchive,
   * and the auditing fields in the table ('time_updated', etc.)
   * @param itemId the item ID to update
   * @param archived whether the item is a favorite or not
   */
  public async updateSavedItemArchiveProperty(
    itemId: string,
    archived: boolean
  ): Promise<void> {
    const timestamp = SavedItemMutationService.formatDate(new Date());
    const timeArchived = archived ? timestamp : '0000-00-00 00:00:00';
    const status = archived ? 1 : 0;
    // TODO: Do we care if this makes an update that doesn't change the status?
    // e.g. archiving an already archived item will update
    //    time_read, time_upated, api_id_updated; but not status
    await this.writeDb('list')
      .update({
        status: status,
        time_read: timeArchived,
        time_updated: timestamp,
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });
  }

  /**
   * Soft delete a saved item. Since we delete from multiple tables,
   * we perform the entire operation as a single transaction
   * to allow us to fully rollback should any on of the
   * database statements fail.
   * @param itemId
   */
  public async deleteSavedItem(itemId) {
    const transaction = await this.writeDb.transaction();

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
          time_updated: SavedItemMutationService.formatDate(new Date()),
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
  public async updateSavedItemUnDelete(itemId) {
    const query: any = await new SavedItemDataService(
      this.context
    ).getSavedItemTimeRead(itemId);

    // This is a check to determine if the saved item was previously archived. Fun, right?
    const status =
      query.time_read === '0000-00-00 00:00:00'
        ? SavedItemStatus.UNREAD
        : SavedItemStatus.ARCHIVED;

    await this.writeDb('list')
      .update({
        status,
        time_updated: SavedItemMutationService.formatDate(new Date()),
        api_id_updated: this.apiId,
      })
      .where({ item_id: itemId, user_id: this.userId });
  }

  /**
   * @param item
   * @param savedItemUpsertInput
   */
  public async upsertSavedItem(
    item: ItemResponse,
    savedItemUpsertInput: SavedItemUpsertInput
  ): Promise<any> {
    const currentDate = SavedItemMutationService.formatDate(new Date());
    const givenTimestamp = new Date(savedItemUpsertInput.timestamp * 1000);
    const givenDate = savedItemUpsertInput.timestamp
      ? SavedItemMutationService.formatDate(givenTimestamp)
      : currentDate;
    //`returning` is not supported for mysql in knex
    await this.writeDb('list')
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
    return this.writeDb('list')
      .update({
        time_updated: SavedItemMutationService.formatDate(new Date()),
        api_id_updated: this.apiId,
      })
      .andWhere('user_id', this.userId);
  }
}
