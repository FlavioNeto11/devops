import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReasoningModel,
  buildChatParams,
  buildChatOpenAIArgs,
  resolveReasoningEffort,
  withTimeout,
  callWithFallback,
  AiTimeoutError,
  chatJSON,
  chatText,
} from '../src/index.js';

test('isReasoningModel: gpt-5* e o* sao reasoning; gpt-4o e embeddings nao', () => {
  assert.equal(isReasoningModel('gpt-5'), true);
  assert.equal(isReasoningModel('gpt-5-nano'), true);
  assert.equal(isReasoningModel('o1'), true);
  assert.equal(isReasoningModel('o3-mini'), true);
  assert.equal(isReasoningModel('gpt-4o-mini'), false);
  assert.equal(isReasoningModel('text-embedding-3-small'), false);
  assert.equal(isReasoningModel('  gpt-5  '), true); // trim
});

test('buildChatParams: reasoning OMITE temperature e seta reasoning_effort', () => {
  const p = buildChatParams('gpt-5', { reasoningEffort: 'low', temperature: 0.3, jsonMode: true });
  assert.equal('temperature' in p, false, 'nao deve enviar temperature p/ reasoning');
  assert.equal(p.reasoning_effort, 'low');
  assert.deepEqual(p.response_format, { type: 'json_object' });
});

test('buildChatParams: modelo comum aplica temperature, sem reasoning_effort', () => {
  const p = buildChatParams('gpt-4o-mini', { temperature: 0.3, jsonMode: true });
  assert.equal(p.temperature, 0.3);
  assert.equal('reasoning_effort' in p, false);
  assert.deepEqual(p.response_format, { type: 'json_object' });
});

test('buildChatOpenAIArgs: reasoning sem temperature + modelKwargs; comum com temperature 0', () => {
  const r = buildChatOpenAIArgs('gpt-5', 'sk-x', { reasoningEffort: 'minimal' });
  assert.equal('temperature' in r, false);
  assert.deepEqual(r.modelKwargs, { reasoning_effort: 'minimal' });
  const c = buildChatOpenAIArgs('gpt-4o', 'sk-x');
  assert.equal(c.temperature, 0);
  assert.equal('modelKwargs' in c, false);
});

test('resolveReasoningEffort: env vence; senao fallback', () => {
  delete process.env.OPENAI_REASONING_EFFORT;
  assert.equal(resolveReasoningEffort('low'), 'low');
  assert.equal(resolveReasoningEffort('minimal'), 'minimal');
  process.env.OPENAI_REASONING_EFFORT = 'high';
  assert.equal(resolveReasoningEffort('low'), 'high');
  delete process.env.OPENAI_REASONING_EFFORT;
});

test('withTimeout: rejeita com AiTimeoutError ao estourar', async () => {
  await assert.rejects(
    withTimeout(new Promise((res) => setTimeout(res, 50)), 5),
    (e) => e instanceof AiTimeoutError,
  );
  assert.equal(await withTimeout(Promise.resolve(42), 50), 42);
});

test('callWithFallback: fallback sem client, fallback no timeout, valor no sucesso', async () => {
  assert.equal(await callWithFallback(() => 1, 'fb', 50, null), 'fb');
  assert.equal(await callWithFallback(() => Promise.resolve('ok'), 'fb', 50, {}), 'ok');
  const slow = () => new Promise((res) => setTimeout(() => res('late'), 50));
  assert.equal(await callWithFallback(slow, 'fb', 5, {}), 'fb');
});

test('chatJSON: parseia JSON e envia params de reasoning corretos', async () => {
  let captured;
  const client = {
    chat: { completions: { create: async (args) => { captured = args; return { choices: [{ message: { content: '{"ok":true}' } }] }; } } },
  };
  const out = await chatJSON(client, 'oi', { model: 'gpt-5-nano', reasoningEffort: 'low' });
  assert.deepEqual(out, { ok: true });
  assert.equal('temperature' in captured, false);
  assert.equal(captured.reasoning_effort, 'low');
  assert.deepEqual(captured.response_format, { type: 'json_object' });
  assert.equal(captured.messages[0].content, 'oi');
});

test('chatText: retorna o texto da escolha', async () => {
  const client = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'resposta' } }] }) } },
  };
  assert.equal(await chatText(client, [{ role: 'user', content: 'x' }], { model: 'gpt-5-nano' }), 'resposta');
});
