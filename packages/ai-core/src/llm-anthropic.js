// llm-anthropic.js — adapter ESTRUTURAL de LLM da Anthropic (Claude) para o grafo (ai-core).
// MESMO contrato do createOpenAiLlm: complete({...}) → { text, toolCalls, usage, raw }, então
// qualquer consumidor (sicat/gymops/reqhub) troca o provider sem mexer no grafo/tools.
// Cliente estrutural = uma instância do SDK @anthropic-ai/sdk (ou compatível .messages.create).
//
// Conversões (OpenAI-style → Anthropic Messages):
//  - mensagens {role:system} → param `system` (concatenado);
//  - {role:user|assistant, content} → bloco de texto;
//  - {role:assistant, tool_calls} → blocos {type:tool_use, id, name, input};
//  - {role:tool, tool_call_id, content} → mensagem USER com {type:tool_result, tool_use_id, content};
//  - mensagens consecutivas do MESMO papel são FUNDIDAS (exigência da API da Anthropic).

function safeJsonParse(s) {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

// content de usuário pode ser STRING ou ARRAY de blocos (multimodal). Converte para blocos da
// Anthropic, aceitando blocos nativos ({type:'image',source}/{type:'document',source}/{type:'text'})
// E o shape OpenAI ({type:'image_url', image_url:{url:'data:...;base64,...'}}). Retrocompatível.
function toAnthropicUserBlocks(content) {
  if (!Array.isArray(content)) return [{ type: 'text', text: String(content == null ? '' : content) }];
  const dataUrl = (u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(String(u || '')); return m ? { type: 'base64', media_type: m[1], data: m[2] } : null; };
  return content.map((b) => {
    if (!b || typeof b !== 'object') return { type: 'text', text: String(b == null ? '' : b) };
    if (b.type === 'text') return { type: 'text', text: String(b.text == null ? '' : b.text) };
    if (b.type === 'image') return { type: 'image', source: b.source || dataUrl(b.image_url && b.image_url.url) || { type: 'base64', media_type: b.mediaType, data: b.dataBase64 } };
    if (b.type === 'image_url') { const s = dataUrl(b.image_url && b.image_url.url); return s ? { type: 'image', source: s } : { type: 'text', text: '' }; }
    if (b.type === 'document') return { type: 'document', source: b.source || { type: 'base64', media_type: b.mediaType || 'application/pdf', data: b.dataBase64 || b.data } };
    return { type: 'text', text: '' };
  });
}

/** AiTool (parameters JSON Schema) → tool da Anthropic. */
export function toAnthropicTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: 'object', properties: {} },
  };
}

/** toolChoice (OpenAI-style) → tool_choice da Anthropic. */
export function toAnthropicToolChoice(toolChoice) {
  if (!toolChoice || toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'required' || toolChoice === 'any') return { type: 'any' };
  if (typeof toolChoice === 'string') return { type: 'tool', name: toolChoice };
  if (toolChoice && toolChoice.function && toolChoice.function.name) return { type: 'tool', name: toolChoice.function.name };
  return { type: 'auto' };
}

/** Converte um array de mensagens OpenAI-style em { system, messages } da Anthropic. */
export function toAnthropicMessages(messages = []) {
  const systemParts = [];
  const raw = []; // [{role, blocks:[...]}]
  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'system') { if (msg.content) systemParts.push(String(msg.content)); continue; }
    if (msg.role === 'tool') {
      // resultado de tool → mensagem USER com bloco tool_result
      raw.push({ role: 'user', blocks: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: String(msg.content == null ? '' : msg.content) }] });
      continue;
    }
    if (msg.role === 'assistant') {
      const blocks = [];
      if (msg.content) blocks.push({ type: 'text', text: String(msg.content) });
      for (const tc of (msg.tool_calls || [])) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function && tc.function.name, input: safeJsonParse(tc.function && tc.function.arguments) });
      }
      raw.push({ role: 'assistant', blocks: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      continue;
    }
    // user (ou qualquer outro) → texto OU blocos multimodais (imagem/document)
    raw.push({ role: 'user', blocks: toAnthropicUserBlocks(msg.content) });
  }
  // funde mensagens consecutivas do MESMO papel
  const merged = [];
  for (const m of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.blocks.push(...m.blocks);
    else merged.push({ role: m.role, blocks: [...m.blocks] });
  }
  // a Anthropic exige que a 1ª mensagem seja do usuário; se começar com assistant, injeta um user vazio
  if (merged.length && merged[0].role === 'assistant') merged.unshift({ role: 'user', blocks: [{ type: 'text', text: '(contexto)' }] });
  // simplifica: bloco único de texto → string
  const out = merged.map((m) => {
    if (m.blocks.length === 1 && m.blocks[0].type === 'text') return { role: m.role, content: m.blocks[0].text };
    return { role: m.role, content: m.blocks };
  });
  return { system: systemParts.join('\n\n'), messages: out };
}

/**
 * Adapter Anthropic. `client` = instância do SDK (@anthropic-ai/sdk).
 * complete({ model, messages, tools?, toolChoice?, jsonMode?, maxTokens? })
 *   → { text, toolCalls: [{id,name,arguments}], usage:{input_tokens,output_tokens}, raw }
 */
export function createAnthropicLlm(client, { defaultModel = 'claude-sonnet-4-6', defaultMaxTokens = 4096 } = {}) {
  if (!client) throw new Error('createAnthropicLlm: client obrigatorio');
  return {
    provider: 'anthropic',
    model: defaultModel,
    async complete({ model, messages, tools, toolChoice, jsonMode, maxTokens } = {}) {
      const m = model || defaultModel;
      const { system, messages: amsgs } = toAnthropicMessages(messages);
      let sys = system;
      // Anthropic não tem json_object nativo — instrução fail-soft p/ saída JSON pura.
      if (jsonMode) sys = (sys ? sys + '\n\n' : '') + 'Responda APENAS com um JSON válido, sem texto fora do JSON.';
      const req = {
        model: m,
        max_tokens: maxTokens || defaultMaxTokens,
        messages: amsgs,
        ...(sys ? { system: sys } : {}),
        ...(tools && tools.length ? { tools: tools.map(toAnthropicTool), tool_choice: toAnthropicToolChoice(toolChoice) } : {}),
      };
      const res = await client.messages.create(req);
      const content = Array.isArray(res.content) ? res.content : [];
      const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolCalls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, arguments: b.input || {} }));
      const usage = res.usage ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } : null;
      return { text, toolCalls, usage, raw: res };
    },
  };
}
