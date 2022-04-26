import { IContext } from '../server/context';
import { executeMutation } from './index';
import { readClient, writeClient } from '../database/client';

describe('executeMutation spec test', () => {
  afterAll(async () => {
    await readClient().destroy();
    await writeClient().destroy();
  });

  it('should change client writeDbClient and calls the mutation function ', async () => {
    const testContext = {
      dbClient: readClient(),
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
    expect(testContext.dbClient).toEqual(writeClient());
    expect(res).toEqual('world');
  });
});
