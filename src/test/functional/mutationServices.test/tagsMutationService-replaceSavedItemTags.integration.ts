import { writeClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import sinon from 'sinon';
import { ItemsEventEmitter } from '../../../businessEvents';
import { UsersMetaService } from '../../../dataService';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import chaiDateTime from 'chai-datetime';
import { BasicItemEventPayload, EventType } from '../../../businessEvents';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from '../testServerUtil';

chai.use(deepEqualInAnyOrder);
chai.use(chaiDateTime);

describe('tags mutation: replace savedItem tags', () => {
  const db = writeClient();
  const eventEmitter: ItemsEventEmitter = new ItemsEventEmitter();

  const server = getServer('1', db, eventEmitter);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;
  let logTagSpy;

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
        item_id: 1,
        tag: 'existing_tag',
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

  const replaceSavedItemTags = gql`
    mutation replaceSavedItemTags($input: [SavedItemTagsInput!]!) {
      replaceSavedItemTags(input: $input) {
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

  it('replacesSavedItemTags should replace tags for a given savedItem', async () => {
    const tagNames = ['🤪😒', '(╯°□°)╯︵ ┻━┻'];

    const variables = {
      input: [{ savedItemId: '1', tags: tagNames }],
    };

    const res = await server.executeOperation({
      query: replaceSavedItemTags,
      variables,
    });

    const expectedTags = [
      {
        id: '8J+kqvCfmJI=',
        name: '🤪😒',
        _createdAt: getUnixTimestamp(updateDate),
        _updatedAt: getUnixTimestamp(updateDate),
      },
      {
        id: 'KOKVr8Kw4pahwrAp4pWv77i1IOKUu+KUgeKUuw==',
        name: '(╯°□°)╯︵ ┻━┻',
        _createdAt: getUnixTimestamp(updateDate),
        _updatedAt: getUnixTimestamp(updateDate),
      },
    ];

    expect(res).is.not.undefined;
    expect(res.data.replaceSavedItemTags[0].url).equals('http://1');
    expect(res.data.replaceSavedItemTags[0]._updatedAt).equals(
      getUnixTimestamp(updateDate)
    );
    expect(res.data.replaceSavedItemTags[0].tags.length).to.equal(2);
    expect(res.data.replaceSavedItemTags[0].tags).to.deep.equalInAnyOrder(
      expectedTags
    );
  });

  it('replacesSavedItemTags should replace tags for multiple savedItems', async () => {
    const tagNames = ['(╯°□°)╯︵ ┻━┻'];

    const variables = {
      input: [
        { savedItemId: '1', tags: tagNames },
        { savedItemId: '0', tags: tagNames },
      ],
    };

    const res = await server.executeOperation({
      query: replaceSavedItemTags,
      variables,
    });

    const expectedTags = [
      {
        id: 'KOKVr8Kw4pahwrAp4pWv77i1IOKUu+KUgeKUuw==',
        name: '(╯°□°)╯︵ ┻━┻',
        _createdAt: getUnixTimestamp(updateDate),
        _updatedAt: getUnixTimestamp(updateDate),
      },
    ];

    expect(res).is.not.undefined;
    expect(res.data.replaceSavedItemTags.length).to.equal(2);
    expect(res.data.replaceSavedItemTags).to.deep.equalInAnyOrder([
      {
        url: 'http://1',
        _updatedAt: getUnixTimestamp(updateDate),
        tags: expectedTags,
      },
      {
        url: 'http://0',
        _updatedAt: getUnixTimestamp(updateDate),
        tags: expectedTags,
      },
    ]);
  });

  it('replaceSavedItemTags should emit replace_tag event on success', async () => {
    const variables = {
      input: [{ savedItemId: '1', tags: ['tofino', 'victoria'] }],
    };

    //register event before mutation, otherwise event won't be captured
    let eventObj = null;
    eventEmitter.on(
      EventType.REPLACE_TAGS,
      (eventData: BasicItemEventPayload) => {
        eventObj = eventData;
      }
    );

    const res = await server.executeOperation({
      query: replaceSavedItemTags,
      variables,
    });

    expect(res.errors).to.be.undefined;
    expect(eventObj.user.id).equals('1');
    expect(parseInt((await eventObj.savedItem).id)).equals(1);
    expect(await eventObj.tags).to.deep.equalInAnyOrder(['tofino', 'victoria']);
    expect(await eventObj.tagsUpdated).to.deep.equalInAnyOrder([
      'tofino',
      'victoria',
    ]);
  });

  it('replaceSavedItemTags should roll back if encounter an error during transaction', async () => {
    const listStateQuery = db('list').select();
    const tagStateQuery = db('item_tags').select();
    const metaStateQuery = db('users_meta').select();

    // Get the current db state
    const listState = await listStateQuery;
    const tagState = await tagStateQuery;
    const metaState = await metaStateQuery;

    logTagSpy = await sinon
      .stub(UsersMetaService.prototype, 'logTagMutation')
      .rejects(Error('server error'));

    const variables = {
      input: { savedItemId: '1', tags: ['helloWorld'] },
    };

    const res = await server.executeOperation({
      query: replaceSavedItemTags,
      variables,
    });

    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).contains(`Internal server error`);
    expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
    expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
    expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    logTagSpy.restore();
  });
  it('should not allow an empty tag', async () => {
    const variables = {
      input: { savedItemId: '1', tags: ['helloWorld', ''] },
    };
    const res = await server.executeOperation({
      query: replaceSavedItemTags,
      variables,
    });
    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).contains('Invalid tag: empty string');
    expect(res.errors[0].extensions?.code).to.equal('BAD_USER_INPUT');
  });
});
