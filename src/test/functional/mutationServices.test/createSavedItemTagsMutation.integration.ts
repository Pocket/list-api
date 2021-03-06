import { writeClient } from '../../../database/client';
import {
  BasicItemEventPayload,
  EventType,
  ItemsEventEmitter,
} from '../../../businessEvents';
import { getServer } from '../testServerUtil';
import sinon from 'sinon';
import { gql } from 'apollo-server-express';
import { getUnixTimestamp } from '../../../utils';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import chaiDateTime from 'chai-datetime';

chai.use(deepEqualInAnyOrder);
chai.use(chaiDateTime);

describe('createSavedItemTags mutation', function () {
  const db = writeClient();
  const eventEmitter: ItemsEventEmitter = new ItemsEventEmitter();

  const server = getServer('1', db, eventEmitter);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;

  beforeAll(() => {
    // Mock Date.now() to get a consistent date for inserting data
    clock = sinon.useFakeTimers({
      now: updateDate,
      shouldAdvanceTime: false,
    });
  });

  afterAll(async () => {
    await db.destroy();
    clock.restore();
  });

  beforeEach(async () => {
    await db('item_tags').truncate();
    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 1,
        tag: 'summer',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'second_id',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 1,
        tag: 'zebra',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 0,
        tag: 'existing_tag',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
    ]);

    await db('list').truncate();
    const inputData = [
      { item_id: 0, status: 1, favorite: 0 },
      { item_id: 1, status: 1, favorite: 0 },
    ].map((row) => {
      return {
        ...row,
        user_id: 1,
        resolved_id: row.item_id,
        given_url: `http://${row.item_id}`,
        title: `title ${row.item_id}`,
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        api_id_updated: 'apiid',
      };
    });
    await db('list').insert(inputData);
  });

  const createSavedItemTags = gql`
    mutation createSavedItemTags($input: [SavedItemTagsInput!]!) {
      createSavedItemTags(input: $input) {
        url
        _updatedAt
        tags {
          id
          name
          _createdAt
          _updatedAt
        }
      }
    }
  `;

  it(
    'should be able to bulk update multiple tags for multiple savedItem' +
      'and return savedItems current state',
    async () => {
      const tagNames = ['????????', '(??????????)?????? ?????????'];

      const variables = {
        input: [
          { savedItemId: '0', tags: tagNames },
          { savedItemId: '0', tags: [...tagNames, 'another_new_tag'] },
          { savedItemId: '1', tags: tagNames },
        ],
      };

      const res = await server.executeOperation({
        query: createSavedItemTags,
        variables,
      });

      const addedResult = [
        {
          id: '8J+kqvCfmJI=',
          name: '????????',
          _createdAt: getUnixTimestamp(updateDate),
          _updatedAt: getUnixTimestamp(updateDate),
        },
        {
          id: 'KOKVr8Kw4pahwrAp4pWv77i1IOKUu+KUgeKUuw==',
          name: '(??????????)?????? ?????????',
          _createdAt: getUnixTimestamp(updateDate),
          _updatedAt: getUnixTimestamp(updateDate),
        },
      ];

      const expectedTagsForSavedItemOne = [
        ...addedResult,
        {
          id: 'c3VtbWVy',
          name: 'summer',
          _createdAt: getUnixTimestamp(date),
          _updatedAt: getUnixTimestamp(date),
        },
        {
          id: 'emVicmE=',
          name: 'zebra',
          _createdAt: getUnixTimestamp(date1),
          _updatedAt: getUnixTimestamp(date1),
        },
      ];

      const expectedTagsForSavedItemZero = [
        ...addedResult,
        {
          id: 'ZXhpc3RpbmdfdGFn',
          name: 'existing_tag',
          _createdAt: getUnixTimestamp(date1),
          _updatedAt: getUnixTimestamp(date1),
        },
        {
          id: 'YW5vdGhlcl9uZXdfdGFn',
          name: 'another_new_tag',
          _createdAt: getUnixTimestamp(updateDate),
          _updatedAt: getUnixTimestamp(updateDate),
        },
      ];

      expect(res).is.not.undefined;
      expect(res.data.createSavedItemTags[0].url).equals('http://0');
      expect(res.data.createSavedItemTags[0]._updatedAt).equals(
        getUnixTimestamp(updateDate)
      );
      expect(res.data.createSavedItemTags[0].tags.length).to.equal(4);
      expect(res.data.createSavedItemTags[0].tags).to.deep.equalInAnyOrder(
        expectedTagsForSavedItemZero
      );

      expect(res.data.createSavedItemTags[1].url).equals('http://1');
      expect(res.data.createSavedItemTags[1]._updatedAt).equals(
        getUnixTimestamp(updateDate)
      );
      expect(res.data.createSavedItemTags[1].tags.length).to.equal(4);
      expect(res.data.createSavedItemTags[1].tags).to.deep.equalInAnyOrder(
        expectedTagsForSavedItemOne
      );
    }
  );

  it('createSavedItemTags should emit ADD_TAGS event on success', async () => {
    const variables = {
      input: [{ savedItemId: '1', tags: ['tofino', 'victoria'] }],
    };

    //register event before mutation, otherwise event won't be captured
    let eventObj = null;
    eventEmitter.on(EventType.ADD_TAGS, (eventData: BasicItemEventPayload) => {
      eventObj = eventData;
    });

    const res = await server.executeOperation({
      query: createSavedItemTags,
      variables,
    });

    expect(res.errors).to.be.undefined;
    expect(eventObj.user.id).equals('1');
    expect(parseInt((await eventObj.savedItem).id)).equals(1);
    expect(await eventObj.tags).to.deep.equalInAnyOrder([
      'summer',
      'tofino',
      'victoria',
      'zebra',
    ]);
    expect(await eventObj.tagsUpdated).to.deep.equalInAnyOrder([
      'tofino',
      'victoria',
    ]);
  });
});
