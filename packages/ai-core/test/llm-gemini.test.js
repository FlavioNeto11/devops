import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeminiLlm, toGeminiContents, toGeminiTool, toGeminiToolConfig,
  createLlm, providerForModel, estimateCostUsd,
} from '../src/index.js';

// Mock do cliente @google/generative-ai: getGenerativeModel captura os args e generateContent
// devolve uma resposta canônica, capturando os contents recebidos.
function mockGemini(canned) {
  const cap = { modelArgs: null, contents: null };
  const client = {
    getGenerativeModel(args) {
      cap.modelArgs = args;
      return { async generateContent(req) { cap.contents = req.contents; return { response: canned }; } };
    },
  };
  return { client, cap };
}

test('providerForModel: gemini -> google', () => {
  assert.equal(providerForModel('gemini-2.0-flash'), 'google');
  assert.equal(providerForModel('gemini-1.5-pro'), 'google');
  assert.equal(providerForModel('models/gemini-2.0-flash'), 'google');
  // não regride os outros providers
  assert.equal(providerForModel('claude-sonnet-4-6'), 'anthropic');
  assert.equal(providerForModel('gpt-5'), 'openai');
});

test('estimateCostUsd: pricing do gemini presente', () => {
  const cost = estimateCostUsd('gemini-2.0-flash', 1_000_000, 1_000_000);
  assert.ok(cost > 0, 'custo do gemini deve ser > 0');
  assert.equal(cost, 0.1 + 0.4);
});

test('toGeminiTool: sanitiza schema (type MAIÚSCULO, remove additionalProperties/$schema)', () => {
  const t = toGeminiTool({
    name: 'search', description: 'busca',
    parameters: { type: 'object', additionalProperties: false, $schema: 'http://x', properties: { q: { type: 'string' } }, required: ['q'] },
  });
  assert.equal(t.name, 'search');
  assert.equal(t.parameters.type, 'OBJECT');
  assert.equal(t.parameters.additionalProperties, undefined);
  assert.equal(t.parameters.$schema, undefined);
  assert.equal(t.parameters.properties.q.type, 'STRING');
  assert.deepEqual(t.parameters.required, ['q']);
});

test('toGeminiToolConfig: auto/required/specific', () => {
  assert.deepEqual(toGeminiToolConfig('auto'), { functionCallingConfig: { mode: 'AUTO' } });
  assert.deepEqual(toGeminiToolConfig('required'), { functionCallingConfig: { mode: 'ANY' } });
  assert.deepEqual(toGeminiToolConfig('search'), { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['search'] } });
});

test('toGeminiContents: system->systemInstruction, assistant tool_calls->functionCall, tool->functionResponse', () => {
  const { systemInstruction, contents } = toGeminiContents([
    { role: 'system', content: 'A' },
    { role: 'system', content: 'B' },
    { role: 'user', content: 'q' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'noop#0', type: 'function', function: { name: 'noop', arguments: '{"x":1}' } }] },
    { role: 'tool', tool_call_id: 'noop#0', content: '{"r":5}' },
  ]);
  assert.equal(systemInstruction, 'A\n\nB');
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[0].parts[0].text, 'q');
  assert.equal(contents[1].role, 'model');
  assert.equal(contents[1].parts[0].functionCall.name, 'noop');
  assert.deepEqual(contents[1].parts[0].functionCall.args, { x: 1 });
  assert.equal(contents[2].role, 'user');
  assert.equal(contents[2].parts[0].functionResponse.name, 'noop');
  assert.deepEqual(contents[2].parts[0].functionResponse.response, { r: 5 });
});

test('toGeminiContents: injeta user inicial se começar com model', () => {
  const { contents } = toGeminiContents([{ role: 'assistant', content: 'oi' }]);
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[1].role, 'model');
});

test('createGeminiLlm.complete: mapeia resposta (text + functionCall + usage) e monta o request', async () => {
  const canned = {
    candidates: [{ content: { parts: [{ text: 'Olá.' }, { functionCall: { name: 'noop', args: { a: 1 } } }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
  };
  const { client, cap } = mockGemini(canned);
  const llm = createGeminiLlm(client, { defaultModel: 'gemini-2.0-flash' });
  const out = await llm.complete({
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'oi' }],
    tools: [{ name: 'noop', description: 'x', parameters: { type: 'object', properties: {} } }],
    toolChoice: 'auto', jsonMode: true, maxTokens: 256,
  });
  assert.equal(out.text, 'Olá.');
  assert.equal(out.toolCalls[0].name, 'noop');
  assert.equal(out.toolCalls[0].id, 'noop#1');
  assert.deepEqual(out.toolCalls[0].arguments, { a: 1 });
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
  // request
  assert.equal(cap.modelArgs.model, 'gemini-2.0-flash');
  assert.equal(cap.modelArgs.systemInstruction, 'sys');
  assert.equal(cap.modelArgs.tools[0].functionDeclarations[0].name, 'noop');
  assert.equal(cap.modelArgs.generationConfig.responseMimeType, 'application/json');
  assert.equal(cap.modelArgs.generationConfig.maxOutputTokens, 256);
  assert.equal(cap.contents[0].role, 'user');
  assert.equal(cap.contents[0].parts[0].text, 'oi');
});

test('createGeminiLlm: multimodal (image_url + document) -> inlineData', async () => {
  const { client, cap } = mockGemini({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: {} });
  const llm = createGeminiLlm(client);
  await llm.complete({
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'veja' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      { type: 'document', mediaType: 'application/pdf', dataBase64: 'BBBB' },
    ] }],
  });
  const parts = cap.contents[0].parts;
  assert.equal(parts[0].text, 'veja');
  assert.equal(parts[1].inlineData.mimeType, 'image/png');
  assert.equal(parts[1].inlineData.data, 'AAAA');
  assert.equal(parts[2].inlineData.mimeType, 'application/pdf');
  assert.equal(parts[2].inlineData.data, 'BBBB');
});

test('createLlm: factory escolhe o adapter gemini por provider', () => {
  const stub = { getGenerativeModel: () => ({ generateContent: async () => ({ response: {} }) }) };
  assert.equal(createLlm({ provider: 'google', client: stub }).provider, 'google');
  assert.equal(createLlm({ provider: 'gemini', client: stub }).provider, 'google');
});
