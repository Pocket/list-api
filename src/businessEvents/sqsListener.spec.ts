import { SQS } from '@aws-sdk/client-sqs';
import sinon from 'sinon';
import { SqsListener } from './sqsListener';
import { ItemsEventEmitter } from './itemsEventEmitter';
import { SavedItem } from '../types';
import { EventType, SQSEvents } from './types';

describe('SqsListener spec test', function () {
  function fakeSendError() {
    throw new Error('some SQS error');
  }

  const sqs = new SQS({ region: 'us-east-1' });
  let stub = null;
  afterAll(() => {
    stub.reset();
  });

  it('should log error when sqs send fails', async () => {
    const eventEmitter = new ItemsEventEmitter();
    stub = sinon.stub(sqs, 'send').callsFake(fakeSendError);
    const sqsListener = new SqsListener(eventEmitter, sqs, 'someurl', [
      'some sqs events',
    ]);
    const consoleSpy = jest.spyOn(console, 'log');

    const testSavedItem: SavedItem = {
      id: '1',
      resolvedId: '1',
      url: 'itemurl',
      isFavorite: false,
      isArchived: false,
      status: 'UNREAD',
      item: null,
    };

    const eventData = {
      user: { id: '1' },
      savedItem: Promise.resolve(testSavedItem),
      apiUser: { apiId: '1' },
      eventType: EventType.ADD_ITEM,
    };

    await sqsListener.process(eventData);
    expect(consoleSpy.mock.calls[0][0]).toContain(
      `unable to add event ${SQSEvents['ADD_ITEM']} to the queue
       for userId ${eventData.user.id} and itemId ${testSavedItem.id}`
    );
  });
});
