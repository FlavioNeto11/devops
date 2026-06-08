import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAIEmbeddings } from '@langchain/openai';
import { getAiConfig, hasOpenAiApiKey } from '../ai-config.js';

/**
 * RAG de conhecimento de domínio (Fase 2). Carrega um índice pré-construído
 * (artifacts/conversation-knowledge-index.json — gerado por scripts/rag/build-knowledge-index.mjs
 * com text-embedding-3-small) e recupera, por turno, os trechos mais relevantes via cosseno,
 * para ATERRAR o reasoning e a síntese. Degrada graciosamente: sem índice ou sem chave → [].
 */

export const KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small';
const INDEX_PATH = resolve(process.cwd(), 'artifacts', 'conversation-knowledge-index.json');

type KnowledgeChunk = { id: string; source: string; title?: string; text: string; embedding: number[] };
type KnowledgeIndex = { version: number; model: string; chunks: KnowledgeChunk[] };
export type KnowledgeHit = { text: string; source: string; title?: string; score: number };

// undefined = ainda não carregado; null = ausente/indisponível.
let cachedIndex: KnowledgeIndex | null | undefined;
let embeddings: OpenAIEmbeddings | null | undefined;

function loadIndex(): KnowledgeIndex | null {
  if (cachedIndex !== undefined) {
    return cachedIndex;
  }
  try {
    if (!existsSync(INDEX_PATH)) {
      cachedIndex = null;
      return null;
    }
    const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    cachedIndex = parsed && Array.isArray(parsed.chunks) && parsed.chunks.length > 0 ? parsed as KnowledgeIndex : null;
  } catch {
    cachedIndex = null;
  }
  return cachedIndex;
}

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

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

export function isKnowledgeIndexAvailable(): boolean {
  return loadIndex() != null;
}

/** Quantidade de chunks no índice carregado (0 se ausente). Para health/observabilidade. */
export function getKnowledgeChunkCount(): number {
  return loadIndex()?.chunks.length ?? 0;
}

/**
 * Recupera os trechos de conhecimento mais relevantes para a consulta.
 * Retorna [] (sem erro) quando o índice ou a chave não estão disponíveis.
 */
export async function retrieveKnowledge(
  query: string,
  options: { k?: number; minScore?: number; augment?: string } = {}
): Promise<KnowledgeHit[]> {
  const index = loadIndex();
  if (!index) {
    return [];
  }
  const baseQuery = String(query || '').trim();
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

  let queryVector: number[];
  try {
    queryVector = await embedder.embedQuery(fullQuery);
  } catch {
    return [];
  }

  const k = Math.max(1, Math.min(options.k ?? 6, 12));
  const minScore = options.minScore ?? 0.18;
  const queryTokens = new Set(tokenize(fullQuery));

  // Retrieval híbrido: cosseno (semântico) + bônus lexical (capta termos exatos: CDF, MTR, números, siglas).
  return index.chunks
    .map((chunk) => {
      const cosine = Math.max(0, cosineSimilarity(queryVector, chunk.embedding));
      const lexical = lexicalScore(queryTokens, `${chunk.title || ''} ${chunk.text}`);
      return {
        text: chunk.text,
        source: chunk.source,
        title: chunk.title,
        score: cosine + 0.3 * lexical
      };
    })
    .filter((hit) => Number.isFinite(hit.score) && hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
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
