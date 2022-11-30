import { AuthenticationError } from 'apollo-server-express';
import {
  BasicItemEventPayloadWithContext,
  EventType,
  ItemsEventEmitter,
} from '../businessEvents';
import { IncomingHttpHeaders } from 'http';
import { Knex } from 'knex';
import { SavedItem, Tag } from '../types';
import DataLoader from 'dataloader';
import { createSavedItemDataLoaders } from '../dataLoader/savedItemsDataLoader';
import { createTagDataLoaders } from '../dataLoader/tagsDataLoader';
import { TagModel } from '../models';
import * as Sentry from '@sentry/node';

export interface IContext {
  userId: string;
  headers: IncomingHttpHeaders;
  apiId: string;
  userIsPremium: boolean;
  dbClient: Knex;
  eventEmitter: ItemsEventEmitter;
  models: {
    tag: TagModel;
  };
  withDbClientOverride(dbClient: Knex): IContext;
  dataLoaders: {
    savedItemsById: DataLoader<string, SavedItem>;
    savedItemsByUrl: DataLoader<string, SavedItem>;
    tagsById: DataLoader<string, Tag>;
    tagsByName: DataLoader<string, Tag>;
  };

  emitItemEvent(
    event: EventType,
    savedItem: SavedItem | Promise<SavedItem>,
    tags?: string[]
  ): void;
}

export class ContextManager implements IContext {
  public readonly dataLoaders: IContext['dataLoaders'];
  public readonly dbClient: Knex;

  constructor(
    private config: {
      request: any;
      dbClient: Knex;
      eventEmitter: ItemsEventEmitter;
    }
  ) {
    this.dbClient = config.dbClient;
    this.dataLoaders = {
      ...createTagDataLoaders(this),
      ...createSavedItemDataLoaders(this),
    };
    this.models = {
      tag: new TagModel(this),
    };
  }
  models: { tag: TagModel };

  withDbClientOverride(dbClient: Knex): ContextManager {
    const config = {
      ...this.config,
      dbClient,
    };
    return new ContextManager(config);
  }

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

  get userIsPremium(): boolean {
    const userIsPremium = this.headers.premium;
    //check that we have a premium header, and if it is set to true
    return userIsPremium !== undefined && userIsPremium === 'true';
  }

  get apiId(): string {
    const apiId = this.headers.apiid || '0';

    return apiId instanceof Array ? apiId[0] : apiId;
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
    this.generateEventPayload(savedItem, tagsUpdated)
      .then((payload) => {
        this.eventEmitter.emitItemEvent(event, payload);
      })
      .catch((error) => {
        Sentry.captureException(error, { level: 'warning' });
      });
  }

  /**
   * Generate the event payload for every item event
   * @param savedItem
   * @param tagsUpdated
   * @private
   */
  private async generateEventPayload(
    savedItem: SavedItem | Promise<SavedItem>,
    tagsUpdated: string[]
  ): Promise<BasicItemEventPayloadWithContext | undefined> {
    const save = await Promise.resolve(savedItem);
    if (save == null) {
      Sentry.captureEvent({
        message: 'Save was null or undefined when generating event payload',
        level: 'warning',
      });
      return;
    }
    const tags = (await this.models.tag.getBySaveId(save.id)).map(
      (_) => _.name
    );

    return {
      savedItem: save,
      tags,
      tagsUpdated,
      user: {
        id: this.userId,
        hashedId: this.headers.encodedid,
        email: this.headers.email,
        guid: parseInt(this.headers.guid),
        hashedGuid: this.headers.encodedguid,
        isPremium: this.userIsPremium,
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
