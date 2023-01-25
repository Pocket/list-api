import { Request, Response } from 'express';
import { Router } from 'express';
import { checkSchema, Schema } from 'express-validator';
import { readClient } from '../../database/client';
import { SavedItemDataService } from '../../dataService';
import config from '../../config';
import { sqs } from '../../aws/sqs';
import {
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import { nanoid } from 'nanoid';
import * as Sentry from '@sentry/node';
import { validate } from './validator';

export type SqsMessage = {
  userId: number;
  email: string;
  isPremium: boolean;
  itemIds: number[];
  traceId: string;
};

const router = Router();

const queueDeleteSchema: Schema = {
  traceId: {
    in: ['body'],
    optional: true,
    isString: true,
    notEmpty: true,
  },
  userId: {
    in: ['body'],
    errorMessage: 'Must provide valid userId',
    isInt: true,
    toInt: true,
  },
  email: {
    in: ['body'],
    errorMessage: 'Must provide valid email',
  },
  isPremium: {
    in: ['body'],
    errorMessage: 'Must provide valid isPremium (true | false)',
    isBoolean: true,
  },
};

router.post(
  '/',
  checkSchema(queueDeleteSchema),
  validate,
  (req: Request, res: Response) => {
    const requestId = req.body.traceId ?? nanoid();
    const savedItemService = new SavedItemDataService({
      userId: req.body.userId.toString(),
      dbClient: readClient(),
      apiId: 'backend',
    });

    enqueueSavedItemIds(req.body, savedItemService, requestId);

    return res.send({
      status: 'OK',
      message: `QueueDelete: Enqueued items for User ID: ${req.body.userId} (requestId='${requestId}')`,
    });
  }
);

/**
 * Enqueue item IDs for deletions in batches. This is used to purge
 * user list and tag data when a user deletes their account. Since
 * the data to clear could be large, we don't want to keep the api
 * connection open while it's happening. Instead these processes
 * will happen asynchronously in the background using queues.
 * @param data
 * @param savedItemService
 * @param requestId
 */
export async function enqueueSavedItemIds(
  data: Omit<SqsMessage, 'itemIds'>,
  savedItemService: SavedItemDataService,
  requestId: string
): Promise<void> {
  const { userId, email, isPremium } = data;
  const limit = config.queueDelete.queryLimit;
  let offset = 0;
  const sqsCommands: SendMessageBatchCommand[] = [];
  let sqsEntries: SendMessageBatchRequestEntry[] = [];

  const loopCondition = true;
  while (loopCondition) {
    const ids = await savedItemService.getSavedItemIds(offset, limit);
    if (!ids.length) break;

    const chunkedIds = chunk(ids, config.queueDelete.itemIdChunkSize);

    let nextChunk = chunkedIds.next();
    while (!nextChunk.done) {
      sqsEntries.push(
        convertToSqsEntry({
          userId,
          email,
          isPremium,
          itemIds: nextChunk.value,
          traceId: nanoid(),
        })
      );

      if (sqsEntries.length === config.aws.sqs.batchSize) {
        sqsCommands.push(buildSqsCommand(sqsEntries));
        sqsEntries = []; // reset
      }

      nextChunk = chunkedIds.next();
    }

    offset = offset + limit;
  }

  // If there's any remaining, send to SQS
  if (sqsEntries.length) {
    sqsCommands.push(buildSqsCommand(sqsEntries));
  }

  await Promise.allSettled(
    sqsCommands.map((command) => {
      // Handle logging individual errors as the promises are resolved
      return sqs.send(command).catch((err) => {
        const message = `QueueDelete: Error - Failed to enqueue saved items for userId: ${userId} (command=\n${JSON.stringify(
          command
        )})`;
        Sentry.addBreadcrumb({ message });
        Sentry.captureException(err);
        console.log(message);
      });
    })
  );
}

/**
 * Build command for sending messages to the delete queue,
 * for purging user data after account deletion.
 * @param entries
 */
function buildSqsCommand(
  entries: SendMessageBatchRequestEntry[]
): SendMessageBatchCommand {
  const command = new SendMessageBatchCommand({
    Entries: entries,
    QueueUrl: config.aws.sqs.listDeleteQueue.url,
  });
  return command;
}

/**
 * Convert a JSON object to an SQS send message entry
 * @param message
 */
function convertToSqsEntry(message: SqsMessage): SendMessageBatchRequestEntry {
  return {
    Id: nanoid(),
    MessageBody: JSON.stringify(message),
  };
}

/**
 * Yield chunks of a given list
 * @param list
 * @param size
 */
function* chunk(list: number[], size = 1000): Generator<number[]> {
  for (let i = 0; i < list.length; i += size) {
    yield list.slice(i, i + size);
  }
}

export default router;
