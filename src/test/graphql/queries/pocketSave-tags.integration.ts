import { readClient } from '../../../database/client';
import { ContextManager } from '../../../server/context';
import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { ApolloServer } from '@apollo/server';
import request from 'supertest';
import { gql } from 'graphql-tag';
import { print } from 'graphql';

describe('pocketSave.tags', () => {
  const db = readClient();
  const headers = { userid: '1' };
  const date = new Date('2020-10-03 10:20:30');
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;

  const GET_POCKET_SAVE_TAGS = gql`
    query saveById($userId: ID!, $itemId: ID!) {
      _entities(representations: { id: $userId, __typename: "User" }) {
        ... on User {
          saveById(id: $itemId) {
            tags {
              name
              id
              _deletedAt
            }
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
    await db('item_tags').truncate();
    const listDataBase = {
      user_id: 1,
      title: 'mytitle',
      time_added: date,
      time_updated: date,
      time_read: date,
      time_favorited: date,
      api_id: 'apiid',
      status: 0,
      favorite: 0,
      api_id_updated: 'apiid',
    };
    const tagsDataBase = {
      user_id: 1,
      status: 1,
      time_added: date,
      time_updated: date,
      api_id: 'apiid',
      api_id_updated: 'apiid',
    };
    await db('list').insert([
      {
        ...listDataBase,
        item_id: 1,
        resolved_id: 1,
        given_url: 'http://abc',
      },
      {
        ...listDataBase,
        item_id: 2,
        resolved_id: 2,
        given_url: 'http://def',
      },
    ]);
    await db('item_tags').insert([
      {
        ...tagsDataBase,
        item_id: 1,
        tag: 'tobio',
      },
      {
        ...tagsDataBase,
        item_id: 1,
        tag: 'shoyo',
      },
    ]);
  });
  it('resolves one or more tags on a save', async () => {
    const variables = {
      userId: '1',
      itemId: '1',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE_TAGS),
        variables,
      });
    expect(res.body.errors).toBeUndefined();
    const tags = res.body.data?._entities[0].saveById.tags;
    const expectedTags = [
      // for id, just check that we have a string with at least one character
      // this test doesn't care so much about the specific generated id
      // (covered elsewhere)
      { name: 'tobio', _deletedAt: null, id: expect.stringMatching(/.+/) },
      { name: 'shoyo', _deletedAt: null, id: expect.stringMatching(/.+/) },
    ];
    expect(tags).not.toBeUndefined();
    expect(tags).toBeArrayOfSize(2);
    expect(tags).toIncludeSameMembers(expectedTags);
  });
  it('returns an empty array if no tags on a save, with no errors', async () => {
    const variables = {
      userId: '1',
      itemId: '2',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(GET_POCKET_SAVE_TAGS),
        variables,
      });
    expect(res.body.errors).toBeUndefined();
    const tags = res.body.data?._entities[0].saveById.tags;
    expect(tags).not.toBeUndefined();
    expect(tags).toBeArrayOfSize(0);
  });
});
