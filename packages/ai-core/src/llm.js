// llm.js — adapter ESTRUTURAL de LLM para o grafo (ai-core/graph).
//
// O grafo fala com UM contrato — `llm.complete({...}) → { text, toolCalls, usage }` —
// e o app injeta a implementação. Aqui vai o adapter para o SDK nativo da OpenAI
// (cliente estrutural, mesmo padrão do ai-kit); um app LangChain pode fornecer o
// seu próprio adapter com a MESMA assinatura (é assim que o SICAT entra na F4).
// Mantém o contrato gpt-5 (reasoning_effort, sem temperature) via ai-kit.

import { buildChatParams } from '@flavioneto11/ai-kit';

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
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
    async complete({ model, messages, tools, toolChoice, jsonMode, reasoningEffort, maxTokens } = {}) {
      const m = model || defaultModel;
      const params = buildChatParams(m, { reasoningEffort, jsonMode });
      const res = await client.chat.completions.create({
        ...params,
        messages,
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
