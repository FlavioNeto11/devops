// llm-gemini.js — adapter ESTRUTURAL de LLM do Google Gemini para o grafo (ai-core).
// MESMO contrato de createOpenAiLlm/createAnthropicLlm: complete({...}) → { text, toolCalls,
// usage:{input_tokens,output_tokens}, raw }. Assim qualquer consumidor troca o provider sem
// mexer no grafo/tools. É PURAMENTE ADITIVO: não altera os caminhos OpenAI/Anthropic.
//
// Cliente estrutural = uma instância de `new GoogleGenerativeAI(apiKey)` (@google/generative-ai)
// — o app constrói com a chave e injeta aqui (fail-soft: sem chave, o app nem constrói o adapter).
//
// Conversões (OpenAI-style → Gemini):
//  - {role:system} → systemInstruction (concatenado);
//  - {role:user|assistant} → {role:'user'|'model', parts:[...]}; assistant vira 'model';
//  - {role:assistant, tool_calls} → parts [{functionCall:{name,args}}];
//  - {role:tool, tool_call_id, content} → turno 'user' com [{functionResponse:{name,response}}]
//    (Gemini não tem id de tool-call; o nome é derivado do id sintetizado `name#i`);
//  - multimodal: image → {inlineData:{mimeType,data}}; document(PDF) → inlineData nativo (Gemini lê PDF).

const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

function safeJsonParse(s) {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

// data URL "data:mime;base64,xxxx" → { mimeType, data }
function fromDataUrl(u) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(String(u || ''));
  return m ? { mimeType: m[1], data: m[2] } : null;
}

// content (string OU array de blocos) → parts do Gemini. Aceita blocos nativos
// ({type:'image',source},{type:'document',source},{type:'text'}) e o shape OpenAI
// ({type:'image_url',image_url:{url:'data:...'}}) e {dataBase64,mediaType}. Retrocompatível.
function toGeminiParts(content) {
  if (!Array.isArray(content)) return [{ text: String(content == null ? '' : content) }];
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') { parts.push({ text: String(b == null ? '' : b) }); continue; }
    if (b.type === 'text') { parts.push({ text: String(b.text == null ? '' : b.text) }); continue; }
    if (b.type === 'image') {
      const s = b.source;
      if (s && s.type === 'base64') parts.push({ inlineData: { mimeType: s.media_type, data: s.data } });
      else if (s && s.url) { const d = fromDataUrl(s.url); if (d) parts.push({ inlineData: d }); }
      else if (b.dataBase64) parts.push({ inlineData: { mimeType: b.mediaType, data: b.dataBase64 } });
      continue;
    }
    if (b.type === 'image_url') { const d = fromDataUrl(b.image_url && b.image_url.url); if (d) parts.push({ inlineData: d }); continue; }
    if (b.type === 'document') {
      const s = b.source;
      if (s && s.type === 'base64') parts.push({ inlineData: { mimeType: s.media_type || 'application/pdf', data: s.data } });
      else parts.push({ inlineData: { mimeType: b.mediaType || 'application/pdf', data: b.dataBase64 || b.data } });
      continue;
    }
  }
  return parts.length ? parts : [{ text: '' }];
}

/** Converte mensagens OpenAI-style em { systemInstruction, contents } do Gemini. */
export function toGeminiContents(messages = []) {
  const systemParts = [];
  const raw = []; // [{role:'user'|'model', parts:[...]}]
  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'system') { if (msg.content) systemParts.push(String(msg.content)); continue; }
    if (msg.role === 'tool') {
      const name = String(msg.tool_call_id || '').split('#')[0] || 'tool';
      const response = safeJsonParse(msg.content);
      raw.push({ role: 'user', parts: [{ functionResponse: { name, response: response && typeof response === 'object' && Object.keys(response).length ? response : { result: String(msg.content == null ? '' : msg.content) } } }] });
      continue;
    }
    if (msg.role === 'assistant') {
      const parts = [];
      if (msg.content) parts.push({ text: String(msg.content) });
      for (const tc of (msg.tool_calls || [])) {
        parts.push({ functionCall: { name: tc.function && tc.function.name, args: safeJsonParse(tc.function && tc.function.arguments) } });
      }
      raw.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      continue;
    }
    raw.push({ role: 'user', parts: toGeminiParts(msg.content) });
  }
  // funde turnos consecutivos do MESMO papel (Gemini alterna user/model)
  const merged = [];
  for (const t of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.parts.push(...t.parts);
    else merged.push({ role: t.role, parts: [...t.parts] });
  }
  // Gemini exige que o 1o turno seja 'user'
  if (merged.length && merged[0].role === 'model') merged.unshift({ role: 'user', parts: [{ text: '(contexto)' }] });
  return { systemInstruction: systemParts.join('\n\n'), contents: merged };
}

// Gemini aceita um SUBSET de JSON Schema (estilo OpenAPI). Remove chaves não suportadas
// ($schema, additionalProperties, etc.) e normaliza `type` p/ MAIÚSCULO (SchemaType).
const SCHEMA_KEEP = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'nullable', 'format']);
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'STRING' };
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!SCHEMA_KEEP.has(k)) continue;
    if (k === 'type') out.type = String(v).toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = sanitizeSchema(pv);
    } else if (k === 'items') out.items = sanitizeSchema(v);
    else out[k] = v;
  }
  if (!out.type) out.type = out.properties ? 'OBJECT' : 'STRING';
  return out;
}

/** AiTool (parameters JSON Schema) → functionDeclaration do Gemini. */
export function toGeminiTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchema(tool.parameters || { type: 'object', properties: {} }),
  };
}

/** toolChoice (OpenAI-style) → functionCallingConfig do Gemini. */
export function toGeminiToolConfig(toolChoice) {
  if (!toolChoice || toolChoice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
  if (toolChoice === 'required' || toolChoice === 'any') return { functionCallingConfig: { mode: 'ANY' } };
  if (typeof toolChoice === 'string') return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolChoice] } };
  if (toolChoice && toolChoice.function && toolChoice.function.name) return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolChoice.function.name] } };
  return { functionCallingConfig: { mode: 'AUTO' } };
}

/**
 * Adapter Gemini. `client` = instância de `new GoogleGenerativeAI(apiKey)`.
 * complete({ model, messages, tools?, toolChoice?, jsonMode?, maxTokens? })
 *   → { text, toolCalls:[{id,name,arguments}], usage:{input_tokens,output_tokens}, raw }
 */
export function createGeminiLlm(client, { defaultModel = GEMINI_DEFAULT_MODEL, defaultMaxTokens = 4096 } = {}) {
  if (!client || typeof client.getGenerativeModel !== 'function') {
    throw new Error('createGeminiLlm: client (new GoogleGenerativeAI(apiKey)) obrigatorio');
  }
  return {
    provider: 'google',
    model: defaultModel,
    async complete({ model, messages, tools, toolChoice, jsonMode, maxTokens } = {}) {
      const m = model || defaultModel;
      const { systemInstruction, contents } = toGeminiContents(messages);
      const generationConfig = { maxOutputTokens: maxTokens || defaultMaxTokens };
      if (jsonMode) generationConfig.responseMimeType = 'application/json';

      const genModel = client.getGenerativeModel({
        model: m,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(tools && tools.length ? { tools: [{ functionDeclarations: tools.map(toGeminiTool) }], toolConfig: toGeminiToolConfig(toolChoice) } : {}),
        generationConfig,
      });

      const res = await genModel.generateContent({ contents });
      const response = res.response;
      const parts = response?.candidates?.[0]?.content?.parts || [];

      let text = '';
      const toolCalls = [];
      parts.forEach((p, i) => {
        if (p == null) return;
        if (typeof p.text === 'string') text += p.text;
        if (p.functionCall) toolCalls.push({ id: `${p.functionCall.name}#${i}`, name: p.functionCall.name, arguments: p.functionCall.args || {} });
      });

      const um = response?.usageMetadata || {};
      const usage = { input_tokens: Number(um.promptTokenCount || 0), output_tokens: Number(um.candidatesTokenCount || 0) };
      return { text, toolCalls, usage, raw: response };
    },
  };
}
