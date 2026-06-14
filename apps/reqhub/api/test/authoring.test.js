import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTool, createToolRegistry } from '@flavioneto11/ai-core';
import { buildAuthoringTools } from '../src/tools.js';
import { evaluateAuth } from '../src/auth.js';
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

test('todas as tools sao R1 (sem mutacao)', () => {
  for (const t of reg.list()) {
    assert.equal(t.risk, 'R1');
    assert.ok(!t.mutates);
  }
  assert.deepEqual(reg.list().map((t) => t.name).sort(), ['req.authoring.analyze', 'req.authoring.draft', 'req.authoring.suggest_links']);
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
