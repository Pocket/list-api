import chai, { expect } from 'chai';
import { readClient, writeClient } from '../../database/client';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import shallowDeepEqual from 'chai-shallow-deep-equal';
import sinon from 'sinon';
import { SQS } from '@aws-sdk/client-sqs';
import {
  enqueueSavedItemIds,
  SqsMessage,
} from '../../server/routes/queueDelete';
import { SavedItemDataService } from '../../dataService';
import config from '../../config';
import * as Sentry from '@sentry/node';

chai.use(deepEqualInAnyOrder);
chai.use(shallowDeepEqual);

describe('SavedItemsService', () => {
  let sentrySpy;
  let breadSpy;
  let sqsSendMock, queryLimit, itemIdChunkSize, sqsBatchSize;

  beforeAll(async () => {
    const db = writeClient();

    await db('list').truncate();
    const data = [];
    for (let i = 1; i <= 6; i++) {
      const date = new Date(`2020-10-0${i} 10:20:30`);

      data.push({
        user_id: 1,
        item_id: i,
        resolved_id: i,
        given_url: `https://abc${i}`,
        title: `my title ${i}`,
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 0,
        favorite: 0,
        api_id_updated: 'apiid',
      });
    }
    await db('list').insert(data);
    sentrySpy = sinon.spy(Sentry, 'captureException');
    breadSpy = sinon.spy(Sentry, 'addBreadcrumb');
  });

  beforeEach(() => {
    queryLimit = config.queueDelete.queryLimit;
    itemIdChunkSize = config.queueDelete.itemIdChunkSize;
    sqsBatchSize = config.aws.sqs.batchSize;
  });

  afterEach(() => {
    config.queueDelete.queryLimit = queryLimit;
    config.queueDelete.itemIdChunkSize = itemIdChunkSize;
    config.aws.sqs.batchSize = sqsBatchSize;
    sentrySpy.resetHistory();
    breadSpy.resetHistory();
  });

  describe('enqueueSavedItemIds success', () => {
    beforeAll(() => {
      sqsSendMock?.restore();
    });
    beforeEach(
      () => (sqsSendMock = sinon.stub(SQS.prototype, 'send').resolves())
    );
    afterEach(() => sqsSendMock.restore());
    it('sends batches of messages to sqs', async () => {
      config.queueDelete.queryLimit = 3;
      config.queueDelete.itemIdChunkSize = 3;
      config.aws.sqs.batchSize = 1;
      const userId = 1;
      const savedItemService = new SavedItemDataService({
        userId: userId.toString(),
        dbClient: readClient(),
        apiId: 'backend',
      });
      const data = {
        userId,
        email: 'test@yolo.com',
        isPremium: false,
      };

      await enqueueSavedItemIds(data as SqsMessage, savedItemService, '123');

      expect(sqsSendMock.callCount).to.equal(2);
      // No exceptions
      expect(sentrySpy.callCount).to.equal(0);
      const firstMessage = JSON.parse(
        sqsSendMock.getCall(0).args[0].input.Entries[0].MessageBody
      );
      const secondMessage = JSON.parse(
        sqsSendMock.getCall(1).args[0].input.Entries[0].MessageBody
      );
      expect(firstMessage).to.shallowDeepEqual({ ...data, itemIds: [1, 2, 3] });
      expect(firstMessage.traceId).to.not.be.empty;
      expect(secondMessage).to.shallowDeepEqual({
        ...data,
        itemIds: [4, 5, 6],
      });
      expect(secondMessage.traceId).to.not.be.empty;
    });
  });
  describe('enqueueSavedItemIds failure', () => {
    beforeAll(() => {
      sqsSendMock?.restore();
    });
    beforeEach(() => {
      sqsSendMock = sinon
        .stub(SQS.prototype, 'send')
        .onFirstCall()
        .rejects(new Error('no queue for you'))
        .onSecondCall()
        .resolves();
    });
    afterEach(() => sqsSendMock.restore());
    it('reports errors to Sentry when a batch fails, even if some succeed', async () => {
      config.queueDelete.queryLimit = 3;
      config.queueDelete.itemIdChunkSize = 3;
      config.aws.sqs.batchSize = 1;
      const userId = 1;
      const savedItemService = new SavedItemDataService({
        userId: userId.toString(),
        dbClient: readClient(),
        apiId: 'backend',
      });
      const data = {
        userId,
        email: 'test@yolo.com',
        isPremium: false,
      };

      await enqueueSavedItemIds(data as SqsMessage, savedItemService, '123');

      // Two calls made
      expect(sqsSendMock.callCount).to.equal(2);
      // Only one fails
      expect(sentrySpy.callCount).to.equal(1);
      expect(sentrySpy.firstCall.args[0].message).to.equal('no queue for you');
      expect(breadSpy.callCount).to.equal(1);
      expect(breadSpy.firstCall.args[0].message)
        .to.contain('QueueDelete: Error')
        .and.to.contain('itemIds');
    });
  });
});
