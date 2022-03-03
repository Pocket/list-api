import { timeIt, seeds } from '@pocket-tools/backend-benchmarking';
import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
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
        savedItemsTemp(pagination: $pagination, filter: $filter, sort: $sort) {
          edges {
            node {
              url
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
describe('temp table with new list pagination', () => {
  const db = readClient();
  const server = new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
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

  beforeAll(async () => {
    await Promise.all([
      db('list').truncate(),
      db('readitla_b.items_extended').truncate(),
    ]);
    const seeder = seeds.mockList('1', { count: 1000, batchSize: 100 });
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
  it('works?', async () => {
    const variables = {
      id: '1',
      filter: { contentType: 'ARTICLE' },
      sort: { sortBy: 'CREATED_AT', sortOrder: 'DESC' },
      pagination: { first: 30 },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    console.log(JSON.stringify(res));
    const cursor = res.data?._entities[0].savedItemsTemp.pageInfo.endCursor;
    const nextRes = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables: {
        ...variables,
        pagination: { first: 30, after: cursor },
      },
    });
    console.log(JSON.stringify(nextRes));
  });
});
