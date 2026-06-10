import OpenAI from 'openai';
import { env } from '../env.js';
import { callWithFallback, chatJSON as kitChatJSON, chatText as kitChatText } from '@flavioneto11/ai-kit';
import { aiMetrics } from './ai-metrics.js';

// Contrato gpt-5 centralizado em @flavioneto11/ai-kit (compartilhado com o SICAT).
// Flag de rollback (ver docs/standards/deprecation-policy.md): AI_KIT=off volta ao
// caminho inline legado por 1 ciclo, caso algo regrida.
const AI_KIT_ENABLED = (process.env.AI_KIT ?? 'on').trim().toLowerCase() !== 'off';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (_client) return _client;
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

const SYNC_TIMEOUT_MS = 20_000;
const ASYNC_TIMEOUT_MS = 60_000;
// Esforço de reasoning p/ modelos gpt-5*/o* (low = rápido e bom o bastante; tunável via env).
const REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT?.trim() || 'low') as
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high';
// Modelo configurável via OPENAI_MODEL (default gpt-5-nano — liberado nesta conta).
const defaultModel = (): string => process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';

function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/** Opções do callAI: número = timeoutMs (compat); objeto permite rotular o stage nas métricas. */
type CallAiOpts = number | { timeoutMs?: number; stage?: string };

export async function callAI<T>(
  fn: (client: OpenAI) => Promise<T>,
  fallback: T,
  opts: CallAiOpts = SYNC_TIMEOUT_MS,
): Promise<T> {
  const timeoutMs = typeof opts === 'number' ? opts : (opts.timeoutMs ?? SYNC_TIMEOUT_MS);
  const stage = typeof opts === 'number' ? 'call' : (opts.stage ?? 'call');
  const client = getOpenAI();
  const start = Date.now();

  let result: T;
  if (AI_KIT_ENABLED) {
    result = await callWithFallback(fn, fallback, timeoutMs, client);
  } else if (!client) {
    result = fallback;
  } else {
    // --- legado (AI_KIT=off) ---
    try {
      result = await Promise.race([
        fn(client),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs),
        ),
      ]);
      console.info(`[ai] call completed in ${Date.now() - start}ms`);
    } catch (err) {
      console.warn(`[ai] call failed after ${Date.now() - start}ms:`, (err as Error).message);
      result = fallback;
    }
  }

  // Instrumentação F0 (só telemetria — comportamento intacto). Fallback é
  // detectado por identidade de referência (o mesmo objeto passado entra na resposta).
  const seconds = (Date.now() - start) / 1000;
  const usedFallback = Object.is(result, fallback);
  aiMetrics.observeTurn(stage, usedFallback ? 'error' : 'ok', seconds);
  if (usedFallback) aiMetrics.countError(stage, client ? 'fallback' : 'no_api_key');
  return result;
}

export async function callAIAsync<T>(
  fn: (client: OpenAI) => Promise<T>,
  fallback: T,
  stage = 'async',
): Promise<T> {
  return callAI(fn, fallback, { timeoutMs: ASYNC_TIMEOUT_MS, stage });
}

export async function chatJSON<T>(
  client: OpenAI,
  prompt: string,
  model: string = defaultModel(),
): Promise<unknown> {
  if (AI_KIT_ENABLED) {
    return kitChatJSON(client, prompt, { model, reasoningEffort: REASONING_EFFORT });
  }
  // --- legado (AI_KIT=off): modelos de reasoning rejeitam temperature -> omitimos ---
  const reasoning = isReasoningModel(model);
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    ...(reasoning ? { reasoning_effort: REASONING_EFFORT } : { temperature: 0.3 }),
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  return JSON.parse(content) as unknown;
}

/**
 * Chat de texto livre (conversacional) — resposta generativa em linguagem natural.
 * Usado pelo assistente do operador (POST /ai/chat).
 */
export async function chatText(
  client: OpenAI,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string = defaultModel(),
): Promise<string> {
  if (AI_KIT_ENABLED) {
    return kitChatText(client, messages, { model, reasoningEffort: REASONING_EFFORT });
  }
  // --- legado (AI_KIT=off) ---
  const reasoning = isReasoningModel(model);
  const completion = await client.chat.completions.create({
    model,
    messages,
    ...(reasoning ? { reasoning_effort: REASONING_EFFORT } : { temperature: 0.4 }),
  });
  return completion.choices[0]?.message?.content ?? '';
}
