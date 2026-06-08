import OpenAI from 'openai';
import { env } from '../env.js';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (_client) return _client;
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

const SYNC_TIMEOUT_MS = 10_000;
const ASYNC_TIMEOUT_MS = 60_000;

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
  model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini',
): Promise<unknown> {
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  return JSON.parse(content) as unknown;
}
