import { ItemsEventEmitter } from './itemsEventEmitter';
import { EventType, ItemEventPayload } from './types';
import config from '../config';
import {
  PutEventsCommand,
  PutEventsCommandOutput,
} from '@aws-sdk/client-eventbridge';
import { eventBridgeClient } from '../aws/eventBridgeClient';
import * as Sentry from '@sentry/node';

export class EventBridgeHandler {
  private client = eventBridgeClient;
  constructor(
    emitter: ItemsEventEmitter,
    events: Array<keyof typeof EventType>
  ) {
    // register handler for item events
    events.forEach((event) =>
      emitter.on(
        EventType[event],
        async (data: ItemEventPayload) => await this.process(data)
      )
    );
  }
  /**
   * Send event to Event Bus, pulling the event bus and the event source
   * from the config.
   * Will not throw errors if event fails; instead, log exception to Sentry
   * and add to Cloudwatch logs.
   * @param eventPayload the payload to send to event bus
   */
  public async process(data: ItemEventPayload) {
    const putEventCommand = new PutEventsCommand({
      Entries: [
        {
          EventBusName: config.aws.eventBus.name,
          Detail: JSON.stringify(data),
          Source: config.serviceName,
          DetailType: data.eventType,
        },
      ],
    });
    const output: PutEventsCommandOutput = await this.client.send(
      putEventCommand
    );
    if (output.FailedEntryCount) {
      const failedEventError = new Error(
        `Failed to send event '${data.eventType}' to event bus=${
          config.aws.eventBus.name
        }. Event Body:\n ${JSON.stringify(data)}`
      );
      Sentry.captureException(failedEventError);
      console.error(failedEventError);
    }
  }
}
