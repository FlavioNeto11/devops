// Embeddings (OpenAI text-embedding-3-small, 1536 dims) — fail-soft: sem OPENAI_API_KEY,
// embed() retorna null e a busca cai para filtro textual. Usado pela busca semantica de imoveis.
import OpenAI from 'openai';
import { env } from '../env';

const EMBED_MODEL = 'text-embedding-3-small';
let client: OpenAI | null | undefined;

function getClient(): OpenAI | null {
  if (client === undefined) client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  return client;
}

export function embeddingsAvailable(): boolean {
  return Boolean(getClient());
}

export async function embed(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c || !text.trim()) return null;
  try {
    const res = await c.embeddings.create({ model: EMBED_MODEL, input: text.slice(0, 8000) });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error('[imobia] embed falhou (fail-soft):', (err as Error).message);
    return null;
  }
}

/** number[] -> literal aceito pelo cast ::vector do pgvector. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
