import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createForgeEventsHub } from './forge-events.js';

function fakeRes() {
  const chunks = [];
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, flushHeaders() { /* noop */ }, write(c) { chunks.push(c); }, chunks };
}
function fakeReq() {
  const handlers = {};
  return { on(ev, fn) { handlers[ev] = fn; }, _close() { if (handlers.close) handlers.close(); } };
}

test('forge-events: snapshot imediato, dedup por assinatura, frame novo só quando muda', async () => {
  let state = { source: 'live', products: [{ name: 'crm', reqCount: 5, progress: { done: 5, pct: 100 } }] };
  const hub = createForgeEventsHub({ stateFn: () => state });
  const req = fakeReq(); const res = fakeRes();
  hub.addClient(req, res);
  await new Promise((r) => setTimeout(r, 10)); // tick(true) inicial é async
  assert.equal(res.headers['Content-Type'], 'text/event-stream');
  assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
  const frames = () => res.chunks.filter((c) => c.includes('event: state')).length;
  assert.equal(frames(), 1); // snapshot imediato
  await hub._internals.tick(false); // mesma assinatura -> nada desce
  assert.equal(frames(), 1);
  state = { source: 'live', products: [{ name: 'crm', reqCount: 6, progress: { done: 5, pct: 83 } }] };
  await hub._internals.tick(false); // progresso mudou -> frame novo
  assert.equal(frames(), 2);
  assert.match(res.chunks[res.chunks.length - 1], /"reqCount":6/);
  req._close(); // remove o cliente e para os intervals (senão o test runner ficaria pendurado)
});

test('forge-events: stateFn que lança não derruba o hub (fail-soft, sem frame)', async () => {
  const hub = createForgeEventsHub({ stateFn: () => { throw new Error('configmap fora'); } });
  const req = fakeReq(); const res = fakeRes();
  hub.addClient(req, res);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(res.chunks.filter((c) => c.includes('event: state')).length, 0);
  assert.ok(res.chunks.some((c) => c.startsWith(': connected'))); // conexão viva mesmo sem estado
  req._close();
});
