import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBudget, deriveAlerts } from './budgets.js';

test('computeBudget: sem orçamento -> null', () => {
  assert.equal(computeBudget({ provider: 'openai', monthlyUsd: null, spentUsd: 5 }), null);
  assert.equal(computeBudget({ provider: 'openai', monthlyUsd: 0, spentUsd: 5 }), null);
});

test('computeBudget: faixas ok/warn/breach', () => {
  const ok = computeBudget({ provider: 'openai', monthlyUsd: 100, spentUsd: 50, warnPct: 80, breachPct: 100 });
  assert.equal(ok.threshold, 'ok');
  assert.equal(ok.pctOfLimit, 50);
  assert.equal(ok.breach, false);

  const warn = computeBudget({ provider: 'openai', monthlyUsd: 100, spentUsd: 85 });
  assert.equal(warn.threshold, 'warn');

  const breach = computeBudget({ provider: 'openai', monthlyUsd: 100, spentUsd: 130 });
  assert.equal(breach.threshold, 'breach');
  assert.equal(breach.breach, true);
  assert.equal(breach.pctOfLimit, 130);
});

test('deriveAlerts: gera banners p/ budget warn/breach e rate-limit alto', () => {
  const alerts = deriveAlerts({
    budgetsByProvider: {
      openai: { provider: 'openai', monthlyUsd: 100, spentUsd: 130, pctOfLimit: 130, threshold: 'breach', breach: true },
      anthropic: { provider: 'anthropic', monthlyUsd: 50, spentUsd: 20, pctOfLimit: 40, threshold: 'ok' },
    },
    limitsByProvider: {
      anthropic: { rateLimits: [{ kind: 'requests', limit: 1000, remaining: 20, unit: 'per-minute', pctUsed: 98 }] },
    },
  });
  const ids = alerts.map((a) => a.id);
  assert.ok(ids.includes('budget-openai'));
  assert.ok(!ids.includes('budget-anthropic')); // ok não vira alerta
  assert.ok(ids.includes('rate-anthropic-requests'));
  assert.equal(alerts.find((a) => a.id === 'budget-openai').severity, 'critical');
});
