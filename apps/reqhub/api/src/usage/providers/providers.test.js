import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiAdminClient } from './openai-admin.js';
import { createAnthropicAdminClient } from './anthropic-admin.js';

function jsonFetch(map) {
  // map: url-substring -> json body
  return async (url) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(map)) {
      if (u.includes(needle)) return { ok: true, status: 200, headers: new Map(), async json() { return body; } };
    }
    return { ok: false, status: 404, headers: new Map(), async json() { return {}; } };
  };
}

test('openai-admin: sem chave admin -> PROVIDER_KEY_ABSENT (fail-soft)', async () => {
  const c = createOpenAiAdminClient({ adminKey: '', fetchImpl: async () => { throw new Error('não deveria chamar'); } });
  assert.equal(c.enabled, false);
  const r = await c.accountUsage({ fromMs: 0, toMs: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PROVIDER_KEY_ABSENT');
});

test('openai-admin: normaliza custo + uso por modelo', async () => {
  const fetchImpl = jsonFetch({
    '/v1/organization/costs': { data: [{ results: [{ amount: { value: 12.5, currency: 'usd' } }] }, { results: [{ amount: { value: 2.5 } }] }] },
    '/v1/organization/usage/completions': { data: [{ results: [{ model: 'gpt-5', input_tokens: 1000, output_tokens: 300, num_model_requests: 5 }] }] },
  });
  const c = createOpenAiAdminClient({ adminKey: 'sk-admin', fetchImpl });
  const r = await c.accountUsage({ fromMs: Date.UTC(2026, 5, 1), toMs: Date.UTC(2026, 5, 20) });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'openai');
  assert.equal(r.cost, 15); // 12.5 + 2.5
  assert.equal(r.tokensIn, 1000);
  assert.equal(r.tokensOut, 300);
  assert.equal(r.requests, 5);
  assert.equal(r.perModel[0].model, 'gpt-5');
  assert.equal(r.lag, 'daily');
});

test('anthropic-admin: sem chave -> PROVIDER_KEY_ABSENT; com chave normaliza', async () => {
  const absent = createAnthropicAdminClient({ adminKey: '' });
  assert.equal((await absent.accountUsage({ fromMs: 0, toMs: 1 })).code, 'PROVIDER_KEY_ABSENT');

  const fetchImpl = jsonFetch({
    '/v1/organizations/usage_report/messages': { data: [{ results: [{ model: 'claude-3-5-sonnet', input_tokens: 800, output_tokens: 200, num_requests: 3 }] }] },
    '/v1/organizations/cost_report': { data: [{ results: [{ amount: 7.25 }] }] },
  });
  const c = createAnthropicAdminClient({ adminKey: 'sk-ant-admin', fetchImpl });
  const r = await c.accountUsage({ fromMs: Date.UTC(2026, 5, 1), toMs: Date.UTC(2026, 5, 20) });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'anthropic');
  assert.equal(r.cost, 7.25);
  assert.equal(r.tokensIn, 800);
  assert.equal(r.tokensOut, 200);
  assert.equal(r.requests, 3);
});

test('openai-admin: rate-limit probe lê headers', async () => {
  const headers = new Map([
    ['x-ratelimit-limit-requests', '1000'],
    ['x-ratelimit-remaining-requests', '800'],
    ['x-ratelimit-limit-tokens', '200000'],
    ['x-ratelimit-remaining-tokens', '150000'],
  ]);
  const fetchImpl = async () => ({ ok: true, status: 200, headers, async json() { return {}; } });
  const c = createOpenAiAdminClient({ adminKey: 'sk-admin', apiKey: 'sk-normal', fetchImpl });
  const r = await c.rateLimitProbe();
  assert.equal(r.ok, true);
  const reqs = r.rateLimits.find((x) => x.kind === 'requests');
  assert.equal(reqs.limit, 1000);
  assert.equal(reqs.remaining, 800);
  assert.equal(reqs.pctUsed, 20);
});
