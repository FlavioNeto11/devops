// ADR-010, hardening P1 — UNKNOWN ≠ PUBLIC. Conteúdo criado pelo operador nasce RESTRITO; só a
// curadoria (com motivo, trilha e, para material de terceiro, referência de autorização) publica, e
// nunca com natureza UNKNOWN. O PUT genérico não publica nada. Banco + RBAC reais (app = besc_app).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDisposablePg, usePgEnv, requirePgOrFail } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);
if (pgInst) { usePgEnv(pgInst); process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-pub-')); }

let server; let base; let db; let curator;
before(async () => {
  if (!pgInst) return;
  const store = await import('../src/store.js');
  await store.init();
  const { bootFoundation } = await import('../src/foundation/index.js');
  assert.equal(await bootFoundation(), true);
  db = await import('../src/db.js');
  const { createAccessToken } = await import('@flavioneto11/oidc-kit');
  const u = (await db.query(`INSERT INTO users (email, name, approval_status) VALUES ('curador@pub.localhost','Curador','active') RETURNING id`)).rows[0];
  await db.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'manager'`, [u.id]);
  curator = createAccessToken({ sub: u.id }, { secret: process.env.SESSION_SECRET, ttlSeconds: 600, prefix: 'besc_access' });
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (!pgInst) return; server?.close(); await db?.closePools(); await pgInst.stop(); });

const call = async (method, route, { body, token } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

test('item novo do operador nasce restrito: invisível ao público, visível à curadoria', { skip }, async () => {
  const c = await call('POST', '/library', { token: curator, body: { title: 'Ofício recebido', kind: 'historia', summary: 'texto' } });
  assert.equal(c.status, 201);
  const id = c.json.id;
  assert.ok(!(await call('GET', '/library')).json.some((it) => it.id === id));
  assert.equal((await call('GET', `/library/${id}`)).status, 404);
  const seen = await call('GET', `/library/${id}`, { token: curator });
  assert.equal(seen.json.publication, 'RESTRICTED');
  assert.equal(seen.json.sourceNature, 'UNKNOWN');
  assert.equal(seen.json.classificationBasis, 'default-restricted');
  // o PUT genérico não publica
  await call('PUT', `/library/${id}`, { token: curator, body: { publication: 'PUBLIC_SAFE', sourceNature: 'OFFICIAL_PUBLICATION', curation: { publication: 'PUBLIC_SAFE', sourceNature: 'OFFICIAL_PUBLICATION' } } });
  assert.equal((await call('GET', `/library/${id}`)).status, 404, 'PUT genérico não pode publicar');
});

test('curadoria: UNKNOWN nunca é pública; material de terceiro exige autorização; motivo obrigatório', { skip }, async () => {
  const id = (await call('POST', '/library', { token: curator, body: { title: 'Material X', kind: 'fundamento' } })).json.id;
  const bad = [
    { sourceNature: 'UNKNOWN', publication: 'PUBLIC_SAFE', reason: 'tentativa de publicar desconhecido' },
    { sourceNature: 'COMMERCIAL_MATERIAL', publication: 'PUBLIC_SAFE', reason: 'material comercial sem autorização' },
    { sourceNature: 'PRIVATE_APPRAISAL', publication: 'PUBLIC_SAFE', reason: 'laudo privado sem autorização' },
    { sourceNature: 'FINAL_COURT_DECISION', publication: 'PUBLIC_SAFE', reason: 'trânsito não verificado' },
    { sourceNature: 'OFFICIAL_PUBLICATION', publication: 'PUBLIC_SAFE', reason: 'curto' },
    { sourceNature: 'OFFICIAL_PUBLICATION', publication: 'TALVEZ', reason: 'valor de publicação inválido' },
  ];
  for (const body of bad) {
    const r = await call('PUT', `/library/${id}/curation`, { token: curator, body });
    assert.equal(r.status, 422, JSON.stringify(body));
    assert.equal((await call('GET', `/library/${id}`)).status, 404);
  }
});

test('curadoria válida publica, fica na trilha e pode ser revertida', { skip }, async () => {
  const id = (await call('POST', '/library', { token: curator, body: { title: 'Decreto 6.380/2008', kind: 'base_legal' } })).json.id;
  assert.equal((await call('PUT', `/library/${id}/curation`, { body: { sourceNature: 'STATUTE', publication: 'PUBLIC_SAFE', reason: 'norma publicada no DOU' } })).status, 401, 'anônimo não cura');
  const ok = await call('PUT', `/library/${id}/curation`, { token: curator, body: { sourceNature: 'STATUTE', publication: 'PUBLIC_SAFE', reason: 'norma publicada no DOU, fonte planalto.gov.br' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const pub = await call('GET', `/library/${id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.publication, 'PUBLIC_SAFE');
  assert.equal(pub.json.classificationBasis, 'curator');
  const ev = (await db.query(`SELECT payload FROM audit_event WHERE event_type = 'content.curated' AND entity_id = $1`, [id])).rows;
  assert.equal(ev.length, 1);
  await call('PUT', `/library/${id}/curation`, { token: curator, body: { sourceNature: 'STATUTE', publication: 'RESTRICTED', reason: 'retirado para revisão editorial' } });
  assert.equal((await call('GET', `/library/${id}`)).status, 404);
  const third = (await call('POST', '/library', { token: curator, body: { title: 'Material autorizado', kind: 'fundamento' } })).json.id;
  const withAuth = await call('PUT', `/library/${third}/curation`, { token: curator, body: { sourceNature: 'COMMERCIAL_MATERIAL', publication: 'PUBLIC_SAFE', reason: 'autorização por escrito do autor recebida', authorizationRef: 'ofício 12/2026' } });
  assert.equal(withAuth.status, 200);
});

test('jurisprudência: item do operador fora da reavaliação nasce restrito; não-decisões só para a curadoria', { skip }, async () => {
  const j = await call('POST', '/jurisprudence', { token: curator, body: { title: 'Decisão nova', tribunal: 'TJSC', outcome: 'favoravel' } });
  assert.equal(j.status, 201);
  assert.equal((await call('GET', `/jurisprudence/${j.json.id}`)).status, 404);
  assert.equal((await call('GET', `/jurisprudence/${j.json.id}`, { token: curator })).json.publication, 'RESTRICTED');
  const anon = (await call('GET', '/jurisprudence')).json;
  const cur = (await call('GET', '/jurisprudence', { token: curator })).json;
  assert.equal(anon.length, 79);
  assert.equal(cur.length, 100);
  assert.ok(anon.every((it) => it.publication === 'PUBLIC_SAFE' && it.assessment.sourceNature === 'NON_FINAL_COURT_DECISION'));
});
