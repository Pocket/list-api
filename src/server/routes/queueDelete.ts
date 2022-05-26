import { Request, Response } from 'express';
import { Router } from 'express';
import { checkSchema, Schema } from 'express-validator';
import { readClient } from '../../database/client';
import { SavedItemDataService } from '../../dataService';
import config from '../../config';
import { sqs } from '../../aws/sqs';
import {
  SendMessageBatchCommand,
  SendMessageBatchCommandOutput,
  SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import { nanoid } from 'nanoid';
import * as Sentry from '@sentry/node';
import { validate } from './validator';

export type SqsMessage = {
  userId: number;
  email: string;
  status: 'FREE' | 'PREMIUM';
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
    isEmail: true,
  },
  status: {
    in: ['body'],
    errorMessage: 'Must provide valid status (FREE or PREMIUM)',
    custom: {
      options: (status) => ['FREE', 'PREMIUM'].includes(status),
    },
  },
};

router.post(
  '/',
  checkSchema(queueDeleteSchema),
  validate,
  (req: Request, res: Response) => {
    const traceId = req.body.traceId ?? nanoid();
    const savedItemService = new SavedItemDataService({
      userId: req.body.userId.toString(),
      dbClient: readClient(),
      apiId: 'backend',
    });

    enqueueSavedItemIds(req.body, savedItemService, traceId);

    return res.send({
      status: 'OK',
      message: `QueueDelete: Enqueued items for User ID: ${req.body.userId} (traceId='${traceId}')`,
    });
  }
);

/**
 * Enqueue item IDs for deletions in batches
 * @param data
 * @param savedItemService
 * @param traceId
 */
export async function enqueueSavedItemIds(
  data: Omit<SqsMessage, 'itemIds'>,
  savedItemService: SavedItemDataService,
  traceId: string
): Promise<void> {
  const { userId, email, status } = data;
  const limit = config.queueDelete.queryLimit;
  let offset = 0;
  const sqsSends: Promise<SendMessageBatchCommandOutput>[] = [];
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
          status,
          itemIds: nextChunk.value,
          traceId: nanoid(),
        })
      );

      if (sqsEntries.length === config.aws.sqs.batchSize) {
        sqsSends.push(sqsSendBatch(sqsEntries));
        sqsEntries = []; // reset
      }

      nextChunk = chunkedIds.next();
    }

    offset += offset + limit;
  }

  // If there's any remaining, send to SQS
  if (sqsEntries.length) {
    sqsSends.push(sqsSendBatch(sqsEntries));
  }

  try {
    await Promise.all(sqsSends);
  } catch (e) {
    const message = `QueueDelete: Error - Failed to enqueue saved items for userId: ${userId} (traceId='${traceId}')`;
    Sentry.addBreadcrumb({ message });
    Sentry.captureException(e);
    console.log(message);
  }
}

/**
 * Send messages in a batch to SQS
 * @param entries
 */
async function sqsSendBatch(
  entries: SendMessageBatchRequestEntry[]
): Promise<SendMessageBatchCommandOutput> {
  const command = new SendMessageBatchCommand({
    Entries: entries,
    QueueUrl: config.aws.sqs.listDeleteQueue.url,
  });

  return sqs.send(command);
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
