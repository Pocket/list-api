import { BasicUserEventPayloadWithContext, EventType } from '../eventType';
import {
  AccountDeleteEventBusPayload,
  EventBridgeEventType,
  EventHandlerCallbackMap,
} from './types';

/**
 * Mapping for events
 */
export const eventMap: EventHandlerCallbackMap = {
  [EventType.ACCOUNT_DELETE]: (
    data: BasicUserEventPayloadWithContext
  ): AccountDeleteEventBusPayload => {
    return {
      userId: data.user.id,
      email: data.user.email,
      isPremium: data.user.isPremium,
      version: '1.0.0',
      service: 'list',
      timestamp: Math.round(new Date().getTime() / 1000),
      eventType: EventBridgeEventType.ACCOUNT_DELETION,
    };
  },
};
