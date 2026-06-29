// =============================================================================
// Camada de IA PROVIDER-AGNÓSTICA do ZapBridge (espelha apps/gymops/.../ai/ai.service.ts).
// Reasoning: Claude (AI_PROVIDER=anthropic, default) via @anthropic-ai/sdk — token de
// assinatura (ANTHROPIC_AUTH_TOKEN, Bearer + beta oauth) OU API key (ANTHROPIC_API_KEY).
// Embeddings: SEMPRE OpenAI (text-embedding-3-small) — Anthropic não expõe /embeddings.
// Sem credencial → getClient()/getEmbedder() devolvem null e tudo degrada fail-soft.
//
// createLlm/callWithFallback/estimateCostUsd vêm dos kits ESM via loader lazy.
// =============================================================================
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { loadAiCore, loadAiKit } from './ai-core-loader';
import { getAiMetrics } from './ai-metrics';

type AiClient = unknown;

let _client: AiClient | null = null;
let _clientProvider = '';

export function activeProvider(): 'openai' | 'anthropic' {
  return env.ai.provider === 'anthropic' ? 'anthropic' : 'openai';
}

/** Cliente do provider de reasoning ativo (null se sem credencial → fail-soft). */
export function getClient(): AiClient | null {
  const provider = activeProvider();
  if (_client && _clientProvider === provider) return _client;
  if (provider === 'anthropic') {
    const authToken = (env.ai.anthropicAuthToken ?? '').trim();
    const apiKey = (env.ai.anthropicApiKey ?? '').trim();
    if (!authToken && !apiKey) return null;
    _client = authToken
      ? new Anthropic({
          authToken,
          defaultHeaders: { 'anthropic-beta': process.env.ANTHROPIC_OAUTH_BETA || 'oauth-2025-04-20' },
        })
      : new Anthropic({ apiKey });
  } else {
    const apiKey = (env.ai.openaiApiKey ?? '').trim();
    if (!apiKey) return null;
    _client = new OpenAI({ apiKey });
  }
  _clientProvider = provider;
  return _client;
}

export function defaultModel(): string {
  return activeProvider() === 'anthropic'
    ? env.ai.anthropicModel || 'claude-sonnet-4-6'
    : process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';
}
export function activeModel(): string {
  return defaultModel();
}

const SYNC_TIMEOUT_MS = 20_000;
const ASYNC_TIMEOUT_MS = 60_000;

async function recordUsage(usage: unknown, model: string): Promise<void> {
  try {
    const { extractTokenUsage, estimateCostUsd } = await loadAiCore();
    const { inputTokens, outputTokens } = extractTokenUsage(usage);
    const m = getAiMetrics();
    m.addTokens(model, inputTokens, outputTokens);
    m.addCost(model, estimateCostUsd(model, inputTokens, outputTokens));
  } catch {
    /* telemetria nunca quebra a IA */
  }
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
      try {
        return JSON.parse(body.slice(s, e + 1));
      } catch {
        /* cai abaixo */
      }
    }
    return {};
  }
}

type CallAiOpts = number | { timeoutMs?: number; stage?: string };

/** Executa uma chamada de IA com timeout + fallback + telemetria (nunca lança). */
export async function callAI<T>(
  fn: (client: AiClient) => Promise<T>,
  fallback: T,
  opts: CallAiOpts = SYNC_TIMEOUT_MS,
): Promise<T> {
  const timeoutMs = typeof opts === 'number' ? opts : opts.timeoutMs ?? SYNC_TIMEOUT_MS;
  const stage = typeof opts === 'number' ? 'call' : opts.stage ?? 'call';
  const client = getClient();
  const start = Date.now();
  const { callWithFallback } = await loadAiKit();
  const result = await callWithFallback(fn, fallback, timeoutMs, client);
  const seconds = (Date.now() - start) / 1000;
  const usedFallback = Object.is(result, fallback);
  const m = getAiMetrics();
  m.observeTurn(stage, usedFallback ? 'error' : 'ok', seconds);
  if (usedFallback) m.countError(stage, client ? 'fallback' : 'no_api_key');
  return result;
}

export async function callAIAsync<T>(
  fn: (client: AiClient) => Promise<T>,
  fallback: T,
  stage = 'async',
): Promise<T> {
  return callAI(fn, fallback, { timeoutMs: ASYNC_TIMEOUT_MS, stage });
}

/** Saída estruturada (JSON). */
export async function chatJSON(client: AiClient, prompt: string, model: string = defaultModel()): Promise<unknown> {
  const { createLlm } = await loadAiCore();
  const llm = createLlm({ provider: activeProvider(), client, defaultModel: model });
  const out = await llm.complete({ model, messages: [{ role: 'user', content: prompt }], jsonMode: true });
  await recordUsage(out.usage, model);
  return parseJsonLoose(out.text);
}

/** Chat de texto livre. */
export async function chatText(
  client: AiClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string = defaultModel(),
): Promise<string> {
  const { createLlm } = await loadAiCore();
  const llm = createLlm({ provider: activeProvider(), client, defaultModel: model });
  const out = await llm.complete({ model, messages });
  await recordUsage(out.usage, model);
  return out.text;
}

/** Chat MULTIMODAL — content pode ser string ou array de blocos (file-ingest-kit). */
export async function chatMultimodal(
  client: AiClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | unknown[] }>,
  model: string = defaultModel(),
): Promise<string> {
  const { createLlm } = await loadAiCore();
  const llm = createLlm({ provider: activeProvider(), client, defaultModel: model });
  const out = await llm.complete({ model, messages: messages as Array<Record<string, unknown>> });
  await recordUsage(out.usage, model);
  return out.text;
}

// ---------------------------------------------------------------- embeddings
// Cliente OpenAI dedicado a embeddings (independe do provider de reasoning).
let _embedClient: OpenAI | null = null;
function embedClient(): OpenAI | null {
  const apiKey = (env.ai.openaiApiKey ?? '').trim();
  if (!apiKey) return null;
  if (!_embedClient) _embedClient = new OpenAI({ apiKey });
  return _embedClient;
}

/** Embeda uma lista de textos (text-embedding-3-small, 1536). [] se sem OPENAI_API_KEY. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = embedClient();
  if (!client || texts.length === 0) return [];
  const res = await client.embeddings.create({ model: env.ai.embeddingModel, input: texts });
  return res.data.map((d) => d.embedding as number[]);
}

export interface Embedder {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedFn(texts: string[]): Promise<number[][]>; // formato do createEmbedder do ai-core
}

/** Embedder no formato consumido por createUserMemory/createEmbedder. null se sem chave OpenAI. */
export function getEmbedder(): Embedder | null {
  if (!embedClient()) return null;
  return {
    embedQuery: async (t: string) => (await embedTexts([t]))[0] ?? [],
    embedDocuments: (ts: string[]) => embedTexts(ts),
    embedFn: (ts: string[]) => embedTexts(ts),
  };
}
