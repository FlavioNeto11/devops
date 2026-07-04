// Testes das funções puras da aba Forge (node:test, zero dependência).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  progressOf, productSummaries, phaseModel, buildDag, waveProgress, reqRow,
  validateReqId, nextReqId, forgeStatusCls, hubSummary, blueprintById, DONE_STATUSES,
  typeLabel, asList, dagFromWaves, businessProductScopes, NON_PRODUCT_SCOPES,
  weightedProgress, wavesFromProgress, STAGE_WEIGHT,
  studioPhaseModel, STUDIO_PHASE_KEYS, STUDIO_T1_PHASE_KEYS,
  isT1Product, embedConsoleUrl, publishedSiteUrl, parseEmbedMessage,
  mergeLiveProducts, mergeImplItems, forgeStateSig,
  FORGE_MODES, FORGE_MODE_LABELS, normalizeForgeMode, modeCopy,
  projectRequirementCard, forgeReqObject, buildLaunchBody,
  briefFromPortalContract, externalContractRef, suggestIntegrationBlock, CAPTURE_BRIEF_MAX_ENDPOINTS,
  emptyIdea, normalizeIdea, applyIdeaPatch, ideaReady, ideaMaturityHint, composeBriefFromIdea, IDEA_MATURITY_THRESHOLD,
  previewErrorMessage,
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

// ---------- (E4, Forja 4.1) trilho REDUZIDO t1 + embed do CMS ----------
const t1Prod = { name: 'anarabottini', display_name: 'Ana Rabottini', app_type: 'cms_portal', blueprint: 'cms-portal', base_path: '/sites/anarabottini', vision: 'Portal de palestrante', requirement_ids: [], phases: { requirements: { status: 'adopted' } } };

test('isT1Product: cms_portal é t1; software/ausente não é', () => {
  assert.equal(isT1Product(t1Prod), true);
  assert.equal(isT1Product({ app_type: 'product_software' }), false);
  assert.equal(isT1Product({}), false);
  assert.equal(isT1Product(null), false);
});

test('studioPhaseModel t1: trilho reduzido Brief → Conteúdo → Publicação (sem esteira de código)', () => {
  const steps = studioPhaseModel(t1Prod, null, { items: {} }, { liveUrlOk: true });
  assert.deepEqual(steps.map((s) => s.key), STUDIO_T1_PHASE_KEYS);
  assert.deepEqual(STUDIO_T1_PHASE_KEYS, ['brief', 'conteudo', 'publicado']);
  const by = Object.fromEntries(steps.map((s) => [s.key, s]));
  assert.equal(by.brief.status, 'done');            // tem visão
  assert.equal(by.conteudo.status, 'current');      // conteúdo é vivo: nunca 'done'
  assert.equal(by.publicado.status, 'done');        // sonda confirmou no ar
  assert.equal(by.publicado.detail, 'no ar');
});

test('studioPhaseModel t1: exatamente uma fase current; sonda rebaixa/pende publicado', () => {
  const off = studioPhaseModel(t1Prod, null, { items: {} }, { liveUrlOk: false });
  assert.equal(off.filter((s) => s.status === 'current').length, 1);
  assert.match(off.find((s) => s.key === 'publicado').detail, /fora do ar/);
  const unknown = studioPhaseModel(t1Prod, null, { items: {} }, {});
  assert.match(unknown.find((s) => s.key === 'publicado').detail, /pendente/);
  const semBrief = studioPhaseModel({ ...t1Prod, vision: '' }, null, { items: {} }, {});
  assert.equal(semBrief[0].status, 'current'); // brief vira a primeira pendência
  assert.equal(semBrief.find((s) => s.key === 'conteudo').status, 'todo');
});

test('studioPhaseModel: produto t3 NÃO é afetado pelo trilho t1 (regressão)', () => {
  const prod = { name: 'crm', vision: 'v', app_type: 'product_software', requirement_ids: [], phases: {} };
  assert.deepEqual(studioPhaseModel(prod, null, { items: {} }, {}).map((s) => s.key), STUDIO_PHASE_KEYS);
});

test('embedConsoleUrl: URL do modo embed do Console com o projeto codificado', () => {
  assert.equal(embedConsoleUrl('anarabottini'), '/devops/?embed=1#conteudo?projeto=anarabottini');
  assert.equal(embedConsoleUrl('a b&c'), '/devops/?embed=1#conteudo?projeto=a%20b%26c');
  assert.equal(embedConsoleUrl(''), '');
  assert.equal(embedConsoleUrl(null), '');
});

test('publishedSiteUrl: base_path com barra final; nunca URL fora do site', () => {
  assert.equal(publishedSiteUrl({ base_path: '/sites/anarabottini' }), '/sites/anarabottini/');
  assert.equal(publishedSiteUrl({ base_path: '/rmambiental/' }), '/rmambiental/');
  assert.equal(publishedSiteUrl({}), '');
  assert.equal(publishedSiteUrl({ base_path: 'https://evil.example' }), ''); // só path absoluto
});

test('parseEmbedMessage: aceita só o contrato do console-embed (payload não confiável)', () => {
  assert.deepEqual(parseEmbedMessage({ source: 'console-embed', type: 'embed:ready' }),
    { type: 'embed:ready', view: '', projeto: '' });
  assert.deepEqual(parseEmbedMessage({ source: 'console-embed', type: 'embed:navigate', view: 'conteudo', projeto: 'x' }),
    { type: 'embed:navigate', view: 'conteudo', projeto: 'x' });
  // projeto/view não-string são descartados (nunca lança)
  assert.deepEqual(parseEmbedMessage({ source: 'console-embed', type: 'embed:navigate', projeto: 42 }).projeto, '');
  assert.equal(parseEmbedMessage({ source: 'outro', type: 'embed:ready' }), null);
  assert.equal(parseEmbedMessage({ source: 'console-embed', type: 'outro' }), null);
  assert.equal(parseEmbedMessage('embed:ready'), null);
  assert.equal(parseEmbedMessage(null), null);
});

// ---------- (C2) MODOS DE USUÁRIO: projeções puras sobre a MESMA engine ----------
test('normalizeForgeMode: default guiado + migração dos nomes antigos do wizard', () => {
  assert.deepEqual(FORGE_MODES, ['simples', 'guiado', 'profissional']);
  for (const m of FORGE_MODES) assert.equal(normalizeForgeMode(m), m);
  assert.equal(normalizeForgeMode(null), 'guiado');
  assert.equal(normalizeForgeMode(''), 'guiado');
  assert.equal(normalizeForgeMode('xpto'), 'guiado');
  assert.equal(normalizeForgeMode('guided'), 'guiado');        // pré-C2
  assert.equal(normalizeForgeMode('advanced'), 'profissional'); // pré-C2
  for (const m of FORGE_MODES) assert.ok(FORGE_MODE_LABELS[m], 'label de ' + m);
});

test('modeCopy: texto por modo, fallback no guiado, chave desconhecida vazia', () => {
  for (const m of FORGE_MODES) assert.ok(modeCopy(m, 'selector.sub').length > 0, 'selector.sub de ' + m);
  // modos diferentes têm condução diferente onde faz sentido
  assert.notEqual(modeCopy('simples', 'idea.brief'), modeCopy('profissional', 'idea.brief'));
  assert.notEqual(modeCopy('guiado', 'idea.q'), modeCopy('profissional', 'idea.q'));
  // modo inválido cai no guiado (default)
  assert.equal(modeCopy('xpto', 'idea.q'), modeCopy('guiado', 'idea.q'));
  // chave desconhecida nunca explode
  assert.equal(modeCopy('simples', 'nao.existe'), '');
});

// O MESMO requisito de exemplo usado nos 3 modos (gate de preservação de dados).
const C2_REQ = Object.freeze({
  id: 'REQ-LOJA-0002',
  req: Object.freeze({
    title: 'Login e controle de acesso',
    type: 'functional',
    statement: 'O sistema DEVE permitir login com perfis de acesso por papel.',
    acceptance_criteria: Object.freeze(['usuário sem papel não acessa', 'admin gerencia papéis']),
    priority: 'high',
    capability_blocks: Object.freeze(['oidc-sessao', 'rbac-multitenant']),
  }),
});

test('GATE C2: projectRequirementCard preserva os DADOS nos 3 modos (id/title/statement intactos)', () => {
  const original = { id: C2_REQ.id, title: C2_REQ.req.title, statement: C2_REQ.req.statement };
  for (const m of FORGE_MODES) {
    const card = projectRequirementCard(C2_REQ, m); // entrada congelada: projeção não muta (senão lança)
    assert.deepEqual(card.source, original, 'source intacto no modo ' + m);
    assert.equal(card.id, C2_REQ.id, 'id presente no modo ' + m);
    assert.ok(card.title.length > 0 && card.lines.length > 0, 'apresentação não-vazia no modo ' + m);
  }
  // e os DADOS por baixo são OS MESMOS entre os modos (só a apresentação muda)
  const sources = FORGE_MODES.map((m) => projectRequirementCard(C2_REQ, m).source);
  assert.deepEqual(sources[0], sources[1]);
  assert.deepEqual(sources[1], sources[2]);
});

test('projeção SIMPLES: linguagem natural, sem YAML/ids técnicos; tech nunca exposto', () => {
  const card = projectRequirementCard(C2_REQ, 'simples');
  assert.equal(card.title, 'Seu sistema terá login e controle de acesso'); // exemplo canônico do escopo
  assert.equal(card.lines[0], 'Ele vai permitir login com perfis de acesso por papel.');
  assert.equal(card.tech, null);
  const shown = card.title + ' ' + card.lines.join(' ');
  assert.ok(!/REQ-/.test(shown), 'sem REQ-id no simples');
  assert.ok(!/functional|oidc|rbac|yaml/i.test(shown), 'sem jargão técnico no simples');
  // sigla no início do título não é decapitalizada
  assert.match(projectRequirementCard({ id: 'X', req: { title: 'IA assistiva', statement: 'O sistema DEVE sugerir.' } }, 'simples').title, /terá IA assistiva$/);
  // statement fora da forma canônica passa como está (nunca inventa)
  assert.equal(projectRequirementCard({ id: 'X', req: { title: 'T', statement: 'Avisar por e-mail.' } }, 'simples').lines[0], 'Avisar por e-mail.');
});

test('projeção GUIADO: title+statement+aceite resumido; tech p/ o disclosure', () => {
  const card = projectRequirementCard(C2_REQ, 'guiado');
  assert.equal(card.title, C2_REQ.req.title);
  assert.equal(card.lines[0], C2_REQ.req.statement);
  assert.match(card.lines[1], /^Aceite: usuário sem papel não acessa \(\+1\)$/);
  assert.equal(card.tech.typeLabel, 'Funcional');
  assert.deepEqual(card.tech.blocks, ['oidc-sessao', 'rbac-multitenant']);
  assert.deepEqual(card.tech.acceptance, ['usuário sem papel não acessa', 'admin gerencia papéis']);
});

test('projeção PROFISSIONAL: tudo aberto (statement + todos os critérios + tech)', () => {
  const card = projectRequirementCard(C2_REQ, 'profissional');
  assert.equal(card.title, C2_REQ.req.title);
  assert.equal(card.lines.length, 3); // statement + 2 critérios
  assert.match(card.lines[1], /^✓ /);
  assert.equal(card.tech.priority, 'high');
});

test('GATE C2: payload de launch IDÊNTICO nos 3 modos, exceto creation_mode', () => {
  const proposed = [
    { id: 'REQ-LOJA-0001', req: { title: 'Fundação', statement: 'O sistema DEVE subir com /health.', acceptance_criteria: ['/health 200'] } },
    { id: 'REQ-LOJA-0002', req: C2_REQ.req },
  ];
  const mk = (creationMode) => buildLaunchBody({
    product: 'loja', displayName: 'Loja', blueprint: 'node-api-vue-spa', brief: 'uma loja', mode: 'release',
    requirements: proposed.map(({ id, req }) => forgeReqObject(id, 'loja', 'node-api-vue-spa', req)),
    architecture: { stack: 'sicat', selected_blocks: [{ id: 'oidc-sessao' }], adrs: [], waves: [{ id: 'w0', work_orders: ['REQ-LOJA-0001'] }] },
    creationMode,
  });
  const bodies = FORGE_MODES.map(mk);
  bodies.forEach((b, i) => assert.equal(b.creation_mode, FORGE_MODES[i]));
  const strip = (b) => { const { creation_mode, ...rest } = b; return rest; };
  assert.deepEqual(strip(bodies[0]), strip(bodies[1]), 'simples ≡ guiado (exceto creation_mode)');
  assert.deepEqual(strip(bodies[1]), strip(bodies[2]), 'guiado ≡ profissional (exceto creation_mode)');
  // sem creationMode (cliente antigo) o campo NEM EXISTE (retrocompat byte a byte)
  assert.ok(!('creation_mode' in mk(undefined)));
  // modo legado normalizado também no payload
  assert.equal(mk('advanced').creation_mode, 'profissional');
});

test('forgeReqObject: YAML canônico (mesmo objeto que ia pro export do studio)', () => {
  const o = forgeReqObject('REQ-X-0001', 'x', 'bp', { title: 'T', statement: 'S', acceptance_criteria: 'um só' });
  assert.equal(o.id, 'REQ-X-0001');
  assert.equal(o.status, 'proposed');
  assert.equal(o.scope.product_scope, 'x');
  assert.deepEqual(o.acceptance_criteria, ['um só']);
  assert.deepEqual(o.verification_method, ['test']);
});


// ---------- mergeLiveProducts / mergeImplItems / forgeStateSig (D1, Forja 4.1) ----------
test('mergeLiveProducts: fixture do INCIDENTE real — vivo stale (2) manda na presença; baked preenche campos', () => {
  // baked pós-#176: 5 produtos (2 adotados); ConfigMap stale: só 2 greenfield, SEM origin.
  const baked = [
    { name: 'contaviva-360', display_name: 'ContaViva 360', origin: 'greenfield', vision: 'ERP', phases: { requirements: { status: 'approved' } } },
    { name: 'neuroevolui', display_name: 'NeuroEvolui', origin: 'greenfield', vision: 'clinica' },
    { name: 'sicat', display_name: 'SICAT', origin: 'adopted', vision: 'MTR CETESB', architecture_summary: 'Vue+Express' },
    { name: 'gymops', display_name: 'GymOps', origin: 'adopted' },
    { name: 'contaviva-pro', display_name: 'ContaViva Pro', origin: 'greenfield' },
  ];
  const live = [
    { name: 'contaviva-360', display_name: 'ContaViva 360', vision: '', reqCount: 9, progress: { done: 9, pct: 100 }, reqs: [{ id: 'REQ-CONTAVIVA360-0001', status: 'deployed' }] },
    { name: 'neuroevolui', display_name: 'NeuroEvolui', reqCount: 9, progress: { done: 9, pct: 100 }, reqs: [] },
  ];
  const m = mergeLiveProducts(baked, live, {});
  // PRESENÇA = vivo (decisão adversarial: união ressuscitaria produto apagado p/ sempre)
  assert.deepEqual(m.map((p) => p.name), ['contaviva-360', 'neuroevolui']);
  // CAMPOS: baked preenche o que o vivo não transporta/manda vazio
  assert.equal(m[0].origin, 'greenfield');
  assert.equal(m[0].vision, 'ERP'); // vivo mandou '' -> baked preenche
  assert.equal(m[0].progress.pct, 100); // progresso vem do vivo
});

test('mergeLiveProducts: origin do vivo vence quando presente; adotado nunca vira greenfield por default do baked ausente', () => {
  const m = mergeLiveProducts([], [{ name: 'x', origin: 'adopted', reqs: [] }], {});
  assert.equal(m[0].origin, 'adopted');
  const m2 = mergeLiveProducts([{ name: 'y', origin: 'adopted' }], [{ name: 'y', reqs: [] }], {});
  assert.equal(m2[0].origin, 'adopted'); // vivo sem origin -> baked preserva
});

test('mergeImplItems: UNIÃO — baked traz escopos de plataforma; vivo vence por id', () => {
  const baked = { 'REQ-AI-0001': { status: 'deployed' }, 'REQ-CONTAVIVA360-0001': { status: 'merged' } };
  const live = [{ name: 'contaviva-360', reqs: [{ id: 'REQ-CONTAVIVA360-0001', status: 'deployed' }] }];
  const items = mergeImplItems(baked, live);
  assert.equal(items['REQ-AI-0001'].status, 'deployed');       // plataforma NÃO some (o replace antigo zerava)
  assert.equal(items['REQ-CONTAVIVA360-0001'].status, 'deployed'); // vivo vence
});

test('forgeStateSig: determinística e sensível a origem/progresso', () => {
  const a = forgeStateSig([{ name: 'x', reqCount: 2, progress: { done: 1, pct: 50 }, origin: 'greenfield' }]);
  const b = forgeStateSig([{ name: 'x', reqCount: 2, progress: { done: 2, pct: 100 }, origin: 'greenfield' }]);
  assert.notEqual(a, b);
  assert.equal(a, forgeStateSig([{ name: 'x', reqCount: 2, progress: { done: 1, pct: 50 }, origin: 'greenfield' }]));
});


// ---------- (E2, Forja 4.1) captura de portal como entrada da Forja ----------
// Export canônico de exemplo (formato do portal-recorder: manifest + endpoints, SEM samples).
const CAPTURE_EXPORT = {
  manifest: {
    portal: 'cetesb-mtr', base_url: 'https://mtr.cetesb.sp.gov.br', version: '2026-07-01',
    endpoint_count: 4, content_hash: 'sha256:abc123', redaction_policy: 'business-sensitive-v1',
  },
  endpoints: [
    { id: 'e1', group: 'manifesto', method: 'GET', path_template: '/api/manifesto/{id}', auth: { required: true }, requires_captcha: false },
    { id: 'e2', group: 'manifesto', method: 'POST', path_template: '/api/manifesto', auth: { required: true }, requires_captcha: false },
    { id: 'e3', group: 'auth', method: 'POST', path_template: '/api/login', auth: { required: false }, requires_captcha: true },
    { id: 'e4', group: 'parceiro', method: 'GET', path_template: '/api/parceiro', auth: { required: true }, requires_captcha: false },
  ],
};

test('briefFromPortalContract: deriva brief com portal, entidades, fluxos e endpoints', () => {
  const brief = briefFromPortalContract(CAPTURE_EXPORT);
  assert.match(brief, /"cetesb-mtr"/, 'nome do portal');
  assert.match(brief, /https:\/\/mtr\.cetesb\.sp\.gov\.br/, 'base_url');
  assert.match(brief, /4 endpoint\(s\)/, 'contagem de endpoints');
  assert.match(brief, /Entidades\/áreas observadas \(3\): auth, manifesto, parceiro\./, 'grupos = entidades, ordenados');
  assert.match(brief, /Fluxos: 2 consulta\(s\) e 2 operação\(ões\) de escrita\./, 'leitura × escrita');
  assert.match(brief, /3 endpoint\(s\) exigem autenticação\./, 'auth agregado');
  assert.match(brief, /1 exigem captcha\./, 'captcha agregado');
  assert.match(brief, /GET \/api\/manifesto\{id\}|GET \/api\/manifesto\/\{id\}/, 'endpoint listado');
  assert.match(brief, /POST \/api\/login\s.*\[captcha\]/, 'flag [captcha] no endpoint');
  assert.match(brief, /GET \/api\/parceiro \[auth\]/, 'flag [auth] no endpoint');
  assert.doesNotMatch(brief, /sample|payload de exemplo anexado/i, 'nunca menciona samples como conteúdo');
});

test('briefFromPortalContract: sugere o bloco de integração quando informado (opts.integrationBlock)', () => {
  const withBlock = briefFromPortalContract(CAPTURE_EXPORT, { integrationBlock: 'gateway-externo' });
  assert.match(withBlock, /Capacidade sugerida: inclua o bloco "gateway-externo"/);
  const without = briefFromPortalContract(CAPTURE_EXPORT);
  assert.doesNotMatch(without, /Capacidade sugerida/);
});

test('briefFromPortalContract: trunca a lista no teto e aponta o restante para o anexo', () => {
  const many = {
    manifest: { portal: 'p', version: 'v', content_hash: 'sha256:x' },
    endpoints: Array.from({ length: CAPTURE_BRIEF_MAX_ENDPOINTS + 7 }, (_, i) => ({
      id: 'e' + i, group: 'g', method: 'GET', path_template: '/api/x/' + i, auth: { required: false },
    })),
  };
  const brief = briefFromPortalContract(many);
  const listed = (brief.match(/^ {2}- GET /gm) || []).length;
  assert.equal(listed, CAPTURE_BRIEF_MAX_ENDPOINTS, 'lista exatamente o teto');
  assert.match(brief, /… e mais 7 endpoint\(s\) no contrato anexo\./);
});

test('briefFromPortalContract: fail-soft — export inutilizável vira string vazia', () => {
  assert.equal(briefFromPortalContract(null), '');
  assert.equal(briefFromPortalContract({}), '');
  assert.equal(briefFromPortalContract({ manifest: { portal: 'p' }, endpoints: [] }), '', 'sem endpoints');
  assert.equal(briefFromPortalContract({ manifest: {}, endpoints: [{ method: 'GET' }] }), '', 'sem portal');
  assert.equal(briefFromPortalContract('string'), '');
});

test('externalContractRef: referência {portal, contract_version, content_hash} do manifest', () => {
  assert.deepEqual(externalContractRef(CAPTURE_EXPORT),
    { portal: 'cetesb-mtr', contract_version: '2026-07-01', content_hash: 'sha256:abc123' });
  assert.equal(externalContractRef(null), null);
  assert.equal(externalContractRef({ manifest: { portal: 'p' } }), null, 'sem content_hash -> null');
  assert.equal(externalContractRef({ manifest: { content_hash: 'sha256:x' } }), null, 'sem portal -> null');
  // version ausente degrada para '' (não quebra o carimbo)
  assert.deepEqual(externalContractRef({ manifest: { portal: 'p', content_hash: 'sha256:x' } }),
    { portal: 'p', contract_version: '', content_hash: 'sha256:x' });
});

test('suggestIntegrationBlock: prefere gateway-externo; fallback categoria integration; null sem opção', () => {
  const catalog = [
    { id: 'camadas-rigidas', category: 'foundation' },
    { id: 'gateway-externo', category: 'integration' },
    { id: 'outro-integ', category: 'integration' },
  ];
  assert.equal(suggestIntegrationBlock(catalog), 'gateway-externo');
  assert.equal(suggestIntegrationBlock([{ id: 'outro-integ', category: 'integration' }]), 'outro-integ', 'fallback declarativo por categoria');
  assert.equal(suggestIntegrationBlock([{ id: 'camadas-rigidas', category: 'foundation' }]), null);
  assert.equal(suggestIntegrationBlock([]), null);
  assert.equal(suggestIntegrationBlock(undefined), null);
});

test('buildLaunchBody: externalContract carimba architecture.external_contract (retrocompat sem ele)', () => {
  const base = {
    product: 'meu-mtr', displayName: 'Meu MTR', blueprint: 'node-api-vue-spa', brief: 'b', mode: 'pr',
    requirements: [{ title: 'T', statement: 'S' }],
    architecture: { stack: 'sicat', selected_blocks: [{ id: 'gateway-externo' }], adrs: [], waves: [] },
  };
  const withEc = buildLaunchBody({ ...base, externalContract: externalContractRef(CAPTURE_EXPORT) });
  assert.deepEqual(withEc.architecture.external_contract,
    { portal: 'cetesb-mtr', contract_version: '2026-07-01', content_hash: 'sha256:abc123' });
  // sem externalContract o payload NEM tem o campo (idêntico ao pré-E2, byte a byte)
  const withoutEc = buildLaunchBody(base);
  assert.ok(!('external_contract' in withoutEc.architecture));
  // externalContract inválido (sem portal) é ignorado — nunca carimba lixo
  const junk = buildLaunchBody({ ...base, externalContract: { content_hash: 'x' } });
  assert.ok(!('external_contract' in junk.architecture));
  // e o resto do payload permanece igual nos três casos
  const strip = (b) => { const { architecture, ...rest } = b; return rest; };
  assert.deepEqual(strip(withEc), strip(withoutEc));
});

test('modeCopy: cartão de captura projeta pelos 3 modos (copy distinta por modo)', () => {
  const titles = FORGE_MODES.map((m) => modeCopy(m, 'fork.capture.title'));
  assert.equal(new Set(titles).size, 3, 'títulos distintos por modo');
  assert.match(modeCopy('simples', 'fork.capture.title'), /sistema que você já usa/i);
  assert.match(modeCopy('guiado', 'fork.capture.title'), /portal capturado/i);
  assert.match(modeCopy('profissional', 'fork.capture.foot'), /\/portal-rec\/api\/v1\/contracts/);
  // modo desconhecido cai no guiado (regra geral do MODE_COPY)
  assert.equal(modeCopy('???', 'fork.capture.desc'), modeCopy('guiado', 'fork.capture.desc'));
});

/* ─── ETAPA IDEIA — copiloto de produto (funções puras) ─────────────────────────────────────── */

test('emptyIdea/normalizeIdea: shape canônico e defensivo (nunca lança)', () => {
  const e = emptyIdea();
  assert.deepEqual(e.capabilities, []);
  assert.equal(e.maturity, 0);
  assert.equal(e.confirmed, false);
  // entrada suja: campos ausentes/errados viram defaults; listas coagidas a string[]
  const n = normalizeIdea({ problem: '  dor  ', capabilities: ['a', { text: 'b' }, '', 42], maturity: 250, actors: 'x' });
  assert.equal(n.problem, 'dor');
  assert.deepEqual(n.capabilities, ['a', 'b', '42']);
  assert.equal(n.maturity, 100, 'maturity clampada a 100');
  assert.deepEqual(n.actors, [], 'actors não-array vira []');
  assert.doesNotThrow(() => normalizeIdea(null));
});

test('applyIdeaPatch: escalares substituem, listas acrescentam com dedupe (nunca apagam)', () => {
  let idea = emptyIdea();
  idea = applyIdeaPatch(idea, { patch: { name: 'Chamados', problem: 'suporte caótico', capabilities: ['abrir chamado', 'atribuir a técnico'] }, maturity: 30, open_questions: [{ text: 'qual SLA?', essential: true }] });
  assert.equal(idea.name, 'Chamados');
  assert.deepEqual(idea.capabilities, ['abrir chamado', 'atribuir a técnico']);
  assert.equal(idea.maturity, 30);
  assert.equal(idea.openQuestions[0].essential, true);
  // segundo turno: acrescenta 1 capacidade nova + repete uma (dedupe case-insensitive) e sobe maturity
  idea = applyIdeaPatch(idea, { patch: { capabilities: ['Abrir chamado', 'avisar quando atrasa'] }, maturity: 55, open_questions: [] });
  assert.deepEqual(idea.capabilities, ['abrir chamado', 'atribuir a técnico', 'avisar quando atrasa'], 'sem duplicata; preserva o que já havia');
  assert.equal(idea.maturity, 55);
  assert.deepEqual(idea.openQuestions, [], 'open_questions é snapshot (substitui)');
  // patch vazio não destrói nada
  const before = JSON.stringify(idea);
  idea = applyIdeaPatch(idea, {});
  assert.equal(JSON.stringify(idea), before);
});

test('applyIdeaPatch: summary vem do patch.summary OU do payload.summary (fechamento)', () => {
  let idea = applyIdeaPatch(emptyIdea(), { summary: 'Sistema para gerir chamados.' });
  assert.equal(idea.summary, 'Sistema para gerir chamados.');
  idea = applyIdeaPatch(idea, { patch: { summary: 'Gestão de chamados de ponta a ponta.' } });
  assert.equal(idea.summary, 'Gestão de chamados de ponta a ponta.', 'patch.summary tem prioridade');
});

test('ideaReady: gate exige maturidade + problema + público + >=2 capacidades e nenhuma pergunta essencial', () => {
  const closed = { problem: 'p', audience: 'gestores', capabilities: ['a', 'b'], maturity: IDEA_MATURITY_THRESHOLD, openQuestions: [] };
  assert.equal(ideaReady(closed), true);
  assert.equal(ideaReady({ ...closed, maturity: 69 }), false, 'abaixo do limiar');
  assert.equal(ideaReady({ ...closed, capabilities: ['a'] }), false, 'menos de 2 capacidades');
  assert.equal(ideaReady({ ...closed, problem: '' }), false, 'sem problema');
  assert.equal(ideaReady({ ...closed, audience: '', actors: [] }), false, 'sem público nem atores');
  assert.equal(ideaReady({ ...closed, audience: '', actors: ['operador'] }), true, 'atores satisfazem "quem usa"');
  assert.equal(ideaReady({ ...closed, openQuestions: [{ text: 'x', essential: true }] }), false, 'pergunta essencial bloqueia');
  assert.equal(ideaReady({ ...closed, openQuestions: [{ text: 'x', essential: false }] }), true, 'pergunta não-essencial não bloqueia');
});

test('composeBriefFromIdea: monta brief textual rico (>=10 chars) preservando as seções', () => {
  const brief = composeBriefFromIdea({
    summary: 'Gestão de chamados.', problem: 'suporte caótico', audience: 'equipe de suporte', actors: ['técnico'],
    capabilities: ['abrir chamado', 'atribuir'], businessRules: ['SLA de 24h'], goals: ['reduzir atraso'], value: 'clientes satisfeitos', constraints: ['LGPD'],
  });
  assert.ok(brief.length >= 10);
  assert.match(brief, /Problema\/dor que resolve: suporte caótico/);
  assert.match(brief, /Para quem \/ quem usa: equipe de suporte; técnico/);
  assert.match(brief, /- abrir chamado/);
  assert.match(brief, /Regras de negócio:/);
  assert.match(brief, /Restrições de negócio: LGPD/);
});

test('ideaMaturityHint: aponta a MAIOR lacuna atual em ordem', () => {
  assert.match(ideaMaturityHint(emptyIdea()), /qual problema/i);
  assert.match(ideaMaturityHint({ problem: 'p' }), /para quem/i);
  assert.match(ideaMaturityHint({ problem: 'p', audience: 'a' }), /o que o sistema/i);
  assert.match(ideaMaturityHint({ problem: 'p', audience: 'a', capabilities: ['x', 'y'], openQuestions: [{ text: 'falta o SLA', essential: true }] }), /SLA/);
  assert.match(ideaMaturityHint({ problem: 'p', audience: 'a', capabilities: ['x', 'y'], maturity: 100 }), /pronta/i);
});

/* ─── Preview: mensagens de erro amigáveis (nunca o texto cru) ───────────────────────────────── */
test('previewErrorMessage: mapeia código -> pt-BR amigável; default para desconhecido/ausente', () => {
  assert.match(previewErrorMessage('DISPATCH_DISABLED'), /configuração/i);
  assert.match(previewErrorMessage('PREVIEW_UPSTREAM_AUTH'), /autenticação|configuração/i);
  assert.match(previewErrorMessage('BUILD_TIMEOUT'), /demorou/i);
  assert.match(previewErrorMessage('AI_DISABLED'), /IA/);
  // desconhecido e ausente caem no genérico amigável
  assert.match(previewErrorMessage('HTTP 500'), /Tente novamente/i);
  assert.match(previewErrorMessage(), /Tente novamente/i);
  // NUNCA vaza termos técnicos do GitHub
  for (const c of ['DISPATCH_DISABLED', 'PREVIEW_UPSTREAM_AUTH', 'PREVIEW_UPSTREAM', undefined]) {
    assert.doesNotMatch(previewErrorMessage(c), /Bad credentials|documentation_url|GitHub \d/i);
  }
});
