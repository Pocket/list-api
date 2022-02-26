import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { ContextManager } from '../../../server/context';
import chaiDateTime from 'chai-datetime';
import sinon from 'sinon';
import { Knex } from 'knex';
import { EventType, ItemsEventEmitter } from '../../../businessEvents';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from './serverUti';

chai.use(chaiDateTime);

async function upsertSavedItem(
  db: Knex,
  status: number,
  date: Date,
  archived = false
) {
  await db('list').insert({
    item_id: 1,
    status: status,
    favorite: 0,
    user_id: 1,
    resolved_id: 1,
    given_url: 'https://1.test',
    title: 'title 1',
    time_added: date,
    time_updated: date,
    time_read: archived ? date : '0000-00-00 00:00:00',
    time_favorited: date,
    api_id: 'apiid',
    api_id_updated: 'apiid',
  });
}

async function setUpSavedItem(db: Knex, date: Date) {
  await upsertSavedItem(db, 0, date);
  await db('item_tags').insert([
    {
      user_id: 1,
      item_id: 1,
      tag: 'zebra',
      time_added: date,
      time_updated: date,
    },
    {
      user_id: 1,
      item_id: 1,
      tag: 'travel',
      time_added: date,
      time_updated: date,
    },
  ]);
  await db('item_attribution').insert({
    user_id: 1,
    item_id: 1,
    attribution_type_id: 101,
  });
  await db('items_scroll').insert({
    user_id: 1,
    item_id: 1,
    view: 1,
    section: 0,
    page: 1,
    node_index: 10,
    scroll_percent: 10,
    time_updated: date,
    updated_at: date,
  });
}

describe('Delete/Undelete SavedItem: ', () => {
  //using write client as mutation will use write client to read as well.
  const db = writeClient();
  const readDb = readClient();
  const eventEmitter = new ItemsEventEmitter();
  const userId = '1';
  const server = getServer('1', readDb, db, eventEmitter);

  const date = new Date('2020-10-03 10:20:30');
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;

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

    await db('list').truncate();
    await db('item_tags').truncate();
    await db('item_attribution').truncate();
    await db('items_scroll').truncate();
  });

  it('should delete a saved item', async () => {
    await setUpSavedItem(db, date);
    const eventTracker = sinon.fake();
    eventEmitter.on(EventType.DELETE_ITEM, eventTracker);
    const itemId = '1';

    const variables = {
      itemId: itemId,
    };

    const deleteSavedItemMutation = gql`
      mutation deleteSavedItem($itemId: ID!) {
        deleteSavedItem(id: $itemId)
      }
    `;
    const res = await server.executeOperation({
      query: deleteSavedItemMutation,
      variables,
    });
    const querySavedItem = gql`
      query getSavedItem($userId: ID!, $itemId: ID!) {
        _entities(representations: { id: $userId, __typename: "User" }) {
          ... on User {
            savedItemById(id: $itemId) {
              status
              _deletedAt
            }
          }
        }
      }
    `;
    const queryVars = {
      userId: userId,
      itemId: itemId,
    };
    const roundtrip = await server.executeOperation({
      query: querySavedItem,
      variables: queryVars,
    });
    const itemRes = roundtrip.data?._entities[0].savedItemById;

    const query = async (tableName) =>
      await db(tableName).select().where({ user_id: 1, item_id: 1 }).first();

    expect(res.errors).to.be.undefined;
    expect(res.data?.deleteSavedItem).to.equal('1');
    expect(itemRes.status).to.equal('DELETED');
    expect(itemRes._deletedAt).to.equal(getUnixTimestamp(updateDate));
    expect(await query('item_tags')).to.be.undefined;
    expect(await query('item_attribution')).to.be.undefined;
    expect(await query('items_scroll')).to.be.undefined;
    // Check for delete event
    expect(eventTracker.callCount).to.equal(1);
    expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(1);
  });

  it('should undelete a deleted saved item and set status to unread if not previously archived', async () => {
    await upsertSavedItem(db, 2, date);

    const variables = { itemId: '1' };
    const updateSavedItemUnDelete = gql`
      mutation updateSavedItemUnDelete($itemId: ID!) {
        updateSavedItemUnDelete(id: $itemId) {
          status
          _updatedAt
        }
      }
    `;
    const res = await server.executeOperation({
      query: updateSavedItemUnDelete,
      variables,
    });

    expect(res.errors).to.be.undefined;
    const itemRes = res.data?.updateSavedItemUnDelete;
    expect(itemRes.status).to.equal('UNREAD');
    expect(itemRes._updatedAt).to.equal(getUnixTimestamp(updateDate));
  });

  it('should undelete a deleted saved item and set status to archived if previously archived', async () => {
    await upsertSavedItem(db, 2, date, true);

    const variables = { itemId: '1' };
    const updateSavedItemUnDelete = gql`
      mutation updateSavedItemUnDelete($itemId: ID!) {
        updateSavedItemUnDelete(id: $itemId) {
          status
          _updatedAt
        }
      }
    `;
    const res = await server.executeOperation({
      query: updateSavedItemUnDelete,
      variables,
    });

    expect(res.errors).to.be.undefined;
    const itemRes = res.data?.updateSavedItemUnDelete;
    expect(itemRes.status).to.equal('ARCHIVED');
    expect(itemRes._updatedAt).to.equal(getUnixTimestamp(updateDate));
  });
});
