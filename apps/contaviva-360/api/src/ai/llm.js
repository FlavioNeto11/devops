// ai/llm.js — Adaptador LLM via fetch nativo (sem SDK externo). Suporta OpenAI e Anthropic.
// Fail-closed: sem chave → getLlm() retorna null; o caller responde 503.
// Embeddings sempre via OpenAI (Anthropic não expõe /embeddings).
import { AiToolError } from '@flavioneto11/ai-core';

let _llm = null;
let _provider = null;

export function aiProvider() {
  if (_provider) return _provider;
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
}

export const DEFAULT_MODEL = () =>
  process.env.CONTAVIVA_AI_MODEL ||
  (aiProvider() === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini');

const CHEAP_MODEL = () =>
  aiProvider() === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';

// Converte AiTool → OpenAI function definition
const toOAITool = (t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
});

// Converte AiTool → Anthropic tool definition
const toAnthrTool = (t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters || { type: 'object', properties: {} },
});

// Converte messages (OpenAI-style) para Anthropic format
function toAnthrMessages(messages) {
  let system = '';
  const msgs = [];
  for (const m of messages || []) {
    if (m.role === 'system') { system += (system ? '\n\n' : '') + String(m.content || ''); continue; }
    if (m.role === 'tool') {
      // Tool result: Anthropic usa role:user com content:tool_result
      msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || m.tool_use_id || '', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] });
    } else {
      msgs.push(m);
    }
  }
  return { system, messages: msgs };
}

function createOpenAiHttpLlm({ apiKey, defaultModel }) {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  async function complete({ model, messages, tools, toolChoice, jsonMode, maxTokens = 2048 } = {}) {
    const body = { model: model || defaultModel, messages, max_tokens: maxTokens };
    if (tools && tools.length) {
      body.tools = tools.map(toOAITool);
      body.tool_choice = toolChoice || 'auto';
    }
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || res.statusText;
      throw Object.assign(new AiToolError('LLM_ERROR', `OpenAI ${res.status}: ${msg}`), { status: res.status });
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    const toolCalls = (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name || '',
      arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
    }));
    return { text: msg.content || '', toolCalls, usage: data.usage || {}, raw: data };
  }
  return { provider: 'openai', model: defaultModel, complete };
}

function createAnthropicHttpLlm({ apiKey, defaultModel }) {
  async function complete({ model, messages, tools, toolChoice, maxTokens = 2048 } = {}) {
    const { system, messages: msgs } = toAnthrMessages(messages);
    const body = { model: model || defaultModel, max_tokens: maxTokens, messages: msgs };
    if (system) body.system = system;
    if (tools && tools.length) {
      body.tools = tools.map(toAnthrTool);
      body.tool_choice = { type: toolChoice === 'none' ? 'auto' : 'auto' };
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || res.statusText;
      throw Object.assign(new AiToolError('LLM_ERROR', `Anthropic ${res.status}: ${msg}`), { status: res.status });
    }
    const data = await res.json();
    let text = '';
    const toolCalls = [];
    for (const block of data.content || []) {
      if (block.type === 'text') text += block.text || '';
      if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} });
    }
    return { text, toolCalls, usage: data.usage || {}, raw: data };
  }
  return { provider: 'anthropic', model: defaultModel, complete };
}

export async function getLlm() {
  if (_llm) return _llm;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (anthropicKey) {
    _llm = createAnthropicHttpLlm({ apiKey: anthropicKey, defaultModel: DEFAULT_MODEL() });
    _provider = 'anthropic';
  } else if (openaiKey) {
    _llm = createOpenAiHttpLlm({ apiKey: openaiKey, defaultModel: DEFAULT_MODEL() });
    _provider = 'openai';
  }
  return _llm;
}

export function __resetLlmForTest() { _llm = null; _provider = null; }

export { CHEAP_MODEL };

// Embedder via OpenAI /embeddings (Anthropic não expõe embeddings)
let _embedder = null;
export async function getEmbedder() {
  if (_embedder) return _embedder;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.CONTAVIVA_EMBED_MODEL || 'text-embedding-3-small';
  _embedder = {
    model,
    dimensions: 1536,
    async embedTexts(texts) {
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`Embed error ${res.status}`);
      const data = await res.json();
      return (data.data || []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
    async embedQuery(text) { return (await this.embedTexts([String(text)]))[0]; },
  };
  return _embedder;
}
