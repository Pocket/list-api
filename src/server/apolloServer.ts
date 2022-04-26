import { ApolloServer } from 'apollo-server-express';
import { buildSubgraphSchema } from '@apollo/federation';
import { typeDefs } from './typeDefs';
import { resolvers } from '../resolvers';
import { errorHandler } from '@pocket-tools/apollo-utils';
import { ItemsEventEmitter } from '../businessEvents';
import { ContextManager } from './context';
import { readClient } from '../database/client';
import { Request } from 'express';
import {
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageDisabled,
} from 'apollo-server-core';
import { sentryPlugin } from '@pocket-tools/apollo-utils';

// Function signature for context creator; primarily for
// injecting test contexts
interface ContextFactory {
  (req: Request): ContextManager;
}

/**
 * Context factory function. Creates a new context upon
 * every request
 * @param req server request
 * @param emitter a pre-initialized itemsEventEmitter
 * @returns ContextManager
 */
export function getContext(
  req: Request,
  emitter: ItemsEventEmitter
): ContextManager {
  return new ContextManager({
    request: req,
    dbClient: readClient(),
    eventEmitter: emitter,
  });
}

/**
 * Sets up and configures an ApolloServer for the application.
 * @param contextFactory function for creating the context with
 * every request
 * @returns ApolloServer
 */
export function getServer(contextFactory: ContextFactory): ApolloServer {
  return new ApolloServer({
    schema: buildSubgraphSchema({ typeDefs, resolvers }),
    plugins: [
      sentryPlugin,
      process.env.NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
    formatError: errorHandler,
    introspection: process.env.NODE_ENV !== 'production',
    context: ({ req }) => contextFactory(req),
  });
}

/**
 * Create and start the apollo server. Required to await server.start()
 * before applying middleware per apollo-server 3 migration.
 */
export async function startServer(
  contextFactory: ContextFactory
): Promise<ApolloServer> {
  const server = getServer(contextFactory);
  await server.start();
  return server;
}
