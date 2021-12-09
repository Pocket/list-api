import { EventBatchProcessor } from './eventBatchProcessor';
import { unifiedEventKinesisHandler } from './unifiedEventKinesisHandler';
import { SqsListener } from './sqsListener';
import { sqs } from '../aws/sqs';
import { ItemsEventEmitter } from './itemsEventEmitter';
import { SnowplowHandler } from './snowplowHandler';
import { tracker } from '../snowplow/tracker';
import config from '../config';

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
  const sqsEventsToListen = Object.values(
    config.aws.sqs.publisherQueue.events
  ) as string[];
  new SqsListener(
    emitter,
    sqs,
    config.aws.sqs.publisherQueue.url,
    sqsEventsToListen
  );
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
