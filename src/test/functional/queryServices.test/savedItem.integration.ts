import { readClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from '../testServerUtil';

chai.use(chaiDateTime);

describe('getSavedItemByItemId', () => {
  const db = readClient();
  const server = getServer('1', db, null);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const unixDate = getUnixTimestamp(date); // unix timestamp
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const unixDate1 = getUnixTimestamp(date1); // unix timestamp

  const GET_SAVED_ITEM = gql`
    query getSavedItem($userId: ID!, $itemId: ID!) {
      _entities(representations: { id: $userId, __typename: "User" }) {
        ... on User {
          savedItemById(id: $itemId) {
            id
            url
            isFavorite
            isArchived
            favoritedAt
            archivedAt
            status
            createdAt
            _createdAt
            _updatedAt
            _deletedAt
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
        time_updated: date1,
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
        given_url: 'http://def',
        title: 'title2',
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 2,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 3,
        resolved_id: 3,
        given_url: 'http://ijk',
        title: 'title3',
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 1,
        favorite: 1,
        api_id_updated: 'apiid',
      },
    ]);
  });

  it('should return a saved item with all appropriate fields', async () => {
    const variables = {
      userId: '1',
      itemId: '1',
    };

    const res = await server.executeOperation({
      query: GET_SAVED_ITEM,
      variables,
    });
    expect(res.data?._entities[0].savedItemById.url).to.equal('http://abc');
    expect(res.data?._entities[0].savedItemById.id).to.equal('1');
    expect(res.data?._entities[0].savedItemById.favoritedAt).to.equal(unixDate);
    expect(res.data?._entities[0].savedItemById.isFavorite).to.equal(true);
    expect(res.data?._entities[0].savedItemById.status).to.equal('UNREAD');
    expect(res.data?._entities[0].savedItemById.createdAt).to.equal(
      '2020-10-03 10:20:30Z'
    );
    expect(res.data?._entities[0].savedItemById._createdAt).to.equal(unixDate);
    expect(res.data?._entities[0].savedItemById._updatedAt).to.equal(unixDate1);
    expect(res.data?._entities[0].savedItemById._deletedAt).to.be.null;
  });

  it('should return null if no item is found for the user', async () => {
    const variables = {
      userId: '1',
      itemId: '10',
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEM,
      variables,
    });
    expect(res.data?._entities[0].savedItemById).to.be.null;
  });
  it('should resolve item url', async () => {
    const variables = {
      userId: '1',
      itemId: '1',
    };
    const GET_SAVED_ITEM_ITEM = gql`
      query getSavedItem($userId: ID!, $itemId: ID!) {
        _entities(representations: { id: $userId, __typename: "User" }) {
          ... on User {
            savedItemById(id: $itemId) {
              id
              url
              isFavorite
              favoritedAt
              item {
                ... on Item {
                  givenUrl
                }
              }
            }
          }
        }
      }
    `;
    const res = await server.executeOperation({
      query: GET_SAVED_ITEM_ITEM,
      variables,
    });
    expect(res.data?._entities[0].savedItemById.item.givenUrl).to.equal(
      'http://abc'
    );
  });

  it('should have _deletedAt field if item is deleted', async () => {
    const variables = {
      userId: '1',
      itemId: '2',
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEM,
      variables,
    });
    expect(res.data?._entities[0].savedItemById._deletedAt).to.equal(unixDate1);
  });

  it('should resolve isArchived properly', async () => {
    const archivedVars = {
      userId: '1',
      itemId: '3',
    };
    const nonArchivedVars = {
      userId: '1',
      itemId: '2',
    };
    const archivedRes = await server.executeOperation({
      query: GET_SAVED_ITEM,
      variables: archivedVars,
    });
    const nonArchivedRes = await server.executeOperation({
      query: GET_SAVED_ITEM,
      variables: nonArchivedVars,
    });
    expect(archivedRes.data?._entities[0].savedItemById.isArchived).to.equal(
      true
    );
    expect(archivedRes.data?._entities[0].savedItemById.archivedAt).to.equal(
      getUnixTimestamp(date)
    );
    expect(nonArchivedRes.data?._entities[0].savedItemById.isArchived).to.equal(
      false
    );
    expect(nonArchivedRes.data?._entities[0].savedItemById.archivedAt).to.be
      .null;
  });
});
