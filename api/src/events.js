import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emit(type, payload) {
  bus.emit('event', { type, payload, ts: new Date().toISOString() });
}
