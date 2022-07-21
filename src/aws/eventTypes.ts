export type BaseEventBusPayload = {
  timestamp: number;
  version: string;
  eventType: string;
};

export type AccountDeleteEventBusPayload = BaseEventBusPayload & {
  userId: string;
  email: string;
  isPremium: boolean;
};

export type EventHandlerCallbackMap = {
  [key: string]: (data: any) => BaseEventBusPayload;
};

export enum EventBridgeEventType {
  ACCOUNT_DELETION = 'account-deletion',
}
