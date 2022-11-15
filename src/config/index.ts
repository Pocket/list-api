// DO NOT CHANGE: circular dependency if simplified to "import { EventType } from '../businessEvents'"
import { EventType } from '../businessEvents/types';

const awsEnvironments = ['production', 'development'];
let localAwsEndpoint;
let snowplowHttpProtocol = 'https';
if (!awsEnvironments.includes(process.env.NODE_ENV)) {
  localAwsEndpoint = process.env.AWS_ENDPOINT || 'http://localhost:4566';
  snowplowHttpProtocol = 'http';
}

export default {
  app: {
    environment: process.env.NODE_ENV || 'development',
    depthLimit: 8,
  },
  events: {
    source: 'list-api', // TODO - ok to change from 'backend-php'?
    version: '0.0.2', // TODO - version currently in documentation
  },
  snowplow: {
    endpoint: process.env.SNOWPLOW_ENDPOINT || 'localhost:9090',
    httpProtocol: snowplowHttpProtocol,
    bufferSize: 1,
    retries: 3,
    appId: 'pocket-backend-list-api',
    events: EventType,
    schemas: {
      listItemUpdate: 'iglu:com.pocket/list_item_update/jsonschema/1-0-1',
      listItem: 'iglu:com.pocket/list_item/jsonschema/1-0-1',
      content: 'iglu:com.pocket/content/jsonschema/1-0-0',
      user: 'iglu:com.pocket/user/jsonschema/1-0-0',
      apiUser: 'iglu:com.pocket/api_user/jsonschema/1-0-0',
    },
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: localAwsEndpoint,
    maxRetries: 3, // maximum number of retries for aws sdk requests
    kinesis: {
      unifiedEvents: {
        streamName: 'unified_event',
        events: EventType,
      },
      maxBatch: 500, // maximum batch size for kinesis
      interval: 1000, // ms (approx) between processing batches
    },
    eventBus: {
      name:
        process.env.EVENT_BUS_NAME || 'PocketEventBridge-Dev-Shared-Event-Bus',
      eventBridge: { source: 'user-events' },
    },
    sqs: {
      publisherQueue: {
        events: Object.values(EventType) as string[],
        url:
          process.env.SQS_PUBLISHER_DATA_QUEUE_URL ||
          'http://localhost:4566/queue/pocket-publisher-data-queue',
      },
      listDeleteQueue: {
        url:
          process.env.SQS_BATCH_DELETE_QUEUE_URL ||
          'http://localhost:4566/queue/pocket-list-delete-queue',
        visibilityTimeout: 10000,
        messageRetentionSeconds: 1209600,
        maxMessages: 1,
        waitTimeSeconds: 0,
        defaultPollIntervalSeconds: 300,
        afterMessagePollIntervalSeconds: 30,
      },
      permLibItemMainQueue: {
        events: [EventType.ADD_ITEM],
        url:
          process.env.SQS_PERMLIB_ITEMMAIN_QUEUE_URL ||
          'http://localhost:4566/queue/PermLib-Local-ItemMain',
      },
      waitTimeSeconds: 20,
      batchSize: 10,
    },
  },
  database: {
    // contains tables for user, list, tags, annotations, etc.
    read: {
      host: process.env.DATABASE_READ_HOST || 'localhost',
      port: process.env.DATABASE_READ_PORT || '3309',
      user: process.env.DATABASE_READ_USER || 'root',
      password: process.env.DATABASE_READ_PASSWORD || '',
    },
    write: {
      host: process.env.DATABASE_WRITE_HOST || 'localhost',
      port: process.env.DATABASE_WRITE_PORT || '3309',
      user: process.env.DATABASE_WRITE_USER || 'root',
      password: process.env.DATABASE_WRITE_PASSWORD || '',
    },
    dbName: process.env.DATABASE || 'readitla_ril-tmp',
    tz: process.env.DATABASE_TZ || 'US/Central',
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    release: process.env.GIT_SHA || '',
    environment: process.env.NODE_ENV || 'development',
  },
  parserDomain: process.env.PARSER_DOMAIN || 'https://parse-sir.local',
  parserVersion: process.env.PARSER_VERSION || 'v3beta',
  pagination: {
    defaultPageSize: 30,
    maxPageSize: 100,
  },
  queueDelete: {
    queryLimit: 500,
    itemIdChunkSize: 200,
  },
  batchDelete: {
    deleteDelayInMilliSec: 3000,
    tablesWithPii: ['item_tags', 'list', 'item_attribution'],
    tablesWithUserIdAlone: [
      'list_meta',
      'items_scroll',
      'item_ads',
      'item_time_spent',
      'item_currently_reading',
      'list_extras',
      'list_shares',
    ],
  },
};
