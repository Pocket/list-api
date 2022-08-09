import { Knex } from 'knex';
import { ItemsEventEmitter } from '../../businessEvents';
import { ApolloServer } from 'apollo-server-express';
import {
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from 'apollo-server-core';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { typeDefs } from '../../server/typeDefs';
import { resolvers } from '../../resolvers';
import { ContextManager } from '../../server/context';
import { errorHandler } from '@pocket-tools/apollo-utils';

export function getServer(
  userId: string,
  dbClient: Knex,
  eventEmitter: ItemsEventEmitter,
  headers = {}
) {
  return new ApolloServer({
    schema: buildSubgraphSchema({ typeDefs, resolvers }),
    plugins: [
      ApolloServerPluginInlineTraceDisabled(),
      ApolloServerPluginUsageReportingDisabled(),
    ],
    //formatError: errorHandler,
    context: () => {
      return new ContextManager({
        request: {
          headers: {
            userid: userId,
            apiid: '0',
            ...headers,
          },
        },
        dbClient: dbClient,
        eventEmitter: eventEmitter,
      });
    },
  });
}
