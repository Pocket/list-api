import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import * as Sentry from '@sentry/serverless';
import { handlers } from './handlers';

/**
 * The main handler function which will be wrapped by Sentry prior to export
 * @param event
 * @returns
 */
export async function processor(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchFailures: SQSBatchItemFailure[] = [];
  for await (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      if (handlers[message['detail-type']] == null) {
        throw new Error(
          `Unable to retrieve handler for detail-type='${message['detail-type']}'`
        );
      }
      await handlers[message['detail-type']](record);
    } catch (error) {
      console.log(error);
      Sentry.captureException(error);
      batchFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: batchFailures };
}

export const handler = Sentry.AWSLambda.wrapHandler(processor);
