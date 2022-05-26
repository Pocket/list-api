import nock from 'nock';
import { config } from './config';
import { postBatchDelete, processor } from './index';
import * as Sentry from '@sentry/serverless';
import sinon from 'sinon';
import { SQSEvent } from 'aws-lambda';

describe('batchDelete lambda', () => {
  let sentryStub: sinon.SinonStub;
  beforeAll(() => (sentryStub = sinon.stub(Sentry, 'captureException')));
  afterAll(() => sentryStub.restore());
  describe('happy path', () => {
    beforeEach(() => {
      sentryStub.resetHistory();
      nock(config.endpoint).post(config.batchDeletePath).reply(200);
    });
    it('processor does not return batchItemFailure or log to Sentry if response is ok', async () => {
      const res = await processor({
        Records: [
          {
            body: JSON.stringify({ userId: 1, itemIds: [] }),
            messageId: 'abc',
          },
        ],
      } as SQSEvent); // Don't want to bother with all the fields
      expect(res.batchItemFailures).toEqual([]);
      expect(sentryStub.callCount).toEqual(0);
    });
  });
  describe('sad path', () => {
    beforeEach(() => {
      sentryStub.resetHistory();
      nock(config.endpoint)
        .post(config.batchDeletePath)
        .reply(400, { errors: ['this is an error'] });
    });
    it('postBatchDelete throws error if response is not ok', async () => {
      expect.assertions(2);
      try {
        await postBatchDelete({ userId: 1, itemIds: [] });
      } catch (e) {
        expect(e.message).toContain('batchDelete - 400');
        expect(e.message).toContain('this is an error');
      }
    });
    it('processor returns batchItemFailure and logs to Sentry if response is not ok', async () => {
      const res = await processor({
        Records: [
          {
            body: JSON.stringify({ userId: 1, itemIds: [] }),
            messageId: 'abc',
          },
        ],
      } as SQSEvent); // Don't want to bother with all the fields
      expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'abc' }]);
      expect(sentryStub.callCount).toEqual(1);
    });
  });
});
