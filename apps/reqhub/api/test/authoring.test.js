import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTool, createToolRegistry } from '@flavioneto11/ai-core';
import { buildAuthoringTools } from '../src/tools.js';
import { evaluateAuth, ssoIdentity, parseGroups } from '../src/auth.js';
import { PROMPTS, VOCAB } from '../src/prompts.js';

// Stub de LLM: devolve `payload` como JSON (ou um texto cru para simular JSON invalido).
const stubLlm = (payload, { raw } = {}) => ({
  async complete() {
    return { text: raw !== undefined ? raw : JSON.stringify(payload), usage: { total_tokens: 7 } };
  },
});

const reg = createToolRegistry(buildAuthoringTools());
const ctx = (llm, extra = {}) => ({ llm, authenticated: true, identity: 'operator', ...extra });

test('auth: sem token configurado -> 503 fail-closed', () => {
  const r = evaluateAuth('Bearer x', '');
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.code, 'AUTH_DISABLED');
});

test('auth: token errado -> 401; correto -> operator', () => {
  assert.equal(evaluateAuth('Bearer nope', 'segredo').ok, false);
  assert.equal(evaluateAuth('Bearer nope', 'segredo').status, 401);
  const ok = evaluateAuth('Bearer segredo', 'segredo');
  assert.equal(ok.ok, true);
  assert.equal(ok.identity, 'operator');
});

test('ssoIdentity: le X-Auth-Request-* da borda; admin via platform-admins', () => {
  const admin = ssoIdentity({ 'x-auth-request-email': 'Flavio@nvit.com.br', 'x-auth-request-groups': 'platform-admins, project-members' });
  assert.equal(admin.email, 'flavio@nvit.com.br');
  assert.equal(admin.isAdmin, true);
  assert.deepEqual(admin.groups, ['platform-admins', 'project-members']);
  const member = ssoIdentity({ 'x-auth-request-email': 'm@x.com', 'x-auth-request-groups': 'project-members' });
  assert.equal(member.isAdmin, false);
  assert.equal(ssoIdentity({}), null); // sem headers -> sem sessao
  assert.deepEqual(parseGroups('a, b ,,c'), ['a', 'b', 'c']);
});

test('todas as tools sao R1 (sem mutacao)', () => {
  for (const t of reg.list()) {
    assert.equal(t.risk, 'R1');
    assert.ok(!t.mutates);
  }
  assert.deepEqual(reg.list().map((t) => t.name).sort(), [
    'req.authoring.analyze',
    'req.authoring.analyze_refinement',
    'req.authoring.assist',
    'req.authoring.classify_change',
    'req.authoring.draft',
    'req.authoring.draft_refinement',
    'req.authoring.revise',
    'req.authoring.revise_refinement',
    'req.authoring.suggest_links',
  ]);
});

test('draft: gera rascunho a partir do esboco (operador autenticado)', async () => {
  const payload = { title: 'Exportar MTR', type: 'functional', statement: 'O sistema DEVE exportar MTR', acceptance_criteria: ['gera PDF'], warnings: [] };
  const out = await dispatchTool(reg.get('req.authoring.draft'), { sketch: 'preciso exportar o MTR em PDF', scope: 'sicat' }, ctx(stubLlm(payload)));
  assert.equal(out.status, 'executed');
  assert.equal(out.output.prompt_version, PROMPTS.draft.version);
  assert.equal(out.output.draft.title, 'Exportar MTR');
});

test('authorize por identidade: nao autenticado -> TOOL_DENIED', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.draft'), { sketch: 'algo qualquer' }, ctx(stubLlm({}), { authenticated: false })),
    (e) => e.code === 'TOOL_DENIED'
  );
});

test('input invalido -> TOOL_INVALID_INPUT (sketch ausente)', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.draft'), {}, ctx(stubLlm({}))),
    (e) => e.code === 'TOOL_INVALID_INPUT'
  );
});

test('JSON invalido do modelo -> erro ESTRUTURADO (sem fallback silencioso)', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.analyze'), { requirement: { id: 'REQ-X' } }, ctx(stubLlm(null, { raw: 'desculpe, nao consigo' }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('analyze: devolve gaps + score', async () => {
  const payload = { gaps: [{ kind: 'acceptance', field: 'acceptance_criteria', message: 'ausente', severity: 'warning' }], score: 0.4 };
  const out = await dispatchTool(reg.get('req.authoring.analyze'), { requirement: { id: 'REQ-X', statement: 'x' } }, ctx(stubLlm(payload)));
  assert.equal(out.output.score, 0.4);
  assert.equal(out.output.gaps.length, 1);
});

test('assist: pergunta -> reply grounded + citations, draft null', async () => {
  const payload = { intent: 'question', reply: 'A autenticacao usa OIDC (ver REQ-SICAT-0001).', citations: ['REQ-SICAT-0001'], grounded: true, draft: null, open_questions: [], quick_replies: ['Como funciona o MTR?'] };
  const out = await dispatchTool(reg.get('req.authoring.assist'), { product: 'sicat', message: 'como funciona a autenticacao?', grounding: [{ id: 'REQ-SICAT-0001', title: 'OIDC', statement: 'O sistema DEVE autenticar via OIDC' }] }, ctx(stubLlm(payload)));
  assert.equal(out.status, 'executed');
  assert.equal(out.output.prompt_version, PROMPTS.assist.version);
  assert.equal(out.output.intent, 'question');
  assert.deepEqual(out.output.citations, ['REQ-SICAT-0001']);
  assert.equal(out.output.grounded, true);
  assert.equal(out.output.draft, null);
  assert.equal(out.output.quick_replies.length, 1);
});

test('assist: pedido de mudanca -> draft preenchido (shape do applyDraftToForm)', async () => {
  const payload = { intent: 'create', reply: 'Proponho um novo requisito.', citations: [], grounded: true, next_question: 'isso seria ignorado', draft: { title: 'Exportar CDF', type: 'functional', statement: 'O sistema DEVE exportar CDF', acceptance_criteria: ['gera PDF'], scope: { applies_to: 'product', product_scope: 'sicat' }, priority: 'high' } };
  const out = await dispatchTool(reg.get('req.authoring.assist'), { product: 'sicat', message: 'preciso exportar o CDF', grounding: [] }, ctx(stubLlm(payload)));
  assert.equal(out.output.intent, 'create');
  assert.equal(out.output.draft.title, 'Exportar CDF');
  assert.equal(out.output.draft.scope.product_scope, 'sicat');
  assert.equal(out.output.next_question, ''); // ao propor draft, nao pergunta
});

test('assist: clarify -> next_question unica (string), draft null', async () => {
  const payload = { intent: 'clarify', reply: 'Para propor, preciso de um detalhe.', grounded: false, draft: null, next_question: 'Quem deve ver a tela: todos ou só no primeiro login?', quick_replies: ['Todos', 'Só no primeiro login'] };
  const out = await dispatchTool(reg.get('req.authoring.assist'), { product: 'gymops', message: 'quero uma tela de boas-vindas', grounding: [] }, ctx(stubLlm(payload)));
  assert.equal(out.output.intent, 'clarify');
  assert.equal(out.output.draft, null);
  assert.equal(out.output.next_question, 'Quem deve ver a tela: todos ou só no primeiro login?');
  assert.equal(out.output.quick_replies.length, 2);
});

test('assist: tolera open_questions[] legado -> pega a 1a como next_question', async () => {
  const payload = { intent: 'clarify', reply: 'Preciso de mais um detalhe.', draft: null, open_questions: ['Em quais telas aparece?', 'Tem variação por papel?'] };
  const out = await dispatchTool(reg.get('req.authoring.assist'), { product: 'gymops', message: 'algo novo', grounding: [] }, ctx(stubLlm(payload)));
  assert.equal(out.output.next_question, 'Em quais telas aparece?');
});

test('assist: input invalido -> TOOL_INVALID_INPUT (sem product/message/grounding)', async () => {
  await assert.rejects(() => dispatchTool(reg.get('req.authoring.assist'), { message: 'oi' }, ctx(stubLlm({}))), (e) => e.code === 'TOOL_INVALID_INPUT');
  await assert.rejects(() => dispatchTool(reg.get('req.authoring.assist'), { product: 'sicat', message: 'oi' }, ctx(stubLlm({}))), (e) => e.code === 'TOOL_INVALID_INPUT');
});

test('assist: JSON invalido do modelo -> LLM_INVALID_JSON (chat vive no JSON)', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.assist'), { product: 'sicat', message: 'oi', grounding: [] }, ctx(stubLlm(null, { raw: 'Claro! Aqui esta um texto solto.' }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('revise: corrige o requisito a partir das lacunas (shape do draft)', async () => {
  const payload = { draft: { title: 'Exportar CDF', type: 'functional', statement: 'O sistema DEVE exportar CDF em PDF', acceptance_criteria: ['gera PDF', 'inclui periodo'], verification_method: ['test-e2e'], scope: { applies_to: 'product', product_scope: 'sicat' }, priority: 'high' }, notes: 'Adicionei criterios de aceite e metodo de verificacao.' };
  const out = await dispatchTool(reg.get('req.authoring.revise'), { requirement: { id: 'REQ-SICAT-0020', statement: 'exportar CDF' }, gaps: [{ field: 'acceptance_criteria', message: 'ausente' }] }, ctx(stubLlm(payload)));
  assert.equal(out.output.prompt_version, PROMPTS.revise.version);
  assert.equal(out.output.draft.title, 'Exportar CDF');
  assert.ok(out.output.draft.acceptance_criteria.length >= 1);
  assert.match(out.output.notes, /criterios/i);
});

test('revise: propaga source.source_paths quando o modelo preenche a origem', async () => {
  const payload = { draft: { title: 'X', statement: 'O sistema DEVE X', source: { source_paths: ['apps/gymops/apps/api/src/x.ts'] } }, notes: 'origem proposta' };
  const out = await dispatchTool(reg.get('req.authoring.revise'), { requirement: { id: 'REQ-GYMOPS-0020', statement: 'x', scope: { product_scope: 'gymops' } }, gaps: [{ field: 'source', message: 'origem ausente' }] }, ctx(stubLlm(payload)));
  assert.deepEqual(out.output.draft.source.source_paths, ['apps/gymops/apps/api/src/x.ts']);
});

test('revise: input invalido -> TOOL_INVALID_INPUT (sem requirement)', async () => {
  await assert.rejects(() => dispatchTool(reg.get('req.authoring.revise'), {}, ctx(stubLlm({}))), (e) => e.code === 'TOOL_INVALID_INPUT');
});

test('suggest-links: classifica candidatos e marca status=proposed', async () => {
  const payload = { suggestions: [{ target: 'REQ-OIDC-0001', type: 'depends_on', confidence: 0.8, note: 'usa SSO' }] };
  const out = await dispatchTool(
    reg.get('req.authoring.suggest_links'),
    { requirement: { id: 'REQ-SICAT-0001' }, candidates: [{ id: 'REQ-OIDC-0001', title: 'OIDC', score: 0.83 }] },
    ctx(stubLlm(payload))
  );
  assert.equal(out.output.suggestions[0].status, 'proposed');
  assert.ok(VOCAB.LINK_TYPES.includes(out.output.suggestions[0].type));
});

// --- CAMADA DE REFINAMENTO (REF-*) -------------------------------------------
const refGrounding = [{ id: 'REQ-GYMOPS-0010', title: 'Telas administrativas', statement: 'O sistema DEVE expor /settings...' }];

test('classify_change: refinement -> anchors/citations filtrados pelo grounding', async () => {
  const payload = { level: 'refinement', confidence: 0.9, rationale: 'detalha o perfil', anchors: [{ requirement_id: 'REQ-GYMOPS-0010', relation: 'refines' }], target_req_id: null, suggested_type: null, citations: ['REQ-GYMOPS-0010'] };
  const out = await dispatchTool(reg.get('req.authoring.classify_change'), { product: 'gymops', sketch: 'mostrar endereço no /profile', grounding: refGrounding }, ctx(stubLlm(payload)));
  assert.equal(out.status, 'executed');
  assert.equal(out.output.level, 'refinement');
  assert.deepEqual(out.output.anchors, [{ requirement_id: 'REQ-GYMOPS-0010', relation: 'refines' }]);
  assert.deepEqual(out.output.citations, ['REQ-GYMOPS-0010']);
  assert.equal(VOCAB.CHANGE_LEVELS.includes(out.output.level), true);
});

test('classify_change: ANTI-FABRICACAO — ancora/target fora do grounding sao descartados', async () => {
  const payload = { level: 'refinement', anchors: [{ requirement_id: 'REQ-GYMOPS-9999', relation: 'refines' }], target_req_id: 'REQ-GYMOPS-8888', citations: ['REQ-GYMOPS-9999'] };
  const out = await dispatchTool(reg.get('req.authoring.classify_change'), { product: 'gymops', sketch: 'algo', grounding: refGrounding }, ctx(stubLlm(payload)));
  assert.deepEqual(out.output.anchors, []); // id fantasma removido
  assert.equal(out.output.target_req_id, null);
  assert.deepEqual(out.output.citations, []);
});

test('classify_change: level fora do enum -> LLM_INVALID_JSON', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.classify_change'), { product: 'gymops', sketch: 'mudança qualquer', grounding: [] }, ctx(stubLlm({ level: 'enorme' }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('classify_change: input invalido -> TOOL_INVALID_INPUT (sem grounding)', async () => {
  await assert.rejects(() => dispatchTool(reg.get('req.authoring.classify_change'), { product: 'gymops', sketch: 'mudança qualquer' }, ctx(stubLlm({}))), (e) => e.code === 'TOOL_INVALID_INPUT');
});

test('draft_refinement: devolve draft rico (surface/states)', async () => {
  const draft = { title: 'Endereço no perfil', kind: 'screen', surface: { route: '/profile', name: 'Perfil' }, behavior: { states: [{ name: 'normal', when: 'tem unidade', ui: 'mostra endereço' }, { name: 'empty', when: 'sem unidade', ui: 'Sem unidades' }], data: [{ field: 'unit.address', source: 'Unit.address', editable: false }] }, acceptance_criteria: ['exibe endereço'], verification_method: ['test-e2e'], source: { source_paths: ['apps/gymops/apps/web/src/app/(app)/profile'] } };
  const out = await dispatchTool(reg.get('req.authoring.draft_refinement'), { product: 'gymops', sketch: 'endereço no /profile', anchors: [{ requirement_id: 'REQ-GYMOPS-0010', relation: 'refines' }] }, ctx(stubLlm({ draft, warnings: [] })));
  assert.equal(out.output.prompt_version, PROMPTS.draftRefinement.version);
  assert.equal(out.output.draft.kind, 'screen');
  assert.equal(out.output.draft.surface.route, '/profile');
  assert.ok(out.output.draft.behavior.states.length >= 2);
});

test('draft_refinement: input invalido -> TOOL_INVALID_INPUT (sem anchors)', async () => {
  await assert.rejects(() => dispatchTool(reg.get('req.authoring.draft_refinement'), { sketch: 'algo' }, ctx(stubLlm({}))), (e) => e.code === 'TOOL_INVALID_INPUT');
});

test('analyze_refinement: devolve gaps + score (mesmo shape de analyze)', async () => {
  const payload = { gaps: [{ kind: 'states', field: 'behavior.states', message: 'faltou error/empty', severity: 'warning' }], score: 0.6 };
  const out = await dispatchTool(reg.get('req.authoring.analyze_refinement'), { refinement: { id: 'REF-GYMOPS-0001', kind: 'screen' } }, ctx(stubLlm(payload)));
  assert.equal(out.output.score, 0.6);
  assert.equal(out.output.gaps.length, 1);
});

test('analyze_refinement: PROJETA so {gaps,score} — modelo nao sobrescreve prompt_version nem vaza chaves', async () => {
  const payload = { gaps: [], score: 0.5, prompt_version: 'HACKED@999', arbitrary_extra: 'leaked' };
  const out = await dispatchTool(reg.get('req.authoring.analyze_refinement'), { refinement: { id: 'REF-X', kind: 'screen' } }, ctx(stubLlm(payload)));
  assert.equal(out.output.prompt_version, PROMPTS.analyzeRefinement.version); // NAO foi sobrescrito
  assert.equal(out.output.arbitrary_extra, undefined); // chave fantasma nao vaza
});

test('draft_refinement: kind fora do enum -> LLM_INVALID_JSON (fail-fast na API)', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.draft_refinement'), { product: 'gymops', sketch: 'algo de tela', anchors: [] }, ctx(stubLlm({ draft: { title: 'X', kind: 'pagina' } }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('draft_refinement: filtra verification_method ao ENUM', async () => {
  const draft = { title: 'X', kind: 'screen', verification_method: ['test-e2e', 'inventado', 'manual-review'] };
  const out = await dispatchTool(reg.get('req.authoring.draft_refinement'), { product: 'gymops', sketch: 'algo de tela', anchors: [] }, ctx(stubLlm({ draft })));
  assert.deepEqual(out.output.draft.verification_method, ['test-e2e', 'manual-review']);
});

// --- GROUNDING DE CONTRATO (F3-prep Forja 4.1): a autoria de REF recebe o openapi REAL ---
test('draft_refinement@2: prompt recebe o CONTRATO REAL quando fornecido (grounding, nao heuristica)', () => {
  assert.equal(PROMPTS.draftRefinement.version, 'draft-refinement@2');
  const withContract = PROMPTS.draftRefinement.user({ product: 'neuroevolui', sketch: 'tela de relatorios', anchors: [], contract: 'paths:\n  /v1/patient-reports:\n    get: {}' });
  assert.match(withContract, /CONTRATO REAL DA API/);
  assert.match(withContract, /\/v1\/patient-reports/);
  const without = PROMPTS.draftRefinement.user({ product: 'neuroevolui', sketch: 'tela de relatorios', anchors: [] });
  assert.ok(!/CONTRATO REAL DA API/.test(without), 'sem contrato fornecido, a secao nao aparece (nada inventado)');
  assert.match(PROMPTS.draftRefinement.system, /contract":\s*"existing"\|"proposed"|"contract": "existing"\|"proposed"/);
});

test('revise_refinement@2: prompt recebe o CONTRATO REAL quando fornecido', () => {
  assert.equal(PROMPTS.reviseRefinement.version, 'revise-refinement@2');
  const withContract = PROMPTS.reviseRefinement.user({ refinement: { id: 'REF-X' }, gaps: [], contract: 'paths:\n  /v1/reports: {}' });
  assert.match(withContract, /CONTRATO REAL DA API/);
  const without = PROMPTS.reviseRefinement.user({ refinement: { id: 'REF-X' }, gaps: [] });
  assert.ok(!/CONTRATO REAL DA API/.test(without));
});

test('draft_refinement: marcador contract proposto pelo modelo e PRESERVADO (endpoint novo explicito)', async () => {
  const draft = { title: 'X', kind: 'screen', behavior: { states: [{ name: 'normal' }], data: [{ field: 'clinic_name', source: 'api:/v1/settings', editable: true, contract: 'proposed' }] } };
  const out = await dispatchTool(reg.get('req.authoring.draft_refinement'), { product: 'neuroevolui', sketch: 'tela de config', anchors: [] }, ctx(stubLlm({ draft })));
  assert.equal(out.output.draft.behavior.data[0].contract, 'proposed');
});

test('draft_refinement: marcador contract fora do enum -> LLM_INVALID_JSON (fail-fast, sem conserto silencioso)', async () => {
  const draft = { title: 'X', kind: 'screen', behavior: { states: [{ name: 'normal' }], data: [{ field: 'a', source: 'api:/v1/x', editable: false, contract: 'imaginado' }] } };
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.draft_refinement'), { product: 'neuroevolui', sketch: 'algo', anchors: [] }, ctx(stubLlm({ draft }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('revise_refinement: marcador contract invalido em interactions -> LLM_INVALID_JSON', async () => {
  const draft = { title: 'X', kind: 'screen', behavior: { states: [{ name: 'normal' }], interactions: [{ trigger: 't', action: 'POST /v1/x', result: 'r', contract: 'talvez' }] } };
  await assert.rejects(
    () => dispatchTool(reg.get('req.authoring.revise_refinement'), { refinement: { id: 'REF-X' }, gaps: [] }, ctx(stubLlm({ draft, notes: '' }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('revise_refinement: corrige o refinamento (draft + notes)', async () => {
  const draft = { title: 'Endereço no perfil', kind: 'screen', surface: { route: '/profile' }, behavior: { states: [{ name: 'normal' }, { name: 'error' }, { name: 'empty' }] }, source: { source_paths: ['apps/gymops/apps/web/src/app/(app)/profile'] } };
  const out = await dispatchTool(reg.get('req.authoring.revise_refinement'), { refinement: { id: 'REF-GYMOPS-0001' }, gaps: [{ field: 'behavior.states', message: 'faltou error/empty' }] }, ctx(stubLlm({ draft, notes: 'adicionei error e empty' })));
  assert.equal(out.output.prompt_version, PROMPTS.reviseRefinement.version);
  assert.ok(out.output.draft.behavior.states.length >= 3);
  assert.match(out.output.notes, /error/i);
});
