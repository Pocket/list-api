import * as Sentry from '@sentry/node';
import config from '../config';
import express from 'express';
import https from 'https';
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
import { initTracing } from './tracing';

Sentry.init({
  ...config.sentry,
  debug: config.sentry.environment == 'development',
});
const app = express();

// JSON parser to enable POST body with JSON
app.use(express.json());

// Initialize routes
app.use('/queueDelete', queueDeleteRouter);

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

initTracing();
export default app;
