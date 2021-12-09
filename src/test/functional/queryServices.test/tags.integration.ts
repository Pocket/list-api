import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { IContext } from '../../../server/context';
import chaiDateTime from 'chai-datetime';
import { getUnixTimestamp } from '../../../utils';

chai.use(chaiDateTime);

describe('tags query tests - happy path', () => {
  const db = readClient();
  const server = new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
    context: ({ req }) => {
      const executionContext: IContext = {
        userId: '1',
        apiId: '0',
        headers: undefined,
        db: {
          readClient: db,
          writeClient: writeClient(),
        },
        eventEmitter: null,
        emitItemEvent: undefined,
      };
      return executionContext;
    },
  });
  const date = new Date('2020-10-03T10:20:30.000Z');
  const unixDate = getUnixTimestamp(date);
  const date1 = new Date('2021-10-03T10:20:30.000Z');
  const unixDate1 = getUnixTimestamp(date1);

  const GET_TAG_CONNECTION = gql`
    query getTags($id: ID!, $pagination: PaginationInput) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          tags(pagination: $pagination) {
            edges {
              cursor
              node {
                id
                name
                _createdAt
                _updatedAt
                _deletedAt
                _version
              }
            }
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            totalCount
          }
        }
      }
    }
  `;

  afterAll(async () => {
    await db.destroy();
  });

  beforeAll(async () => {
    await db('list').truncate();
    await db('list').insert([
      {
        user_id: 1,
        item_id: 1,
        resolved_id: 1,
        given_url: 'http://abc',
        title: 'mytitle',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 2,
        resolved_id: 2,
        given_url: 'http://tagtest',
        title: 'tagstest',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: '0',
        status: 0,
        favorite: 1,
        api_id_updated: '0',
      },
    ]);

    await db('item_tags').truncate();
    await db('item_tags').insert([
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
        tag: 'travel',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 2,
        tag: 'travel',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 2,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 2,
        item_id: 2,
        tag: 'dontfetch',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
    ]);
  });

  it('return list of Tags for SavedItem', async () => {
    const variables = {
      userId: '1',
      itemId: '1',
    };

    const GET_TAGS_FOR_SAVED_ITEM = gql`
      query getSavedItem($userId: ID!, $itemId: ID!) {
        _entities(representations: { id: $userId, __typename: "User" }) {
          ... on User {
            savedItemById(id: $itemId) {
              url
              tags {
                ... on Tag {
                  id
                  name
                  _createdAt
                  _updatedAt
                  _version
                  _deletedAt
                  savedItems {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await server.executeOperation({
      query: GET_TAGS_FOR_SAVED_ITEM,
      variables,
    });
    expect(res.data?._entities[0].savedItemById.url).to.equal('http://abc');
    expect(res.data?._entities[0].savedItemById.tags[0].name).to.equal(
      'travel'
    );
    const tagId0 = Buffer.from(
      res.data?._entities[0].savedItemById.tags[0].id,
      'base64'
    ).toString();
    expect(tagId0).to.equal('travel');
    expect(res.data?._entities[0].savedItemById.tags[0]._version).is.null;
    expect(res.data?._entities[0].savedItemById.tags[0]._deletedAt).is.null;
    expect(res.data?._entities[0].savedItemById.tags[0]._createdAt).to.equal(
      unixDate
    );
    expect(res.data?._entities[0].savedItemById.tags[0]._updatedAt).to.equal(
      unixDate1
    );
    expect(res.data?._entities[0].savedItemById.tags[1]._createdAt).to.equal(
      unixDate1
    );
    expect(res.data?._entities[0].savedItemById.tags[1]._updatedAt).to.equal(
      unixDate1
    );
    expect(res.data?._entities[0].savedItemById.tags[1].name).to.equal('zebra');
    const tagId1 = Buffer.from(
      res.data?._entities[0].savedItemById.tags[1].id,
      'base64'
    ).toString();
    expect(tagId1).to.equal('zebra');
    expect(res.data?._entities[0].savedItemById.tags[1]._deletedAt).is.null;
  });

  it('return list of SavedItems for Tags', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2 },
    };

    const GET_TAGS_SAVED_ITEMS = gql`
      query getTags($id: ID!, $pagination: PaginationInput) {
        _entities(representations: { id: $id, __typename: "User" }) {
          ... on User {
            tags(pagination: $pagination) {
              edges {
                cursor
                node {
                  id
                  name
                  savedItems {
                    id
                    url
                  }
                }
              }
              pageInfo {
                startCursor
                endCursor
                hasNextPage
                hasPreviousPage
              }
              totalCount
            }
          }
        }
      }
    `;

    const res = await server.executeOperation({
      query: GET_TAGS_SAVED_ITEMS,
      variables,
    });

    expect(res.data?._entities[0].tags.edges[0].node.name).to.equal(
      'adventure'
    );
    expect(
      res.data?._entities[0].tags.edges[0].node.savedItems[0].url
    ).to.equal('http://tagtest');
  });

  it('should return list of Tags for User for first n values', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2 },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.data?._entities[0].tags.pageInfo.hasNextPage).is.true;
    expect(res.data?._entities[0].tags.pageInfo.hasPreviousPage).is.false;
    expect(res.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.data?._entities[0].tags.edges[0].node.name).to.equal(
      'adventure'
    );
    const tagId = Buffer.from(
      res.data?._entities[0].tags.edges[0].node.id,
      'base64'
    ).toString();
    expect(tagId).to.equal('adventure');
    expect(res.data?._entities[0].tags.edges[1].node.name).to.equal('travel');
  });

  it('should return list of Tags for User for last n values', async () => {
    const variables = {
      id: '1',
      pagination: { last: 2 },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.data?._entities[0].tags.edges[0].node.name).to.equal('travel');
  });

  it('should return list of Tags for User for first n values after the given cursor', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2, after: 'YWR2ZW50dXJlXypfImFkdmVudHVyZSI=' },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.data?._entities[0].tags.edges[0].node.name).to.equal('travel');
  });

  it('should return list of Tags for User for last n values before the given cursor', async () => {
    const variables = {
      id: '1',
      pagination: { last: 2, before: 'emVicmFfKl8iemVicmEi' },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.data?._entities[0].tags.pageInfo.hasNextPage).is.true;
    expect(res.data?._entities[0].tags.pageInfo.hasPreviousPage).is.false;
    expect(res.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.data?._entities[0].tags.edges[1].node.name).to.equal('travel');
  });

  it('should always return the oldest date for _createdAt and latest date for _updatdAt for tags', async () => {
    const variables = {
      id: '1',
      pagination: { last: 2, before: 'emVicmFfKl8iemVicmEi' },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });
    expect(res.data?._entities[0].tags.edges[1].node.name).to.equal('travel');
    expect(res.data?._entities[0].tags.edges[1].node._createdAt).to.equal(
      unixDate
    );
    expect(res.data?._entities[0].tags.edges[1].node._updatedAt).to.equal(
      unixDate1
    );
  });

  it('should not overflow when first is greater than available item', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2, after: 'dHJhdmVsXypfInRyYXZlbCI=' },
    };

    const res = await server.executeOperation({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.data?._entities[0].tags.edges.length).to.equal(1);
    expect(res.data?._entities[0].tags.edges[0].node.name).to.equal('zebra');
  });
});
