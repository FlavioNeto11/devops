import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topoSort, planBuild } from './build-plan.mjs';
import { planProgress } from './orchestrate-build.mjs';

test('topoSort: cadeia A<-B<-C respeita a ordem', () => {
  const ids = ['C', 'B', 'A'];
  const deps = new Map([['A', new Set()], ['B', new Set(['A'])], ['C', new Set(['B'])]]);
  const r = topoSort(ids, deps);
  assert.ok(r.ok);
  assert.deepEqual(r.order, ['A', 'B', 'C']);
});

test('topoSort: detecta ciclo', () => {
  const r = topoSort(['A', 'B'], new Map([['A', new Set(['B'])], ['B', new Set(['A'])]]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.cycle.sort(), ['A', 'B']);
});

test('planBuild: scaffold vem primeiro e tudo depende dele; deps respeitadas', () => {
  const reqs = [
    { id: 'REQ-CRM-0001', scope: { applies_to: 'product-foundation', product_scope: 'crm' } },
    { id: 'REQ-CRM-0002', scope: { applies_to: 'product', product_scope: 'crm' } },
    { id: 'REQ-CRM-0003', scope: { applies_to: 'product', product_scope: 'crm' } },
  ];
  const edges = [{ from: 'REQ-CRM-0003', to: 'REQ-CRM-0002', type: 'depends_on' }];
  const res = planBuild({ product: 'crm', blueprint: 'node-api-vue-spa', baselineHash: 'h', reqs, edges });
  assert.ok(res.ok);
  assert.equal(res.plan.scaffold_req, 'REQ-CRM-0001');
  assert.equal(res.plan.order[0], 'REQ-CRM-0001');
  assert.ok(res.plan.order.indexOf('REQ-CRM-0003') > res.plan.order.indexOf('REQ-CRM-0002'));
  assert.deepEqual(res.plan.waves[0].work_orders, ['REQ-CRM-0001']);
});

test('planBuild: ciclo entre requisitos vira erro', () => {
  const reqs = [
    { id: 'REQ-X-0001', scope: { applies_to: 'product', product_scope: 'x' } },
    { id: 'REQ-X-0002', scope: { applies_to: 'product', product_scope: 'x' } },
  ];
  const edges = [
    { from: 'REQ-X-0001', to: 'REQ-X-0002', type: 'depends_on' },
    { from: 'REQ-X-0002', to: 'REQ-X-0001', type: 'depends_on' },
  ];
  const res = planBuild({ product: 'x', blueprint: 'b', baselineHash: 'h', reqs, edges });
  assert.equal(res.ok, false);
});

test('planProgress: scaffold pendente bloqueia; depois libera wave; completa', () => {
  const plan = {
    order: ['REQ-CRM-0001', 'REQ-CRM-0002', 'REQ-CRM-0003'],
    scaffold_req: 'REQ-CRM-0001',
    waves: [
      { id: 'w0-foundation', work_orders: ['REQ-CRM-0001'] },
      { id: 'w1', work_orders: ['REQ-CRM-0002'] },
      { id: 'w2', work_orders: ['REQ-CRM-0003'] },
    ],
  };
  let p = planProgress(plan, {});
  assert.equal(p.scaffold.done, false);
  assert.deepEqual(p.ready, []);

  p = planProgress(plan, { 'REQ-CRM-0001': { status: 'merged' } });
  assert.deepEqual(p.ready, ['REQ-CRM-0002']);
  assert.ok(p.blocked.some((b) => b.req === 'REQ-CRM-0003'));

  p = planProgress(plan, {
    'REQ-CRM-0001': { status: 'deployed' },
    'REQ-CRM-0002': { status: 'deployed' },
    'REQ-CRM-0003': { status: 'done' },
  });
  assert.equal(p.complete, true);
  assert.deepEqual(p.ready, []);
});
