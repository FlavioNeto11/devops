// Ponta a ponta HTTP (F2) com token real e RBAC real, sobre Postgres descartável: boot da fundação
// (migrations + seed de papéis), usuários gestores, upload -> classificação -> reivindicação ->
// visão. Prova também que o frontend não contorna nada: com token válido de gestor, as rotas da
// tese antiga continuam 410 e o reconhecimento de direito continua 409 (F4).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDisposablePg, usePgEnv } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = pgInst ? false : 'Docker indisponível — teste HTTP com banco pulado';
if (pgInst) {
  usePgEnv(pgInst);
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-e2e-'));
}

let server; let base; let db; const tokens = {};
before(async () => {
  if (!pgInst) return;
  const { bootFoundation } = await import('../src/foundation/index.js');
  assert.equal(await bootFoundation(), true);
  db = await import('../src/db.js');
  const { createAccessToken } = await import('@flavioneto11/oidc-kit');
  for (const name of ['a', 'b', 'c']) {
    const u = (await db.query(`INSERT INTO users (email, name, approval_status) VALUES ($1, $2, 'active') RETURNING id`, [`gestor-${name}@teste.local`, `Gestor ${name}`])).rows[0];
    await db.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'manager'`, [u.id]);
    tokens[name] = createAccessToken({ sub: u.id }, { secret: process.env.SESSION_SECRET, ttlSeconds: 3600, prefix: 'besc_access' });
  }
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!pgInst) return;
  server?.close();
  await db?.closePools();
  pgInst.stop();
});

const call = async (method, route, { who, body, form } = {}) => {
  const headers = {};
  if (who) headers.authorization = `Bearer ${tokens[who]}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(base + route, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* binário */ }
  return { status: res.status, json, text };
};

test('F2 ponta a ponta com RBAC real e limites da fase', { skip }, async () => {
  assert.equal((await call('GET', '/recovery/claims')).status, 401, 'sem login não lê reivindicações (PII)');
  const meta = await call('GET', '/recovery/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.json.multi_issuer_research_gate, 'CLOSED');

  const claimant = await call('POST', '/recovery/claimants', { who: 'a', body: { personType: 'PF', displayName: 'Titular E2E' } });
  assert.equal(claimant.status, 200, claimant.text);
  const claim = await call('POST', '/recovery/claims', { who: 'a', body: { claimantId: claimant.json.id, claimKind: 'UNCONVERTED_POSITION' } });
  assert.equal(claim.json.state, 'OPEN');

  const bytes = `cautela e2e ${Date.now()}`;
  const form = new FormData();
  form.append('claimId', claim.json.id);
  form.append('notes', 'Banco do Estado de Santa Catarina, 1984');
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'cautela.pdf');
  const up = await call('POST', '/recovery/evidence', { who: 'a', form });
  assert.equal(up.status, 201, up.text);
  assert.equal(up.json.evidence.hashStatus, 'HASHED');
  assert.deepEqual(up.json.originCandidates.map((o) => o.originId), ['BESC']);
  const evId = up.json.evidence.id;

  const cls = await call('POST', `/recovery/evidence/${evId}/classifications`, { who: 'a', body: { documentKind: 'CERTIFICATE', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT', originCandidate: 'BESC', certificateNumber: `E2E-${Date.now()}` } });
  assert.equal(cls.status, 200, cls.text);
  assert.equal(cls.json.state, 'LINKED');

  const dl = await call('GET', `/recovery/evidence/${evId}/file`, { who: 'a' });
  assert.equal(dl.status, 200);
  assert.equal(dl.text, bytes);

  const view = await call('GET', `/recovery/claims/${claim.json.id}`, { who: 'a' });
  assert.equal(view.json.claim.stageLabel, 'POSSÍVEL DIREITO');
  assert.ok(view.json.journey.filter((s) => ['F3', 'F4', 'F5'].includes(s.phase)).every((s) => s.status === 'NOT_AVAILABLE_IN_PHASE'));
  assert.equal(view.json.claimant.displayName, 'Titular E2E');

  const rec = await call('POST', `/recovery/claims/${claim.json.id}/transitions`, { who: 'a', body: { toState: 'RECOGNIZED', reason: 'tentativa de pular a validação externa' } });
  assert.equal(rec.status, 409);
  assert.equal(rec.json.code, 'NOT_AVAILABLE_IN_PHASE');
  const bad = await call('POST', '/recovery/claims', { who: 'a', body: { claimantId: claimant.json.id, assetOriginId: 'NOSSA_CAIXA' } });
  assert.equal(bad.status, 409);

  // quatro-olhos por HTTP
  const ap = await call('POST', '/recovery/approvals', { who: 'a', body: { action: 'LEGAL_OPINION', subjectType: 'claim', subjectId: claim.json.id, reason: 'parecer sobre prescrição da pretensão de conversão' } });
  assert.equal((await call('POST', `/recovery/approvals/${ap.json.id}/review`, { who: 'a', body: {} })).status, 403);
  assert.equal((await call('POST', `/recovery/approvals/${ap.json.id}/review`, { who: 'b', body: { notes: 'ok' } })).status, 200);
  assert.equal((await call('POST', `/recovery/approvals/${ap.json.id}/decision`, { who: 'a', body: { decision: 'APPROVED' } })).status, 403);
  assert.equal((await call('POST', `/recovery/approvals/${ap.json.id}/decision`, { who: 'c', body: { decision: 'APPROVED' } })).json.decision, 'APPROVED');

  // trilha verificável e sem PII
  const v = await call('GET', '/audit/verify', { who: 'a' });
  assert.equal(v.json.ok, true, v.text);
  const events = await call('GET', '/audit/events?limit=200', { who: 'a' });
  const blob = JSON.stringify(events.json);
  assert.ok(!blob.includes('Titular E2E'), 'nome do reclamante não entra na trilha');
  assert.ok(events.json.some((e) => e.event_type === 'recovery.evidence.received' && e.schema_version === 2 && e.source === 'besc-api'));
});

test('com token válido de gestor, a tese antiga continua 410 (frontend não é autoridade)', { skip }, async () => {
  for (const [m, r] of [['POST', '/titles/x/batches'], ['POST', '/marketplace/titles/x/contract'], ['POST', '/contracts/x/leases'], ['POST', '/gate/grant'], ['GET', '/marketplace/catalog']]) {
    const res = await call(m, r, { who: 'a', body: m === 'GET' ? undefined : {} });
    assert.equal(res.status, 410, `${m} ${r}`);
  }
  const legacyRead = await call('GET', '/titles', { who: 'a' });
  assert.equal(legacyRead.status, 200, 'leitura histórica do marketplace segue disponível ao gestor');
});

test('permissões do marketplace aparecem como desativadas no catálogo', { skip }, async () => {
  const { rows } = await db.query(`SELECT key, label FROM permissions WHERE key IN ('tokens:issue','contracts:contract','recovery:write')`);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.label]));
  assert.match(byKey['tokens:issue'], /desativado/);
  assert.match(byKey['contracts:contract'], /desativado/);
  assert.ok(byKey['recovery:write']);
  assert.ok(readFileSync);
});
