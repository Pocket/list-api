import { ApolloServer } from '@apollo/server';
import { ContextManager } from '../../../server/context';
import { readClient } from '../../../database/client';
import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { gql } from 'graphql-tag';
import { print } from 'graphql';
import request from 'supertest';
import { TagModel } from '../../../models';

describe('saveBatchUpdateTags', () => {
  const db = readClient();
  const headers = { userid: '1' };
  const date = new Date('2020-10-03T10:20:30.000Z');
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;

  const BATCH_UPDATE_TAGS = gql`
    mutation saveBatchUpdateTags(
      $input: [SaveUpdateTagsInput!]!
      $timestamp: ISOString!
    ) {
      save {
        tags {
          name
          _createdAt
        }
      }
      errors {
        __typename
        path
        message
      }
    }
  `;
  beforeAll(async () => {
    ({ app, server, url } = await startServer(0));
  });
  beforeEach(async () => {
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
  afterAll(async () => {
    await db.destroy();
    await server.stop();
  });
  it('adds one or more tags to a save that already has tags', async () => {
    const variables = {
      userId: '1',
      input: {
        saveId: '1',
        removeTagIds: [],
        addTagNames: ['daichi', 'asahi', 'sugawara'],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    expect(res.body.data.errors).toBeUndefined();
    const expectedTags = [
      {
        name: 'tobio',
        _createdAt: '2020-10-03T10:20:30.000Z',
      },
      {
        name: 'shoyo',
        _createdAt: '2020-10-03T10:20:30Z.000Z',
      },
      {
        name: 'daichi',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
      {
        name: 'asahi',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
      {
        name: 'sugawara',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
    ];
    expect(res.body.data.saveBatchUpdateTags.save.tags).toIncludeSameMembers(
      expectedTags
    );
    expect(res.body.data.saveBatchUpdateTags.errors).toBeArrayOfSize(0);
  });
  it('adds one or more tags to a save that has no tags', async () => {
    const variables = {
      userId: '1',
      input: {
        saveId: '2',
        removeTagIds: [],
        addTagNames: ['daichi', 'asahi', 'sugawara'],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    const expectedTags = [
      {
        name: 'daichi',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
      {
        name: 'asahi',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
      {
        name: 'sugawara',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
    ];
    expect(res.body.data.errors).toBeUndefined();
    expect(res.body.data.saveBatchUpdateTags.save.tags).toIncludeSameMembers(
      expectedTags
    );
    expect(res.body.data.saveBatchUpdateTags.errors).toBeArrayOfSize(0);
  });
  it('deletes one or more tags from a save with tags', async () => {
    const removeTagIds = ['shoyo', 'tobio'].map((tag) =>
      TagModel.encodeId(tag)
    );
    const variables = {
      userId: '1',
      input: {
        saveId: '1',
        removeTagIds,
        addTagNames: [],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };
    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    expect(res.body.data.errors).toBeUndefined();
    expect(res.body.data.saveBatchUpdateTags.save.tags).toBeArrayOfSize(0);
    expect(res.body.data.saveBatchUpdateTags.errors).toBeArrayOfSize(0);
  });
  it('does not fail when adding a tag that already exists on a save, and updates _createdAt', async () => {
    const variables = {
      userId: '1',
      input: {
        saveId: '1',
        removeTagIds: [],
        addTagNames: ['tobio', 'sugawara'],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    const expectedTags = [
      {
        name: 'tobio',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
      {
        name: 'shoyo',
        _createdAt: '2020-10-03T10:20:30Z.000Z',
      },
      {
        name: 'sugawara',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
    ];
    expect(res.body.data.errors).toBeUndefined();
    expect(res.body.data.saveBatchUpdateTags.save.tags).toIncludeSameMembers(
      expectedTags
    );
    expect(res.body.data.saveBatchUpdateTags.errors).toBeArrayOfSize(0);
  });
  it('deletes and adds tags at the same time', async () => {
    const removeTagIds = [TagModel.encodeId('tobio')];
    const variables = {
      userId: '1',
      input: {
        saveId: '1',
        removeTagIds,
        addTagNames: ['sugawara'],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };
    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    const expectedTags = [
      {
        name: 'shoyo',
        _createdAt: '2020-10-03T10:20:30Z.000Z',
      },
      {
        name: 'sugawara',
        _createdAt: '2023-02-23T20:23:00.000Z',
      },
    ];
    expect(res.body.data.errors).toBeUndefined();
    expect(res.body.data.saveBatchUpdateTags.save.tags).toIncludeSameMembers(
      expectedTags
    );
    expect(res.body.data.saveBatchUpdateTags.errors).toBeArrayOfSize(0);
  });
  it('fails the entire batch and rolls back if encounter NOT_FOUND error', async () => {
    const removeTagId = TagModel.encodeId('oikawa');
    const variables = {
      userId: '1',
      input: {
        saveId: '1',
        removeTagIds: [removeTagId],
        addTagNames: ['sugawara'],
      },
      timestamp: '2023-02-23T20:23:00.000Z',
    };
    const res = await request(app)
      .post(url)
      .set(headers)
      .send({
        query: print(BATCH_UPDATE_TAGS),
        variables,
      });
    // The original tags
    const expectedTags = [
      {
        name: 'tobio',
        _createdAt: '2020-10-03T10:20:30.000Z',
      },
      {
        name: 'shoyo',
        _createdAt: '2020-10-03T10:20:30Z.000Z',
      },
    ];
    expect(res.body.data.errors).toBeUndefined();
    expect(res.body.data.saveBatchUpdateTags.save.tags).toIncludeSameMembers(
      expectedTags
    );
    const expectedErrors = [
      {
        __typename: 'NotFound',
        message: `entity identified by key=id, value=${removeTagId} was not found.`,
        path: 'saveBatchUpdateTags',
      },
    ];
    expect(res.body.data.saveBatchUpdateTags.errors).toIncludeSameMembers(
      expectedErrors
    );
  });
});
