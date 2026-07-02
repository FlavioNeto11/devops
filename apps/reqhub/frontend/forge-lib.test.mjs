// Testes das funções puras da aba Forge (node:test, zero dependência).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  progressOf, productSummaries, phaseModel, buildDag, waveProgress, reqRow,
  validateReqId, nextReqId, forgeStatusCls, hubSummary, blueprintById, DONE_STATUSES,
  typeLabel, asList, dagFromWaves, businessProductScopes, NON_PRODUCT_SCOPES,
  weightedProgress, wavesFromProgress, STAGE_WEIGHT,
  studioPhaseModel, STUDIO_PHASE_KEYS,
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

test('businessProductScopes: só software de negócio (exclui infra; CMS já sem reqs)', () => {
  const reqs = [
    { id: 'REQ-SICAT-0001', scope: { product_scope: 'sicat' } },
    { id: 'REQ-CRM-0001', scope: { product_scope: 'crm' } },
    { id: 'REQ-ARGOCD-0001', scope: { product_scope: 'argocd' } },   // infra -> fora
    { id: 'REQ-TRAEFIK-0001', scope: { product_scope: 'traefik' } }, // infra -> fora
    { id: 'REQ-CONSOLE-0001', scope: { product_scope: 'console' } },
  ];
  assert.deepEqual(businessProductScopes(reqs, null), ['console', 'crm', 'sicat']);
  // todos os escopos de infra são excluídos
  for (const sc of NON_PRODUCT_SCOPES) {
    assert.equal(businessProductScopes([{ id: 'X', scope: { product_scope: sc } }], null).length, 0, sc);
  }
  // produto declarado com app_type != product_software também sai
  const products = { products: [{ name: 'crm', app_type: 'cms_portal' }] };
  assert.deepEqual(businessProductScopes(reqs, products), ['console', 'sicat']);
  assert.deepEqual(businessProductScopes([], null), []);
});

test('blueprintById', () => {
  const bp = { blueprints: [{ id: 'node-api-vue-spa', name: 'X' }] };
  assert.equal(blueprintById(bp, 'node-api-vue-spa').name, 'X');
  assert.equal(blueprintById(bp, 'nope'), null);
});

test('weightedProgress: merged NÃO é 100% (deploy/verificação pendente)', () => {
  const is = { items: { a: { status: 'merged' }, b: { status: 'merged' } } };
  const p = weightedProgress(['a', 'b'], is);
  assert.equal(p.pct, 90, 'dois merged = 90% (peso 0.9), não 100%');
  assert.equal(p.delivered, 2);
  assert.equal(p.live, 0);
});

test('weightedProgress: live=true faz merged contar como no ar (100%)', () => {
  const is = { items: { a: { status: 'merged' }, b: { status: 'merged' } } };
  const p = weightedProgress(['a', 'b'], is, { live: true });
  assert.equal(p.pct, 100);
  assert.equal(p.live, 2);
});

test('weightedProgress: granular por estágio + breakdown', () => {
  const is = { items: { a: { status: 'not_started' }, b: { status: 'in_progress' }, c: { status: 'pr_open' }, d: { status: 'deployed' } } };
  const p = weightedProgress(['a', 'b', 'c', 'd'], is);
  // (0 + 0.4 + 0.7 + 1) / 4 = 0.525 -> 53
  assert.equal(p.pct, 53);
  assert.equal(p.by.in_progress, 1);
  assert.equal(p.by.pr_open, 1);
  assert.equal(p.by.deployed, 1);
  assert.equal(p.live, 1); // só o deployed
});

test('weightedProgress: vazio = 0% (sem NaN)', () => {
  const p = weightedProgress([], { items: {} });
  assert.equal(p.pct, 0); assert.equal(p.total, 0);
});

test('STAGE_WEIGHT: ordem monotônica not_started<in_progress<pr_open<merged<=deployed', () => {
  assert.ok(STAGE_WEIGHT.not_started < STAGE_WEIGHT.in_progress);
  assert.ok(STAGE_WEIGHT.in_progress < STAGE_WEIGHT.pr_open);
  assert.ok(STAGE_WEIGHT.pr_open < STAGE_WEIGHT.merged);
  assert.ok(STAGE_WEIGHT.merged < STAGE_WEIGHT.deployed);
  assert.equal(STAGE_WEIGHT.deployed, 1);
});

test('wavesFromProgress: preenche em ordem conforme o pct (coerente, sem 0/N falso)', () => {
  const bp = { waves: [{ id: 'w0', work_orders: ['t1', 't2'] }, { id: 'w1', work_orders: ['t3'] }, { id: 'w2', work_orders: ['t4'] }] };
  assert.deepEqual(wavesFromProgress(bp, 0).map((w) => w.state), ['todo', 'todo', 'todo']);
  assert.deepEqual(wavesFromProgress(bp, 100).map((w) => w.state), ['done', 'done', 'done']);
  const mid = wavesFromProgress(bp, 50).map((w) => w.state); // filled=1.5 -> w0 done, w1 active, w2 todo
  assert.deepEqual(mid, ['done', 'active', 'todo']);
  assert.deepEqual(wavesFromProgress(bp, 50)[0].tasks, ['t1', 't2']);
});

// ---------- studioPhaseModel (trilho de 7 fases do Product Studio, A1b) ----------
test('studioPhaseModel: 7 fases, produto completo fica done até publicado', () => {
  const prod = { name: 'crm', vision: 'CRM enxuto', requirement_ids: ['REQ-CRM-0001', 'REQ-CRM-0002', 'REQ-CRM-0003', 'REQ-CRM-0004', 'REQ-CRM-0005'], phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' } } };
  const plan = { status: 'approved', waves: [{ id: 'w1', work_orders: ['a'] }] };
  const steps = studioPhaseModel(prod, plan, implStatus, { previewStatus: 'ready', previewScreens: 4 });
  assert.deepEqual(steps.map((s) => s.key), STUDIO_PHASE_KEYS);
  assert.deepEqual(steps.map((s) => s.status), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.match(steps.find((s) => s.key === 'telas').detail, /4 tela/);
});

test('studioPhaseModel: exatamente uma fase current (a primeira não concluída)', () => {
  const prod = { name: 'novo', vision: 'algo', requirement_ids: [], phases: {} };
  const steps = studioPhaseModel(prod, null, { items: {} }, {});
  assert.equal(steps.filter((s) => s.status === 'current').length, 1);
  assert.equal(steps.find((s) => s.status === 'current').key, 'requisitos'); // brief done (tem visão)
});

test('studioPhaseModel: sem visão -> brief é a fase current; docs aguardando', () => {
  const steps = studioPhaseModel({ name: 'x', requirement_ids: [] }, null, { items: {} }, {});
  assert.equal(steps[0].key, 'brief');
  assert.equal(steps[0].status, 'current');
  assert.equal(steps.find((s) => s.key === 'docs').status, 'todo');
});

test('studioPhaseModel: preview building/error/null aparecem no detail de telas (fail-soft)', () => {
  const prod = { name: 'p', vision: 'v', requirement_ids: ['REQ-CRM-0001'], phases: { requirements: { status: 'approved' } } };
  assert.match(studioPhaseModel(prod, null, implStatus, { previewStatus: 'building' }).find((s) => s.key === 'telas').detail, /gerando/);
  assert.match(studioPhaseModel(prod, null, implStatus, { previewStatus: 'error' }).find((s) => s.key === 'telas').detail, /erro/);
  assert.match(studioPhaseModel(prod, null, implStatus, {}).find((s) => s.key === 'telas').detail, /não consultado/);
});

test('studioPhaseModel: sonda liveUrlOk=false rebaixa publicado mesmo com pipeline 100%', () => {
  const prod = { name: 'crm', vision: 'v', requirement_ids: Object.keys(implStatus.items), phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' } } };
  const steps = studioPhaseModel(prod, null, implStatus, { previewStatus: 'ready', liveUrlOk: false });
  assert.equal(steps.find((s) => s.key === 'pipeline').status, 'done');
  const pub = steps.find((s) => s.key === 'publicado');
  assert.notEqual(pub.status, 'done');
  assert.match(pub.detail, /fora do ar/);
});

