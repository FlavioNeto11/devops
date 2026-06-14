// llm.js — adapter de LLM da IA de autoria. Usa @flavioneto11/ai-core
// (createOpenAiLlm, contrato gpt-5 via ai-kit). O SDK `openai` e importado de
// forma PREGUICOSA: importar este modulo nao exige o pacote nem a key — so quando
// a IA esta de fato habilitada. Sem OPENAI_API_KEY -> getLlm() retorna null
// (as rotas respondem 503 AI_DISABLED). Isso mantem o pod no ar mesmo sem o secret.
import { createOpenAiLlm } from '@flavioneto11/ai-core';

export function aiEnabled() {
  return Boolean((process.env.OPENAI_API_KEY || '').trim());
}

export const DEFAULT_MODEL = () => process.env.REQHUB_AI_MODEL || 'gpt-5';

let _llm = null;

// Retorna o adapter (cacheado) ou null se a IA nao esta habilitada.
export async function getLlm() {
  if (!aiEnabled()) return null;
  if (_llm) return _llm;
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  _llm = createOpenAiLlm(client, { defaultModel: DEFAULT_MODEL() });
  return _llm;
}

// Apenas para testes: injeta um adapter stub (evita rede/SDK real).
export function __setLlmForTest(stub) {
  _llm = stub;
}
