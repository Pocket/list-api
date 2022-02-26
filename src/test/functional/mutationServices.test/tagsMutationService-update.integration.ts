import { readClient, writeClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import sinon from 'sinon';
import { ItemsEventEmitter } from '../../../businessEvents/itemsEventEmitter';
import { UsersMetaService } from '../../../dataService';
import { mysqlTimeString } from '../../../dataService/utils';
import config from '../../../config';
import chaiDateTime from 'chai-datetime';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from './testServerUtil';

chai.use(deepEqualInAnyOrder);
chai.use(chaiDateTime);

describe('updateTag Mutation: ', () => {
  const db = writeClient();
  const readDb = readClient();
  const eventEmitter = new ItemsEventEmitter();
  const server = getServer('1', readDb, db, eventEmitter);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const unixDate = getUnixTimestamp(date);
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
    await readClient().destroy();
    await writeClient().destroy();
    clock.restore();
  });

  beforeEach(async () => {
    // Mock Date.now() to get a consistent date for inserting data
    clock = sinon.useFakeTimers({
      now: updateDate,
      shouldAdvanceTime: true,
    });

    await db('item_tags').truncate();
    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 0,
        tag: 'zebra',
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
        item_id: 2,
        tag: 'unchanged',
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
      { item_id: 2, status: 1, favorite: 0 },
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

  const updateTagsMutation = gql`
    mutation updateTag($input: TagUpdateInput!) {
      updateTag(input: $input) {
        name
        _createdAt
        _updatedAt
        savedItems {
          edges {
            cursor
            node {
              id
              url
              _updatedAt
            }
          }
        }
      }
    }
  `;

  const happyPathTestCases = ['changed_name', '🤪😒', '(╯°□°)╯︵ ┻━┻'];

  test.each(happyPathTestCases)(
    'should update an existing tag name',
    async (newTagName) => {
      const variables = {
        input: { name: newTagName, id: 'emVicmE=' },
      };

      const expectedSavedItems = [
        {
          node: {
            id: '0',
            url: 'http://0',
            _updatedAt: getUnixTimestamp(updateDate),
          },
          cursor: 'MF8qXzE2MDE3Mzg0MzA=',
        },
        {
          node: {
            id: '1',
            url: 'http://1',
            _updatedAt: getUnixTimestamp(updateDate),
          },
          cursor: 'MV8qXzE2MDE3Mzg0MzA=',
        },
      ];

      const res = await server.executeOperation({
        query: updateTagsMutation,
        variables,
      });
      expect(res).is.not.undefined;
      expect(res.data.updateTag.name).equals(newTagName);
      expect(res.data.updateTag._createdAt).equals(unixDate);
      expect(res.data.updateTag._updatedAt).equals(
        getUnixTimestamp(updateDate)
      );
      expect(res.data.updateTag.savedItems.edges).to.deep.equalInAnyOrder(
        expectedSavedItems
      );
    }
  );

  it('should return error if tagId does not exist', async () => {
    const variables = {
      input: { name: 'changed_name', id: 'id_not_found' },
    };

    const res = await server.executeOperation({
      query: updateTagsMutation,
      variables,
    });

    expect(res).is.not.undefined;
    expect(res.data).is.null;
    expect(res.errors[0].message).equals(
      `Tag Id does not exist ${variables.input.id}`
    );
  });
  it('should update tag name with primary key conflict', async () => {
    const variables = {
      input: { name: 'existing_tag', id: 'emVicmE=' },
    };

    const res = await server.executeOperation({
      query: updateTagsMutation,
      variables,
    });

    const expectedSavedItems = [
      {
        node: {
          id: '0',
          url: 'http://0',
          _updatedAt: getUnixTimestamp(updateDate),
        },
        cursor: 'MF8qXzE2MDE3Mzg0MzA=',
      },
      {
        node: {
          id: '1',
          url: 'http://1',
          _updatedAt: getUnixTimestamp(updateDate),
        },
        cursor: 'MV8qXzE2MDE3Mzg0MzA=',
      },
    ];

    const QueryOldTags = await db('item_tags').select().where({ tag: 'zebra' });

    expect(res).is.not.undefined;
    expect(res.data.updateTag.name).equals('existing_tag');
    expect(res.data.updateTag._createdAt).equals(unixDate);
    expect(res.data.updateTag._updatedAt).equals(getUnixTimestamp(updateDate));
    expect(res.data.updateTag.savedItems.edges).to.deep.equalInAnyOrder(
      expectedSavedItems
    );
    expect(QueryOldTags.length).equals(0);
  });
  it('should log the tag mutation', async () => {
    const variables = {
      input: { name: 'existing_tag', id: 'emVicmE=' },
    };
    await server.executeOperation({
      query: updateTagsMutation,
      variables,
    });
    const res = await db('users_meta')
      .where({ user_id: '1', property: 18 })
      .pluck('value');
    expect(res[0]).to.equal(mysqlTimeString(updateDate, config.database.tz));
  });
  it('should roll back if encounter an error during transaction', async () => {
    const listStateQuery = db('list').select();
    const tagStateQuery = db('item_tags').select();
    const metaStateQuery = db('users_meta').select();

    // Get the current db state
    const listState = await listStateQuery;
    const tagState = await tagStateQuery;
    const metaState = await metaStateQuery;

    const logMutation = sinon
      .stub(UsersMetaService.prototype, 'logTagMutation')
      .rejects(Error('server error'));
    const variables = {
      input: { id: 'emVicmE=', name: 'existing_tag' },
    };
    const res = await server.executeOperation({
      query: updateTagsMutation,
      variables,
    });
    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).to.equal(
      `updateTag: server error while updating tag ${JSON.stringify(
        variables.input
      )}`
    );
    expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
    expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
    expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    logMutation.restore();
  });
});
