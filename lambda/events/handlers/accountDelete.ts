import { SQSRecord } from 'aws-lambda';
import { config } from '../config';
import fetch from 'node-fetch';

/**
 * Logic for processing individual events forwarded to SQS from
 * event bridge, to queue chunks of list for deletion.
 * @param record SQSRecord containing forwarded event from eventbridge
 * @throws Error if response is not ok
 */
export async function accountDeleteHandler(record: SQSRecord) {
  const message = JSON.parse(record.body)['detail'];
  const postBody = {
    userId: message['userId'],
    email: message['email'],
    status: message['status'],
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
