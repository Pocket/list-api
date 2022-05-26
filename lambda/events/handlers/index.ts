import { SQSRecord } from 'aws-lambda';
import { accountDeleteHandler } from './accountDelete';

export enum Event {
  ACCOUNT_DELETION = 'account-deletion',
}

export const handlers: {
  [key: string]: (message: SQSRecord) => Promise<void>;
} = {
  [Event.ACCOUNT_DELETION]: accountDeleteHandler,
};
