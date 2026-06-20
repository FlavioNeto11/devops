import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from './cache.js';

const tick = () => new Promise((r) => setImmediate(r));

test('cache: hit fresco não rechama o loader', async () => {
  let now = 1000; let calls = 0;
  const c = createCache({ now: () => now });
  const loader = async () => { calls += 1; return 'v' + calls; };
  const a = await c.get('k', 100, loader);
  assert.equal(a.value, 'v1'); assert.equal(a.stale, false);
  const b = await c.get('k', 100, loader); // dentro do TTL
  assert.equal(b.value, 'v1'); assert.equal(b.stale, false);
  assert.equal(calls, 1);
});

test('cache: vencido serve STALE na hora e revalida em background', async () => {
  let now = 1000; let calls = 0;
  const c = createCache({ now: () => now });
  const loader = async () => { calls += 1; return 'v' + calls; };
  await c.get('k', 100, loader); // v1
  now = 2000; // venceu
  const stale = await c.get('k', 100, loader);
  assert.equal(stale.value, 'v1');      // serve o anterior na hora
  assert.equal(stale.stale, true);
  await tick(); await tick();           // deixa o refresh em background concluir
  const fresh = await c.get('k', 100, loader);
  assert.equal(fresh.value, 'v2');      // já revalidou
  assert.equal(fresh.stale, false);
});

test('cache: single-flight — dois gets concorrentes sem valor prévio chamam o loader 1x', async () => {
  let now = 1000; let calls = 0;
  const c = createCache({ now: () => now });
  const loader = async () => { calls += 1; await tick(); return 'v' + calls; };
  const [a, b] = await Promise.all([c.get('k', 100, loader), c.get('k', 100, loader)]);
  assert.equal(calls, 1);
  assert.equal(a.value, 'v1');
  assert.equal(b.value, 'v1');
});

test('cache: erro no refresh mantém o STALE anterior', async () => {
  let now = 1000; let fail = false;
  const c = createCache({ now: () => now });
  const loader = async () => { if (fail) throw new Error('boom'); return 'ok'; };
  await c.get('k', 100, loader); // 'ok'
  now = 2000; fail = true;
  const r = await c.get('k', 100, loader);
  assert.equal(r.value, 'ok'); // serve o stale
  await tick(); await tick();
  const r2 = await c.get('k', 100, loader);
  assert.equal(r2.value, 'ok'); // continua servindo o último bom
});
