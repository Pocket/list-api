//this must run before all imports and server start
//so open-telemetry can patch all libraries that we use
import { nodeSDKBuilder } from './tracing';

nodeSDKBuilder().then(async () => {
  const app = await _startServer();
  app.listen({ port: 4005 }, () => {
    console.log(`🚀 Public server ready at http://localhost:4005`);
  });
});

import * as Sentry from '@sentry/node';
import config from '../config';
import express from 'express';
import { getContext, startServer } from './apolloServer';
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

export function _startServer() {
  Sentry.init({
    ...config.sentry,
    debug: config.sentry.environment == 'development',
  });

  const app = express();

  // JSON parser to enable POST body with JSON
  app.use(express.json());

  // Initialize routes
  app.use('/queueDelete', queueDeleteRouter);

  // Expose health check url
  app.get('/.well-known/apollo/server-health', (req, res) => {
    res.status(200).send('ok');
  });

  // Start BatchDelete queue polling
  new BatchDeleteHandler(new EventEmitter());

  // Initialize event handlers
  initItemEventHandlers(itemsEventEmitter, [
    unifiedEventHandler,
    sqsEventHandler,
    snowplowEventHandler,
    initAccountDeletionCompleteEvents,
  ]);

  // Inject initialized event emittters to create context factory function
  const contextFactory = (req: express.Request) => {
    return getContext(req, itemsEventEmitter);
  };

  const server = startServer(contextFactory);
  server.then((server) => server.applyMiddleware({ app, path: '/' }));

  return app;
}
