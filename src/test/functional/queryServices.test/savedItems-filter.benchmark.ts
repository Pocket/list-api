import Chance from 'chance';
import { readClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import { ContextManager } from '../../../server/context';
import {
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from 'apollo-server-core';

function timeIt(callback, name, times = 20) {
  return async function wrapper(...args) {
    const timeRecords = Array(times);
    let n = 0;
    let min = Infinity;
    let max = 0;
    while (n < times) {
      const start = Date.now();
      await callback(...args);
      const end = Date.now();
      const time = end - start;
      timeRecords[n] = time;
      if (time < min) {
        min = time;
      }
      if (time > max) {
        max = time;
      }
      n++;
    }
    const average =
      timeRecords.reduce((total, curr) => total + curr, 0) / times;
    console.log(
      `${name}: average ${average} ms over ${times} trials (min: ${min}, max: ${max})`
    );
  };
}

function* bigListGenerator(userId: number, batchSize: number, count: number) {
  const chance = new Chance();
  let index = 0;
  const earlyTime = 1298613211000;
  const maxTime = 1645768411000;
  const listData = Array(batchSize);
  const extendedData = Array(batchSize);
  // Populate the data
  while (index < count) {
    const timeAdded = chance.integer({ min: earlyTime, max: maxTime });
    const timeUpdated = chance.integer({ min: timeAdded, max: maxTime });
    const isArchived = Math.random() < 0.2; // arbitrary 20% chance
    const isFavorite = Math.random() < 0.1; // arbitrary 10% chance

    const isArticle = Math.random() < 0.9; // arbitrary 90% chance; otherwise video

    listData[index % batchSize] = {
      user_id: userId,
      item_id: index,
      resolved_id: index,
      given_url: chance.url(),
      title: chance.sentence({ words: chance.integer({ min: 4, max: 12 }) }),
      time_added: new Date(timeAdded),
      time_updated: new Date(timeUpdated),
      status: isArchived ? 1 : 0,
      time_read: isArchived
        ? new Date(chance.integer({ min: timeAdded, max: timeUpdated }))
        : undefined,
      favorite: isFavorite ? 1 : 0,
      time_favorited: isFavorite
        ? new Date(chance.integer({ min: timeAdded, max: timeUpdated }))
        : undefined,
      api_id: ['1234', '5678', '1111', '9999'][
        chance.integer({ min: 0, max: 3 })
      ],
      api_id_updated: ['1234', '5678', '1111', '9999'][
        chance.integer({ min: 0, max: 3 })
      ],
    };
    extendedData[index % batchSize] = {
      extended_item_id: index,
      video: isArticle ? 0 : 1,
      is_article: isArticle ? 1 : 0,
    };
    index += 1;
    if (index && index % batchSize === 0) {
      yield { list: listData, items_extended: extendedData };
    }
    // If doesn't divide evenly, figure it out here at the end of the while loop
  }
}

const GET_SAVED_ITEMS = gql`
  query getSavedItem($id: ID!, $filter: SavedItemsFilter) {
    _entities(representations: { id: $id, __typename: "User" }) {
      ... on User {
        savedItems(pagination: { first: 30 }, filter: $filter) {
          edges {
            node {
              url
              item {
                ... on Item {
                  savedItem {
                    id
                    status
                    isFavorite
                    tags {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

describe('big list generator', () => {
  const db = readClient();
  beforeAll(async () => {
    await Promise.all([
      db('list').truncate(),
      db('readitla_b.items_extended').truncate(),
    ]);
    const myListGenerator = bigListGenerator(1, 500, 50000);
    let batch = myListGenerator.next();
    while (!batch.done) {
      await Promise.all([
        db('list').insert(batch.value['list']),
        db('readitla_b.items_extended').insert(batch.value['items_extended']),
      ]);
      batch = myListGenerator.next();
    }
  });
  afterAll(async () => {
    await db.destroy();
  });
  it('makes a big list with roughly expected proportions', async () => {
    const favorites = await db('list')
      .where('favorite', 1)
      .count('*', { as: 'count' })
      .first()
      .then((_) => +_.count);
    const archived = await db('list')
      .where('status', 1)
      .count('*', { as: 'count' })
      .first()
      .then((_) => +_.count);
    const articles = await db('readitla_b.items_extended')
      .where('is_article', 1)
      .count('*', { as: 'count' })
      .first()
      .then((_) => +_.count);
    const total = await db('list')
      .count('*', { as: 'count' })
      .first()
      .then((_) => +_.count);
    expect(total).toEqual(50000);
    expect(favorites / total).toBeCloseTo(0.1);
    expect(archived / total).toBeCloseTo(0.2);
    expect(articles / total).toBeCloseTo(0.9);
  });
  describe('performance testing', () => {
    const server = new ApolloServer({
      schema: buildFederatedSchema({ typeDefs, resolvers }),
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginUsageReportingDisabled(),
      ],
      context: ({ req }) => {
        return new ContextManager({
          request: {
            headers: { userid: '1', apiid: '0' },
          },
          db: {
            readClient: readClient(),
            writeClient: readClient(),
          },
          eventEmitter: null,
        });
      },
    });
    it('baseline select performance: 50k', async () => {
      const variables = {
        id: '1',
      };
      const query = async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables,
        });
      await timeIt(query, 'no filter 50k')();
    }, 10000000);
    it('article filter performance: 50k', async () => {
      const variables = {
        id: '1',
        filter: { contentType: 'ARTICLE' },
      };
      const query = async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables,
        });
      await timeIt(query, 'article filter 50k')();
    }, 10000000);
    it('favorite filter performance: 50k', async () => {
      const variables = {
        id: '1',
        filter: { isFavorite: true },
      };
      const query = async () =>
        await server.executeOperation({
          query: GET_SAVED_ITEMS,
          variables,
        });
      await timeIt(query, 'favorite filter 50k')();
    }, 10000000);
  });
  //   describe('performance testing', async () => {
  //     const myFun = () => db('list').select();
  //     await timeIt(myFun, 'select * from list')();
  //   });
});
