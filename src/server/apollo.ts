import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServer, ApolloServerPlugin } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageGraphQLPlayground } from '@apollo/server-plugin-landing-page-graphql-playground';
import {
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from '@apollo/server/plugin/disabled';
import { ApolloServerPluginInlineTrace } from '@apollo/server/plugin/inlineTrace';
import { sentryPlugin, errorHandler } from '@pocket-tools/apollo-utils';
import config from '../config';
import { ContextManager } from './context';
import { readClient, writeClient } from '../database/client';
import {
  eventBridgeEventHandler,
  initItemEventHandlers,
  itemsEventEmitter,
  snowplowEventHandler,
  sqsEventHandler,
  unifiedEventHandler,
} from '../businessEvents';
import { initAccountDeletionCompleteEvents } from '../aws/eventTypes';
import { Knex } from 'knex';
import { createApollo4QueryValidationPlugin } from 'graphql-constraint-directive/apollo4';
import { schema } from './schema';

/**
 * Stopgap method to set global db connection in context,
 * depending on whether the request is a query or mutation.
 * It's not possible to run both a mutation and query at the
 * same time according to the graphql spec.
 * This is a fragile regex which depends on the `mutation` keyword
 * being present or not at the beginning of the request
 * (part of the graphql request spec).
 * This method should just be used in the context factory function
 * but is exported from this file for unit testing.
 * @param query a graphql request body
 * @returns either a read or write connection to the database,
 * depending on if query or mutation.
 */
export const contextConnection = (query: string): Knex => {
  const isMutationRegex = /^[\n\r\s]*(mutation)/;
  const isMutation = isMutationRegex.test(query);
  return isMutation ? writeClient() : readClient();
};

export async function startServer(port: number) {
  Sentry.init({
    ...config.sentry,
    debug: config.sentry.environment == 'development',
  });

  const app = express();
  // Our httpServer handles incoming requests to our Express app.
  // Below, we tell Apollo Server to "drain" this httpServer,
  // enabling our servers to shut down gracefully.
  const httpServer = http.createServer(app);

  // Expose health check url
  app.get('/.well-known/apollo/server-health', (req, res) => {
    res.status(200).send('ok');
  });

  // Initialize event handlers
  initItemEventHandlers(itemsEventEmitter, [
    unifiedEventHandler,
    sqsEventHandler,
    snowplowEventHandler,
    initAccountDeletionCompleteEvents,
    eventBridgeEventHandler,
  ]);

  // Inject initialized event emittter to create context factory function
  const contextFactory = (req: express.Request) => {
    const dbClient = contextConnection(req.body.query);
    return new ContextManager({
      request: req,
      dbClient,
      eventEmitter: itemsEventEmitter,
    });
  };

  // Set up plugins depending on environment
  // Default plugins regardless
  const defaultPlugins = [
    sentryPlugin,
    ApolloServerPluginUsageReportingDisabled(),
    ApolloServerPluginDrainHttpServer({ httpServer }),
    createApollo4QueryValidationPlugin({ schema }),
  ];
  // Environment-specific plugins map
  const pluginsConfig: Record<
    'test' | 'production' | 'development',
    ApolloServerPlugin[]
  > = {
    test: [ApolloServerPluginInlineTraceDisabled()],
    development: [
      ApolloServerPluginLandingPageGraphQLPlayground(),
      ApolloServerPluginInlineTrace({ includeErrors: { unmodified: true } }),
    ],
    production: [
      ApolloServerPluginLandingPageDisabled(),
      ApolloServerPluginInlineTrace({
        includeErrors: { unmodified: true },
      }),
    ],
  };

  const plugins = [
    ...defaultPlugins,
    ...(pluginsConfig[process.env.NODE_ENV] ?? []),
  ];

  const server = new ApolloServer<ContextManager>({
    schema,
    plugins,
    formatError: process.env.NODE_ENV !== 'test' ? errorHandler : undefined,
    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  // Apply to root
  const url = '/';

  app.use(
    url,
    // JSON parser to enable POST body with JSON
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => contextFactory(req),
    })
  );

  await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));
  return { app, server, url };
}
