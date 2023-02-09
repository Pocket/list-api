import { ApolloServer } from '@apollo/server';
import { ContextManager } from '../../../server/context';
import { readClient } from '../../../database/client';
import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { gql } from 'graphql-tag';
import { print } from 'graphql';
import request from 'supertest';

describe('getPocketSaveByItemId', () => {
  const db = readClient();
  const headers = { userid: '1' };
  const date1 = new Date('2008-10-21 13:57:01');
  const date2 = new Date('0000-00-00 00:00:00');
  const date3 = new Date('2008-10-21 14:00:01');
  const date4 = new Date('2012-08-13 15:32:05');
  const date5 = new Date('2008-11-03 08:51:01');
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;

  const GET_POCKET_SAVE = gql`
    query getPocketSave($userId: ID!, $itemId: ID!) {
      _entities(representations: { id: $userId, __typename: "User" }) {
        ... on User {
          pocketSaveById(id: $itemId) {
            archived
            archivedAt
            createdAt
            deletedAt
            favorite
            favoritedAt
            givenUrl
            id
            status
            title
            updatedAt
          }
        }
      }
    }
  `;

  afterAll(async () => {
    await db.destroy();
    await server.stop();
  });

  beforeAll(async () => {
    ({ app, server, url } = await startServer(0));
    await db('list').truncate();
    await db('list').insert([
      {
        api_id: '012',
        api_id_updated: '012',
        favorite: 0,
        given_url: 'http://www.ideashower.com/',
        item_id: 55,
        resolved_id: 55,
        status: 0,
        time_added: date1,
        time_favorited: date2,
        time_read: date3,
        time_updated: date4,
        title: 'the Idea Shower',
        user_id: 1,
      },
      {
        api_id_updated: 'apiid',
        api_id: 'apiid',
        favorite: 1,
        given_url: 'http://irctc.co.in/',
        item_id: 987,
        resolved_id: 987,
        status: 2,
        time_added: date5,
        time_favorited: date2,
        time_read: date5,
        time_updated: date5,
        title: '',
        user_id: 1,
      },
      {
        api_id_updated: 'apiid',
        api_id: 'apiid',
        favorite: 1,
        given_url: 'http://www.frameip.com/voip/',
        item_id: 551,
        resolved_id: 551,
        time_added: date5,
        time_favorited: date5,
        time_read: date5,
        time_updated: date5,
        title: 'Tout sur la voip',
        status: 1,
        user_id: 1,
      },
    ]);
  });

  it('should return a pocket save with all appropriate fields', async () => {
    const variables = {
      userId: '1',
      itemId: '55',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE),
        variables,
      });
    expect(res.body.data?._entities[0].pocketSaveById.archived).toBe(false);
    expect(res.body.data?._entities[0].pocketSaveById.archivedAt).toBe(null);
    expect(res.body.data?._entities[0].pocketSaveById.createdAt).toBe(
      date1.toISOString()
    );
    expect(res.body.data?._entities[0].pocketSaveById.deletedAt).toBe(null);
    expect(res.body.data?._entities[0].pocketSaveById.favorite).toBe(false);
    expect(res.body.data?._entities[0].pocketSaveById.favoritedAt).toBe(null);
    expect(res.body.data?._entities[0].pocketSaveById.givenUrl).toBe(
      'http://www.ideashower.com/'
    );
    expect(res.body.data?._entities[0].pocketSaveById.id).toBe('55');
    expect(res.body.data?._entities[0].pocketSaveById.status).toBe('UNREAD');
    expect(res.body.data?._entities[0].pocketSaveById.title).toBe(
      'the Idea Shower'
    );
    expect(res.body.data?._entities[0].pocketSaveById.updatedAt).toBe(
      date4.toISOString()
    );
  });
  it('should return null if no item is found for the user', async () => {
    const variables = {
      userId: '1',
      itemId: '10',
    };
    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE),
        variables,
      });
    expect(res.body.data?._entities[0].pocketSaveById).toBe(null);
    expect(res.body.errors[0].message).toBe(
      `Error - Not Found: Saved Item with ID=${variables.itemId} does not exist.`
    );
    expect(res.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
  it('should have deletedAt field if item is deleted', async () => {
    const variables = {
      userId: '1',
      itemId: '987',
    };
    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE),
        variables,
      });
    expect(res.body.data?._entities[0].pocketSaveById.deletedAt).toBe(
      date5.toISOString()
    );
  });
  it('should resolve archived properly', async () => {
    const archivedVars = {
      userId: '1',
      itemId: '551',
    };
    const nonArchivedVars = {
      userId: '1',
      itemId: '55',
    };
    const archivedRes = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE),
        variables: archivedVars,
      });
    const nonArchivedRes = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE),
        variables: nonArchivedVars,
      });
    expect(archivedRes.body.data?._entities[0].pocketSaveById.archived).toBe(
      true
    );
    expect(archivedRes.body.data?._entities[0].pocketSaveById.archivedAt).toBe(
      date5.toISOString()
    );
    expect(nonArchivedRes.body.data?._entities[0].pocketSaveById.archived).toBe(
      false
    );
    expect(
      nonArchivedRes.body.data?._entities[0].pocketSaveById.archivedAt
    ).toBe(null);
  });
});
