import { AuthenticationError } from 'apollo-server-express';
import {
  BasicItemEventPayloadWithContext,
  EventType,
  ItemsEventEmitter,
} from '../businessEvents';
import { IncomingHttpHeaders } from 'http';
import { Knex } from 'knex';
import { SavedItem } from '../types';
import { TagDataService } from '../dataService/queryServices';
import DataLoader from 'dataloader';
import {
  createSavedItemsDataLoaderById,
  createSavedItemsDataLoaderUrls,
} from '../dataLoader/savedItemsDataLoader';

export interface IContext {
  userId: string;
  headers: IncomingHttpHeaders;
  apiId: string;
  db: {
    readClient: Knex;
    writeClient: Knex;
  };
  eventEmitter: ItemsEventEmitter;
  dataLoaders: {
    savedItemsById: DataLoader<any, any>;
    savedItemsByUrl: DataLoader<any, any>;
  };

  emitItemEvent(
    event: EventType,
    savedItem: SavedItem | Promise<SavedItem>,
    tags?: string[]
  ): void;
}

export class ContextManager implements IContext {
  constructor(
    private config: {
      request: any;
      db: { readClient: Knex; writeClient: Knex };
      eventEmitter: ItemsEventEmitter;
    }
  ) {}

  get headers(): { [key: string]: any } {
    return this.config.request.headers;
  }

  get userId(): string {
    const userId = this.headers.userid;

    if (!userId) {
      throw new AuthenticationError(
        'You must be logged in to use this service'
      );
    }

    return userId instanceof Array ? userId[0] : userId;
  }

  get apiId(): string {
    const apiId = this.headers.apiid || '0';

    return apiId instanceof Array ? apiId[0] : apiId;
  }

  get db(): IContext['db'] {
    return this.config.db;
  }

  get dataLoaders(): IContext['dataLoaders'] {
    return {
      savedItemsById: createSavedItemsDataLoaderById(this),
      savedItemsByUrl: createSavedItemsDataLoaderUrls(this),
    };
  }

  get eventEmitter(): ItemsEventEmitter {
    return this.config.eventEmitter;
  }

  /**
   * Emit item events
   * @param event
   * @param savedItem
   * @param tagsUpdated tags updated during mutation
   */
  emitItemEvent(
    event: EventType,
    savedItem: SavedItem | Promise<SavedItem>,
    tagsUpdated?: string[]
  ): void {
    this.eventEmitter.emitItemEvent(
      event,
      this.generateEventPayload(savedItem, tagsUpdated)
    );
  }

  /**
   * Generate the event payload for every item event
   * @param savedItem
   * @param tagsUpdated
   * @private
   */
  private generateEventPayload(
    savedItem: SavedItem | Promise<SavedItem>,
    tagsUpdated: string[]
  ): BasicItemEventPayloadWithContext {
    const tagsFn = async () => {
      return (
        await new TagDataService(this).getTagsByUserItem((await savedItem).id)
      ).map((tag) => tag.name);
    };
    return {
      savedItem: Promise.resolve(savedItem),
      tags: Promise.resolve(tagsFn()),
      tagsUpdated: tagsUpdated,
      user: {
        id: this.userId,
        hashedId: this.headers.encodedid,
        email: this.headers.email,
        guid: parseInt(this.headers.guid),
        hashedGuid: this.headers.encodedguid,
      },
      apiUser: {
        apiId: this.apiId,
        name: this.headers.applicationname,
        isNative: this.headers.applicationisnative === 'true', // boolean value in header as string
        isTrusted: this.headers.applicationistrusted === 'true', // boolean value in header as string
        clientVersion: this.headers.clientversion,
      },
      request: {
        language: this.headers.gatewaylanguage,
        snowplowDomainUserId: this.headers.gatewaysnowplowdomainuserid,
        ipAddress: this.headers.gatewayipaddress,
        userAgent: this.headers.gatewayuseragent,
      },
    };
  }
}
