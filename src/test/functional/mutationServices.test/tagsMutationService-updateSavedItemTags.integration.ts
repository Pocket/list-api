import { readClient, writeClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import sinon from 'sinon';
import { ItemsEventEmitter } from '../../../businessEvents';
import { UsersMetaService } from '../../../dataService';
import { mysqlTimeString } from '../../../dataService/utils';
import config from '../../../config';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import chaiDateTime from 'chai-datetime';
import { BasicItemEventPayload, EventType } from '../../../businessEvents';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from '../testServerUtil';

chai.use(deepEqualInAnyOrder);
chai.use(chaiDateTime);

describe('tags mutation update: ', () => {
  const db = readClient();
  const readDb = readClient();
  const eventEmitter: ItemsEventEmitter = new ItemsEventEmitter();

  const server = getServer('1', readDb, db, eventEmitter);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const unixDate = getUnixTimestamp(date);
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
    await writeClient().destroy();
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

  const updateSavedItemTags = gql`
    mutation updateSavedItemTags($input: SavedItemTagUpdateInput!) {
      updateSavedItemTags(input: $input) {
        url
        _createdAt
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

  const updateSavedItemRemoveTags = gql`
    mutation updateSavedItemRemoveTags($savedItemId: ID!) {
      updateSavedItemRemoveTags(savedItemId: $savedItemId) {
        id
        url
        _createdAt
        _updatedAt
        tags {
          name
        }
      }
    }
  `;

  it('updateSavedItemTags should update tags for a given savedItems', async () => {
    const happyPathTagNames = ['changed_name', '🤪😒', '(╯°□°)╯︵ ┻━┻'];
    const happyPathTagIds: string[] = happyPathTagNames.map((tagName) =>
      Buffer.from(tagName).toString('base64')
    );

    const variables = {
      input: { savedItemId: '1', tagIds: happyPathTagIds },
    };

    const res = await server.executeOperation({
      query: updateSavedItemTags,
      variables,
    });

    const expectedTags = [
      {
        id: 'Y2hhbmdlZF9uYW1l',
        name: 'changed_name',
        _createdAt: getUnixTimestamp(updateDate),
        _updatedAt: getUnixTimestamp(updateDate),
      },
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
    expect(res.data.updateSavedItemTags.url).equals('http://1');
    expect(res.data.updateSavedItemTags._createdAt).equals(unixDate);
    expect(res.data.updateSavedItemTags._updatedAt).equals(
      getUnixTimestamp(updateDate)
    );
    expect(res.data.updateSavedItemTags.tags).to.deep.equalInAnyOrder(
      expectedTags
    );
  });

  it(' updateSavedItemTags should emit replace_tag event on success', async () => {
    const tofino = Buffer.from('tofino').toString('base64');
    const victoria = Buffer.from('victoria').toString('base64');
    const variables = {
      input: { savedItemId: '1', tagIds: [tofino, victoria] },
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
      query: updateSavedItemTags,
      variables,
    });

    expect(res.errors).to.be.undefined;
    expect(eventObj.user.id).equals('1');
    expect(parseInt((await eventObj.savedItem).id)).equals(1);
    expect(eventObj.tagsUpdated).to.deep.equalInAnyOrder([
      'tofino',
      'victoria',
    ]);
  });

  it('updateSavedItemTags should throw NOT_FOUND error if itemId doesnt exist', async () => {
    const variables = {
      input: { savedItemId: '13', tagIds: ['TagB'] },
    };

    const res = await server.executeOperation({
      query: updateSavedItemTags,
      variables,
    });

    expect(res).is.not.undefined;
    expect(res.errors[0].message).contains(
      `SavedItem Id ${variables.input.savedItemId} does not exist`
    );
    expect(res.errors[0].extensions.code).equals('NOT_FOUND');
  });

  it('updateSavedItemTags should throw error when tagIds are empty', async () => {
    const variables = {
      input: { savedItemId: '1', tagIds: [] },
    };

    const res = await server.executeOperation({
      query: updateSavedItemTags,
      variables,
    });

    expect(res).is.not.undefined;
    expect(res.errors[0].message).contains(
      'SavedItemTagUpdateInput.tagIds cannot be empty.'
    );
    expect(res.errors[0].extensions.code).equals('BAD_USER_INPUT');
  });

  it('updateSavedItemTags : should log the tag mutation', async () => {
    const variables = {
      input: { savedItemId: '1', tagIds: ['helloWorld'] },
    };

    await server.executeOperation({
      query: updateSavedItemTags,
      variables,
    });

    const res = await db('users_meta')
      .where({ user_id: '1', property: 18 })
      .pluck('value');

    expect(res[0]).to.equal(mysqlTimeString(updateDate, config.database.tz));
  });

  it('updateSavedItemTags : should roll back if encounter an error during transaction', async () => {
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
      input: { savedItemId: '1', tagIds: ['helloWorld'] },
    };

    const res = await server.executeOperation({
      query: updateSavedItemTags,
      variables,
    });

    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).contains(`Internal server error`);
    expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
    expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
    expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    logTagSpy.restore();
  });

  it('updateSavedItemRemoveTags: should remove all tags for a given savedItemId', async () => {
    const variables = {
      savedItemId: '1',
    };

    const res = await server.executeOperation({
      query: updateSavedItemRemoveTags,
      variables,
    });

    expect(res).is.not.undefined;
    expect(res.data.updateSavedItemRemoveTags.url).equals('http://1');
    expect(res.data.updateSavedItemRemoveTags._createdAt).equals(unixDate);
    expect(res.data.updateSavedItemRemoveTags._updatedAt).equals(
      getUnixTimestamp(updateDate)
    );
    expect(res.data.updateSavedItemRemoveTags.tags).is.empty;
  });

  it('updateSavedItemRemoveTags : should throw not found error if savedItemId doesnt exist', async () => {
    const variables = {
      savedItemId: '13',
    };

    const res = await server.executeOperation({
      query: updateSavedItemRemoveTags,
      variables,
    });

    expect(res.errors).is.not.undefined;
    expect(res.errors[0].message).contains(
      `SavedItem Id ${variables.savedItemId} does not exist`
    );
    expect(res.errors[0].extensions.code).equals('NOT_FOUND');
  });

  it('updateSavedItemRemoveTags : should log the tag mutation', async () => {
    const variables = {
      savedItemId: '1',
    };

    await server.executeOperation({
      query: updateSavedItemRemoveTags,
      variables,
    });

    const res = await db('users_meta')
      .where({ user_id: '1', property: 18 })
      .pluck('value');
    expect(res[0]).to.equal(mysqlTimeString(updateDate, config.database.tz));
  });

  it(' updateSavedItemRemoveTags: should emit clear_tag event on success', async () => {
    const variables = {
      savedItemId: '1',
    };

    //register event before mutation, otherwise event won't be captured
    let eventObj = null;
    eventEmitter.on(
      EventType.CLEAR_TAGS,
      (eventData: BasicItemEventPayload) => {
        eventObj = eventData;
      }
    );

    const res = await server.executeOperation({
      query: updateSavedItemRemoveTags,
      variables,
    });

    expect(res.errors).to.be.undefined;
    expect(eventObj.user.id).equals('1');
    expect(parseInt((await eventObj.savedItem).id)).equals(1);
    expect(eventObj.tagsUpdated).to.deep.equalInAnyOrder([
      'summer',
      'zebra',
      'existing_tag',
    ]);
  });

  it('updateSavedItemRemoveTags : should roll back if encounter an error during transaction', async () => {
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
      savedItemId: '1',
    };

    const res = await server.executeOperation({
      query: updateSavedItemRemoveTags,
      variables,
    });

    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).contains(`Internal server error`);
    expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
    expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
    expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    logTagSpy.restore();
  });
});
