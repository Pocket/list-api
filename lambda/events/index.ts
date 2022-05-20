import { SQSEvent } from 'aws-lambda';
import * as Sentry from '@sentry/serverless';

function processor(event: SQSEvent) {
  console.log(`Events Lambda invoked with: ${JSON.stringify(event)}`);
}

export const handler = Sentry.AWSLambda.wrapHandler(processor);
