import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import * as Sentry from '@sentry/serverless';
import { config } from './config';
import fetch from 'node-fetch';

type BatchDeleteMessage = {
  userId: number;
  itemIds: number[];
  traceId?: string;
};

/**
 * The main handler function which will be wrapped by Sentry prior to export
 * @param event
 * @returns
 */
export async function processor(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchFailures: SQSBatchItemFailure[] = [];
  for await (const record of event.Records) {
    const message: BatchDeleteMessage = JSON.parse(record.body);
    try {
      await postBatchDelete(message);
    } catch (error) {
      console.log(error);
      Sentry.captureException(error);
      batchFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: batchFailures };
}

/**
 * The logic for each individual message in the SQS batch
 * @param message
 */
export async function postBatchDelete(
  message: BatchDeleteMessage
): Promise<void> {
  const postBody = { userId: message.userId, itemIds: message.itemIds };
  if (message.traceId) {
    postBody['traceId'] = message.traceId;
  }
  const res = await fetch(config.endpoint + config.batchDeletePath, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postBody),
  });
  if (!res.ok) {
    const data = (await res.json()) as any;
    throw new Error(
      `batchDelete - ${res.status}\n${JSON.stringify(data.errors)}`
    );
  }
}

export const handler = Sentry.AWSLambda.wrapHandler(processor);
