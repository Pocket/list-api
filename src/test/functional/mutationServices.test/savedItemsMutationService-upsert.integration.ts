import { writeClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import nock from 'nock';
import config from '../../../config';
import {
  BasicItemEventPayload,
  EventType,
  ItemsEventEmitter,
  SQSEvents,
  SqsListener,
} from '../../../businessEvents';
import {
  ReceiveMessageCommand,
  ReceiveMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { sqs } from '../../../aws/sqs';
import sinon from 'sinon';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from '../testServerUtil';
import { transformers } from '../../../businessEvents/sqs/transformers';

chai.use(chaiDateTime);

function mockParserGetItemRequest(urlToParse: string, data: any) {
  nock(config.parserDomain)
    .get(`/${config.parserVersion}/getItemListApi`)
    .query({ url: urlToParse, getItem: '1' })
    .reply(200, data)
    .persist();
}

async function getSqsMessages(
  queueUrl: string
): Promise<ReceiveMessageCommandOutput> {
  const receiveParams = {
    AttributeNames: ['All'],
    MaxNumberOfMessages: 10,
    MessageAttributeNames: ['All'],
    QueueUrl: queueUrl,
    VisibilityTimeout: 20,
    WaitTimeSeconds: 4,
  };
  const receiveCommand = new ReceiveMessageCommand(receiveParams);

  try {
    return await sqs.send(receiveCommand);
  } catch (err) {
    console.log('unable to read message from the queue', err);
  }
}

describe('UpsertSavedItem Mutation', () => {
  const db = writeClient();
  const itemsEventEmitter = new ItemsEventEmitter();
  new SqsListener(itemsEventEmitter, transformers);
  const server = getServer('1', db, itemsEventEmitter);
  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const unixDate = getUnixTimestamp(date);
  const dateNow = new Date('2021-10-06 03:22:00');
  let clock;

  beforeAll(() => {
    clock = sinon.useFakeTimers({
      now: dateNow,
      shouldAdvanceTime: false,
    });
  });

  afterAll(async () => {
    await db.destroy();
    clock.restore();
    nock.cleanAll();
  });

  beforeEach(async () => {
    await sqs.purgeQueue({ QueueUrl: config.aws.sqs.publisherQueue.url });
    await sqs.purgeQueue({ QueueUrl: config.aws.sqs.permLibItemMainQueue.url });
    await db('item_tags').truncate();
    await db('list').truncate();
    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 8,
        tag: 'zebra',
        status: 1,
        time_added: null,
        time_updated: null,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
    ]);
  });
  describe('happy paths', () => {
    beforeAll(() => {
      const mockRequestData = [
        {
          url: 'http://getpocket.com',
          itemId: 8,
        },
        {
          url: 'http://google.com',
          itemId: 11,
        },
        {
          url: 'http://favorite.com',
          itemId: 2,
        },
        {
          url: 'http://eventemitter.com',
          itemId: 3,
        },
        {
          url: 'http://addingtoqueue.com',
          itemId: 25,
        },
        {
          url: 'http://write-client.com',
          itemId: 50,
        },
      ];
      mockRequestData.forEach(({ url, itemId }) =>
        mockParserGetItemRequest(url, {
          item: {
            given_url: url,
            item_id: itemId,
            resolved_id: itemId,
            title: url,
          },
        })
      );
    });

    it('should add a valid item and return savedItem', async () => {
      const variables = {
        url: 'http://getpocket.com',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
            _createdAt
            _updatedAt
            favoritedAt
            archivedAt
            isFavorite
            isArchived
            _deletedAt
            _version
            item {
              ... on Item {
                givenUrl
              }
            }
            tags {
              name
            }
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult).is.not.null;
      expect(mutationResult.data?.upsertSavedItem.id).to.equal('8');
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);
      expect(mutationResult.data?.upsertSavedItem.isFavorite).is.false;
      expect(mutationResult.data?.upsertSavedItem.isArchived).is.false;
      expect(mutationResult.data?.upsertSavedItem._deletedAt).is.null;
      expect(mutationResult.data?.upsertSavedItem._version).is.null;
      expect(mutationResult.data?.upsertSavedItem.item.givenUrl).equals(
        variables.url
      );
      expect(mutationResult.data?.upsertSavedItem.tags[0].name).equals('zebra');
      expect(mutationResult.data?.upsertSavedItem.archivedAt).is.null;
      expect(mutationResult.data?.upsertSavedItem.favoritedAt).is.null;
    });

    it('should add an item to the list even if the parser has not yet resolved or cannot resolve it', async () => {
      const url = 'https://unresolved.url';
      mockParserGetItemRequest(url, {
        item: {
          given_url: url,
          item_id: 1,
          resolved_id: '0',
        },
      });

      const variables = { url };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            item {
              ... on Item {
                givenUrl
              }
              ... on PendingItem {
                url
              }
            }
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult).is.not.null;
      expect(mutationResult.data?.upsertSavedItem.id).to.equal('1');
      expect(mutationResult.data?.upsertSavedItem.item.givenUrl).is.undefined;
      expect(mutationResult.data?.upsertSavedItem.item.url).to.equal(url);
    });

    it('should updated time favourite and time updated if provided in input', async () => {
      const variables = {
        url: 'http://google.com',
        isFavorite: true,
        timestamp: unixDate,
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem(
          $url: String!
          $isFavorite: Boolean
          $timestamp: Int
        ) {
          upsertSavedItem(
            input: { url: $url, isFavorite: $isFavorite, timestamp: $timestamp }
          ) {
            id
            url
            _createdAt
            _updatedAt
            favoritedAt
            archivedAt
            isFavorite
            isArchived
            _deletedAt
            _version
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult).is.not.null;
      expect(mutationResult.data?.upsertSavedItem.id).to.equal('11');
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);
      expect(mutationResult.data?.upsertSavedItem.isFavorite).is.true;
      expect(mutationResult.data?.upsertSavedItem.isArchived).is.false;
      expect(mutationResult.data?.upsertSavedItem.archivedAt).is.null;
      expect(mutationResult.data?.upsertSavedItem._createdAt).to.equal(
        unixDate
      );
      expect(mutationResult.data?.upsertSavedItem.favoritedAt).to.equal(
        unixDate
      );
    });

    it('should set time favorite to current time if isFav is set', async () => {
      const variables = {
        url: 'http://favorite.com',
        isFavorite: true,
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!, $isFavorite: Boolean) {
          upsertSavedItem(input: { url: $url, isFavorite: $isFavorite }) {
            id
            url
            favoritedAt
            isFavorite
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult.data?.upsertSavedItem.url).equals(
        'http://favorite.com'
      );
      expect(mutationResult.data?.upsertSavedItem.isFavorite).is.true;
      expect(mutationResult.data?.upsertSavedItem.favoritedAt).to.not.equal(
        getUnixTimestamp(new Date('0000-00-00 00:00:00'))
      );
    });

    it('should emit event on successful insert', async () => {
      const variables = {
        url: 'http://eventemitter.com',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
          }
        }
      `;

      let eventObj = null;
      itemsEventEmitter.on(
        EventType.ADD_ITEM,
        (eventData: BasicItemEventPayload) => {
          eventObj = eventData;
        }
      );

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(eventObj.user.id).equals('1');
      expect(parseInt((await eventObj.savedItem).id)).equals(3);
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);
    });

    it('should not emit event for duplicate add', async () => {
      const variables = {
        url: 'http://eventemitter.com',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
          }
        }
      `;
      // Duplicate the insert
      // register event before mutation, otherwise event won't be captured
      await server.executeOperation({ query: ADD_AN_ITEM, variables });
      let eventObj = null;
      itemsEventEmitter.on(
        EventType.ADD_ITEM,
        (eventData: BasicItemEventPayload) => {
          eventObj = eventData;
        }
      );
      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(eventObj).is.null;
      console.log(JSON.stringify(mutationResult));
      console.log(mutationResult.errors);
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);
    });

    it('should push addItem event to publisher data queue when an item is added', async () => {
      const variables = {
        url: 'http://addingtoqueue.com',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);

      const publisherQueueMessages = await getSqsMessages(
        config.aws.sqs.publisherQueue.url
      );
      expect(publisherQueueMessages?.Messages[0]?.Body).is.not.null;
      const publisherQueueMessageBody = JSON.parse(
        publisherQueueMessages?.Messages[0]?.Body
      );
      expect(publisherQueueMessageBody.action).equals(SQSEvents.ADD_ITEM);
      expect(publisherQueueMessageBody.user_id).equals(1);
      expect(publisherQueueMessageBody.item_id).equals(25);
      expect(publisherQueueMessageBody.api_id).equals(0);

      const permLibQueueData = await getSqsMessages(
        config.aws.sqs.permLibItemMainQueue.url
      );
      // Should not send for non-premium users
      expect(permLibQueueData?.Messages).is.undefined;
    });

    it('should push addItem event to perm lib queue for premium users', async () => {
      const variables = {
        url: 'http://addingtoqueue.com',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
          }
        }
      `;

      const server = getServer('1', db, itemsEventEmitter, { premium: 'true' });
      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult.data?.upsertSavedItem.url).to.equal(variables.url);

      const permLibQueueData = await getSqsMessages(
        config.aws.sqs.permLibItemMainQueue.url
      );
      expect(permLibQueueData?.Messages[0]?.Body).is.not.null;
      const permLibQueueBody = JSON.parse(permLibQueueData?.Messages[0]?.Body);
      expect(permLibQueueBody.userId).equals(1);
      expect(permLibQueueBody.itemId).equals(25);
      expect(permLibQueueBody.givenUrl).equals(variables.url);
      expect(permLibQueueBody.timeAdded).equals('2021-10-06 03:22:00');
      expect(permLibQueueBody.resolvedId).equals(25);
    });
    describe(' - on existing savedItem: ', () => {
      const ADD_AN_ITEM = gql`
        mutation addAnItem(
          $url: String!
          $isFavorite: Boolean
          $timestamp: Int
        ) {
          upsertSavedItem(
            input: { url: $url, isFavorite: $isFavorite, timestamp: $timestamp }
          ) {
            id
            url
            status
            _createdAt
            _updatedAt
            favoritedAt
            archivedAt
            isFavorite
            isArchived
          }
        }
      `;

      beforeEach(async () => {
        await db('list').truncate();
        await db('list').insert({
          item_id: 11,
          status: 1,
          favorite: 0,
          user_id: 1,
          resolved_id: 11,
          given_url: `http://google.com`,
          title: `don't be evil`,
          time_added: date,
          time_updated: date,
          time_read: date,
          time_favorited: date,
          api_id: 'apiid',
          api_id_updated: 'apiid',
        });
      });

      it(`should update an item already in a user's list`, async () => {
        const variables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        const mutationResult = await server.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });
        expect(mutationResult.errors).to.be.undefined;
        const data = mutationResult.data.upsertSavedItem;
        expect(data._createdAt)
          .to.equal(getUnixTimestamp(dateNow))
          .and.to.equal(data._updatedAt)
          .and.to.equal(data.favoritedAt);
        expect(data.status).to.equal('UNREAD');
        expect(data.isFavorite).to.be.true;
        expect(data.isArchived).to.be.false;
        expect(data.archivedAt).to.be.null;
        expect(data.url).to.equal('http://google.com');
        expect(data.id).to.equal('11');
      });
      it('should not emit an add item event', async () => {
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.ADD_ITEM, eventTracker);
        const variables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });
        expect(eventTracker.callCount).to.equal(0);
      });
      it('should emit favorite event if item is favorited', async () => {
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.FAVORITE_ITEM, eventTracker);
        const variables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });
        expect(eventTracker.callCount).to.equal(1);
        expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
          11
        );
      });
      it('should not unfavorite a previously favorited item, and should not send favorite event', async () => {
        const faveVariables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        const unFaveVariables = {
          url: 'http://google.com',
          isFavorite: false,
          timestamp: getUnixTimestamp(dateNow),
        };
        // Put in a favorite item
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables: faveVariables,
        });
        // Start listening for events after initial insert
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.FAVORITE_ITEM, eventTracker);
        // re-add it
        const res = await server.executeOperation({
          query: ADD_AN_ITEM,
          variables: unFaveVariables,
        });
        expect(res.errors).to.be.undefined;
        expect(res.data.upsertSavedItem.isFavorite).to.be.true;
        expect(eventTracker.callCount).to.equal(0);
      });
      it('should send not favorite event if item was previously favorited', async () => {
        const faveVariables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        const reFaveVariables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        // Put in a favorite item
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables: faveVariables,
        });
        // Start listening for events after initial insert
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.FAVORITE_ITEM, eventTracker);
        // re-add it
        const res = await server.executeOperation({
          query: ADD_AN_ITEM,
          variables: reFaveVariables,
        });
        expect(res.errors).to.be.undefined;
        expect(res.data.upsertSavedItem.isFavorite).to.be.true;
        expect(eventTracker.callCount).to.equal(0);
      });
      it('should emit unarchive event if item was previously archived', async () => {
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.UNARCHIVE_ITEM, eventTracker);
        const variables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });
        expect(eventTracker.callCount).to.equal(1);
        expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
          11
        );
      });

      it('should not emit unarchive event if item was not archived', async () => {
        const eventTracker = sinon.fake();
        itemsEventEmitter.on(EventType.UNARCHIVE_ITEM, eventTracker);
        await db('list')
          .update({ status: 0 })
          .where({ item_id: 11, user_id: 1 });
        const variables = {
          url: 'http://google.com',
          isFavorite: true,
          timestamp: getUnixTimestamp(dateNow),
        };
        await server.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });
        expect(eventTracker.callCount).to.equal(0);
      });

      //this test passes.
      // note, for some reason - if we have a test with null readClient,
      // then the following test/test suite fails to run
      //this somehow sets the db to null for the following test suite - so commenting this out
      /*it('should use write database client for all mutation call', async () => {
        //passing read client as null
        const writeServer = getServer(
          '1',
          null,
          writeClient(),
          itemsEventEmitter
        );
        const variables = {
          url: 'http://write-client.com',
        };
        const ADD_AN_ITEM = gql`
          mutation addAnItem($url: String!) {
            upsertSavedItem(input: { url: $url }) {
              id
              url
              _createdAt
              _updatedAt
            }
          }
        `;
        const mutationResult = await writeServer.executeOperation({
          query: ADD_AN_ITEM,
          variables,
        });

        expect(mutationResult.data?.upsertSavedItem.url).to.equal(
          variables.url
        );
      }); */
    });
  });
  describe('sad path', function () {
    it('should return error for invalid url', async () => {
      mockParserGetItemRequest('abcde1234', {
        item: {
          given_url: 'abcde1234',
          item_id: null,
        },
      });

      const variables = {
        url: 'abcde1234',
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!) {
          upsertSavedItem(input: { url: $url }) {
            id
            url
            _createdAt
            _updatedAt
          }
        }
      `;

      const mutationResult = await server.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult.errors[0].message).equals(
        `unable to add item with url: ${variables.url}`
      );
    }, 30000);
    it('should return error when insertion throws error', async () => {
      mockParserGetItemRequest('http://databasetest.com', {
        item: {
          given_url: 'http://databasetest.com',
          item_id: 2,
        },
      });

      const badServer = getServer('1', db, null, itemsEventEmitter);

      const variables = {
        url: 'http://databasetest.com',
        isFavorite: true,
      };

      const ADD_AN_ITEM = gql`
        mutation addAnItem($url: String!, $isFavorite: Boolean) {
          upsertSavedItem(input: { url: $url, isFavorite: $isFavorite }) {
            id
            url
            _createdAt
            _updatedAt
          }
        }
      `;

      const mutationResult = await badServer.executeOperation({
        query: ADD_AN_ITEM,
        variables,
      });
      expect(mutationResult.errors[0].message).equals(
        `unable to add item with url: ${variables.url}`
      );
    }, 30000);
  });
});
