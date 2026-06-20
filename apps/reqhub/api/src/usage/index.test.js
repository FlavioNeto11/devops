import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireUsageAdmin, createUsageContext, collectBreakdown } from './index.js';
import { loadUsageConfig } from './config.js';
import { createCache } from './cache.js';

function fakeRes() {
  return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
}

test('requireUsageAdmin: admin SSO passa', () => {
  const req = { headers: { 'x-auth-request-email': 'a@b.com', 'x-auth-request-groups': 'platform-admins' } };
  const res = fakeRes(); let nexted = false;
  requireUsageAdmin(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(req.identity, 'a@b.com');
});

test('requireUsageAdmin: membro não-admin -> 403', () => {
  const req = { headers: { 'x-auth-request-email': 'm@b.com', 'x-auth-request-groups': 'project-members' } };
  const res = fakeRes(); let nexted = false;
  requireUsageAdmin(req, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res._status, 403);
});

test('requireUsageAdmin: sem identidade e sem token configurado -> 503 fail-closed', () => {
  const prev = process.env.REQHUB_API_TOKEN; delete process.env.REQHUB_API_TOKEN;
  const req = { headers: {} };
  const res = fakeRes();
  requireUsageAdmin(req, res, () => {});
  assert.equal(res._status, 503);
  assert.equal(res._json.error.code, 'AUTH_DISABLED');
  if (prev !== undefined) process.env.REQHUB_API_TOKEN = prev;
});

test('requireUsageAdmin: Bearer válido passa', () => {
  const prev = process.env.REQHUB_API_TOKEN; process.env.REQHUB_API_TOKEN = 'sekret';
  const req = { headers: { authorization: 'Bearer sekret' } };
  const res = fakeRes(); let nexted = false;
  requireUsageAdmin(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  if (prev !== undefined) process.env.REQHUB_API_TOKEN = prev; else delete process.env.REQHUB_API_TOKEN;
});

test('collectBreakdown agrega telemetria interna com clientes stub (sem rede)', async () => {
  const prom = {
    async query() { return { ok: true, result: [] }; },
    async breakdownRows() {
      return {
        ok: true, reachable: true,
        costRows: [{ app: 'sicat', model: 'gpt-5', value: 9 }, { app: 'sicat', model: 'claude-3-5-sonnet', value: 4 }],
        tokenRows: [{ app: 'sicat', model: 'gpt-5', direction: 'in', value: 500 }],
        reqRows: [{ app: 'sicat', model: 'gpt-5', value: 3 }],
      };
    },
  };
  const lf = { enabled: false, async health() { return { ok: false }; }, async dailyMetrics() { return { ok: false }; } };
  const ctx = createUsageContext({ config: loadUsageConfig({}), cache: createCache(), prom, lf });

  const bd = await collectBreakdown(ctx, { windowId: '30d' });
  const openai = bd.providers.find((p) => p.provider === 'openai');
  const anthropic = bd.providers.find((p) => p.provider === 'anthropic');
  assert.equal(openai.internal.cost, 9);
  assert.equal(anthropic.internal.cost, 4);
  assert.equal(openai.account, null);
  assert.equal(bd.sourcesHealth.prometheus, 'ok');
  assert.equal(bd.sourcesHealth.langfuse, 'absent');
  assert.equal(bd.sourcesHealth.openaiAdmin, 'absent');
});
