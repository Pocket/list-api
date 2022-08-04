import EventEmitter from 'events';
import { EventBridgeEventType } from './eventTypes';
import { UserMessageBase } from './batchDeleteHandler';

export class AccountDeletionCompleteEventEmitter extends EventEmitter {
  emitAccountDeletionEvent(
    event: EventBridgeEventType.ACCOUNT_DELETION_COMPLETED,
    data: UserMessageBase
  ): void {
    this.emit(event, data);
  }
}
