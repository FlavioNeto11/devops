import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll, runGolden } from './run-evals.mjs';
import { loadCatalog } from '../apply-capabilities.mjs';

test('golden briefs: todos passam no eval determinístico', () => {
  const r = runAll();
  assert.equal(r.failed, 0, `falhas: ${JSON.stringify(r.failures, null, 2)}`);
  assert.ok(r.total >= 2, `esperava >=2 goldens, veio ${r.total}`);
});

test('eval detecta regressão estrutural (ids divergentes reprovam)', () => {
  const byId = loadCatalog();
  const broken = {
    payload: {
      product: 'eval-broken', blueprint: 'node-api-vue-spa', mode: 'pr',
      architecture: { stack: 'sicat', selected_blocks: [] },
      requirements: [{ id: 'REQ-EVALBROKEN-0001', title: 'X', type: 'functional', statement: 'O sistema DEVE x.', acceptance_criteria: ['x'] }],
    },
    expect: { stack: 'sicat', ids: ['REQ-EVALBROKEN-9999'], resolved_blocks_include: [], resolved_blocks_exclude: [] },
  };
  const failures = runGolden(broken, { byId, YAML: null, validateReq: null });
  assert.ok(failures.some((f) => f.includes('ids esperados')), `esperava falha de ids, veio: ${JSON.stringify(failures)}`);
});
