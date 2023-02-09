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
    updateTag(input: $input)
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
  });
  it.todo('disallows array size > 30');
  it.todo('works for array size greater than 0 and less than 30');
});
