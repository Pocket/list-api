import * as Sentry from '@sentry/node';
import config from '../config';
import AWSXRay from 'aws-xray-sdk-core';
import xrayExpress from 'aws-xray-sdk-express';
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
import { EventEmitter } from 'stream';

//Set XRAY to just log if the context is missing instead of a runtime error

AWSXRay.setContextMissingStrategy('LOG_ERROR');
//Add the AWS XRAY ECS plugin that will add ecs specific data to the trace

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
//Capture all https traffic this service sends
//This is to auto capture node fetch requests (like to parser)

AWSXRay.captureHTTPsGlobal(https, true);
//Capture all promises that we make

AWSXRay.capturePromise();
// Initialize sentry

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
]);

// Inject initialized event emittters to create context factory function
const contextFactory = (req: express.Request) => {
  return getContext(req, itemsEventEmitter);
};

const server = startServer(contextFactory);

//If there is no host header (really there always should be..) then use list-api as the name

app.use(xrayExpress.openSegment('list-api'));
//Set XRay to use the host header to open its segment name.

AWSXRay.middleware.enableDynamicNaming('*');
server.then((server) => server.applyMiddleware({ app, path: '/' }));

//Make sure the express app has the xray close segment handler
app.use(xrayExpress.closeSegment());

export default app;
