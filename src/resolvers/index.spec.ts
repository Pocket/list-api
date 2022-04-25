import { IContext } from '../server/context';
import { executeMutation } from './index';
import { writeClient } from '../database/client';

describe('executeMutation spec test', () => {
  it('should change client writeDbClient and calls the mutation function ', async () => {
    const testContext = {
      db: {
        client: null,
        writeClient: writeClient(),
      },
    } as IContext;
    async function testMutation(
      parent,
      args,
      context: IContext
    ): Promise<string> {
      return args.hello;
    }

    const anonymousFunction = executeMutation<any, string>(testMutation);
    const res = await anonymousFunction({}, { hello: 'world' }, testContext);
    expect(testContext.db.client).toEqual(testContext.db.writeClient);
    expect(res).toEqual('world');
  });
});
