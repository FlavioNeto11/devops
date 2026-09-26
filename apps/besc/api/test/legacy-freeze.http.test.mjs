// ADR-010 — congelamento da tese antiga no nível HTTP.
// Prova que as rotas de marketplace/tokenização/aluguel/investimento respondem 410 ANTES de
// qualquer autenticação: nem ausência de login, nem token forjado, nem parâmetros "de demo"
// enviados por um frontend alterado reabrem a operação. Sem banco (fundação desligada).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-freeze-'));
delete process.env.DATABASE_URL;
delete process.env.SESSION_SECRET;

const { createApp } = await import('../src/app.js');
const { FROZEN_ROUTES, REMOVED_REPORT_TYPES, LEGACY_FREEZE_CODE } = await import('../src/governance/legacy-freeze.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const concrete = (route) => route.replace(/:[a-zA-Z]+/g, 'x-legacy-id');
async function call(method, route, { headers = {}, body } = {}) {
  const res = await fetch(base + route, {
    method: method.toUpperCase(),
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'get' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('toda rota congelada responde 410 sem autenticação', async () => {
  assert.ok(FROZEN_ROUTES.length >= 20, 'lista de rotas congeladas deve cobrir o marketplace inteiro');
  for (const [method, route] of FROZEN_ROUTES) {
    const r = await call(method, concrete(route));
    assert.equal(r.status, 410, `${method.toUpperCase()} ${route} deveria ser 410`);
    assert.equal(r.json.code, LEGACY_FREEZE_CODE);
    assert.equal(r.json.adr, 'ADR-010');
  }
});

test('token forjado, flags de demo e corpo "goLive" não contornam o bloqueio (frontend não é autoridade)', async () => {
  const tricks = [
    { headers: { authorization: 'Bearer forged.jwt.token' } },
    { headers: { authorization: 'Bearer besc_access.admin' }, body: { goLive: true, demonstration: false, capabilities: { MARKETPLACE_REAL: true } } },
    { headers: { 'x-demo-mode': 'off', 'x-forwarded-for': '10.0.0.1', 'x-capability-override': 'TOKENIZATION_REAL=true' } },
  ];
  for (const [method, route] of FROZEN_ROUTES) {
    for (const t of tricks) {
      const r = await call(method, concrete(route) + '?go_live=true&demo=false', t);
      assert.equal(r.status, 410, `${method.toUpperCase()} ${route} com ${JSON.stringify(t.headers)}`);
    }
  }
});

test('relatórios removidos (estratégia, parceiro de tokenização, caução) respondem 410 antes do login', async () => {
  for (const type of REMOVED_REPORT_TYPES) {
    for (const p of ['/cases/x/report', '/cases/x/report.html']) {
      const r = await call('get', `${p}?type=${type}`, { headers: { authorization: 'Bearer forged' } });
      assert.equal(r.status, 410, `${p}?type=${type}`);
    }
  }
});

test('o congelamento não substitui o RBAC: rotas de caso e leituras legadas seguem gated (503 sem fundação)', async () => {
  for (const route of ['/cases', '/titles', '/contracts', '/invoices', '/gate', '/cases/x/report?type=full_case_report']) {
    const r = await call('get', route);
    assert.equal(r.status, 503, `${route} deveria continuar exigindo a fundação/login`);
  }
});

test('/portal/mode declara as capacidades desligadas e nunca goLive', async () => {
  const r = await call('get', '/portal/mode');
  assert.equal(r.status, 200);
  assert.equal(r.json.goLive, false);
  assert.equal(r.json.frozen, true);
  for (const v of Object.values(r.json.capabilities)) assert.equal(v, false);
});

test('domínio de recuperação sem fundação: vocabulário público, dados gated', async () => {
  const meta = await call('get', '/recovery/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.json.multi_issuer_research_gate, 'CLOSED');
  for (const v of Object.values(meta.json.capabilities)) assert.equal(v, false);
  const origins = await call('get', '/recovery/origins');
  assert.equal(origins.json.find((o) => o.id === 'BESC').status, 'ACTIVE');
  for (const route of ['/recovery/claims', '/recovery/approvals', '/recovery/evidence/x']) {
    assert.equal((await call('get', route)).status, 503, route);
  }
});

test('/meta não oferece mais os relatórios removidos', async () => {
  const r = await call('get', '/meta');
  for (const type of REMOVED_REPORT_TYPES) assert.ok(!(type in r.json.reportTypes), type);
});
