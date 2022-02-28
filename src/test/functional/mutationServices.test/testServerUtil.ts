import { Knex } from 'knex';
import { ItemsEventEmitter } from '../../../businessEvents';
import { ApolloServer } from 'apollo-server-express';
import { ApolloServerPluginInlineTraceDisabled } from 'apollo-server-core';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import { ContextManager } from '../../../server/context';

export function getServer(
  userId: string,
  readClient: Knex,
  writeClient: Knex,
  eventEmitter: ItemsEventEmitter
) {
  return new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
    plugins: [ApolloServerPluginInlineTraceDisabled()],
    context: () => {
      return new ContextManager({
        request: {
          headers: {
            userid: userId,
            apiid: '0',
          },
        },
        db: {
          readClient: readClient,
          writeClient: writeClient,
        },
        eventEmitter: eventEmitter,
      });
    },
  });
}
