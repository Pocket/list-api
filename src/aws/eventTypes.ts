import { AccountDeletionCompleteEventEmitter } from './accountDeletionEventEmitter';
import { AccountDeletionEventHandler } from './accountDeletionEventHandler';

export type BaseEventBusPayload = {
  timestamp: number;
  version: string;
  eventType: string;
};

export type AccountDeleteEventBusPayload = BaseEventBusPayload & {
  userId: string;
  email: string;
  isPremium: boolean;
  service: 'list';
};

export type EventHandlerCallbackMap = {
  [key: string]: (data: any) => BaseEventBusPayload;
};

export enum EventBridgeEventType {
  ACCOUNT_DELETION_COMPLETED = 'account-deletion-complete',
}

//call this in main.ts where the server starts
export function initAccountDeletionCompleteEvents() {
  const emitter = new AccountDeletionCompleteEventEmitter();
  const handler = new AccountDeletionEventHandler();
  handler.init(emitter);
}
