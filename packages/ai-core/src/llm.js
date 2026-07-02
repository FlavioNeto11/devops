// llm.js — adapter ESTRUTURAL de LLM para o grafo (ai-core/graph).
//
// O grafo fala com UM contrato — `llm.complete({...}) → { text, toolCalls, usage }` —
// e o app injeta a implementação. Aqui vai o adapter para o SDK nativo da OpenAI
// (cliente estrutural, mesmo padrão do ai-kit); um app LangChain pode fornecer o
// seu próprio adapter com a MESMA assinatura (é assim que o SICAT entra na F4).
// Mantém o contrato gpt-5 (reasoning_effort, sem temperature) via ai-kit.

import { buildChatParams } from '@flavioneto11/ai-kit';
import { createAnthropicLlm } from './llm-anthropic.js';
import { createGeminiLlm } from './llm-gemini.js';

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

// content multimodal -> shape OpenAI: mantém text + image_url; converte image nativo (Anthropic/kit)
// em image_url (data URL); DESCARTA document (OpenAI não tem PDF nativo — o texto já vai no bundle).
export function openaiifyContent(content) {
  if (!Array.isArray(content)) return content;
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') { out.push({ type: 'text', text: String(b == null ? '' : b) }); continue; }
    if (b.type === 'text') out.push({ type: 'text', text: String(b.text == null ? '' : b.text) });
    else if (b.type === 'image_url') out.push(b);
    else if (b.type === 'image') {
      const s = b.source;
      if (s && s.type === 'base64') out.push({ type: 'image_url', image_url: { url: `data:${s.media_type};base64,${s.data}` } });
      else if (s && s.url) out.push({ type: 'image_url', image_url: { url: s.url } });
      else if (b.dataBase64) out.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.dataBase64}` } });
    }
    // document: ignorado (sem PDF nativo na OpenAI)
  }
  return out;
}

/**
 * Factory PROVIDER-AGNÓSTICA: devolve o adapter certo a partir do provider + cliente já
 * construído pelo app (com a chave/credencial). `provider` 'anthropic' → Claude; senão OpenAI.
 * Mantém o MESMO contrato complete({...}) → { text, toolCalls, usage } p/ o grafo não saber a diferença.
 */
export function createLlm({ provider, client, defaultModel } = {}) {
  const p = String(provider || '').toLowerCase();
  if (p === 'anthropic') return createAnthropicLlm(client, defaultModel ? { defaultModel } : {});
  if (p === 'google' || p === 'gemini') return createGeminiLlm(client, defaultModel ? { defaultModel } : {});
  return createOpenAiLlm(client, defaultModel ? { defaultModel } : {});
}

/** Converte uma AiTool (com `parameters` JSON Schema) para o formato OpenAI. */
export function toOpenAiToolDef(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  };
}

/**
 * Adapter OpenAI (SDK nativo, cliente estrutural).
 * complete({ model, messages, tools?, toolChoice?, jsonMode?, reasoningEffort?, maxTokens? })
 *   → { text, toolCalls: [{id,name,arguments}], usage, raw }
 */
export function createOpenAiLlm(client, { defaultModel = 'gpt-5-nano' } = {}) {
  if (!client) throw new Error('createOpenAiLlm: client obrigatorio');
  return {
    provider: 'openai',
    model: defaultModel,
    async complete({ model, messages, tools, toolChoice, jsonMode, reasoningEffort, maxTokens } = {}) {
      const m = model || defaultModel;
      const params = buildChatParams(m, { reasoningEffort, jsonMode });
      const safeMessages = (messages || []).map((msg) => (msg && Array.isArray(msg.content) ? { ...msg, content: openaiifyContent(msg.content) } : msg));
      const res = await client.chat.completions.create({
        ...params,
        messages: safeMessages,
        ...(tools?.length ? { tools: tools.map(toOpenAiToolDef), tool_choice: toolChoice || 'auto' } : {}),
        ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      });
      const choice = res.choices?.[0]?.message || {};
      return {
        text: choice.content || '',
        toolCalls: (choice.tool_calls || []).map((tc) => ({
          id: tc.id,
          name: tc.function?.name,
          arguments: safeJsonParse(tc.function?.arguments || '{}'),
        })),
        usage: res.usage || null,
        raw: choice,
      };
    },
  };
}
