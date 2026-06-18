// Testes das funções puras da aba Forge (node:test, zero dependência).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  progressOf, productSummaries, phaseModel, buildDag, waveProgress, reqRow,
  validateReqId, nextReqId, forgeStatusCls, hubSummary, blueprintById, DONE_STATUSES,
  typeLabel, asList, dagFromWaves,
} from './assets/forge-lib.js';

const implStatus = {
  items: {
    'REQ-CRM-0001': { status: 'deployed' },
    'REQ-CRM-0002': { status: 'deployed' },
    'REQ-CRM-0003': { status: 'deployed', pr: 'https://x/24' },
    'REQ-CRM-0004': { status: 'deployed' },
    'REQ-CRM-0005': { status: 'deployed' },
  },
};
const products = {
  products: [{
    name: 'crm', display_name: 'CRM-lite', blueprint: 'node-api-vue-spa', vision: 'v', base_path: '/crm',
    app_type: 'product_software', requirement_ids: ['REQ-CRM-0001','REQ-CRM-0002','REQ-CRM-0003','REQ-CRM-0004','REQ-CRM-0005'],
    phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' }, scaffold: { status: 'not_started' }, build: { status: 'not_started' } },
  }],
};
const buildPlan = {
  product: 'crm', status: 'approved', scaffold_req: 'REQ-CRM-0001',
  waves: [
    { id: 'w0-foundation', gate: 'auto', work_orders: ['REQ-CRM-0001'] },
    { id: 'w1', gate: 'auto', work_orders: ['REQ-CRM-0002'], depends_on: ['w0'] },
    { id: 'w2', gate: 'auto', work_orders: ['REQ-CRM-0003','REQ-CRM-0004'], depends_on: ['w1'] },
    { id: 'w3', gate: 'auto', work_orders: ['REQ-CRM-0005'], depends_on: ['w2'] },
  ],
  order: ['REQ-CRM-0001','REQ-CRM-0002','REQ-CRM-0003','REQ-CRM-0004','REQ-CRM-0005'],
};

test('progressOf computa done/total/pct e by-status', () => {
  const p = progressOf(['REQ-CRM-0001','REQ-CRM-0002'], implStatus);
  assert.equal(p.total, 2); assert.equal(p.done, 2); assert.equal(p.pct, 100); assert.equal(p.by.deployed, 2);
  const empty = progressOf([], implStatus);
  assert.equal(empty.total, 0); assert.equal(empty.pct, 0);
  const partial = progressOf(['REQ-CRM-0001','REQ-X'], implStatus);
  assert.equal(partial.done, 1); assert.equal(partial.pct, 50); assert.equal(partial.by.not_started, 1);
});

test('productSummaries traz progresso vivo e ordena', () => {
  const s = productSummaries(products, implStatus);
  assert.equal(s.length, 1);
  assert.equal(s[0].name, 'crm');
  assert.equal(s[0].reqCount, 5);
  assert.equal(s[0].progress.pct, 100);
  assert.deepEqual(productSummaries({}, implStatus), []);
});

test('phaseModel deriva fases reais e marca uma única current', () => {
  // build completo (100%) → todas done
  const all = phaseModel(products.products[0], buildPlan, implStatus);
  assert.deepEqual(all.map((s) => s.status), ['done', 'done', 'done']);
  // build incompleto → build vira current
  const partialImpl = { items: { 'REQ-CRM-0001': { status: 'deployed' } } };
  const m = phaseModel(products.products[0], buildPlan, partialImpl);
  assert.equal(m[0].status, 'done');     // requirements approved
  assert.equal(m[1].status, 'done');     // architecture approved
  assert.equal(m[2].status, 'current');  // build incompleto
  assert.equal(m.filter((s) => s.status === 'current').length, 1);
  // sem arquitetura aprovada → arquitetura vira a primeira current
  const prod2 = { ...products.products[0], phases: { requirements: { status: 'approved' }, architecture: { status: 'not_started' } } };
  const m2 = phaseModel(prod2, null, partialImpl);
  assert.equal(m2[1].status, 'current');
  assert.equal(m2[2].status, 'todo');
});

test('buildDag liga waves consecutivas', () => {
  const dag = buildDag(buildPlan, implStatus);
  assert.equal(dag.nodes.length, 5);
  // 0001→0002, 0002→0003, 0002→0004, 0003→0005, 0004→0005
  assert.equal(dag.edges.length, 5);
  assert.ok(dag.edges.some((e) => e.from === 'REQ-CRM-0002' && e.to === 'REQ-CRM-0003'));
  assert.ok(dag.edges.some((e) => e.from === 'REQ-CRM-0004' && e.to === 'REQ-CRM-0005'));
  assert.equal(dag.nodes.find((n) => n.id === 'REQ-CRM-0001').wave, 0);
});

test('waveProgress classifica estados com gating', () => {
  const wp = waveProgress(buildPlan, implStatus);
  assert.deepEqual(wp.map((w) => w.state), ['done', 'done', 'done', 'done']);
  // só a fundação pronta → w1 active, w2/w3 blocked
  const part = { items: { 'REQ-CRM-0001': { status: 'deployed' }, 'REQ-CRM-0002': { status: 'pr_open' } } };
  const wp2 = waveProgress(buildPlan, part);
  assert.equal(wp2[0].state, 'done');
  assert.equal(wp2[1].state, 'active');
  assert.equal(wp2[2].state, 'blocked');
});

test('waveProgress: wave vazia nao bloqueia as seguintes', () => {
  const bpEmpty = { waves: [
    { id: 'w0', work_orders: ['REQ-CRM-0001'] },
    { id: 'w-skip', work_orders: [] },           // wave vazia no meio
    { id: 'w1', work_orders: ['REQ-CRM-0002'] },
  ] };
  const impl = { items: { 'REQ-CRM-0001': { status: 'deployed' }, 'REQ-CRM-0002': { status: 'pr_open' } } };
  const wp = waveProgress(bpEmpty, impl);
  assert.equal(wp[0].state, 'done');
  assert.equal(wp[1].state, 'done');     // vazia conta como concluida
  assert.equal(wp[2].state, 'active');   // NAO bloqueada pela vazia
});

test('dagFromWaves: casa por id e por título; arestas entre waves', () => {
  const reqs = [
    { id: 'REQ-HD-0001', title: 'Fundação do app' },
    { id: 'REQ-HD-0002', title: 'Abrir chamado' },
    { id: 'REQ-HD-0003', title: 'Painel de SLAs' },
  ];
  const waves = [
    { id: 'w0-foundation', work_orders: ['REQ-HD-0001'] },          // por id
    { id: 'w1', work_orders: ['Abrir chamado'] },                    // por título
    { id: 'w2', work_orders: ['REQ-HD-0003'] },
  ];
  const dag = dagFromWaves(reqs, waves);
  assert.equal(dag.nodes.length, 3);
  assert.equal(dag.nodes.find((n) => n.id === 'REQ-HD-0002').wave, 1);
  // 0001->0002, 0002->0003
  assert.equal(dag.edges.length, 2);
  assert.ok(dag.edges.some((e) => e.from === 'REQ-HD-0001' && e.to === 'REQ-HD-0002'));
});

test('dagFromWaves: sem waves = nós soltos (sem arestas); requisito órfão entra em wave extra', () => {
  const reqs = [{ id: 'REQ-X-0001', title: 'A' }, { id: 'REQ-X-0002', title: 'B' }];
  const only = dagFromWaves(reqs, []);
  assert.equal(only.nodes.length, 2);
  assert.equal(only.edges.length, 0);
  assert.ok(only.nodes.every((n) => n.wave === 0));
  // órfão (não citado em wave) entra ao final e liga-se à última wave
  const partial = dagFromWaves(reqs, [{ id: 'w0', work_orders: ['REQ-X-0001'] }]);
  assert.equal(partial.nodes.length, 2);
  assert.equal(partial.nodes.find((n) => n.id === 'REQ-X-0002').wave, 1);
  assert.equal(partial.edges.length, 1);
});

test('typeLabel / asList', () => {
  assert.equal(typeLabel('functional'), 'Funcional');
  assert.equal(typeLabel('non_functional'), 'Não-funcional');
  assert.equal(typeLabel('xyz'), 'xyz');
  assert.deepEqual(asList(['a', '', null, 'b']), ['a', 'b']);
  assert.deepEqual(asList('só uma'), ['só uma']);
  assert.deepEqual(asList(undefined), []);
});

test('reqRow junta baseline + status', () => {
  const baseline = { requirements: [{ id: 'REQ-CRM-0003', title: 'Contatos', type: 'functional', scope: { product_scope: 'crm' } }] };
  const row = reqRow('REQ-CRM-0003', baseline, implStatus);
  assert.equal(row.title, 'Contatos');
  assert.equal(row.status, 'deployed');
  assert.equal(row.pr, 'https://x/24');
  const missing = reqRow('REQ-X', baseline, implStatus);
  assert.equal(missing.status, 'not_started');
});

test('validateReqId aceita o padrão canônico', () => {
  assert.ok(validateReqId('REQ-CRM-0001'));
  assert.ok(validateReqId('REQ-CRM-NFR-001'));
  assert.ok(!validateReqId('REQ-crm-1'));
  assert.ok(!validateReqId('CRM-0001'));
});

test('nextReqId acha o próximo livre', () => {
  assert.equal(nextReqId('crm', ['REQ-CRM-0001','REQ-CRM-0005']), 'REQ-CRM-0006');
  assert.equal(nextReqId('crm', []), 'REQ-CRM-0001');
  assert.equal(nextReqId('Gym Ops', ['REQ-GYMOPS-0003']), 'REQ-GYMOPS-0004');
});

test('forgeStatusCls mapeia status→badge', () => {
  assert.equal(forgeStatusCls('deployed'), 'b-ok');
  assert.equal(forgeStatusCls('blocked'), 'b-crit');
  assert.equal(forgeStatusCls('pr_open'), 'b-high');
  assert.equal(forgeStatusCls('not_started'), 'b-low');
  for (const s of DONE_STATUSES) assert.equal(forgeStatusCls(s), 'b-ok');
});

test('hubSummary agrega produtos', () => {
  const h = hubSummary(products, implStatus);
  assert.equal(h.products, 1); assert.equal(h.totalReqs, 5); assert.equal(h.totalDone, 5);
  assert.equal(h.live, 1); assert.equal(h.pct, 100);
});

test('blueprintById', () => {
  const bp = { blueprints: [{ id: 'node-api-vue-spa', name: 'X' }] };
  assert.equal(blueprintById(bp, 'node-api-vue-spa').name, 'X');
  assert.equal(blueprintById(bp, 'nope'), null);
});
