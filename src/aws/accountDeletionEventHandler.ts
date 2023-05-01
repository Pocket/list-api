import EventEmitter from 'events';
import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import config from '../config';
import { IEventHandler } from './IEventHandler';
import { EventBridgeEventType } from './eventTypes';
import { BatchDeleteMessage } from './batchDeleteHandler';
import { EventBridgeBase } from './eventBridgeBase';
import { eventBridgeClient } from './eventBridgeClient';
import { AccountDeleteEventBusPayload } from './eventTypes';

/**
 * This class MUST be initialized using the EventBusHandler.init() method.
 * This is done to ensure event handlers adhere to the EventHandlerInterface.
 */
export class AccountDeletionEventHandler
  extends EventBridgeBase
  implements IEventHandler
{
  constructor() {
    super(eventBridgeClient);
  }

  init(emitter: EventEmitter) {
    emitter.on(
      EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
      async (data: BatchDeleteMessage) => {
        const eventPayload = this.processEventPayloadFromMessage(data);
        await this.sendEvent(eventPayload);
      }
    );

    return this;
  }

  /**
   * Send event to Event Bus, pulling the event bus and the event source
   * from the config.
   * Will not throw errors if event fails; instead, log exception to Sentry
   * and add to Cloudwatch logs.
   * @param eventPayload the payload to send to event bus
   */
  async sendEvent(eventPayload: any) {
    const putEventCommand = new PutEventsCommand({
      Entries: [
        {
          EventBusName: config.aws.eventBus.name,
          Detail: JSON.stringify(eventPayload),
          Source: config.aws.eventBus.accountDeletionEvent.source,
          DetailType: eventPayload.eventType,
        },
      ],
    });
    await this.putEvents(putEventCommand);
  }

  /**
   * Convert batch SQS message to account complete event payload
   */
  processEventPayloadFromMessage(data): AccountDeleteEventBusPayload {
    return {
      userId: data.userId.toString(),
      email: data.email,
      isPremium: data.isPremium,
      version: '1.0.0',
      service: 'list',
      timestamp: Math.round(new Date().getTime() / 1000),
      eventType: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
    };
  }
}
