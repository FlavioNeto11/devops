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
  assert.deepEqual(reg.list().map((t) => t.name).sort(), ['forge.propose_architecture', 'forge.propose_requirements', 'forge.propose_screens', 'forge.refine_screen']);
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

test('propose_requirements: tone simples usa a VARIANTE de prompt (C2) — mesmo schema de saída', async () => {
  const payload = { requirements: [
    { title: 'Avisos automáticos ao cliente', type: 'functional', statement: 'O sistema DEVE avisar o cliente por mensagem quando o pedido atrasar.', acceptance_criteria: ['mensagem enviada em atraso'], priority: 'high' },
  ], notes: '' };
  const out = await dispatchTool(reg.get('forge.propose_requirements'), { product: 'loja', brief: 'uma loja que avisa o cliente sobre o andamento do pedido', tone: 'simples' }, ctx(stubLlm(payload)));
  assert.equal(out.output.prompt_version, PROMPTS.proposeRequirementsSimples.version);
  assert.equal(out.output.prompt_version, 'forge-propose-requirements-simples@1');
  assert.equal(out.output.requirements.length, 1);
});

test('propose_requirements: tone ausente/desconhecido -> prompt técnico (retrocompat)', async () => {
  const payload = { requirements: [{ title: 'x', statement: 'O sistema DEVE x.' }], notes: '' };
  for (const tone of [undefined, 'tecnico', 'outro']) {
    const out = await dispatchTool(reg.get('forge.propose_requirements'), { product: 'loja', brief: 'um produto de teste com brief suficiente', ...(tone !== undefined ? { tone } : {}) }, ctx(stubLlm(payload)));
    assert.equal(out.output.prompt_version, PROMPTS.proposeRequirements.version, 'tone=' + tone);
  }
});

test('variante simples: MESMO contrato de schema e MESMA validação fail-closed de blocos', async () => {
  // o schema de saída declarado no prompt é o mesmo (só o TOM muda)
  for (const field of ['"requirements"', '"title"', '"statement"', '"acceptance_criteria"', '"capability_blocks"', 'DESCARTADO server-side']) {
    assert.ok(PROMPTS.proposeRequirementsSimples.system.includes(field), 'variante declara ' + field);
    assert.ok(PROMPTS.proposeRequirements.system.includes(field), 'técnico declara ' + field);
  }
  // e o corpo do user é EXATAMENTE o mesmo builder (grounding idêntico)
  const args = { product: 'p', blueprint: 'b', brief: 'brief x', catalog: 'catálogo y' };
  assert.equal(PROMPTS.proposeRequirementsSimples.user(args), PROMPTS.proposeRequirements.user(args));
  // fail-closed idêntico: bloco fora do catálogo é DESCARTADO também na variante
  const payload = { requirements: [{ title: 't', statement: 'O sistema DEVE t.', capability_blocks: ['oidc-sessao', 'bloco-inventado'] }] };
  const capabilities = [{ id: 'oidc-sessao', title: 'Login', description: 'x', compatible_stacks: ['sicat'] }];
  const out = await dispatchTool(reg.get('forge.propose_requirements'), { product: 'loja', brief: 'um produto de teste com brief suficiente', tone: 'simples', capabilities }, ctx(stubLlm(payload)));
  assert.deepEqual(out.output.requirements[0].capability_blocks, ['oidc-sessao']);
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
    'forge.propose_architecture', 'forge.propose_requirements', 'forge.propose_screens', 'forge.refine_screen',
    'req.authoring.analyze', 'req.authoring.analyze_refinement', 'req.authoring.assist', 'req.authoring.classify_change',
    'req.authoring.draft', 'req.authoring.draft_refinement', 'req.authoring.revise', 'req.authoring.revise_refinement', 'req.authoring.suggest_links',
  ]);
});
