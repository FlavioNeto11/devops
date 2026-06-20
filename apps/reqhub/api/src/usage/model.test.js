import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerForModel, windowToRange, buildInternalByProvider, assembleBreakdown, summaryFromBreakdown, PROVIDERS } from './model.js';

test('providerForModel deriva o provider pelo nome do modelo', () => {
  assert.equal(providerForModel('claude-3-5-sonnet'), 'anthropic');
  assert.equal(providerForModel('claude-opus-4-8'), 'anthropic');
  assert.equal(providerForModel('anthropic.claude-v2'), 'anthropic');
  assert.equal(providerForModel('gpt-5'), 'openai');
  assert.equal(providerForModel('gpt-5-nano'), 'openai');
  assert.equal(providerForModel('o1-mini'), 'openai');
  assert.equal(providerForModel('text-embedding-3-small'), 'openai');
  assert.equal(providerForModel('mistral-large'), 'unknown');
  assert.equal(providerForModel(''), 'unknown');
  assert.equal(providerForModel(undefined), 'unknown');
});

test('windowToRange resolve janelas conhecidas e cai p/ 30d no inválido', () => {
  const now = Date.UTC(2026, 5, 20, 12, 0, 0); // 2026-06-20T12:00:00Z
  const d30 = windowToRange('30d', now);
  assert.equal(d30.id, '30d');
  assert.equal(d30.granularity, 'day');
  assert.equal(d30.toMs, now);
  assert.equal(d30.fromMs, now - 30 * 86400000);
  const mtd = windowToRange('mtd', now);
  assert.equal(mtd.id, 'mtd');
  assert.equal(new Date(mtd.fromMs).toISOString(), '2026-06-01T00:00:00.000Z');
  const bogus = windowToRange('xyz', now);
  assert.equal(bogus.id, '30d');
  assert.equal(windowToRange('24h', now).granularity, 'hour');
});

test('buildInternalByProvider + assembleBreakdown agrega por provider->módulo->modelo', () => {
  const costRows = [
    { app: 'sicat', model: 'gpt-5', value: 10 },
    { app: 'gymops', model: 'gpt-5-nano', value: 2 },
    { app: 'sicat', model: 'claude-3-5-sonnet', value: 5 },
  ];
  const tokenRows = [
    { app: 'sicat', model: 'gpt-5', direction: 'in', value: 1000 },
    { app: 'sicat', model: 'gpt-5', direction: 'out', value: 300 },
    { app: 'sicat', model: 'claude-3-5-sonnet', direction: 'in', value: 800 },
  ];
  const reqRows = [{ app: 'sicat', model: 'gpt-5', value: 7 }];
  const by = buildInternalByProvider({ costRows, tokenRows, reqRows });

  const bd = assembleBreakdown({ window: { id: '30d' }, internalByProvider: by, generatedAt: 'X' });
  // sempre os 2 providers, mesmo que um esteja zero
  assert.deepEqual(bd.providers.map((p) => p.provider), PROVIDERS);
  const openai = bd.providers.find((p) => p.provider === 'openai');
  const anthropic = bd.providers.find((p) => p.provider === 'anthropic');

  assert.equal(openai.internal.cost, 12); // 10 + 2
  assert.equal(openai.internal.tokensIn, 1000);
  assert.equal(openai.internal.tokensOut, 300);
  assert.equal(openai.internal.requests, 7);
  assert.equal(openai.account, null);
  // módulos ordenados por custo desc
  assert.equal(openai.modules[0].module, 'sicat');
  assert.equal(openai.modules[0].models[0].model, 'gpt-5');

  assert.equal(anthropic.internal.cost, 5);
  assert.equal(anthropic.internal.tokensIn, 800);
  assert.ok(anthropic.claudeCodeSubscriptionNote.includes('Claude Code'));

  // totals usam internal quando não há account
  assert.equal(bd.totals.cost, 17);
  assert.equal(bd.totals.requests, 7);
});

test('assembleBreakdown calcula drift quando há account', () => {
  const by = buildInternalByProvider({ costRows: [{ app: 'reqhub', model: 'gpt-5', value: 8 }] });
  const bd = assembleBreakdown({
    window: { id: '30d' }, internalByProvider: by,
    accountByProvider: { openai: { source: 'account', cost: 10, stale: false } },
  });
  const openai = bd.providers.find((p) => p.provider === 'openai');
  assert.equal(openai.drift, 2); // 10 - 8
  assert.equal(bd.totals.cost, 10); // account fresco vence no total
});

test('summaryFromBreakdown enxuga mantendo provider/totais/health', () => {
  const by = buildInternalByProvider({ costRows: [{ app: 'reqhub', model: 'gpt-5', value: 3 }] });
  const bd = assembleBreakdown({ window: { id: '7d' }, internalByProvider: by, sourcesHealth: { prometheus: 'ok' } });
  const s = summaryFromBreakdown(bd);
  assert.equal(s.providers.length, 2);
  assert.equal(s.sourcesHealth.prometheus, 'ok');
  assert.ok('moduleCount' in s.providers[0]);
  assert.equal(s.providers.find((p) => p.provider === 'openai').moduleCount, 1);
});
