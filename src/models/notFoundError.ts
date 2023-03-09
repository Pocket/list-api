import { BaseErrorModel } from './baseError';
import { NotFoundInternal } from '../types';

export class NotFoundErrorModel extends BaseErrorModel {
  public message(key: string, value: string): NotFoundInternal {
    const message = `Entity identified by key=${key}, value=${value} was not found.`;
    return { message, __typename: 'NotFound' };
  }
}
