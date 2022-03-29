import { timeIt, seeds } from '@pocket-tools/backend-benchmarking';
import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildSubgraphSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import { ContextManager } from '../../../server/context';

const GET_SAVED_ITEMS = gql`
  query getSavedItem(
    $id: ID!
    $filter: SavedItemsFilter
    $sort: SavedItemsSort
    $pagination: PaginationInput
  ) {
    _entities(representations: { id: $id, __typename: "User" }) {
      ... on User {
        savedItems(pagination: $pagination, filter: $filter, sort: $sort) {
          edges {
            node {
              url
              favoritedAt
            }
          }
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
        }
      }
    }
  }
`;
describe.skip('temp table with new list pagination - benchmarking', () => {
  const db = readClient();
  const server = new ApolloServer({
    schema: buildSubgraphSchema({ typeDefs, resolvers }),
    context: ({ req }) => {
      return new ContextManager({
        request: {
          headers: { userid: '1', apiid: '0' },
        },
        db: {
          readClient: readClient(),
          writeClient: writeClient(),
        },
        eventEmitter: null,
      });
    },
  });
  const variables = {
    id: '1',
    filter: { contentType: 'ARTICLE' },
    sort: { sortBy: 'CREATED_AT', sortOrder: 'DESC' },
    pagination: { first: 30 },
  };

  beforeAll(async () => {
    await Promise.all([
      db('list').truncate(),
      db('readitla_b.items_extended').truncate(),
    ]);
    const seeder = seeds.mockList('1', { count: 50000, batchSize: 5000 });
    let batch = seeder.next();
    while (!batch.done) {
      await Promise.all([
        db('list').insert(batch.value['list']),
        db('readitla_b.items_extended').insert(batch.value['items_extended']),
      ]);
      batch = seeder.next();
    }
  });
  afterAll(async () => {
    await db.destroy();
  });
  it('first', async () => {
    await timeIt(
      async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables,
        }),
      { name: 'first', times: 20, printToConsole: true, returnValues: true }
    )();
  });
  it('first/after', async () => {
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    const cursor = res.data?._entities[0].savedItems.pageInfo.endCursor;
    await timeIt(
      async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables: {
            ...variables,
            pagination: { first: 30, after: cursor },
          },
        }),
      { name: 'first/after', times: 20, returnValues: true }
    )();
  });
  it('last', async () => {
    await timeIt(
      async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables: {
            ...variables,
            pagination: { last: 30 },
          },
        }),
      { name: 'last', times: 20 }
    )();
  });
  it('last/before', async () => {
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables: {
        ...variables,
        pagination: { last: 30 },
      },
    });
    const cursor = res.data?._entities[0].savedItems.pageInfo.startCursor;
    await timeIt(
      async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables: {
            ...variables,
            pagination: { last: 30, before: cursor },
          },
        }),
      { name: 'last/before', times: 20 }
    )();
  });
});
