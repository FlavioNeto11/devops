// node --test — adaptadores multimodais (E0b). Caminho STRING inalterado (retrocompat) +
// passthrough de blocos (Anthropic image/document; OpenAI image_url + drop de document).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAnthropicMessages } from './src/llm-anthropic.js';
import { openaiifyContent } from './src/llm.js';

test('anthropic: content string -> inalterado', () => {
  const { messages } = toAnthropicMessages([{ role: 'user', content: 'oi' }]);
  assert.deepEqual(messages, [{ role: 'user', content: 'oi' }]);
});

test('anthropic: array com imagem nativa -> bloco image', () => {
  const { messages } = toAnthropicMessages([{ role: 'user', content: [{ type: 'text', text: 'q' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }] }]);
  assert.ok(Array.isArray(messages[0].content));
  assert.ok(messages[0].content.some((b) => b.type === 'image' && b.source.data === 'AAA'));
  assert.ok(messages[0].content.some((b) => b.type === 'text' && b.text === 'q'));
});

test('anthropic: image_url (shape OpenAI) -> image base64', () => {
  const { messages } = toAnthropicMessages([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,XYZ' } }] }]);
  assert.ok(messages[0].content.some((b) => b.type === 'image' && b.source.type === 'base64' && b.source.data === 'XYZ' && b.source.media_type === 'image/jpeg'));
});

test('anthropic: document (PDF) passthrough', () => {
  const { messages } = toAnthropicMessages([{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'PDF' } }] }]);
  assert.ok(messages[0].content.some((b) => b.type === 'document' && b.source.data === 'PDF'));
});

test('anthropic: tool/assistant inalterados (regressão)', () => {
  const { messages } = toAnthropicMessages([
    { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'foo', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'res' },
  ]);
  assert.ok(messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')));
  assert.ok(messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')));
});

test('openai: string content -> inalterado', () => {
  assert.equal(openaiifyContent('oi'), 'oi');
});

test('openai: image nativo -> image_url; document DROPADO', () => {
  const out = openaiifyContent([
    { type: 'text', text: 'q' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'PDF' } },
  ]);
  assert.ok(out.some((b) => b.type === 'image_url' && b.image_url.url === 'data:image/png;base64,AAA'));
  assert.ok(!out.some((b) => b.type === 'document'));
  assert.ok(out.some((b) => b.type === 'text' && b.text === 'q'));
});

test('openai: image_url passa direto', () => {
  const out = openaiifyContent([{ type: 'image_url', image_url: { url: 'https://x/y.png' } }]);
  assert.ok(out.some((b) => b.type === 'image_url' && b.image_url.url === 'https://x/y.png'));
});
