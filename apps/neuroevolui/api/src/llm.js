// llm.js — adapter de LLM do assistente clínico, PROVIDER-AGNÓSTICO (OpenAI | Anthropic).
// Sem credencial getLlm() retorna null e o assistente responde 503 (fail-closed), pod no ar.
import { createOpenAiLlm, createAnthropicLlm } from '@flavioneto11/ai-core';

export function aiProvider() { return (process.env.AI_PROVIDER || 'openai').toLowerCase(); }

export function aiEnabled() {
  if (aiProvider() === 'anthropic') return Boolean((process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '').trim());
  return Boolean((process.env.OPENAI_API_KEY || '').trim());
}

export const DEFAULT_MODEL = () =>
  process.env.NEUROEVOLUI_AI_MODEL || (aiProvider() === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5');

let _llm = null;

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
    _llm = createAnthropicLlm(client, { defaultModel: DEFAULT_MODEL() });
    return _llm;
  }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  _llm = createOpenAiLlm(client, { defaultModel: DEFAULT_MODEL() });
  return _llm;
}

export function __setLlmForTest(stub) { _llm = stub; }
export function __resetLlmForTest() { _llm = null; }
