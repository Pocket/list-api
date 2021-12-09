import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { expect } from 'chai';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import { IContext } from '../../../server/context';

describe(' tags query tests - sad path validation', () => {
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

  afterAll(async () => {
    await db.destroy();
  });

  beforeAll(async () => {
    await db('item_tags').truncate();
    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 1,
        tag: '',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
    ]);
  });

  it('throw error if invalid field is read from the database for savedItemById.tags', async () => {
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
    expect(res.errors[0].message).contains(
      'field : id is null or empty in object'
    );
  });

  it('throw error if invalid field is read from the database for user.tags query', async () => {
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
    expect(res.errors[0].message).contains(
      'field : id is null or empty in object'
    );
  });
});
