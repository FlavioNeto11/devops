import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBudgets, renderReport, queryCostByApp } from './check-budgets.mjs';

const BUDGETS = { default: { monthlyUsd: 10 }, apps: { caro: { monthlyUsd: 50 } } };

test('evaluateBudgets: default + override por app + flag de estouro', () => {
  const r = evaluateBudgets(
    [{ app: 'barato', usd: 2 }, { app: 'estourado', usd: 12.5 }, { app: 'caro', usd: 30 }],
    BUDGETS,
  );
  const by = Object.fromEntries(r.entries.map((e) => [e.app, e]));
  assert.equal(by.barato.budgetUsd, 10);
  assert.equal(by.barato.exceeded, false);
  assert.equal(by.estourado.exceeded, true);          // 12.5 > 10 (default)
  assert.equal(by.caro.budgetUsd, 50);                // override
  assert.equal(by.caro.exceeded, false);              // 30 < 50
  assert.deepEqual(r.exceeded.map((e) => e.app), ['estourado']);
  assert.equal(r.entries[0].app, 'estourado');        // ordenado por ratio desc
});

test('evaluateBudgets: budgets inválido lança (erro real, não degradação)', () => {
  assert.throws(() => evaluateBudgets([], { default: { monthlyUsd: 0 } }));
  assert.throws(() => evaluateBudgets([], {}));
});

test('renderReport: tabela + seção de estouro; vazio é honesto', () => {
  const r = evaluateBudgets([{ app: 'a', usd: 11 }], BUDGETS);
  const md = renderReport(r, { window: '30d', generatedAt: '2026-01-01T00:00:00Z' });
  assert.match(md, /\| a \| 11\.0000 \| 10\.00 \| 110\.0% \| SIM \|/);
  assert.match(md, /1 app\(s\) acima do budget/);
  assert.match(md, /NUNCA derruba o app/);
  const empty = renderReport({ entries: [], exceeded: [] });
  assert.match(empty, /Nenhum app com métrica de custo/);
});

test('queryCostByApp: fail-soft em Prometheus fora/erro (nunca lança)', async () => {
  const down = await queryCostByApp('http://x', { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(down.ok, false);
  assert.match(down.error, /ECONNREFUSED/);
  const http500 = await queryCostByApp('http://x', { fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(http500.ok, false);
  const missing = await queryCostByApp('');
  assert.equal(missing.ok, false);
});

test('queryCostByApp: parseia séries por app', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({ status: 'success', data: { result: [
      { metric: { app: 'shopdesk' }, value: [1750000000, '3.25'] },
      { metric: { app: 'sicat' }, value: [1750000000, '0.10'] },
    ] } }),
  });
  const r = await queryCostByApp('http://prom', { fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [{ app: 'shopdesk', usd: 3.25 }, { app: 'sicat', usd: 0.1 }]);
});
