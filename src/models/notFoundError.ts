import { BaseErrorModel } from './baseError';
import { NotFound, NotFoundInternal } from '../types';

export class NotFoundErrorModel extends BaseErrorModel {
  public message(key: string, value: string): NotFoundInternal {
    const message = `Entity identified by key=${key}, value=${value} was not found.`;
    return { message, __typename: 'NotFound' };
  }

  public extendedMessage(key: string, value: string): NotFound {
    const message = `Entity identified by key=${key}, value=${value} was not found.`;
    return { message, __typename: 'NotFound', id: value };
  }
}
