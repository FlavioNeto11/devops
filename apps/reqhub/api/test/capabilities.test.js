import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTool, createToolRegistry } from '@flavioneto11/ai-core';
import { buildForgeTools } from '../src/tools.js';
import { summarizeForPrompt, catalogIndex, filterKnownBlocks, validateSelection } from '../src/capabilities.js';

// catálogo de teste (subconjunto do real, com deps + conflito + incompatibilidade de stack)
const CATALOG = [
  { id: 'camadas-rigidas', title: 'Camadas', description: 'route→service→repo', category: 'architecture', compatible_stacks: ['sicat', 'gymops'], requires: [], conflicts_with: [] },
  { id: 'observabilidade', title: 'Observabilidade', description: 'health+metrics', category: 'observability', compatible_stacks: ['sicat', 'gymops'], requires: [], conflicts_with: [] },
  { id: 'worker-queue-transacional', title: 'Worker fila', description: 'fila Postgres SKIP LOCKED', category: 'async', compatible_stacks: ['sicat', 'gymops'], requires: ['camadas-rigidas'], conflicts_with: ['redis-bullmq'] },
  { id: 'redis-bullmq', title: 'Redis/BullMQ', description: 'fila Redis', category: 'async', compatible_stacks: ['gymops'], requires: [], conflicts_with: ['worker-queue-transacional'] },
];
const BLUEPRINTS = [
  { id: 'node-api-vue-spa', base_stack: 'sicat', name: 'SICAT-style', default_blocks: ['camadas-rigidas', 'observabilidade'], compatible_blocks: ['worker-queue-transacional'] },
  { id: 'gymops-style', base_stack: 'gymops', name: 'GymOps-style', default_blocks: ['camadas-rigidas', 'observabilidade', 'redis-bullmq'], compatible_blocks: ['worker-queue-transacional'] },
];

// --- helpers puros -----------------------------------------------------------
test('summarizeForPrompt: lista por stack + marca default/compatível', () => {
  const s = summarizeForPrompt(CATALOG, { stack: 'sicat', defaultBlocks: ['camadas-rigidas'], compatibleBlocks: ['worker-queue-transacional'] });
  assert.match(s, /camadas-rigidas .*\[default\]/);
  assert.match(s, /worker-queue-transacional .*\[compatível\]/);
  assert.doesNotMatch(s, /redis-bullmq/); // incompatível com sicat -> fora
});

test('filterKnownBlocks: dropa id fora do catálogo (fail-closed)', () => {
  const { ids } = catalogIndex(CATALOG);
  const r = filterKnownBlocks(['observabilidade', 'fantasma'], ids);
  assert.deepEqual(r.kept, ['observabilidade']);
  assert.equal(r.dropped[0].id, 'fantasma');
});

test('validateSelection: inclui defaults, puxa requires, dropa incompatível e resolve conflito', () => {
  // sicat: pede worker (compatível) -> puxa camadas-rigidas (requires) + observabilidade (default)
  const a = validateSelection(['worker-queue-transacional'], { stack: 'sicat', capabilities: CATALOG, defaultBlocks: ['camadas-rigidas', 'observabilidade'], compatibleBlocks: ['worker-queue-transacional'] });
  assert.ok(a.valid.includes('worker-queue-transacional') && a.valid.includes('camadas-rigidas') && a.valid.includes('observabilidade'));
  // redis em sicat -> dropado por incompatibilidade
  const b = validateSelection(['redis-bullmq'], { stack: 'sicat', capabilities: CATALOG, defaultBlocks: ['camadas-rigidas'], compatibleBlocks: ['worker-queue-transacional'] });
  assert.ok(!b.valid.includes('redis-bullmq'));
  assert.ok(b.dropped.some((d) => d.id === 'redis-bullmq'));
  // bloco fantasma -> dropado
  const c = validateSelection(['naoexiste'], { stack: 'sicat', capabilities: CATALOG, defaultBlocks: [], compatibleBlocks: [] });
  assert.ok(c.dropped.some((d) => d.id === 'naoexiste'));
});

// --- tools fail-closed --------------------------------------------------------
const stubLlm = (payload) => ({ async complete() { return { text: JSON.stringify(payload), usage: { total_tokens: 9 } }; } });
const reg = createToolRegistry(buildForgeTools());
const ctx = (llm) => ({ llm, authenticated: true, identity: 'operator' });

test('propose_requirements: filtra capability_blocks ao catálogo (descarta fantasma)', async () => {
  const payload = { requirements: [{ title: 'Fila', type: 'functional', statement: 'O sistema DEVE enfileirar', acceptance_criteria: ['ok'], priority: 'high', capability_blocks: ['worker-queue-transacional', 'fantasma'], rationale: 'x' }], notes: '' };
  const out = await dispatchTool(reg.get('forge.propose_requirements'), { product: 'ops', blueprint: 'node-api-vue-spa', brief: 'sistema de ops com fila assincrona', capabilities: CATALOG, blueprints: BLUEPRINTS }, ctx(stubLlm(payload)));
  assert.deepEqual(out.output.requirements[0].capability_blocks, ['worker-queue-transacional']);
});

test('propose_architecture: valida stack + dropa bloco incompatível + mantém defaults', async () => {
  const payload = { stack: 'sicat', blueprint: 'node-api-vue-spa', selected_blocks: [{ id: 'worker-queue-transacional', requirement_titles: ['Fila'] }, { id: 'redis-bullmq', requirement_titles: [] }], adrs: [], waves: [{ id: 'w0-foundation', work_orders: ['Fundação'], depends_on: [] }], notes: '' };
  const out = await dispatchTool(reg.get('forge.propose_architecture'), { product: 'ops', blueprint: 'node-api-vue-spa', requirements: [{ title: 'Fila' }], capabilities: CATALOG, blueprints: BLUEPRINTS }, ctx(stubLlm(payload)));
  assert.equal(out.output.stack, 'sicat');
  const ids = out.output.selected_blocks.map((s) => s.id);
  assert.ok(ids.includes('worker-queue-transacional'));
  assert.ok(ids.includes('camadas-rigidas') && ids.includes('observabilidade')); // defaults + requires
  assert.ok(!ids.includes('redis-bullmq')); // incompatível com sicat -> dropado
});

test('propose_architecture: stack inválida com catálogo -> FORGE_INVALID_SELECTION', async () => {
  const payload = { stack: 'flask', selected_blocks: [], adrs: [], waves: [], notes: '' };
  await assert.rejects(
    () => dispatchTool(reg.get('forge.propose_architecture'), { product: 'ops', requirements: [{ title: 'x' }], capabilities: CATALOG, blueprints: BLUEPRINTS }, ctx(stubLlm(payload))),
    (e) => e.code === 'FORGE_INVALID_SELECTION'
  );
});
