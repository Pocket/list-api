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

chai.use(deepEqualInAnyOrder);
chai.use(shallowDeepEqual);

describe('SavedItemsService', () => {
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
  });

  let sqsSendMock, queryLimit, itemIdChunkSize, sqsBatchSize;
  beforeEach(() => {
    queryLimit = config.queueDelete.queryLimit;
    itemIdChunkSize = config.queueDelete.itemIdChunkSize;
    sqsBatchSize = config.aws.sqs.batchSize;
    sqsSendMock = sinon.stub(SQS.prototype, 'send');
  });

  afterEach(() => {
    config.queueDelete.queryLimit = queryLimit;
    config.queueDelete.itemIdChunkSize = itemIdChunkSize;
    config.aws.sqs.batchSize = sqsBatchSize;
    sinon.restore();
  });

  describe('enqueueSavedItemIds', () => {
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
        status: 'FREE',
      };

      await enqueueSavedItemIds(data as SqsMessage, savedItemService, '123');

      expect(sqsSendMock.callCount).to.equal(2);
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
});
