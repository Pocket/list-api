import { NotFoundError } from '@pocket-tools/apollo-utils';
import { SavedItemDataService } from '../dataService';
import { ParserCaller } from '../externalCaller/parserCaller';
import { IContext } from '../server/context';
import { EventType } from '../businessEvents';
import { SavedItem } from '../types';

export class SavedItemModel {
  private readonly defaultNotFoundMessage = 'SavedItem does not exist';
  private saveService: SavedItemDataService;
  constructor(public readonly context: IContext) {
    this.saveService = new SavedItemDataService(this.context);
  }

  /**
   * 'Archive' a Save in a Pocket User's list
   * @param id the ID of the SavedItem to archive
   * @param timestamp timestamp for when the mutation occurred. Optional
   * to support old id-keyed mutations that didn't require timetsamp.
   * If not provided, defaults to current server time.
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async archiveById(
    id: string,
    timestamp?: Date
  ): Promise<SavedItem | null> {
    const savedItem = await this.saveService.updateSavedItemArchiveProperty(
      id,
      true,
      timestamp
    );
    if (savedItem == null) {
      throw new NotFoundError(this.defaultNotFoundMessage);
    } else {
      this.context.emitItemEvent(EventType.ARCHIVE_ITEM, savedItem);
    }
    return savedItem;
  }
  /**
   * 'Unarchive' a Save in a Pocket User's list
   * @param id the ID of the SavedItem to unarchive (move to 'saves')
   * @param timestamp timestamp for when the mutation occurred. Optional
   * to support old id-keyed mutations that didn't require timetsamp.
   * If not provided, defaults to current server time.
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async unarchiveById(id: string, timestamp?: Date) {
    const savedItem = await this.saveService.updateSavedItemArchiveProperty(
      id,
      false,
      timestamp
    );
    if (savedItem == null) {
      throw new NotFoundError(this.defaultNotFoundMessage);
    } else {
      this.context.emitItemEvent(EventType.UNARCHIVE_ITEM, savedItem);
    }
    return savedItem;
  }

  /**
   * 'Favorite' a Save in a Pocket User's list
   * @param id the ID of the SavedItem to favorite
   * @param timestamp timestamp for when the mutation occurred. Optional
   * to support old id-keyed mutations that didn't require timetsamp.
   * If not provided, defaults to current server time.
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async favoriteById(
    id: string,
    timestamp?: Date
  ): Promise<SavedItem | null> {
    const savedItem = await this.saveService.updateSavedItemFavoriteProperty(
      id,
      true,
      timestamp
    );
    if (savedItem == null) {
      throw new NotFoundError(this.defaultNotFoundMessage);
    } else {
      this.context.emitItemEvent(EventType.FAVORITE_ITEM, savedItem);
    }
    return savedItem;
  }
  /**
   * 'Unfavorite' a Save in a Pocket User's list
   * @param id the ID of the SavedItem to unfavorite (move to 'saves')
   * @param timestamp timestamp for when the mutation occurred. Optional
   * to support old id-keyed mutations that didn't require timetsamp.
   * If not provided, defaults to current server time.
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async unfavoriteById(id: string, timestamp?: Date) {
    const savedItem = await this.saveService.updateSavedItemFavoriteProperty(
      id,
      false,
      timestamp
    );
    if (savedItem == null) {
      throw new NotFoundError(this.defaultNotFoundMessage);
    } else {
      this.context.emitItemEvent(EventType.UNFAVORITE_ITEM, savedItem);
    }
    return savedItem;
  }

  /**
   * 'Archive' a Save in a Pocket User's list
   * @param url the given url of the SavedItem to archive
   * @param timestamp timestamp for when the mutation occurred
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async archiveByUrl(
    url: string,
    timestamp: Date
  ): Promise<SavedItem | null> {
    const id = await this.fetchIdFromUrl(url);
    return this.archiveById(id, timestamp);
  }
  /**
   * 'Unarchive' a Save in a Pocket User's list
   * @param url the given url of the SavedItem to unarchive (move to 'saves')
   * @param timestamp timestamp for when the mutation occurred
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async unarchiveByUrl(
    url: string,
    timestamp: Date
  ): Promise<SavedItem | null> {
    const id = await this.fetchIdFromUrl(url);
    return this.unarchiveById(id, timestamp);
  }

  /**
   * 'Favorite' a Save in a Pocket User's list
   * @param url the given url of the SavedItem to favorite
   * @param timestamp timestamp for when the mutation occurred
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async favoriteByUrl(
    url: string,
    timestamp: Date
  ): Promise<SavedItem | null> {
    const id = await this.fetchIdFromUrl(url);
    return this.favoriteById(id, timestamp);
  }
  /**
   * 'Unfavorite' a Save in a Pocket User's list
   * @param url the given url of the SavedItem to unfavorite
   * @param timestamp timestamp for when the mutation occurred
   * @returns The updated SavedItem if it exists, or null if it doesn't
   * @throws NotFound if the SavedItem doesn't exist
   */
  public async unfavoriteByUrl(
    url: string,
    timestamp: Date
  ): Promise<SavedItem | null> {
    const id = await this.fetchIdFromUrl(url);
    return this.unfavoriteById(id, timestamp);
  }

  /**
   * Given a URL, fetch the itemId associated with it from the Parser
   * service. This is part of the primary key to identify the savedItem
   * (combined with userId).
   * TODO[IN-1478]: Remove this lookup once givenUrl is indexed
   * in the list table (replace with direct db lookup by givenUrl)
   * https://getpocket.atlassian.net/browse/IN-1478
   * @returns the itemId associated with the url
   * @throws NotFound Error if the itemId does not exist
   *  for the URL in the parser service; do not trigger a parse
   *  to avoid any risk of IDs getting out of sync/multiple IDs
   *  for a savedItem record, etc. The ID should already exist
   *  if update mutations are being called on the SavedItem entity.
   */
  private async fetchIdFromUrl(url: string): Promise<string> {
    const id = await ParserCaller.getItemIdFromUrl(url);
    if (id == null) {
      throw new NotFoundError(this.defaultNotFoundMessage);
    }
    return id;
  }
}
