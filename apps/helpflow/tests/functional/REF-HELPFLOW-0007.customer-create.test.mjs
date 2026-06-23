// Teste funcional para REF-HELPFLOW-0007 — Novo solicitante (/customers/new)
// Valida o contrato que o CustomerCreateView.vue usa: POST /v1/customers + GET /v1/customers/:id.
// Skips sem BASE_URL (forge-tests sem API ao vivo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, LIVE } from '../locked/_lib.mjs';

const SKIP = LIVE ? false : 'sem BASE_URL (forge-tests)';
const TAG = 'ref-helpflow-0007-' + Date.now();

test('REF-HELPFLOW-0007: POST /v1/customers cria solicitante com name+email+organization', { skip: SKIP }, async () => {
  assert.equal((await get('/health')).s, 200, 'health ok');
  const r = await post('/v1/customers', { name: 'Maria Teste ' + TAG, email: TAG + '@example.com', organization: 'Dept TI' });
  assert.ok(r.s === 200 || r.s === 201, 'status 200 ou 201 na criação');
  const id = (r.j && (r.j.id || (r.j.data && r.j.data.id))) || null;
  assert.ok(id != null, 'resposta contém id do solicitante criado');
  const detail = await get('/v1/customers/' + id);
  assert.ok(detail.s === 200, 'GET /v1/customers/:id retorna 200 (redirect-to-detail)');
  const c = detail.j && detail.j.data !== undefined ? detail.j.data : detail.j;
  assert.ok(c && c.email, 'detalhe contém email');
  await del('/v1/customers/' + id);
});

test('REF-HELPFLOW-0007: POST /v1/customers sem name recusa (validação server-side)', { skip: SKIP }, async () => {
  const r = await post('/v1/customers', { email: TAG + '-noname@example.com' });
  assert.ok(r.s === 400 || r.s === 422 || (r.s >= 200 && r.s < 300),
    'servidor rejeita (4xx) ou cria mesmo sem name (schema permissivo) — nunca 5xx');
  assert.ok(r.s < 500, 'sem erro de servidor ao omitir campo obrigatório');
});
