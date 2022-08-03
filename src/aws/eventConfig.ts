import {
  AccountDeleteEventBusPayload,
  EventBridgeEventType,
} from './eventTypes';

/**
 * convert batch SQS message to account complete event payload
 */
export function processEventPayloadFromMessage(
  data
): AccountDeleteEventBusPayload {
  return {
    userId: data.userId.toString(),
    email: data.email,
    isPremium: data.isPremium,
    version: '1.0.0',
    service: 'list',
    timestamp: Math.round(new Date().getTime() / 1000),
    eventType: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
  };
}
