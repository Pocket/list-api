import EventEmitter from 'events';

export interface IEventHandler {
  init(emitter: EventEmitter): IEventHandler;
}
