import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { ContextManager } from '../../../server/context';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import sinon from 'sinon';
import { ItemsEventEmitter } from '../../../businessEvents/itemsEventEmitter';
import { mysqlTimeString } from '../../../dataService/utils';
import config from '../../../config';
import { EventType } from '../../../businessEvents';
import { getUnixTimestamp } from '../../../utils';

chai.use(deepEqualInAnyOrder);

describe('Mutation for Tag: ', () => {
  const db = readClient();
  const eventEmitter: ItemsEventEmitter = new ItemsEventEmitter();
  const server = new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
    context: () => {
      return new ContextManager({
        request: {
          headers: {
            userid: '1',
            apiid: '0',
          },
        },
        db: {
          readClient: readClient(),
          writeClient: writeClient(),
        },
        eventEmitter: eventEmitter,
      });
    },
  });
  const createTagsMutation = gql`
    mutation createTags($input: [TagCreateInput!]!) {
      createTags(input: $input) {
        name
        savedItems {
          id
        }
      }
    }
  `;

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;

  afterAll(async () => {
    await db.destroy();
    await writeClient().destroy();
    clock.restore();
  });

  beforeAll(() => {
    // Mock Date.now() to get a consistent date for inserting data
    clock = sinon.useFakeTimers({
      now: updateDate,
      shouldAdvanceTime: false,
    });
  });
  beforeEach(async () => {
    await db('item_tags').truncate();
    await db('list').truncate();
    const inputData = [
      { item_id: 0, status: 0, favorite: 0 },
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

  it('should resolve all tag fields and update the saved item', async () => {
    const createTagsMutationAll = gql`
      mutation createTags($input: [TagCreateInput!]!) {
        createTags(input: $input) {
          name
          id
          _createdAt
          _updatedAt
          _version
          _deletedAt
          savedItems {
            id
            _updatedAt
          }
        }
      }
    `;
    const variables = {
      input: [{ savedItemId: 0, name: 'zeta' }],
    };
    const res = await server.executeOperation({
      query: createTagsMutationAll,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data.createTags.length).to.equal(1);
    const data = res.data.createTags[0];
    expect(data.name).to.equal('zeta');
    expect(data._createdAt).to.equal(getUnixTimestamp(updateDate));
    expect(data._updatedAt).to.equal(getUnixTimestamp(updateDate));
    expect(Buffer.from(data.id, 'base64').toString()).to.equal('zeta');
    expect(data._deletedAt).to.be.null;
    expect(data._version).to.be.null;
  });

  // This test is broken and should be fixed
  // it('long emoji tags', async () => {
  //   const bicycles25 = '\uD83D\uDEB4\u200D\u2640\uFE0F'.repeat(25);
  //   const variables = {
  //     input: [{ savedItemId: 0, name: bicycles25 }],
  //   };
  //   const res = await server.executeOperation({
  //     query: createTagsMutation,
  //     variables,
  //   });
  //   expect(res.errors).to.be.undefined;
  //   expect(res.data.createTags[0].name).to.equal(
  //     '🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️'
  //   );
  // });

  it('should add the same tag to multiple items', async () => {
    const variables = {
      input: [
        { savedItemId: 0, name: 'char' },
        { savedItemId: 1, name: 'char' },
      ],
    };
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    expect(res.errors).to.be.undefined;
    const data = res.data.createTags;
    expect(data.length).to.equal(1);
    expect(data[0].name).to.equal('char');
    expect(data[0].savedItems).to.deep.equalInAnyOrder([
      { id: '0' },
      { id: '1' },
    ]);
  });

  it('createTags should emit ADD_TAGS event on success', async () => {
    const variables = {
      input: [
        { savedItemId: 1, name: 'zeta' },
        { savedItemId: 1, name: 'zeta2' },
      ],
    };

    //register event before mutation, otherwise event won't be captured
    let eventObj = null;
    eventEmitter.on(EventType.ADD_TAGS, (eventData) => {
      eventObj = eventData;
    });

    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    const savedItem = await eventObj.savedItem;
    expect(res.errors).to.be.undefined;
    expect(eventObj.user.id).equals('1');
    expect(parseInt(savedItem.id)).equals(1);
    expect(eventObj.tagsUpdated).to.deep.equalInAnyOrder(['zeta', 'zeta2']);
  });

  it('should add the different tags to the same item', async () => {
    const variables = {
      input: [
        { savedItemId: 0, name: 'Quattro' },
        { savedItemId: 0, name: 'bajeena' },
      ],
    };
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    const expectedData = [
      { name: 'bajeena', savedItems: [{ id: '0' }] },
      { name: 'quattro', savedItems: [{ id: '0' }] },
    ];
    expect(res.errors).to.be.undefined;
    const data = res.data.createTags;
    expect(data.length).to.equal(2);
    expect(data).to.deep.equalInAnyOrder(expectedData);
  });
  it('should handle emojis', async () => {
    const variables = {
      input: [{ savedItemId: 0, name: '🤪😒' }],
    };
    const expectedData = [{ name: '🤪😒', savedItems: [{ id: '0' }] }];
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data.createTags).to.deep.equal(expectedData);
  });

  it('should handle other unicode, non-ascii chars', async () => {
    const variables = {
      input: [
        { savedItemId: 0, name: 'İnanç' },
        { savedItemId: 0, name: '𡞰' },
        { savedItemId: 1, name: '(╯°□°)╯︵ ┻━┻' },
      ],
    };
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    const expectedData = [
      { name: 'i̇nanç', savedItems: [{ id: '0' }] },
      { name: '𡞰', savedItems: [{ id: '0' }] },
      { name: '(╯°□°)╯︵ ┻━┻', savedItems: [{ id: '1' }] },
    ];
    expect(res.errors).to.be.undefined;
    const data = res.data.createTags;
    expect(data.length).to.equal(3);
    expect(data).to.deep.equalInAnyOrder(expectedData);
  });

  it('should not fail on duplicates', async () => {
    const variables = {
      input: [{ savedItemId: 0, name: 'kamille' }],
    };
    await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    expect(res.errors).to.undefined;
    expect(res.data.createTags).to.deep.equal([
      { name: 'kamille', savedItems: [{ id: '0' }] },
    ]);
  });
  it('should not fail on batch input with duplicated values', async () => {
    const variables = {
      input: [
        { savedItemId: 0, name: 'kamille' },
        { savedItemId: 0, name: 'kamille' },
      ],
    };
    const res = await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    expect(res.errors).to.undefined;
    expect(res.data.createTags).to.deep.equal([
      { name: 'kamille', savedItems: [{ id: '0' }] },
    ]);
  });
  it('should ignore attempted insert of duplicated tags, but complete rest of batch', async () => {
    await db('item_tags').insert({
      user_id: 1,
      item_id: 0,
      tag: 'reccoa',
      status: 1,
      time_added: date,
      time_updated: date1,
      api_id: 'apiid',
      api_id_updated: 'updated_api_id',
    });
    const createTagsMutationDateFields = gql`
      mutation createTags($input: [TagCreateInput!]!) {
        createTags(input: $input) {
          name
          _createdAt
          _updatedAt
          savedItems {
            id
          }
        }
      }
    `;

    const variables = {
      input: [
        { savedItemId: 0, name: 'reccoa' },
        { savedItemId: 0, name: 'kamille' },
      ],
    };
    const res = await server.executeOperation({
      query: createTagsMutationDateFields,
      variables,
    });
    expect(res.errors).to.undefined;
    expect(res.data.createTags).to.deep.equalInAnyOrder([
      {
        name: 'kamille',
        savedItems: [{ id: '0' }],
        _createdAt: getUnixTimestamp(updateDate),
        _updatedAt: getUnixTimestamp(updateDate),
      },
      {
        name: 'reccoa',
        savedItems: [{ id: '0' }],
        _createdAt: getUnixTimestamp(date),
        _updatedAt: getUnixTimestamp(date1),
      },
    ]);
  });
  it('should log the tag mutation', async () => {
    const variables = {
      input: [
        { savedItemId: 0, name: 'zeta' },
        { savedItemId: 0, name: 'gundam' },
      ],
    };
    await server.executeOperation({
      query: createTagsMutation,
      variables,
    });
    const res = await db('users_meta')
      .where({ user_id: '1', property: 18 })
      .pluck('value');
    expect(res[0]).to.equal(mysqlTimeString(updateDate, config.database.tz));
  });
});
