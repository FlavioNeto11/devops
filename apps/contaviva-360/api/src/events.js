// events.js — In-memory pub/sub para SSE real-time (REQ-CONTAVIVA360-0008).
import { EventEmitter } from 'node:events';
const bus = new EventEmitter();
bus.setMaxListeners(500);
export function broadcast(tenantId, event) { bus.emit('t:' + tenantId, event); }
export function subscribe(tenantId, fn) { bus.on('t:' + tenantId, fn); }
export function unsubscribe(tenantId, fn) { bus.off('t:' + tenantId, fn); }
