import express from 'express';
import { checkSchema, Schema, validationResult } from 'express-validator';

const router = express.Router();
const batchDeleteSchema: Schema = {
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
        return value.map(parseInt);
      },
    },
  },
};

function validate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() }).setHeader('Content-Type', 'application/json');
  }
  next();
}

router.post(
  '/',
  checkSchema(batchDeleteSchema),
  validate,
  (req: express.Request, res: express.Response) => {
    res.send(
      `Deleting ${req.body.itemIds.length} itemId(s) for userId=${req.body.userId}`
    );
  }
);

export default router;
