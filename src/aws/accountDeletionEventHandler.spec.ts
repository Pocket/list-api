import sinon from 'sinon';
import * as Sentry from '@sentry/node';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import config from '../config';
import { setTimeout } from 'timers/promises';
import EventEmitter from 'events';
import {
  AccountDeleteEventBusPayload,
  EventBridgeEventType,
} from './eventTypes';
import { AccountDeletionEventHandler } from './accountDeletionEventHandler';
import { UserMessageBase } from './batchDeleteHandler';
import * as EventConfig from './eventConfig';

/**
 * Mock event payload
 */
const userEventData: UserMessageBase = {
  traceId: 'bla-123',
  userId: 1,
  email: 'test@email.com',
  isPremium: false,
};

describe('AccountDeleteCompletion Error handler', () => {
  const sandbox = sinon.createSandbox();
  let clientStub = sandbox
    .stub(EventBridgeClient.prototype, 'send')
    .resolves({ FailedEntryCount: 0 });
  const sentryStub = sandbox.stub(Sentry, 'captureException').resolves();
  const crumbStub = sandbox.stub(Sentry, 'addBreadcrumb').resolves();
  const consoleSpy = sandbox.spy(console, 'log');
  const emitter = new EventEmitter();
  const handler = new AccountDeletionEventHandler().init(emitter);
  const now = new Date('2022-01-01 00:00:00');
  let clock;

  beforeAll(() => {
    clock = sinon.useFakeTimers({
      now: now,
      shouldAdvanceTime: false,
    });
  });

  beforeEach(() => {
    clientStub.restore();
  });

  afterEach(() => {
    sandbox.resetHistory();
  });

  afterAll(() => {
    sandbox.restore();
    clock.restore();
  });

  const expectedEventPayload: AccountDeleteEventBusPayload = {
    userId: '1',
    email: 'test@email.com',
    isPremium: false,
    service: 'list',
    version: '1.0.0',
    eventType: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
    timestamp: now.getTime() / 1000,
  };

  const processEventStub = sinon
    .stub(EventConfig, 'processEventPayloadFromMessage')
    .returns(expectedEventPayload);

  it('should listen to account delete, process event data and call sendEvent', () => {
    const sendEventStub = sinon.stub(handler, 'sendEvent').resolves();
    expect(emitter.listeners('account-deletion-complete').length).toBe(1);
    emitter.emit('account-deletion-complete');
    expect(processEventStub.callCount).toBe(1);
    expect(sendEventStub.callCount).toBe(1);
    sendEventStub.restore();
  });

  it('should send event to event bus with proper event data', async () => {
    clientStub = sandbox
      .stub(EventBridgeClient.prototype, 'send')
      .resolves({ FailedEntryCount: 0 });

    const eventType = EventBridgeEventType.ACCOUNT_DELETION_COMPLETED;
    emitter.emit(eventType, userEventData);
    // Wait just a tad in case promise needs time to resolve
    await setTimeout(100);
    expect(sentryStub.callCount).toBe(0);
    expect(consoleSpy.callCount).toBe(0);
    // Listener was registered on event
    expect(emitter.listeners(eventType).length).toBe(1);
    // Event was sent to Event Bus
    expect(clientStub.callCount).toBe(1);
    // Check that the payload is correct; since it's JSON, we need to decode the data
    // otherwise it also does ordering check
    const sendCommand = clientStub.getCall(0).args[0].input as any;
    expect(sendCommand).toHaveProperty('Entries');
    expect(sendCommand.Entries[0]).toMatchObject({
      Source: config.aws.eventBus.accountDeletionEvent.source,
      EventBusName: config.aws.eventBus.name,
      DetailType: eventType,
    });
    expect(JSON.parse(sendCommand.Entries[0]['Detail'])).toEqual(
      expectedEventPayload
    );
  });

  it('should log error if any events fail to send', async () => {
    clientStub = sandbox
      .stub(EventBridgeClient.prototype, 'send')
      .resolves({ FailedEntryCount: 1 });
    emitter.emit(
      EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
      userEventData
    );
    // Wait just a tad in case promise needs time to resolve
    await setTimeout(100);
    expect(sentryStub.callCount).toBe(1);
    expect(sentryStub.getCall(0).firstArg.message).toContain(
      `Failed to send event 'account-deletion-complete' to event bus`
    );
    expect(consoleSpy.callCount).toBe(1);
    expect(consoleSpy.getCall(0).firstArg.message).toContain(
      `Failed to send event 'account-deletion-complete' to event bus`
    );
  });

  it('should log error if send call throws error', async () => {
    clientStub = sandbox
      .stub(EventBridgeClient.prototype, 'send')
      .rejects(new Error('boo!'));
    emitter.emit(
      EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
      userEventData
    );
    // Wait just a tad in case promise needs time to resolve
    await setTimeout(100);
    expect(sentryStub.callCount).toBe(1);
    expect(sentryStub.getCall(0).firstArg.message).toContain('boo!');
    expect(crumbStub.callCount).toBe(1);
    expect(crumbStub.getCall(0).firstArg.message).toContain(
      `Failed to send event 'account-deletion-complete' to event bus`
    );
    expect(consoleSpy.callCount).toBe(2);
    expect(consoleSpy.getCall(0).firstArg.message).toContain(
      `Failed to send event 'account-deletion-complete' to event bus`
    );
  });
});
