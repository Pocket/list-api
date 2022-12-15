//this must run before all imports and server start
//so open-telemetry can patch all libraries that we use
import { nodeSDKBuilder } from './tracing';

nodeSDKBuilder().then(async () => {
  await _startServer();
});

import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServerPluginLandingPageGraphQLPlayground } from '@apollo/server-plugin-landing-page-graphql-playground';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { sentryPlugin, errorHandler } from '@pocket-tools/apollo-utils';
import config from '../config';
import { ContextManager } from './context';
import { readClient } from '../database/client';
import {
  initItemEventHandlers,
  itemsEventEmitter,
  snowplowEventHandler,
  sqsEventHandler,
  unifiedEventHandler,
} from '../businessEvents';
import queueDeleteRouter from './routes/queueDelete';
import { BatchDeleteHandler } from '../aws/batchDeleteHandler';
import { EventEmitter } from 'events';
import { initAccountDeletionCompleteEvents } from '../aws/eventTypes';
import { typeDefs } from './typeDefs';
import { resolvers } from '../resolvers';

export async function _startServer() {
  Sentry.init({
    ...config.sentry,
    debug: config.sentry.environment == 'development',
  });

  const app = express();
  // Our httpServer handles incoming requests to our Express app.
  // Below, we tell Apollo Server to "drain" this httpServer,
  // enabling our servers to shut down gracefully.
  const httpServer = http.createServer(app);
  // Initialize routes
  app.use('/queueDelete', queueDeleteRouter);

  // Start BatchDelete queue polling if not test env
  if (process.env.NODE_ENV != 'test') {
    new BatchDeleteHandler(new EventEmitter());
  }

  // Initialize event handlers
  initItemEventHandlers(itemsEventEmitter, [
    unifiedEventHandler,
    sqsEventHandler,
    snowplowEventHandler,
    initAccountDeletionCompleteEvents,
  ]);

  // Inject initialized event emittter to create context factory function
  const contextFactory = (req: express.Request) => {
    return new ContextManager({
      request: req,
      dbClient: readClient(),
      eventEmitter: itemsEventEmitter,
    });
  };

  const server = new ApolloServer<ContextManager>({
    schema: buildSubgraphSchema({ typeDefs, resolvers }),
    plugins: [
      sentryPlugin,
      process.env.NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageGraphQLPlayground(),
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
    formatError: errorHandler,
    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  app.use(
    '/',
    // JSON parser to enable POST body with JSON
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => contextFactory(req),
    })
  );

  await new Promise<void>((resolve) =>
    httpServer.listen({ port: 4005 }, resolve)
  );
  console.log(`🚀 Public server ready at http://localhost:4005`);
  return app;
}
