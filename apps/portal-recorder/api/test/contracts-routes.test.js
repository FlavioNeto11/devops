// Testes de ROTA dos contratos (E3) com store MOCKADO por injeção (o sub-router
// contracts.js recebe getPool/store/env/fetchImpl) — sem banco, node:test puro.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildContractsRouter } from '../src/contracts.js';

process.env.PORTAL_REC_TOKEN = 'test-token'; // requireWriteAuth (padrão dos writes)
const WRITE_AUTH = { Authorization: 'Bearer test-token' };

const PORTAL = { id: 'por_1', slug: 'cetesb', base_origin: 'https://mtrr.cetesb.sp.gov.br' };
const CONTRACT = {
  id: 'ctr_1', portal_id: 'por_1', session_id: 'cap_1', version: 3,
  created_at: '2026-07-01T12:00:00.000Z', summary: { endpoint_count: 1 },
  endpoints: [{
    method: 'GET', host: 'mtrr.cetesb.sp.gov.br', path_template: '/api/mtr/manifesto/{p3}',
    requires_auth: true, requires_captcha: false, occurrence_count: 4,
    request_schema: {}, response_schema: { type: 'object', properties: { manNumero: { type: 'string' } } },
    sample_request: { segredo: '***' }, sample_response: { manNumero: '4700001' },
  }],
};
const LIST_ROW = { id: 'ctr_1', portal_id: 'por_1', session_id: 'cap_1', version: 3, created_at: CONTRACT.created_at, endpoint_count: 1 };

function mockStore(overrides = {}) {
  return {
    getPortal: async (_pool, ref) => (ref === PORTAL.id || ref === PORTAL.slug ? PORTAL : null),
    getContract: async (_pool, id) => (id === CONTRACT.id ? structuredClone(CONTRACT) : null),
    listContracts: async (_pool, { portalId } = {}) => (portalId && portalId !== PORTAL.id ? [] : [LIST_ROW]),
    ...overrides,
  };
}

async function startApp({ env = {}, store = mockStore(), fetchImpl } = {}) {
  const app = express();
  app.use(express.json());
  app.use(buildContractsRouter({ getPool: () => null, store, env, fetchImpl }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ── GET /v1/contracts (listagem) ──────────────────────────────────────────────
test('GET /v1/contracts?portal= lista contratos leves; portal desconhecido → 404', async () => {
  const app = await startApp();
  try {
    const res = await fetch(`${app.base}/v1/contracts?portal=cetesb`);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.deepEqual(data, [LIST_ROW]);
    assert.equal('endpoints' in data[0], false, 'listagem não carrega o corpo pesado');

    const missing = await fetch(`${app.base}/v1/contracts?portal=nao-existe`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'PORTAL_NOT_FOUND');

    const all = await fetch(`${app.base}/v1/contracts`);
    assert.equal(all.status, 200); // sem filtro = todos
  } finally { await app.close(); }
});

// ── GET /v1/contracts/:id/export (formato canônico, sem samples) ─────────────
test('GET /v1/contracts/:id/export retorna manifest+endpoints canônicos SEM samples', async () => {
  const app = await startApp();
  try {
    const res = await fetch(`${app.base}/v1/contracts/ctr_1/export`);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.manifest.portal, 'cetesb');
    assert.equal(data.manifest.base_url, PORTAL.base_origin);
    assert.equal(data.manifest.endpoint_count, 1);
    assert.match(data.manifest.content_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(data.manifest.version, /^\d{4}-\d{2}-\d{2}$/);
    const [ep] = data.endpoints;
    assert.equal('sample_request' in ep, false);
    assert.equal('sample_response' in ep, false);
    assert.equal(ep.id, 'cetesb-get-api-mtr-manifesto-p3');
    assert.deepEqual(ep.path_params, [{ name: 'p3', type: 'string', detected_from: 'capture' }]);

    const missing = await fetch(`${app.base}/v1/contracts/ctr_nope/export`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'CONTRACT_NOT_FOUND');
  } finally { await app.close(); }
});

test('GET /v1/contracts/:id/export: contrato vazio → 422 fail-closed', async () => {
  const app = await startApp({
    store: mockStore({ getContract: async () => ({ ...structuredClone(CONTRACT), endpoints: [] }) }),
  });
  try {
    const res = await fetch(`${app.base}/v1/contracts/ctr_1/export`);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.code, 'NO_ENDPOINTS');
  } finally { await app.close(); }
});

// ── POST /v1/contracts/:id/promote (write fail-closed em duas camadas) ────────
test('promote: sem Bearer → 401; sem GITHUB_DISPATCH_TOKEN → 503 claro', async () => {
  const app = await startApp({ env: {} });
  try {
    const noAuth = await fetch(`${app.base}/v1/contracts/ctr_1/promote`, { method: 'POST' });
    assert.equal(noAuth.status, 401);

    const noDispatch = await fetch(`${app.base}/v1/contracts/ctr_1/promote`, { method: 'POST', headers: WRITE_AUTH });
    assert.equal(noDispatch.status, 503);
    const body = await noDispatch.json();
    assert.equal(body.error.code, 'DISPATCH_DISABLED');
    assert.match(body.error.message, /GITHUB_DISPATCH_TOKEN/);
  } finally { await app.close(); }
});

test('promote: dispara repository_dispatch com o export no payload (sem samples) → 202', async () => {
  const calls = [];
  const app = await startApp({
    env: { GITHUB_DISPATCH_TOKEN: 'gh_x', GITHUB_DISPATCH_REPO: 'FlavioNeto11/devops' },
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { status: 204, text: async () => '' }; },
  });
  try {
    const res = await fetch(`${app.base}/v1/contracts/ctr_1/promote`, {
      method: 'POST', headers: { ...WRITE_AUTH, 'X-Auth-Request-Email': 'flavio@example.com' },
    });
    assert.equal(res.status, 202);
    const { data } = await res.json();
    assert.equal(data.dispatched, true);
    assert.equal(data.portal_slug, 'cetesb');
    assert.equal(data.contract_id, 'ctr_1');
    assert.equal(data.expected_branch, 'portal-contract/cetesb');
    assert.ok(data.bytes > 0);

    assert.equal(calls.length, 1);
    const sent = JSON.parse(calls[0].opts.body);
    assert.equal(sent.event_type, 'portal-contract-promote');
    assert.equal(sent.client_payload.portal_slug, 'cetesb');
    assert.equal(sent.client_payload.requested_by, 'flavio@example.com');
    assert.equal(sent.client_payload.export.manifest.endpoint_count, 1);
    assert.equal('sample_request' in sent.client_payload.export.endpoints[0], false);
    assert.equal('sample_response' in sent.client_payload.export.endpoints[0], false);
  } finally { await app.close(); }
});

test('promote: contrato inexistente → 404; GitHub recusa → 502', async () => {
  const app = await startApp({
    env: { GITHUB_DISPATCH_TOKEN: 'gh_x' },
    fetchImpl: async () => ({ status: 422, text: async () => 'Invalid event type' }),
  });
  try {
    const missing = await fetch(`${app.base}/v1/contracts/ctr_nope/promote`, { method: 'POST', headers: WRITE_AUTH });
    assert.equal(missing.status, 404);

    const refused = await fetch(`${app.base}/v1/contracts/ctr_1/promote`, { method: 'POST', headers: WRITE_AUTH });
    assert.equal(refused.status, 502);
    const body = await refused.json();
    assert.equal(body.error.code, 'DISPATCH_FAILED');
    assert.match(body.error.message, /422/);
  } finally { await app.close(); }
});

test('promote: slug fora do padrão do workflow → 400 (fail-fast na API)', async () => {
  const oddPortal = { ...PORTAL, slug: '2fast' }; // válido no app, inválido p/ promoção
  const app = await startApp({
    env: { GITHUB_DISPATCH_TOKEN: 'gh_x' },
    store: mockStore({ getPortal: async () => oddPortal }),
  });
  try {
    const res = await fetch(`${app.base}/v1/contracts/ctr_1/promote`, { method: 'POST', headers: WRITE_AUTH });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_SLUG');
  } finally { await app.close(); }
});
