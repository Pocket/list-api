import express from 'express';
import { checkSchema, Schema } from 'express-validator';
import { SavedItemDataService } from '../../dataService';
import { writeClient } from '../../database/client';
import { nanoid } from 'nanoid';
import { validate } from './validator';

const router = express.Router();
const batchDeleteSchema: Schema = {
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
  itemIds: {
    in: ['body'],
    errorMessage: 'Must provide between 1 and 1000 numeric IDs',
    isArray: {
      bail: true,
      options: {
        min: 1,
        max: 1000,
      },
    },
    custom: {
      options: (itemIds) => {
        return itemIds.every((itemId) => {
          // integer validation here
          return Number.isInteger(itemId) && itemId >= 0;
        });
      },
    },
    customSanitizer: {
      options: (value) => {
        return value.map((_) => parseInt(_));
      },
    },
  },
};

router.post(
  '/',
  checkSchema(batchDeleteSchema),
  validate,
  (req: express.Request, res: express.Response) => {
    const traceId = req.body.traceId ?? nanoid();
    const dbClient = writeClient();
    // Kick off promises for deletes, but don't block response
    new SavedItemDataService({
      dbClient,
      userId: req.body.userId,
      apiId: 'backend',
    }).batchDeleteSavedItems(req.body.itemIds, traceId);
    res.send(
      `Deleting ${req.body.itemIds.length} itemId(s) for userId=${req.body.userId} (traceId='${traceId}')`
    );
  }
);

export default router;
