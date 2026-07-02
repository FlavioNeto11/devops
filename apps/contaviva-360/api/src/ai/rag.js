// ai/rag.js — RAG (Retrieval-Augmented Generation) para o assistente contábil.
// Usa pgvector (knowledge_sources + knowledge_chunks) via ai-core.
// Ingestão: fatia texto em chunks, embeda, upserta.
// Consulta: top-K por similaridade coseno, com citations para a resposta.
import { createPgVectorStore, createEmbedder, splitWithOverlap, hashContent } from '@flavioneto11/ai-core';
import { getEmbedder } from './llm.js';
import { randomUUID } from 'node:crypto';

let _store = null;
let _embedder = null;

export async function getRagStore(pool) {
  if (_store) return _store;
  _store = createPgVectorStore({
    query: (sql, params) => pool.query(sql, params),
    chunksTable: 'knowledge_chunks',
    sourcesTable: 'knowledge_sources',
  });
  return _store;
}

async function getAiEmbedder() {
  if (_embedder) return _embedder;
  const httpEmbed = await getEmbedder();
  if (!httpEmbed) return null;
  _embedder = createEmbedder({ embedFn: (texts) => httpEmbed.embedTexts(texts), dimensions: 1536 });
  return _embedder;
}

export function __resetRagForTest() { _store = null; _embedder = null; }

/**
 * Ingere um documento na base de conhecimento.
 * @param {object} pool - pg pool
 * @param {object} opts - { sourceId, title, content, tenantId }
 */
export async function ingestDocument(pool, { sourceId, title, content, tenantId = 1 }) {
  const embedder = await getAiEmbedder();
  if (!embedder) throw new Error('Embedder indisponível (sem OPENAI_API_KEY)');
  const store = await getRagStore(pool);
  const contentStr = String(content || '');
  const contentHash = hashContent(contentStr);
  const existing = await store.getSourceHash(sourceId);
  if (existing === contentHash) return { sourceId, chunkCount: 0, status: 'unchanged' };
  const parts = splitWithOverlap(contentStr, { maxChars: 1000, overlap: 120 });
  if (!parts.length) return { sourceId, chunkCount: 0, status: 'empty' };
  const embeddings = await embedder.embedBatch(parts);
  const chunks = parts.map((text, i) => ({
    id: `${sourceId}:${i}`,
    index: i,
    title: title || null,
    content: text,
    embedding: embeddings[i],
  }));
  const result = await store.upsertSource({ sourceId, contentHash, embeddingModel: 'text-embedding-3-small', chunks });
  return { ...result, status: 'ingested' };
}

/**
 * Busca top-K chunks relevantes para uma query.
 * @returns {Array<{ id, source, title, text, score }>}
 */
export async function searchKnowledge(pool, query, { k = 6, minScore = 0.5 } = {}) {
  const embedder = await getAiEmbedder();
  if (!embedder) return [];
  try {
    const store = await getRagStore(pool);
    const stats = await store.stats();
    if (stats.chunks === 0) return [];
    const vec = await embedder.embedQuery(query);
    const hits = await store.search(vec, { k: k * 2 });
    return hits.filter((h) => h.score >= minScore).slice(0, k);
  } catch {
    return [];
  }
}

/**
 * Formata hits do RAG como bloco de contexto para o prompt.
 */
export function formatRagContext(hits) {
  if (!hits || !hits.length) return '';
  return `\nCONHECIMENTO RELEVANTE (base de documentos):\n${hits.map((h, i) => `[${i + 1}] (${h.source}${h.title ? ` › ${h.title}` : ''}) ${String(h.text).slice(0, 600)}`).join('\n')}`;
}
