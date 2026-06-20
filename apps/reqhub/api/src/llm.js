// llm.js — adapter de LLM da IA de autoria, PROVIDER-AGNÓSTICO (OpenAI | Anthropic).
// AI_PROVIDER=anthropic → Claude (SDK @anthropic-ai). Token de ASSINATURA do Claude Code
// (ANTHROPIC_AUTH_TOKEN, sk-ant-oat01) usa Bearer + beta header `oauth-...`; uma API key
// (ANTHROPIC_API_KEY) usa x-api-key. Default openai (gpt-5). SDKs importados de forma PREGUIÇOSA
// — sem credencial getLlm() retorna null e as rotas respondem 503 (fail-closed), pod no ar.
import { createOpenAiLlm, createAnthropicLlm } from '@flavioneto11/ai-core';
import { recordUsage } from './usage/ai-metrics.js';

export function aiProvider() { return (process.env.AI_PROVIDER || 'openai').toLowerCase(); }

export function aiEnabled() {
  if (aiProvider() === 'anthropic') return Boolean((process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '').trim());
  return Boolean((process.env.OPENAI_API_KEY || '').trim());
}

export const DEFAULT_MODEL = () => process.env.REQHUB_AI_MODEL || (aiProvider() === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5');

let _llm = null;

// Instrumenta: cada complete() registra tokens+custo nas métricas ai_* (reqhub vira módulo
// no painel de Uso da IA, agora separado por provider). Best-effort — nunca altera o resultado.
function instrument(adapter) {
  if (adapter && typeof adapter.complete === 'function') {
    const orig = adapter.complete.bind(adapter);
    adapter.complete = async (args) => {
      const r = await orig(args);
      recordUsage((args && args.model) || DEFAULT_MODEL(), r && r.usage);
      return r;
    };
  }
  return adapter;
}

export async function getLlm() {
  if (!aiEnabled()) return null;
  if (_llm) return _llm;
  if (aiProvider() === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const token = (process.env.ANTHROPIC_AUTH_TOKEN || '').trim();
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const client = token
      ? new Anthropic({ authToken: token, defaultHeaders: { 'anthropic-beta': process.env.ANTHROPIC_OAUTH_BETA || 'oauth-2025-04-20' } })
      : new Anthropic({ apiKey });
    _llm = instrument(createAnthropicLlm(client, { defaultModel: DEFAULT_MODEL() }));
    return _llm;
  }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  _llm = instrument(createOpenAiLlm(client, { defaultModel: DEFAULT_MODEL() }));
  return _llm;
}

// Apenas para testes: injeta um adapter stub (evita rede/SDK real).
export function __setLlmForTest(stub) {
  _llm = stub;
}
