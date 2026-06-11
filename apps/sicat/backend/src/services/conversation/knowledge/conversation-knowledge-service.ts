import { OpenAIEmbeddings } from '@langchain/openai';
import { createPgVectorStore, createReranker, type RagHit } from '@flavioneto11/ai-core';
import { ChatOpenAI } from '@langchain/openai';
import { query } from '../../../db/pool.js';
import { getAiConfig, hasOpenAiApiKey } from '../ai-config.js';

/**
 * RAG de conhecimento de domínio sobre PGVECTOR (F2 — substitui o índice em
 * arquivo artifacts/conversation-knowledge-index.json, que nem chegava à
 * imagem). Retrieval: embedding da consulta → top-K no HNSW (cosine) → bônus
 * lexical (termos exatos: CDF, MTR, números) → re-rank por LLM (gpt-5-nano,
 * desligável via KNOWLEDGE_RERANK=off). Ingestão: knowledge-ingestion.ts
 * (incremental por hash, boot do worker + `npm run rag:ingest`).
 * Degrada graciosamente: sem chave/tabela/erro → [].
 */

export const KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small';

export type KnowledgeHit = { text: string; source: string; title?: string; score: number };

// undefined = ainda não verificado; null = indisponível.
let embeddings: OpenAIEmbeddings | null | undefined;
let chunkCountCache: { value: number; at: number } | null = null;
const CHUNK_COUNT_TTL_MS = 60_000;

const store = createPgVectorStore({ query });

function getEmbeddings(): OpenAIEmbeddings | null {
  if (embeddings !== undefined) {
    return embeddings;
  }
  if (!hasOpenAiApiKey()) {
    embeddings = null;
    return null;
  }
  try {
    const config = getAiConfig();
    embeddings = new OpenAIEmbeddings({ apiKey: config.openAiApiKey, model: KNOWLEDGE_EMBEDDING_MODEL });
  } catch {
    embeddings = null;
  }
  return embeddings;
}

function isRerankEnabled(): boolean {
  return (process.env.KNOWLEDGE_RERANK ?? 'on').trim().toLowerCase() !== 'off';
}

// Re-ranker preguiçoso (gpt-5-nano via adapter mínimo sobre ChatOpenAI).
let reranker: ReturnType<typeof createReranker> | null | undefined;
function getReranker(): ReturnType<typeof createReranker> | null {
  if (reranker !== undefined) return reranker;
  if (!hasOpenAiApiKey() || !isRerankEnabled()) {
    reranker = null;
    return null;
  }
  try {
    const config = getAiConfig();
    const model = new ChatOpenAI({ apiKey: config.openAiApiKey, model: 'gpt-5-nano', modelKwargs: { reasoning_effort: 'minimal' } });
    reranker = createReranker({
      llm: {
        complete: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
          const res = await model.invoke(messages.map((m) => [m.role === 'user' ? 'human' : m.role, m.content] as [string, string]));
          return { text: typeof res.content === 'string' ? res.content : JSON.stringify(res.content), toolCalls: [], usage: res.usage_metadata ?? null };
        }
      },
      model: 'gpt-5-nano'
    });
  } catch {
    reranker = null;
  }
  return reranker;
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'que', 'para', 'com', 'uma', 'uns', 'umas', 'os', 'as',
  'no', 'na', 'nos', 'nas', 'em', 'por', 'ao', 'aos', 'se', 'sua', 'seu', 'ou', 'qual',
  'quais', 'como', 'onde', 'quando', 'isso', 'este', 'esta', 'esse', 'essa', 'meu', 'minha',
  'sobre', 'the', 'and', 'for', 'voce', 'pra', 'tem'
]);

/** Tokeniza para o componente lexical do retrieval híbrido (sem acento, sem stopwords, termos >= 2 chars). */
function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/** Recall lexical: fração dos termos da consulta presentes no chunk (0..1). Pega termos exatos (CDF, MTR, números). */
function lexicalScore(queryTokens: Set<string>, chunkText: string): number {
  if (queryTokens.size === 0) return 0;
  const chunkTokens = new Set(tokenize(chunkText));
  if (chunkTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.size;
}

async function countChunks(): Promise<number> {
  const now = Date.now();
  if (chunkCountCache && now - chunkCountCache.at < CHUNK_COUNT_TTL_MS) {
    return chunkCountCache.value;
  }
  try {
    const stats = await store.stats();
    chunkCountCache = { value: stats.chunks, at: now };
  } catch {
    chunkCountCache = { value: 0, at: now };
  }
  return chunkCountCache.value;
}

/** True quando a base pgvector tem conteúdo (para health/observabilidade). */
export function isKnowledgeIndexAvailable(): boolean {
  // melhor esforço síncrono: usa o cache (atualizado a cada retrieve/health)
  return (chunkCountCache?.value ?? 0) > 0;
}

/** Quantidade de chunks na base (0 se vazia/indisponível). Para health/observabilidade. */
export function getKnowledgeChunkCount(): number {
  void countChunks(); // refresca o cache em background
  return chunkCountCache?.value ?? 0;
}

/**
 * Recupera os trechos de conhecimento mais relevantes para a consulta.
 * Retorna [] (sem erro) quando a base ou a chave não estão disponíveis.
 */
export async function retrieveKnowledge(
  queryText: string,
  options: { k?: number; minScore?: number; augment?: string } = {}
): Promise<KnowledgeHit[]> {
  const baseQuery = String(queryText || '').trim();
  const augment = String(options.augment || '').trim();
  // Goal-aware: a consulta pode ser enriquecida com o objetivo da conversa (Working Memory).
  const fullQuery = [baseQuery, augment].filter(Boolean).join('. ');
  if (!fullQuery) {
    return [];
  }
  const embedder = getEmbeddings();
  if (!embedder) {
    return [];
  }

  try {
    const queryVector = await embedder.embedQuery(fullQuery);
    const k = Math.max(1, Math.min(options.k ?? 6, 12));
    const minScore = options.minScore ?? 0.18;

    // 1) top-K*3 no HNSW (cosine) — margem para o híbrido/re-rank cortarem.
    const candidates: RagHit[] = await store.search(queryVector, { k: Math.min(k * 3, 24) });
    if (candidates.length > 0) {
      chunkCountCache = { value: Math.max(chunkCountCache?.value ?? 0, candidates.length), at: Date.now() };
    }

    // 2) híbrido: score = cosine + 0.3 * lexical (mesmos pesos/threshold do índice antigo).
    const queryTokens = new Set(tokenize(fullQuery));
    let hits = candidates
      .map((c) => ({
        ...c,
        score: Math.max(0, c.score) + 0.3 * lexicalScore(queryTokens, `${c.title || ''} ${c.text}`)
      }))
      .filter((hit) => Number.isFinite(hit.score) && hit.score >= minScore)
      .sort((a, b) => b.score - a.score);

    // 3) re-rank por LLM (defensivo; mantém ordem em erro) e corte final.
    const rr = getReranker();
    if (rr && hits.length > 1) {
      hits = await rr.rerank(fullQuery, hits.slice(0, Math.min(hits.length, 12)), { topN: k });
    } else {
      hits = hits.slice(0, k);
    }

    return hits.map((hit) => ({ text: hit.text, source: hit.source, title: hit.title, score: hit.score }));
  } catch {
    return []; // base ausente/erro de rede → degrada gracioso (comportamento histórico)
  }
}

/**
 * Monta um bloco de contexto factual a partir dos trechos recuperados, para injetar
 * nos prompts do reasoning/síntese. Vazio quando não há nada relevante.
 */
export function buildKnowledgeContextBlock(hits: KnowledgeHit[]): string {
  if (!hits.length) {
    return '';
  }
  const lines = hits.map((hit, index) => `[${index + 1}] (${hit.source}${hit.title ? ` › ${hit.title}` : ''}) ${hit.text}`);
  return (
    'Conhecimento de dominio SICAT/CETESB relevante (use como referencia factual para raciocinar e responder; ' +
    'nao invente alem disto, e nao cite estes indices na resposta):\n' +
    lines.join('\n')
  );
}
