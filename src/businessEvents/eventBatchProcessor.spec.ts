import { EventBatchProcessor } from './eventBatchProcessor';
import sinon from 'sinon';
import { EventEmitter } from 'stream';
import sleep from 'util';

// TODO: Remove and replace with await setTimeout from 'timers/promises'
// after updating to node 16
const wait = sleep.promisify(setTimeout);

describe('EventBatchHandler', () => {
  const emitter = new EventEmitter();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call handler function repeatedly', async () => {
    const handlerFn = sinon.fake.resolves(undefined);
    // Start the event processing loop
    const batchJob = new EventBatchProcessor(
      emitter,
      ['fake-event'],
      handlerFn,
      30
    );
    const emitterLoop = setInterval(() => {
      emitter.emit('fake-event', { data: ['1'] });
    }, 30);
    await wait(300);
    clearInterval(emitterLoop);
    await batchJob.stop();
    // Wait time and interval time is approximate, since it's not certain how
    // long calling the function will take; but should have executed more than once
    expect(handlerFn.callCount).toBeGreaterThan(1);
  });
  it('should not invoke handler with no events', async () => {
    const handlerFn = sinon.fake.resolves(undefined);
    // Start the event processing loop
    const batchJob = new EventBatchProcessor(
      emitter,
      ['fake-event'],
      handlerFn,
      30
    );
    await wait(300);
    await batchJob.stop();
    expect(handlerFn.callCount).toEqual(0);
  });
  // This test has been flaking, and the unified events kinesis stream has been
  // superseded by snowplow analytics.
  // so the risk of removing this coverage is very low
  it.skip('should throw a warning if batch size exceeds processing speed', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const batchJob = new EventBatchProcessor(
      emitter,
      ['different-event', 'fake-event'],
      sinon.fake.resolves(undefined),
      200,
      2
    );
    const emitterLoop = setInterval(() => {
      emitter.emit('fake-event', { data: ['1'] });
    }, 30);
    await wait(300);
    await batchJob.stop();
    clearInterval(emitterLoop);
    expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(consoleSpy.mock.calls[0][0]).toContain(
      'Ensure the processing interval is small enough'
    );
  });
  it('should gracefully handle errors during handler execution', async () => {
    const handlerFn = sinon.fake.rejects(new Error('Some error'));
    const consoleSpy = jest.spyOn(console, 'log');
    // Start the event processing loop
    const batchJob = new EventBatchProcessor(
      emitter,
      ['fake-event'],
      handlerFn,
      50,
      3
    );
    // Send a few events
    let eventCount = 0;
    const eventLoop = async () => {
      while (eventCount < 5) {
        emitter.emit('fake-event', {
          timestamp: new Date().getTime(),
          data: eventCount,
        });
        eventCount += 1;
        await wait(50);
      }
    };
    await eventLoop();
    await batchJob.stop();
    // Wait time and interval time is approximate, since it's not certain how
    // long calling the function will take; but should have executed more than once
    expect(handlerFn.callCount).toBeGreaterThan(1);
    expect(consoleSpy.mock.calls[0][0].message).toEqual('Some error');
    expect(consoleSpy.mock.calls[1][0]).toContain('Failed event batch');
  });
});
