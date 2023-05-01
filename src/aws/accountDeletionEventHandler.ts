import EventEmitter from 'events';
import * as Sentry from '@sentry/node';
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandOutput,
} from '@aws-sdk/client-eventbridge';
import config from '../config';
import { processEventPayloadFromMessage } from './eventConfig';
import { IEventHandler } from './IEventHandler';
import { EventBridgeEventType } from './eventTypes';
import { BatchDeleteMessage } from './batchDeleteHandler';
import { eventBridgeClient } from './eventBridgeClient';

/**
 * This class MUST be initialized using the EventBusHandler.init() method.
 * This is done to ensure event handlers adhere to the EventHandlerInterface.
 */
export class AccountDeletionEventHandler implements IEventHandler {
  private client: EventBridgeClient;

  init(emitter: EventEmitter) {
    this.client = eventBridgeClient;

    emitter.on(
      EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
      async (data: BatchDeleteMessage) => {
        let eventPayload = undefined;
        try {
          eventPayload = processEventPayloadFromMessage(data);
          await this.sendEvent(eventPayload);
        } catch (error) {
          const failedEventError = new Error(
            `Failed to send event '${
              eventPayload.eventType
            }' to event bus. Event Body:\n ${JSON.stringify(eventPayload)}`
          );
          // Don't halt program, but capture the failure in Sentry and Cloudwatch
          Sentry.addBreadcrumb(failedEventError);
          Sentry.captureException(error);
          console.log(failedEventError);
          console.log(error);
        }
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
    const output: PutEventsCommandOutput = await this.client.send(
      putEventCommand
    );
    if (output.FailedEntryCount) {
      const failedEventError = new Error(
        `Failed to send event '${
          eventPayload.eventType
        }' to event bus. Event Body:\n ${JSON.stringify(eventPayload)}`
      );
      // Don't halt program, but capture the failure in Sentry and Cloudwatch
      Sentry.captureException(failedEventError);
      console.log(failedEventError);
    }
  }
}
