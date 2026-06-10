import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateCostUsd, priceForModel, extractTokenUsage,
  createToolRegistry, dispatchTool,
  AiToolDeniedError, AiToolConfirmationRequiredError, AiToolInvalidInputError, AiToolError,
  createAiMetrics, createAiTracer,
  AI_KPIS, summarizeEvalKpis,
  parseGoldenSetJsonl, runEval,
} from '../src/index.js';

// ---------------------------------------------------------------- provider
test('estimateCostUsd usa a tabela default e env override', () => {
  const base = estimateCostUsd('gpt-5-nano', 1_000_000, 1_000_000);
  assert.equal(base, 0.05 + 0.4);
  process.env.AI_PRICE_IN_GPT_5_NANO = '1';
  try {
    assert.equal(priceForModel('gpt-5-nano').in, 1);
  } finally {
    delete process.env.AI_PRICE_IN_GPT_5_NANO;
  }
  assert.equal(estimateCostUsd('modelo-desconhecido', 1000, 1000), 0);
});

test('extractTokenUsage aceita formatos OpenAI e LangChain', () => {
  assert.deepEqual(extractTokenUsage({ prompt_tokens: 10, completion_tokens: 5 }), { inputTokens: 10, outputTokens: 5 });
  assert.deepEqual(extractTokenUsage({ input_tokens: 3, output_tokens: 7 }), { inputTokens: 3, outputTokens: 7 });
  assert.deepEqual(extractTokenUsage(null), { inputTokens: 0, outputTokens: 0 });
});

// ---------------------------------------------------------------- tools
const zLike = (validate) => ({ parse: (v) => { const r = validate(v); if (r !== true) throw new Error(r); return v; } });

function makeTool(over = {}) {
  return {
    name: 'list_items',
    description: 'lista itens',
    specialist: 'ops',
    risk: 'R1',
    mutates: false,
    supportsDryRun: false,
    inputSchema: zLike((v) => (v && typeof v.q === 'string' ? true : 'q obrigatorio')),
    authorize: async () => ({ allowed: true }),
    execute: async (input, ctx) => ({ ok: true, q: input.q, dryRun: ctx.dryRun }),
    ...over,
  };
}

test('dispatchTool R1: authorize + executa direto', async () => {
  const r = await dispatchTool(makeTool(), { q: 'abc' }, { identity: { sub: 'u1' } });
  assert.equal(r.status, 'executed');
  assert.equal(r.output.q, 'abc');
});

test('dispatchTool nega sem permissao (identidade)', async () => {
  const tool = makeTool({ authorize: async (ctx) => ({ allowed: ctx.identity?.sub === 'admin', reason: 'so admin' }) });
  await assert.rejects(() => dispatchTool(tool, { q: 'x' }, { identity: { sub: 'u1' } }), AiToolDeniedError);
  const ok = await dispatchTool(tool, { q: 'x' }, { identity: { sub: 'admin' } });
  assert.equal(ok.status, 'executed');
});

test('dispatchTool R3 sem confirmacao: dry-run vira preview; com confirmacao executa', async () => {
  const tool = makeTool({ name: 'update_item', risk: 'R3', mutates: true, supportsDryRun: true });
  const preview = await dispatchTool(tool, { q: 'x' }, { identity: { sub: 'u1' } });
  assert.equal(preview.status, 'preview');
  assert.equal(preview.output.dryRun, true);
  const real = await dispatchTool(tool, { q: 'x' }, { identity: { sub: 'u1' }, confirmedToolCallId: 'tc1' });
  assert.equal(real.status, 'executed');
  assert.equal(real.output.dryRun, false);
});

test('dispatchTool R3 sem dry-run: exige confirmacao; R4 idem', async () => {
  const noDry = makeTool({ name: 'mutate_nodry', risk: 'R3', mutates: true, supportsDryRun: false });
  await assert.rejects(() => dispatchTool(noDry, { q: 'x' }, {}), AiToolConfirmationRequiredError);
  const destr = makeTool({ name: 'cancel_all', risk: 'R4', mutates: true, supportsDryRun: true });
  const prev = await dispatchTool(destr, { q: 'x' }, {});
  assert.equal(prev.status, 'preview'); // R4 sem confirmacao: dry-run preview, nunca executa
  const real = await dispatchTool(destr, { q: 'x' }, { confirmedToolCallId: 'tc2' });
  assert.equal(real.status, 'executed');
});

test('dispatchTool valida input e shape da tool', async () => {
  await assert.rejects(() => dispatchTool(makeTool(), { nope: 1 }, {}), AiToolInvalidInputError);
  assert.throws(() => createToolRegistry([{ name: 'x' }]), AiToolError);
  assert.throws(() => createToolRegistry([makeTool({ risk: 'R3' })]), AiToolError); // R3 sem mutates
});

test('registry: duplicada e recorte por specialist', () => {
  const reg = createToolRegistry([makeTool(), makeTool({ name: 'other', specialist: 'finance' })]);
  assert.throws(() => reg.register(makeTool()), AiToolError);
  assert.deepEqual(reg.forSpecialist('finance').map((t) => t.name), ['other']);
  assert.equal(reg.get('list_items')?.name, 'list_items');
});

// ---------------------------------------------------------------- observability
test('createAiMetrics: no-op sem promClient; com fake registra', () => {
  const noop = createAiMetrics({});
  assert.equal(noop.enabled, false);
  noop.addTokens('gpt-5', 10, 5); // nao lanca

  const calls = [];
  const fake = (kind) => class { constructor(cfg) { this.cfg = cfg; } labels(...l) { return { observe: (v) => calls.push([kind, this.cfg.name, l, v]), inc: (v = 1) => calls.push([kind, this.cfg.name, l, v]) }; } };
  const m = createAiMetrics({ promClient: { Histogram: fake('h'), Counter: fake('c') }, app: 'sicat' });
  assert.equal(m.enabled, true);
  m.observeTurn('turn', 'ok', 1.5);
  m.addTokens('gpt-5', 100, 50);
  m.addCost('gpt-5', 0.01);
  m.countToolCall('list_items', 'executed');
  m.observeJudgeScore('groundedness', 0.9);
  assert.equal(calls.length, 6); // turn + 2 tokens + cost + tool + judge
  assert.ok(calls.every(([, name]) => name.startsWith('ai_')));
});

test('createAiTracer: spans cronometram e falha de telemetria nao propaga', async () => {
  const ended = [];
  const fakeLf = { trace: () => ({ span: ({ name }) => ({ end: (x) => ended.push([name, x]) }), update: () => { throw new Error('telemetria quebrada'); } }) };
  const tracer = createAiTracer({ langfuse: fakeLf, app: 'gymops' });
  const t = tracer.traceFor({ name: 'turn', sessionId: 's1' });
  const out = await t.span('router', {}, async () => 'fast');
  assert.equal(out, 'fast');
  t.end({ output: 'done' }); // update lanca por dentro — nao deve propagar
  assert.equal(ended.length, 1);
  await assert.rejects(() => t.span('tools', {}, async () => { throw Object.assign(new Error('boom'), { code: 'X' }); }));
});

// ---------------------------------------------------------------- kpi + eval
test('runEval: assertions, tool accuracy e judge mock; summarizeEvalKpis', async () => {
  const cases = parseGoldenSetJsonl([
    '# comentario',
    JSON.stringify({ id: 'c1', input: { q: 'atrasadas?' }, expected: { toolName: 'query_overdue', contains: ['atrasad'] }, judge: ['groundedness'] }),
    JSON.stringify({ id: 'c2', input: { q: 'oi' }, expected: { toolName: null, notContains: ['erro'] } }),
  ].join('\n'));
  assert.equal(cases.length, 2);

  const judgeClient = { chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"score":0.9,"reason":"ok"}' } }] }) } } };
  const res = await runEval(cases, {
    runner: async (c) => (c.id === 'c1'
      ? { text: 'Ha 3 atrasadas.', toolCalls: [{ name: 'query_overdue' }], evidence: { rows: 3 } }
      : { text: 'Ola!', toolCalls: [] }),
    judgeClient,
  });
  assert.equal(res.total, 2);
  assert.equal(res.passed, 2);
  assert.equal(res.toolCallAccuracy, 1);
  assert.ok(Math.abs(res.judgeAverages.groundedness - 0.9) < 1e-9);

  const kpis = summarizeEvalKpis(res);
  assert.equal(kpis.groundedness.ok, true);
  assert.equal(kpis.tool_call_accuracy.ok, true);
  assert.ok(AI_KPIS.cost_per_conversation.direction === 'down');
});

test('runEval: falha de assertion reprova o caso', async () => {
  const res = await runEval([{ id: 'f1', input: {}, expected: { contains: ['nunca-aparece'] } }], {
    runner: async () => ({ text: 'outra coisa' }),
  });
  assert.equal(res.failed, 1);
  assert.match(res.byCase[0].failures[0], /esperava conter/);
});
