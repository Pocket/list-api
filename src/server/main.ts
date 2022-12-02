import { nodeSDKBuilder } from './tracing';

//todo: init the nodeSDK before main runs
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

  app.get('/health', (req, res) => {
    return res.send('alive');
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
