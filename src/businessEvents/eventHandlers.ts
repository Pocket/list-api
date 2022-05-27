import { EventBatchProcessor } from './eventBatchProcessor';
import { unifiedEventKinesisHandler } from './unifiedEventKinesisHandler';
import { SqsListener } from './sqs/sqsListener';
import { ItemsEventEmitter } from './itemsEventEmitter';
import { SnowplowHandler } from './snowplowHandler';
import { tracker } from '../snowplow/tracker';
import config from '../config';
import { transformers } from './sqs/transformers';

export type ItemEventHandlerFn = (emitter: ItemsEventEmitter) => void;

/**
 * @param emitter
 */
export function unifiedEventHandler(emitter: ItemsEventEmitter): void {
  // Create a list of event names (as strings) to register
  // batch kinesis listener for unified event stream
  const unifiedEventsToListen = Object.values(
    config.aws.kinesis.unifiedEvents.events
  ) as string[];
  // Start event batch handler for unified events to kinesis
  new EventBatchProcessor( // eslint-disable-line
    emitter,
    unifiedEventsToListen,
    unifiedEventKinesisHandler,
    config.aws.kinesis.interval,
    config.aws.kinesis.maxBatch
  );
}

/**
 * @param emitter
 */
export function sqsEventHandler(emitter: ItemsEventEmitter): void {
  // Init SQS events handler
  new SqsListener(emitter, transformers);
}

/**
 * @param emitter
 */
export function snowplowEventHandler(emitter: ItemsEventEmitter): void {
  const snowplowEventsToListen = Object.values(
    config.snowplow.events
  ) as string[];
  new SnowplowHandler(emitter, tracker, snowplowEventsToListen);
}
