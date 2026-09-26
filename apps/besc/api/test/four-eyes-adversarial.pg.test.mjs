// ADR-010, hardening P1 — quatro-olhos é IDENTIDADE LÓGICA (users.id), não sessão. Tentativas
// adversariais por HTTP real (app como besc_app): mesmo usuário com outro token/sessão, admin com
// '*', requerente decidindo, concorrência entre revisores e entre decisores, e SQL direto como runtime.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDisposablePg, usePgEnv, requirePgOrFail } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);
if (pgInst) { usePgEnv(pgInst); process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-4eyes-')); }

let server; let base; let db; const tok = {}; const ids = {};
before(async () => {
  if (!pgInst) return;
  const { bootFoundation } = await import('../src/foundation/index.js');
  assert.equal(await bootFoundation(), true);
  db = await import('../src/db.js');
  const { createAccessToken } = await import('@flavioneto11/oidc-kit');
  const mk = (sub) => createAccessToken({ sub }, { secret: process.env.SESSION_SECRET, ttlSeconds: 600, prefix: 'besc_access' });
  for (const [name, role] of [['a', 'manager'], ['b', 'manager'], ['c', 'manager'], ['root', 'admin']]) {
    const u = (await db.query(`INSERT INTO users (email, name, approval_status) VALUES ($1,$2,'active') RETURNING id`, [`${name}@4eyes.localhost`, name])).rows[0];
    await db.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = $2`, [u.id, role]);
    ids[name] = u.id;
    tok[name] = mk(u.id);
  }
  tok.a2 = mk(ids.a); // mesma identidade, outra "sessão"/token
  // outra sessão de verdade: refresh token próprio
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (!pgInst) return; server?.close(); await db?.closePools(); await pgInst.stop(); });

const call = async (who, method, route, body) => {
  const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const newRequest = async (who) => {
  const r = await call(who, 'POST', '/recovery/approvals', { action: 'LEGAL_OPINION', subjectType: 'claim', subjectId: '00000000-0000-0000-0000-000000000001', reason: 'pedido adversarial de quatro-olhos' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.id;
};

test('mesma identidade com outro token não revisa nem decide o próprio pedido', { skip }, async () => {
  const id = await newRequest('a');
  assert.equal((await call('a2', 'POST', `/recovery/approvals/${id}/review`, { notes: 'x' })).status, 403);
  assert.equal((await call('b', 'POST', `/recovery/approvals/${id}/review`, { notes: 'ok' })).status, 200);
  assert.equal((await call('a2', 'POST', `/recovery/approvals/${id}/decision`, { decision: 'APPROVED' })).status, 403);
  assert.equal((await call('a', 'POST', `/recovery/approvals/${id}/decision`, { decision: 'APPROVED' })).status, 403);
});

test('admin com permissão total também não se autoaprova', { skip }, async () => {
  const id = await newRequest('root');
  assert.equal((await call('root', 'POST', `/recovery/approvals/${id}/review`, { notes: 'x' })).status, 403);
  assert.equal((await call('b', 'POST', `/recovery/approvals/${id}/review`, {})).status, 200);
  assert.equal((await call('root', 'POST', `/recovery/approvals/${id}/decision`, { decision: 'APPROVED' })).status, 403);
  const row = (await db.query('SELECT state, approved_by FROM approval_request WHERE id = $1', [id])).rows[0];
  assert.equal(row.state, 'IN_REVIEW');
  assert.equal(row.approved_by, null);
});

test('concorrência: dois revisores ao mesmo tempo → exatamente um vence; o registro não é sobrescrito', { skip }, async () => {
  for (let i = 0; i < 5; i++) {
    const id = await newRequest('a');
    const [r1, r2] = await Promise.all([
      call('b', 'POST', `/recovery/approvals/${id}/review`, { notes: 'b' }),
      call('c', 'POST', `/recovery/approvals/${id}/review`, { notes: 'c' }),
    ]);
    const oks = [r1, r2].filter((r) => r.status === 200);
    assert.equal(oks.length, 1, `rodada ${i}: ${r1.status}/${r2.status}`);
    const row = (await db.query('SELECT reviewed_by FROM approval_request WHERE id = $1', [id])).rows[0];
    assert.equal(row.reviewed_by, oks[0].json.reviewedBy, 'o vencedor é quem ficou registrado');
  }
});

test('concorrência: dois decisores ao mesmo tempo → uma única decisão', { skip }, async () => {
  for (let i = 0; i < 5; i++) {
    const id = await newRequest('a');
    assert.equal((await call('b', 'POST', `/recovery/approvals/${id}/review`, {})).status, 200);
    const [d1, d2] = await Promise.all([
      call('c', 'POST', `/recovery/approvals/${id}/decision`, { decision: 'APPROVED' }),
      call('root', 'POST', `/recovery/approvals/${id}/decision`, { decision: 'REJECTED' }),
    ]);
    const oks = [d1, d2].filter((r) => r.status === 200);
    assert.equal(oks.length, 1, `rodada ${i}: ${d1.status}/${d2.status}`);
    const row = (await db.query('SELECT state, decision FROM approval_request WHERE id = $1', [id])).rows[0];
    assert.equal(row.decision, oks[0].json.decision);
  }
});

test('SQL direto como runtime não forja aprovação', { skip }, async () => {
  const id = await newRequest('a');
  await assert.rejects(() => db.query(`UPDATE approval_request SET state = 'IN_REVIEW', reviewed_by = requested_by, reviewed_at = now() WHERE id = $1`, [id]));
  await assert.rejects(() => db.query(`UPDATE approval_request SET state = 'APPROVED', decision = 'APPROVED', approved_by = $2, approved_at = now() WHERE id = $1`, [id, ids.b]),
    'não se pula a revisão');
  await assert.rejects(() => db.query(`UPDATE approval_request SET requested_by = $2 WHERE id = $1`, [id, ids.c]), /permission denied/);
});
