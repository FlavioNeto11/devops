import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTool, createToolRegistry } from '@flavioneto11/ai-core';
import { buildForgeTools, buildAuthoringTools } from '../src/tools.js';
import { PROMPTS } from '../src/prompts.js';

const stubLlm = (payload, { raw } = {}) => ({
  async complete() { return { text: raw !== undefined ? raw : JSON.stringify(payload), usage: { total_tokens: 11 } }; },
});
const reg = createToolRegistry(buildForgeTools());
const ctx = (llm, extra = {}) => ({ llm, authenticated: true, identity: 'operator', ...extra });

test('forge tools sao R1 (sem mutacao) e registradas', () => {
  for (const t of reg.list()) { assert.equal(t.risk, 'R1'); assert.ok(!t.mutates); }
  assert.deepEqual(reg.list().map((t) => t.name).sort(), ['forge.propose_architecture', 'forge.propose_requirements']);
});

test('propose_requirements: gera conjunto a partir do brief', async () => {
  const payload = { requirements: [
    { title: 'Fundação do app', type: 'functional', statement: 'O sistema DEVE expor app + health', acceptance_criteria: ['/health 200'], priority: 'high', rationale: 'base' },
    { title: 'Abrir chamado', type: 'functional', statement: 'O sistema DEVE permitir abrir chamado', acceptance_criteria: ['salva no banco'], priority: 'high', rationale: 'core' },
  ], notes: 'mvp' };
  const out = await dispatchTool(reg.get('forge.propose_requirements'), { product: 'helpdesk', blueprint: 'node-api-vue-spa', brief: 'um helpdesk simples para abrir e acompanhar chamados' }, ctx(stubLlm(payload)));
  assert.equal(out.status, 'executed');
  assert.equal(out.output.prompt_version, PROMPTS.proposeRequirements.version);
  assert.equal(out.output.requirements.length, 2);
  assert.equal(out.output.notes, 'mvp');
});

test('propose_requirements: brief curto -> TOOL_INVALID_INPUT', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('forge.propose_requirements'), { brief: 'oi' }, ctx(stubLlm({}))),
    (e) => e.code === 'TOOL_INVALID_INPUT'
  );
});

test('propose_requirements: nao autenticado -> TOOL_DENIED', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('forge.propose_requirements'), { brief: 'um produto de teste com brief suficiente' }, ctx(stubLlm({}), { authenticated: false })),
    (e) => e.code === 'TOOL_DENIED'
  );
});

test('propose_architecture: ADRs + waves a partir dos requisitos', async () => {
  const payload = { adrs: [{ title: 'Camadas', decision: 'route→service→repo', rationale: 'testável' }], waves: [{ id: 'w0-foundation', work_orders: ['Fundação'] }, { id: 'w1', work_orders: ['Abrir chamado'] }], notes: 'ok' };
  const out = await dispatchTool(reg.get('forge.propose_architecture'), { product: 'helpdesk', blueprint: 'node-api-vue-spa', requirements: [{ title: 'Fundação' }, { title: 'Abrir chamado' }] }, ctx(stubLlm(payload)));
  assert.equal(out.output.prompt_version, PROMPTS.proposeArchitecture.version);
  assert.equal(out.output.waves.length, 2);
  assert.equal(out.output.adrs[0].title, 'Camadas');
});

test('propose_architecture: requirements vazio -> TOOL_INVALID_INPUT', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('forge.propose_architecture'), { requirements: [] }, ctx(stubLlm({}))),
    (e) => e.code === 'TOOL_INVALID_INPUT'
  );
});

test('JSON invalido do modelo -> LLM_INVALID_JSON (sem fallback)', async () => {
  await assert.rejects(
    () => dispatchTool(reg.get('forge.propose_requirements'), { brief: 'um produto de teste com brief suficiente' }, ctx(stubLlm(null, { raw: 'nao consigo' }))),
    (e) => e.code === 'LLM_INVALID_JSON'
  );
});

test('registry de producao expõe autoria + forge juntos', () => {
  const full = createToolRegistry([...buildAuthoringTools(), ...buildForgeTools()]);
  assert.deepEqual(full.list().map((t) => t.name).sort(), [
    'forge.propose_architecture', 'forge.propose_requirements',
    'req.authoring.analyze', 'req.authoring.assist', 'req.authoring.draft', 'req.authoring.revise', 'req.authoring.suggest_links',
  ]);
});
