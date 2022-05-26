import { SQSRecord } from 'aws-lambda';
import { accountDeleteHandler } from './accountDelete';

export const handlers: {
  [key: string]: (message: SQSRecord) => Promise<void>;
} = {
  ACCOUNT_DELETE: accountDeleteHandler,
};
