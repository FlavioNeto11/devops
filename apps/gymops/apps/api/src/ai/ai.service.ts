import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import { callWithFallback } from '@flavioneto11/ai-kit';
import { createLlm, providerForModel, estimateCostUsd, extractTokenUsage } from '@flavioneto11/ai-core';
import { aiMetrics } from './ai-metrics.js';

// Camada de IA PROVIDER-AGNÓSTICA. AI_PROVIDER=anthropic → Claude (SDK @anthropic-ai); token de
// ASSINATURA do Claude Code (ANTHROPIC_AUTH_TOKEN) via Bearer + beta `oauth-...`, ou API key
// (ANTHROPIC_API_KEY) via x-api-key. Default openai (gpt-5). Todo o produto (draft/checklist/
// delay/chat/summary) chama chatJSON/chatText → adapter ai-core, então a troca é por ENV.

const AI_PROVIDER = (): string => (process.env.AI_PROVIDER ?? 'openai').trim().toLowerCase();

// Cliente estrutural do provider ativo (truthy se a credencial existe; senão null → fail-soft).
type AiClient = unknown;
let _client: AiClient | null = null;
let _clientProvider = '';
export function getClient(): AiClient | null {
  const provider = AI_PROVIDER();
  if (_client && _clientProvider === provider) return _client;
  if (provider === 'anthropic') {
    const authToken = (process.env.ANTHROPIC_AUTH_TOKEN ?? '').trim();
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
    if (!authToken && !apiKey) return null;
    _client = authToken
      ? new Anthropic({ authToken, defaultHeaders: { 'anthropic-beta': process.env.ANTHROPIC_OAUTH_BETA || 'oauth-2025-04-20' } })
      : new Anthropic({ apiKey });
  } else {
    if (!env.OPENAI_API_KEY) return null;
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  _clientProvider = provider;
  return _client;
}
// Compat: o grafo/IA antigos importam getOpenAI(); agora devolve o cliente do provider ativo.
export const getOpenAI = getClient;

const SYNC_TIMEOUT_MS = 20_000;
const ASYNC_TIMEOUT_MS = 60_000;
// Modelo default por provider (env: ANTHROPIC_MODEL / OPENAI_MODEL).
const defaultModel = (): string =>
  AI_PROVIDER() === 'anthropic'
    ? process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'
    : process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';

function recordUsage(usage: unknown, model: string): void {
  try {
    const { inputTokens, outputTokens } = extractTokenUsage(usage);
    aiMetrics.addTokens(model, inputTokens, outputTokens);
    aiMetrics.addCost(model, estimateCostUsd(model, inputTokens, outputTokens));
  } catch { /* telemetria nunca quebra a IA */ }
}

// Extrai JSON de uma resposta de texto (Claude às vezes embrulha em ```json ... ```).
function parseJsonLoose(text: string): unknown {
  const t = String(text || '').trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced && fenced[1] ? fenced[1] : t).trim();
  try {
    return JSON.parse(body);
  } catch {
    const s = body.indexOf('{');
    const e = body.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { return JSON.parse(body.slice(s, e + 1)); } catch { /* cai abaixo */ }
    }
    return {};
  }
}

/** Opções do callAI: número = timeoutMs (compat); objeto permite rotular o stage nas métricas. */
type CallAiOpts = number | { timeoutMs?: number; stage?: string };

export async function callAI<T>(
  fn: (client: AiClient) => Promise<T>,
  fallback: T,
  opts: CallAiOpts = SYNC_TIMEOUT_MS,
): Promise<T> {
  const timeoutMs = typeof opts === 'number' ? opts : (opts.timeoutMs ?? SYNC_TIMEOUT_MS);
  const stage = typeof opts === 'number' ? 'call' : (opts.stage ?? 'call');
  const client = getClient();
  const start = Date.now();

  const result = await callWithFallback(fn, fallback, timeoutMs, client);

  // Instrumentação (latência/erro). usedFallback por identidade de referência.
  const seconds = (Date.now() - start) / 1000;
  const usedFallback = Object.is(result, fallback);
  aiMetrics.observeTurn(stage, usedFallback ? 'error' : 'ok', seconds);
  if (usedFallback) aiMetrics.countError(stage, client ? 'fallback' : 'no_api_key');
  return result;
}

export async function callAIAsync<T>(
  fn: (client: AiClient) => Promise<T>,
  fallback: T,
  stage = 'async',
): Promise<T> {
  return callAI(fn, fallback, { timeoutMs: ASYNC_TIMEOUT_MS, stage });
}

/** Saída estruturada (JSON). client vem do callAI; o adapter resolve o provider ativo. */
export async function chatJSON(
  client: AiClient,
  prompt: string,
  model: string = defaultModel(),
): Promise<unknown> {
  const llm = createLlm({ provider: AI_PROVIDER(), client, defaultModel: model });
  const out = await llm.complete({ model, messages: [{ role: 'user', content: prompt }], jsonMode: true });
  recordUsage(out.usage, model);
  return parseJsonLoose(out.text);
}

/** Chat de texto livre (assistente do operador, POST /ai/chat). */
export async function chatText(
  client: AiClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string = defaultModel(),
): Promise<string> {
  const llm = createLlm({ provider: AI_PROVIDER(), client, defaultModel: model });
  const out = await llm.complete({ model, messages });
  recordUsage(out.usage, model);
  return out.text;
}
