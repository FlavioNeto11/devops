import OpenAI from 'openai';
import { env } from '../env.js';

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
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

export async function callAI<T>(
  fn: (client: OpenAI) => Promise<T>,
  fallback: T,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<T> {
  const client = getOpenAI();
  if (!client) return fallback;

  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(client),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs),
      ),
    ]);
    console.info(`[ai] call completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.warn(`[ai] call failed after ${Date.now() - start}ms:`, (err as Error).message);
    return fallback;
  }
}

export async function callAIAsync<T>(
  fn: (client: OpenAI) => Promise<T>,
  fallback: T,
): Promise<T> {
  return callAI(fn, fallback, ASYNC_TIMEOUT_MS);
}

export async function chatJSON<T>(
  client: OpenAI,
  prompt: string,
  // Modelo configuravel via OPENAI_MODEL (default gpt-5-nano — liberado nesta conta).
  model: string = process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano',
): Promise<unknown> {
  // Modelos de reasoning (gpt-5*, o*) rejeitam temperature != 1 -> omitimos e usamos reasoning_effort.
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
  model: string = process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano',
): Promise<string> {
  const reasoning = isReasoningModel(model);
  const completion = await client.chat.completions.create({
    model,
    messages,
    ...(reasoning ? { reasoning_effort: REASONING_EFFORT } : { temperature: 0.4 }),
  });
  return completion.choices[0]?.message?.content ?? '';
}
