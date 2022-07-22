import {
  AccountDeleteEventBusPayload,
  EventBridgeEventType,
  EventHandlerCallbackMap,
} from './eventTypes';
import { BatchDeleteMessage } from './batchDeleteHandler';

/**
 * Mapping for account deletion complete events.
 */
export const eventMap: EventHandlerCallbackMap = {
  [EventBridgeEventType.ACCOUNT_DELETION_COMPLETED]: (
    data: BatchDeleteMessage
  ): AccountDeleteEventBusPayload => {
    return {
      userId: data.userId.toString(),
      email: data.email,
      isPremium: data.isPremium,
      version: '1.0.0',
      service: 'list',
      timestamp: Math.round(new Date().getTime() / 1000),
      eventType: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
    };
  },
};
