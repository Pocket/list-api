import util from 'util';
import { EventEmitter } from 'events';
import * as Sentry from '@sentry/node';
import { serverLogger } from '../server/logger';

// Generic type for an event handler based on the data it processes
type EventDataHandler<T> = (data: T) => Promise<void>;

// Promisify setTimeout so that we can get a better async stack
// trace to support errors
// TODO: Remove and replace with await setimeout from 'timers/promises'
// after updating to node 16
const sleep = util.promisify(setTimeout);

/**
 * Class for handling batches of events. Given an event emitter,
 * event name(s), an event handler function, and (optionally) a
 * time interval and batch size, this class registers a listener
 * on the event emitter for the given event name(s). When the listener
 * detects an event, it pushes the event data to an internal queue.
 * After the given time interval (default = 1s), will process up to
 * `batchSize` records from the queue using the event handler function.
 * Care should be taken to ensure that the event queue does not grow
 * significantly faster than the rate at which events are processed
 * (`batchSize` * `interval`).
 */
export class EventBatchProcessor<T> {
  private eventDataQueue: T[] = [];
  private shouldStop = false;

  /**
   * @param emitter The EventEmitter instance that emits relevant events
   * @param eventNames The specific event to listen on, emitted by `emitter`. Should emit an event with
   * a payload that can be processed by `handlerFn`
   * @param handlerFn A function to handle events. Should process an array of events and return Promise<void>.
   * @param interval The interval, in ms, to poll the queue for events to process
   * @param batchSize The number of events to process in one batch. If the handler function
   * includes API calls to AWS or other providers, ensure that this does not exceed the
   * limits of the service.
   */
  constructor(
    public emitter: EventEmitter,
    public eventNames: string[],
    private handlerFn: EventDataHandler<T[]>,
    private interval = 1000,
    private batchSize = 500,
  ) {
    // Register a listener on the events that pushes the event data to the queue
    this.eventNames.forEach((eventName: string) =>
      this.emitter.on(eventName, (data: T) => {
        this.eventDataQueue.push(data);
      }),
    );
    // Start consuming events (constructor can't be async)
    setImmediate(async () => await this.batchIntervals());
  }

  /**
   * This method starts what is basically an infinite loop of setTimeout
   * with the consumeBatch callback. It's easier to handle errors than
   * using setInterval. The timing of the callback invocations is more like
   * recursively calling setTimeout than using setInterval.
   */
  private async batchIntervals(): Promise<void> {
    // For breaking out of the recursion
    if (this.shouldStop) {
      return;
    } else {
      await this.consumeBatch();
      await sleep(this.interval);
      return this.batchIntervals();
    }
  }

  /**
   * The actual method for consuming events in the queue. Since events
   * in the queue are not processed at the same cadence as the queries/mutations
   * that create them, this method captures all errors and logs them to sentry
   * rather than interrupting the program.
   * Though the events are written to logs, this does mean that events can
   * fail to be sent while the application is still running, which may result
   * in downstream effects on analytics.
   */
  private async consumeBatch(): Promise<void> {
    const eventBatch = this.eventDataQueue.splice(-1 * this.batchSize);
    if (eventBatch.length === 0) {
      return;
    }
    // Log a warning if there's still a full batch left over after processing
    // This might be an indication that the batch processing can't catch up to the
    // event generation rate.
    if (this.eventDataQueue.length > this.batchSize) {
      serverLogger.warning(
        `${this.eventDataQueue.length} events still in queue after batch processing, Ensure the processing interval is small enough so the queue doesn't grow faster than it can be processed.`,
        { eventNames: this.eventNames },
      );
    }
    try {
      await this.handlerFn(eventBatch);
    } catch (e) {
      serverLogger.error(`Failed event batch`, {
        eventBatch: JSON.stringify(eventBatch),
        error: e,
      });
      Sentry.captureException(e);
    }
  }
  /**
   * Stop the event batch processor. Primarily to be used for tests.
   */
  public async stop(): Promise<void> {
    this.shouldStop = true;
    // Kind of a hacky way to try to 'wait out' any processes in progress
    // Assuming that the process doesn't take longer than the interval
    await sleep(this.interval);
  }
}
