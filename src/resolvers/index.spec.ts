import { ContextManager, IContext } from '../server/context';
import { executeMutation } from './index';
import { readClient, writeClient } from '../database/client';
import sinon from 'sinon';
import { ItemsEventEmitter } from '../businessEvents';

describe('executeMutation spec test', () => {
  afterAll(async () => {
    sinon.restore();
    await readClient().destroy();
    await writeClient().destroy();
  });

  it('should provide a fresh context with a write-capable connection, preserving other context values, and call mutation', async () => {
    const eventEmitter = new ItemsEventEmitter();
    const config = {
      request: { headers: { userid: 1 } },
      dbClient: readClient(),
      eventEmitter,
    };
    const testContext = new ContextManager(config);

    const testMutation = sinon.spy();

    const anonymousFunction = executeMutation<any, string>(testMutation);
    await anonymousFunction({}, { hello: 'world' }, testContext);
    // Call mutation
    expect(testMutation.callCount).toEqual(1);
    const newContext: IContext = testMutation.getCall(0).args[2];
    // Fresh context
    expect(testContext).not.toEqual(newContext);
    // Expected property values
    expect(newContext.dbClient).toEqual(writeClient());
    expect(newContext.models.tag.context.dbClient).toEqual(writeClient());
    expect(newContext.headers).toEqual(config.request.headers);
    expect(newContext.eventEmitter).toEqual(config.eventEmitter);
  });
});
