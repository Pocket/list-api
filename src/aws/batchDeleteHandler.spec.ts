import sinon from 'sinon';
import { EventEmitter } from 'events';
import { BatchDeleteHandler, BatchDeleteMessage } from './batchDeleteHandler';
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SavedItemDataService } from '../dataService/savedItemsService';
import * as Sentry from '@sentry/node';
import config from '../config';

describe('batchDeleteHandler', () => {
  const emitter = new EventEmitter();
  const batchDeleteHandler = new BatchDeleteHandler(emitter, false);
  const fakeMessageBody: BatchDeleteMessage = {
    traceId: 'abc-123',
    itemIds: [1, 2, 3, 4, 5],
    userId: 123,
  };
  let scheduleStub: sinon.SinonStub;
  let sentryStub: sinon.SinonStub;
  let consoleStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.restore();
    scheduleStub = sinon
      .stub(batchDeleteHandler, 'scheduleNextPoll')
      .resolves();

    sentryStub = sinon.stub(Sentry, 'captureException');
    consoleStub = sinon.stub(console, 'error');
  });
  it('sends an event when the class is initialized', () => {
    const eventSpy = sinon.spy(emitter, 'emit');
    sinon.stub(BatchDeleteHandler.prototype, 'pollQueue').resolves();
    new BatchDeleteHandler(emitter);
    expect(eventSpy.calledOnceWithExactly('pollBatchDelete')).toBe(true);
  });
  it('invokes listener when pollBatchDelete event is emitted', async () => {
    const listenerStub = sinon.stub(batchDeleteHandler, 'pollQueue').resolves();
    emitter.emit('pollBatchDelete');
    expect(listenerStub.callCount).toEqual(1);
  });
  it('schedules a poll event after some time if no messages returned', async () => {
    sinon.stub(SQSClient.prototype, 'send').resolves({ Messages: [] });
    await batchDeleteHandler.pollQueue();
    expect(scheduleStub.calledOnceWithExactly(300000)).toBe(true);
  });
  it('logs critical error if could not receive messages, and reschedules', async () => {
    const error = new Error(`You got Q'd`);
    sinon.stub(SQSClient.prototype, 'send').rejects(error);
    await batchDeleteHandler.pollQueue();
    expect(
      sentryStub.calledOnceWithExactly(error, {
        level: Sentry.Severity.Critical,
      })
    ).toBe(true);
    expect(consoleStub.callCount).toEqual(1);
    expect(scheduleStub.calledOnceWithExactly(300000)).toBe(true);
  });
  describe('With a message', () => {
    describe('pollQueue', () => {
      it('invokes account delete data service if a message is returned from poll', async () => {
        const deleteStub = sinon
          .stub(SavedItemDataService.prototype, 'batchDeleteSavedItems')
          .resolves();
        sinon
          .stub(SQSClient.prototype, 'send')
          .resolves({ Messages: [{ Body: JSON.stringify(fakeMessageBody) }] });
        await batchDeleteHandler.pollQueue();
        expect(
          deleteStub.calledOnceWithExactly([1, 2, 3, 4, 5], 'abc-123')
        ).toBe(true);
      });
      it('schedules polling another message after a delay', async () => {
        sinon
          .stub(SQSClient.prototype, 'send')
          .resolves({ Messages: [{ Body: JSON.stringify(fakeMessageBody) }] });
        sinon.stub(batchDeleteHandler, 'handleMessage').resolves(true);
        sinon.stub(batchDeleteHandler, 'deleteMessage').resolves();
        await batchDeleteHandler.pollQueue();
        expect(scheduleStub.calledOnceWithExactly(60000)).toBe(true);
      });
      it('sends a delete if message was successfully processed', async () => {
        sinon.stub(batchDeleteHandler, 'handleMessage').resolves(true);
        const sqsStub = sinon
          .stub(SQSClient.prototype, 'send')
          .onFirstCall()
          .resolves({ Messages: [{ Body: JSON.stringify(fakeMessageBody) }] })
          .onSecondCall()
          .resolves();
        await batchDeleteHandler.pollQueue();
        expect(sqsStub.callCount).toEqual(2);
        expect(sqsStub.secondCall.args[0].input).toEqual(
          new DeleteMessageCommand({
            QueueUrl: config.aws.sqs.listDeleteQueue.url,
            ReceiptHandle: undefined,
          }).input
        );
      });
      it('does not delete if message was unsuccessfully processed', async () => {
        sinon.stub(batchDeleteHandler, 'handleMessage').resolves(false);
        const sqsStub = sinon
          .stub(SQSClient.prototype, 'send')
          .onFirstCall()
          .resolves({ Messages: [{ Body: JSON.stringify(fakeMessageBody) }] })
          .onSecondCall()
          .resolves();
        await batchDeleteHandler.pollQueue();
        expect(sqsStub.callCount).toEqual(1);
      });
    });
    describe('handleMessage', () => {
      it('sends error to Sentry and Cloudwatch if data service call fails, and schedules poll', async () => {
        const error = new Error(`You got Q'd`);
        sinon
          .stub(SavedItemDataService.prototype, 'batchDeleteSavedItems')
          .rejects(error);
        await batchDeleteHandler.handleMessage(fakeMessageBody);
        expect(sentryStub.calledOnceWithExactly(error)).toBe(true);
        expect(consoleStub.callCount).toEqual(2);
      });
    });
  });
});
