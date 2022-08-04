import { SQSRecord } from 'aws-lambda';
import { config } from '../config';
import fetch from 'node-fetch';

/**
 * Given an account delete event, queue SQS messages to delete chunks of the
 * user's list and tags from the database. Since the list size could be very large,
 * don't do this in a single operation but in chunks.
 * @param record SQSRecord containing forwarded event from eventbridge
 * @throws Error if response is not ok
 */
export async function accountDeleteHandler(record: SQSRecord) {
  const message = JSON.parse(JSON.parse(record.body).Message)['detail'];

  if (!message['userId'] || !message['email']) {
    console.log(`invalid payload for account deletion event, ' +
      'error processing 'detail': ${JSON.stringify(message)}`);
    return;
  }

  const postBody = {
    userId: message['userId'],
    email: message['email'],
    isPremium: message['isPremium'],
  };

  if (message['traceId']) {
    postBody['traceId'] = message['traceId'];
  }
  const res = await fetch(config.endpoint + config.queueDeletePath, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postBody),
  });
  if (!res.ok) {
    const data = (await res.json()) as any;
    throw new Error(
      `queueDelete - ${res.status}\n${JSON.stringify(data.errors)}`
    );
  }
}
