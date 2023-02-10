import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { ApolloServer } from '@apollo/server';
import { ContextManager } from '../../../server/context';
import request from 'supertest';

describe('fake bulk mutation', () => {
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;
  const headers = { userid: '1' };

  const fakeBulkMutation = `
  mutation fakeBulkMutation($input: BulkMutationInput!) {
    fakeBulkMutation(input: $input)
  }
`;

  beforeAll(async () => {
    ({ app, server, url } = await startServer(0));
  });

  afterAll(async () => {
    await server.stop();
  });
  it('disallows empty array inputs', async () => {
    const variables = {
      input: { bulkInputs: [], timestamp: '10-06-2023' },
    };
    const res = await request(app).post(url).set(headers).send({
      query: fakeBulkMutation,
      variables,
    });
    expect(res.body.errors.length).toEqual(1);
    expect(res.body.errors[0].extensions.code).toEqual('BAD_USER_INPUT');
    expect(res.body.errors[0].message).toContain(
      'must be at least 1 in length'
    );
  });
  it('disallows array size > 30', async () => {
    const variables = {
      input: {
        bulkInputs: Array.from(Array(100).keys()),
        timestamp: '10-06-2023',
      },
    };
    const res = await request(app).post(url).set(headers).send({
      query: fakeBulkMutation,
      variables,
    });
    expect(res.body.errors[0].extensions.code).toEqual('BAD_USER_INPUT');
    expect(res.body.errors[0].message).toContain('must be no more than 30');
  });
  it('works for array size greater than 0 and less than 30', async () => {
    const variables = {
      input: {
        bulkInputs: Array.from(Array(10).keys()),
        timestamp: '10-06-2023',
      },
    };
    const res = await request(app).post(url).set(headers).send({
      query: fakeBulkMutation,
      variables,
    });
    expect(res.body.errors).toBeUndefined;
    expect(res.body.data.fakeBulkMutation).toEqual(true);
  });
});
