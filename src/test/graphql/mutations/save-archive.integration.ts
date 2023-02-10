import { writeClient } from '../../../database/client';
import { EventType } from '../../../businessEvents';
import sinon from 'sinon';
import { getUnixTimestamp } from '../../../utils';
import { ContextManager } from '../../../server/context';
import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { ApolloServer } from '@apollo/server';
import { gql } from 'graphql-tag';
import { print } from 'graphql';
import request from 'supertest';
import * as Client from '../../../database/client';

describe('saveArchive mutation', function () {
  const db = writeClient();
  const eventSpy = sinon.spy(ContextManager.prototype, 'emitItemEvent');
  const headers = { userid: '1' };
  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;

  const ARCHIVE_MUTATION = gql`
  mutation saveArchive($id: [ID!]!, timestamp: ISOString!) {
    saveArchive(id: $id, timestamp: $timestamp) {
      save {
        id
        archived
        archivedAt
      }
      errors {
        path
        message
      }
    }
  }`;

  beforeEach(async () => {
    await db('list').truncate();
    const inputData = [
      { item_id: 0, status: 0, favorite: 0 },
      { item_id: 1, status: 0, favorite: 0 },
      // One that's already archived
      { item_id: 2, status: 1, favorite: 0 },
    ].map((row) => {
      return {
        ...row,
        user_id: 1,
        resolved_id: row.item_id,
        given_url: `http://${row.item_id}`,
        title: `title ${row.item_id}`,
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        api_id_updated: 'apiid',
      };
    });
    await db('list').insert(inputData);
  });

  beforeAll(async () => {
    ({ app, server, url } = await startServer(0));

    // Mock Date.now() to get a consistent date for inserting data
    clock = sinon.useFakeTimers({
      now: updateDate,
      shouldAdvanceTime: false,
    });
  });

  afterAll(async () => {
    await db.destroy();
    clock.restore();
    sinon.restore();
    await server.stop();
  });

  afterEach(() => sinon.resetHistory());

  it('should archive one save', async () => {
    const testTimestamp = '2023-10-05T14:48:00.000Z';
    const variables = {
      id: ['1'],
      timestamp: testTimestamp,
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({ query: print(ARCHIVE_MUTATION), variables });

    expect(res).not.toBeUndefined();
    const data = res.body.data.saveArchive;
    expect(data[0].url).toEqual('http://0');
    //expect(data[0]._updatedAt).equals('http://0');
  });

  it('should fail the entire batch if one fails (NOT_FOUND)', async () => {
    const testTimestamp = '2023-10-05T14:48:00.000Z';
    const variables = {
      id: ['123123'],
      timestamp: testTimestamp,
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({ query: print(ARCHIVE_MUTATION), variables });

    expect(res).not.toBeUndefined();
    // Technically I think this is an empty array?
    expect(res.body.data.saveArchive).toBeUndefined();
    const errors = res.body.errors;
    // todo check extensions
  });

  it('should archive multiple savedItems', async () => {
    const testTimestamp = '2023-10-05T14:48:00.000Z';
    const variables = {
      id: ['1', '2'],
      timestamp: testTimestamp,
    };

    const res = await request(app)
      .post(url)
      .set(headers)
      .send({ query: print(ARCHIVE_MUTATION), variables });

    expect(res).toBeUndefined();
    const expected = {
      save: [
        {
          id: '1',
        },
        {
          id: '2',
        },
      ],
      errors: [],
    };
    const data = res.body.data.saveArchive;
  });

  it('should not fail if trying to archive a save that is already archived (no-op)', async () => {
    const testTimestamp = '2023-10-05T14:48:00.000Z';
    const variables = {
      id: ['1'],
      timestamp: testTimestamp,
    };

    const res1 = await request(app)
      .post(url)
      .set(headers)
      .send({ query: print(ARCHIVE_MUTATION), variables });
    // already validated above, just ensure this didn't fail
    expect(res1).toBeDefined();
    expect(res1.body.data).toBeDefined();

    const res2 = await request(app)
      .post(url)
      .set(headers)
      .send({ query: print(ARCHIVE_MUTATION), variables });
  });
});
