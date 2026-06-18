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
  assert.deepEqual(reg.list().map((t) => t.name).sort(), ['req.authoring.analyze', 'req.authoring.assist', 'req.authoring.draft', 'req.authoring.suggest_links']);
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
