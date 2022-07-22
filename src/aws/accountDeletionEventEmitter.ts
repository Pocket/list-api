import EventEmitter from 'events';
import { EventBridgeEventType } from './eventTypes';
import { BatchDeleteMessage } from './batchDeleteHandler';

export class AccountDeletionCompleteEventEmitter extends EventEmitter {
  emitItemEvent(
    event: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
    data: BatchDeleteMessage
  ): void {
    this.emit(event, data);
  }
}
