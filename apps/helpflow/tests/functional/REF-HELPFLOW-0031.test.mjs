// Testes funcionais para REF-HELPFLOW-0031 — Detalhe da integração (/integrations/:id).
// Âncora: REQ-HELPFLOW-0005 (Gateway Centralizado). Executa apenas com BASE_URL (LIVE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, sleep, LIVE } from '../locked/_lib.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function createIntegration(overrides = {}) {
  const body = { name: 'Test-REF-0031', kind: 'webhook', status: 'active', base_url: 'http://httpbin.org/get', ...overrides };
  const r = await post('/v1/integrations', body);
  assert.ok(r.s === 201, `criação retornou ${r.s}`);
  return r.j;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado NORMAL — integração carregada
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 normal: GET /v1/integrations/:id retorna configuração da integração', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const created = await createIntegration();
  const r = await get('/v1/integrations/' + created.id);
  assert.equal(r.s, 200, 'GET :id deve retornar 200');
  assert.ok(r.j.id, 'resposta tem id');
  assert.ok(r.j.name, 'resposta tem name');
  assert.ok(r.j.kind, 'resposta tem kind');
  assert.ok(r.j.status, 'resposta tem status');
  // credenciais nunca devem aparecer em claro (a redação é server-side)
  const body = JSON.stringify(r.j);
  assert.ok(!body.includes('password'), 'campo password não exposto em claro');
  assert.ok(!body.includes('api_key'), 'campo api_key não exposto em claro');
});

// ─────────────────────────────────────────────────────────────────────────────
// Estado EMPTY — sem eventos registrados
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 empty: GET /v1/integrations/:id/audit sem chamadas retorna items vazio', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const created = await createIntegration({ name: 'Test-REF-0031-empty' });
  const r = await get('/v1/integrations/' + created.id + '/audit');
  assert.equal(r.s, 200, 'GET /audit deve retornar 200');
  assert.ok(Array.isArray(r.j.items), 'items é array');
  assert.equal(r.j.items.length, 0, 'sem chamadas ainda → items vazio');
  assert.equal(r.j.total, 0, 'total é 0');
});

// ─────────────────────────────────────────────────────────────────────────────
// Estado ERROR — integração não encontrada
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 error: GET /v1/integrations/:id com id inexistente retorna 404', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const r = await get('/v1/integrations/99999999');
  assert.equal(r.s, 404, 'id inexistente deve retornar 404');
  assert.ok(r.j.error, 'resposta de erro tem campo error');
});

// ─────────────────────────────────────────────────────────────────────────────
// Interação: Testar conexão → atualiza status + registra na trilha
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 test-conexao: POST /v1/integrations/:id/test gera veredito com secrets redigidos', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const created = await createIntegration({ name: 'Test-REF-0031-ping' });
  const r = await post('/v1/integrations/' + created.id + '/test', {});
  assert.ok(r.s === 200 || r.s === 503, 'POST /test retorna 200 (ok) ou 503 (gateway indisponível)');
  if (r.s === 200) {
    // veredito deve ter campos do contrato fixo consumido pelo IntegrationDetailView
    assert.ok(typeof r.j.ok === 'boolean', 'campo ok é booleano');
    assert.ok('status_code' in r.j, 'campo status_code presente');
    assert.ok('latency_ms' in r.j, 'campo latency_ms presente');
    assert.ok('method' in r.j, 'campo method presente');
    assert.ok('target' in r.j, 'campo target presente');
    // redação obrigatória server-side
    assert.equal(r.j.redacted, true, 'redacted=true (gateway sempre redige)');
    // sem segredos crus na resposta
    const body = JSON.stringify(r.j);
    assert.ok(!body.match(/(Bearer\s+[A-Za-z0-9_-]{8,})/), 'nenhum Bearer token cru');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Trilha de auditoria: após test, item aparece em /audit com secrets redigidos
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 audit: após POST /test, /audit registra entrada com redacted=true', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const created = await createIntegration({ name: 'Test-REF-0031-audit' });
  const testR = await post('/v1/integrations/' + created.id + '/test', {});
  // disparo pode falhar (gateway mock indisponível) — o que importa é o registro na trilha
  const auditR = await get('/v1/integrations/' + created.id + '/audit');
  assert.equal(auditR.s, 200, 'GET /audit retorna 200');
  assert.ok(Array.isArray(auditR.j.items), 'items é array');
  if (testR.s === 200) {
    assert.ok(auditR.j.items.length >= 1, 'pelo menos um item na trilha após o test');
    const entry = auditR.j.items[0];
    assert.ok(entry.id, 'entrada tem id');
    assert.ok(entry.method, 'entrada tem method');
    assert.ok('status_code' in entry, 'entrada tem status_code');
    assert.ok('latency_ms' in entry, 'entrada tem latency_ms');
    assert.ok('ok' in entry, 'entrada tem ok');
    assert.equal(entry.redacted, true, 'entrada da trilha tem redacted=true');
    assert.ok(entry.created_at, 'entrada tem created_at');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Interação: editar → rota /integrations/:id/edit deve existir (teste de rota frontend)
// Verificado aqui via API: o recurso :id deve ser editável via PUT /v1/integrations/:id
// ─────────────────────────────────────────────────────────────────────────────
test('REF-HELPFLOW-0031 editar: PUT /v1/integrations/:id aplica mudanças e retorna integração atualizada', {
  skip: LIVE ? false : 'sem BASE_URL (forge-tests)',
}, async () => {
  const created = await createIntegration({ name: 'Test-REF-0031-edit' });
  const updateR = await (async () => {
    const res = await fetch(
      (process.env.BASE_URL || 'http://nvit.localhost/helpflow/api').replace(/\/$/, '')
        + '/v1/integrations/' + created.id,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Editado-REF-0031' }) }
    );
    return { s: res.status, j: await res.json().catch(() => ({})) };
  })();
  assert.equal(updateR.s, 200, 'PUT :id deve retornar 200');
  assert.equal(updateR.j.name, 'Editado-REF-0031', 'nome foi atualizado');
});
