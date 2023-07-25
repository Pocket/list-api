import kinesis from '../aws/kinesis';
import config from '../config';
import {
  PutRecordsCommand,
  PutRecordsRequestEntry,
} from '@aws-sdk/client-kinesis';
import * as Sentry from '@sentry/node';
import {
  EventType,
  EventTypeString,
  ItemEventPayload,
  UnifiedEventMap,
  UnifiedEventPayload,
} from './types';
import { serverLogger } from '../server/apollo';

/**
 * Transform an ItemEventPayload into the format expected for UnifiedEvents.
 * Helper function for `unifiedEventKinesisHandler`.
 * Reference: https://github.com/pocket/spec/tree/master/backend/data/unified-event
 */
export async function unifiedEventTransformer(
  eventPayload: ItemEventPayload
): Promise<UnifiedEventPayload> {
  return {
    type: UnifiedEventMap[eventPayload.eventType],
    data: await buildUnifiedEventData(eventPayload),
    timestamp: eventPayload.timestamp,
    source: eventPayload.source,
    version: eventPayload.version,
  };
}

/**
 * Explicitly check if the type of tag event is supported by the unified event handler
 * @param eventType
 */
function isSupportedTagEventType(eventType: EventTypeString) {
  return [
    EventType.ADD_TAGS,
    EventType.CLEAR_TAGS,
    EventType.REMOVE_TAGS,
    EventType.REPLACE_TAGS,
  ].includes(EventType[eventType]);
}

/**
 * Builds the unified event stream data
 * @param eventPayload
 */
async function buildUnifiedEventData(eventPayload: ItemEventPayload) {
  const data = {
    user_id: parseInt(eventPayload.user.id),
    item_id: parseInt((await eventPayload.savedItem).id),
    api_id: parseInt(eventPayload.apiUser.apiId),
  };

  if (isSupportedTagEventType(eventPayload.eventType)) {
    return {
      ...data,
      tags: eventPayload.tagsUpdated,
    };
  }

  return data;
}

/**
 * Process event array and send to kinesis stream.
 * If the response still contains failed records after retrying,
 * log an error to console and sentry.
 * @param events array of event data for unified event stream
 */
export async function unifiedEventKinesisHandler(
  events: ItemEventPayload[]
): Promise<void> {
  if (events.length == 0) {
    return;
  }

  // For more concise logging of failed events
  const unifiedEvents: Promise<UnifiedEventPayload>[] = events.map(
    unifiedEventTransformer
  );
  const resolvedUnifiedEvents = await Promise.all(unifiedEvents);
  const records: PutRecordsRequestEntry[] = resolvedUnifiedEvents.map(
    (event: UnifiedEventPayload, index: number) => {
      return {
        Data: Buffer.from(JSON.stringify(event)),
        PartitionKey: `${index}-partition`,
      };
    }
  );
  const putCommand = new PutRecordsCommand({
    StreamName: config.aws.kinesis.unifiedEvents.streamName,
    Records: records,
  });
  const response = await kinesis.send(putCommand);

  // Check for failed records
  // AWS SDK automatically retries failed records up to max retries
  if (response.FailedRecordCount > 0) {
    // Create array of just failed events
    const failedEvents = response.Records.reduce(
      (accumulator: UnifiedEventPayload[], record, index) => {
        if (record.ErrorCode != null) {
          accumulator.push(resolvedUnifiedEvents[index]);
        }
        return accumulator;
      },
      []
    );
    const errorMessage = `ERROR: Failed to send ${
      failedEvents.length
    } event(s) to kinesis stream '${
      config.aws.kinesis.unifiedEvents.streamName
    }'. Failed Events: \n ${JSON.stringify(failedEvents)}`;
    serverLogger.error(errorMessage);
    Sentry.captureException(new Error(errorMessage));
  }
}
