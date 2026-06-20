import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnthropicLlm, toAnthropicMessages, toAnthropicTool, toAnthropicToolChoice, createLlm, providerForModel, createAiMetrics,
} from '../src/index.js';

test('providerForModel deriva o provider pelo nome', () => {
  assert.equal(providerForModel('claude-sonnet-4-6'), 'anthropic');
  assert.equal(providerForModel('gpt-5'), 'openai');
  assert.equal(providerForModel('o3-mini'), 'openai');
  assert.equal(providerForModel('llama'), 'unknown');
});

test('toAnthropicTool / toAnthropicToolChoice', () => {
  const t = toAnthropicTool({ name: 'search', description: 'busca', parameters: { type: 'object', properties: { q: { type: 'string' } } } });
  assert.equal(t.name, 'search');
  assert.equal(t.input_schema.properties.q.type, 'string');
  assert.deepEqual(toAnthropicToolChoice('auto'), { type: 'auto' });
  assert.deepEqual(toAnthropicToolChoice('required'), { type: 'any' });
  assert.deepEqual(toAnthropicToolChoice('search'), { type: 'tool', name: 'search' });
});

test('toAnthropicMessages: system separado, tool_calls→tool_use, tool→tool_result, merge consecutivo', () => {
  const { system, messages } = toAnthropicMessages([
    { role: 'system', content: 'Você é um assistente.' },
    { role: 'system', content: 'Seja conciso.' },
    { role: 'user', content: 'Quantos pods?' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'count_pods', arguments: '{"ns":"apps"}' } }] },
    { role: 'tool', tool_call_id: 'tc1', content: '12' },
    { role: 'tool', tool_call_id: 'tc1b', content: 'extra' },
  ]);
  assert.equal(system, 'Você é um assistente.\n\nSeja conciso.');
  // [0] user texto; [1] assistant com tool_use; [2] user com 2 tool_result (merge)
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'Quantos pods?');
  assert.equal(messages[1].role, 'assistant');
  assert.equal(messages[1].content[0].type, 'tool_use');
  assert.equal(messages[1].content[0].name, 'count_pods');
  assert.deepEqual(messages[1].content[0].input, { ns: 'apps' });
  assert.equal(messages[2].role, 'user');
  assert.equal(messages[2].content.length, 2);
  assert.equal(messages[2].content[0].type, 'tool_result');
  assert.equal(messages[2].content[0].tool_use_id, 'tc1');
});

test('toAnthropicMessages: injeta user inicial se começar com assistant', () => {
  const { messages } = toAnthropicMessages([{ role: 'assistant', content: 'oi' }]);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
});

test('createAnthropicLlm.complete: mapeia resposta (text + tool_use + usage) no contrato', async () => {
  let captured = null;
  const client = { messages: { async create(req) { captured = req; return {
    content: [{ type: 'text', text: 'Tem 12 pods.' }, { type: 'tool_use', id: 'u1', name: 'noop', input: { a: 1 } }],
    usage: { input_tokens: 100, output_tokens: 20 },
  }; } } };
  const llm = createAnthropicLlm(client, { defaultModel: 'claude-sonnet-4-6' });
  const out = await llm.complete({
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'oi' }],
    tools: [{ name: 'noop', description: 'x', parameters: { type: 'object', properties: {} } }],
    toolChoice: 'auto', maxTokens: 256,
  });
  assert.equal(out.text, 'Tem 12 pods.');
  assert.equal(out.toolCalls[0].name, 'noop');
  assert.deepEqual(out.toolCalls[0].arguments, { a: 1 });
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
  // request montado corretamente
  assert.equal(captured.model, 'claude-sonnet-4-6');
  assert.equal(captured.max_tokens, 256);
  assert.equal(captured.system, 'sys');
  assert.equal(captured.tools[0].name, 'noop');
  assert.deepEqual(captured.tool_choice, { type: 'auto' });
});

test('createLlm: factory escolhe o adapter por provider', () => {
  const stub = { messages: { create: async () => ({}) }, chat: { completions: { create: async () => ({}) } } };
  assert.equal(createLlm({ provider: 'anthropic', client: stub }).provider, 'anthropic');
  // OpenAI adapter não expõe .provider; basta ter .complete
  assert.equal(typeof createLlm({ provider: 'openai', client: stub }).complete, 'function');
});

test('createAiMetrics: addCost/addTokens auto-preenchem o label provider (não quebra a assinatura)', () => {
  // sem promClient -> no-op enabled:false; valida só que as chamadas não lançam
  const m = createAiMetrics({});
  assert.doesNotThrow(() => { m.addCost('claude-sonnet-4-6', 0.01); m.addTokens('gpt-5', 100, 20); });
});
