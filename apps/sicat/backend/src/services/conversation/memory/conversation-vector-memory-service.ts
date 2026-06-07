import { OpenAIEmbeddings } from '@langchain/openai';
import { createPrefixedId } from '../../../lib/ids.js';
import {
  insertConversationSemanticMemory,
  listConversationSemanticMemory
} from '../../../repositories/conversation-semantic-memory-repo.js';
import { getAiConfig, hasOpenAiApiKey } from '../ai-config.js';

/**
 * Memória semântica (vetorial) DEDICADA da conversa: cada turno vira um vetor próprio
 * (tabela conversation_semantic_memory). No recall, recupera-se por SIMILARIDADE os
 * trechos passados mais relevantes à mensagem atual — dando continuidade ALÉM da janela
 * recente de histórico (conversas longas). Degrada graciosamente: sem chave/sem vetores → [].
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MEMORY_TTL_MS = 72 * 60 * 60 * 1000;

let embeddings: OpenAIEmbeddings | null | undefined;

function getEmbeddings(): OpenAIEmbeddings | null {
  if (embeddings !== undefined) return embeddings;
  if (!hasOpenAiApiKey()) {
    embeddings = null;
    return null;
  }
  try {
    const config = getAiConfig();
    embeddings = new OpenAIEmbeddings({ apiKey: config.openAiApiKey, model: EMBEDDING_MODEL });
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
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function clip(text: string, max: number): string {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export type VectorMemoryHit = { role: string; text: string; score: number };

/** Armazena (async) os vetores do turno: mensagem do usuário + resposta do assistente. */
export async function storeConversationTurnVectors(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
  userMessage: string;
  assistantText: string;
}): Promise<void> {
  const embedder = getEmbeddings();
  if (!embedder) return;
  const entries = [
    { role: 'user', text: clip(input.userMessage, 1200) },
    { role: 'assistant', text: clip(input.assistantText, 1600) }
  ].filter((e) => e.text.length > 0);
  if (!entries.length) return;

  try {
    const vectors = await embedder.embedDocuments(entries.map((e) => e.text));
    const validUntil = new Date(Date.now() + MEMORY_TTL_MS).toISOString();
    await Promise.all(
      entries.map((entry, i) =>
        insertConversationSemanticMemory({
          id: createPrefixedId('csm'),
          conversationSessionId: input.conversationSessionId,
          integrationAccountId: input.integrationAccountId,
          role: entry.role,
          text: entry.text,
          embedding: vectors[i] || [],
          validUntil
        })
      )
    );
  } catch {
    // best-effort: memória vetorial não pode derrubar o turno
  }
}

/**
 * Recupera por similaridade os trechos passados mais relevantes à mensagem atual.
 * IMPORTANTE: lista os vetores ANTES de embedar — sessão vazia (ex.: testes) → [] sem
 * gastar chamada de embedding.
 */
export async function recallConversationSemanticMemory(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
  query: string;
  k?: number;
  minScore?: number;
}): Promise<VectorMemoryHit[]> {
  const normalizedQuery = String(input.query || '').trim();
  if (!normalizedQuery) return [];

  let records;
  try {
    records = await listConversationSemanticMemory(input.conversationSessionId, input.integrationAccountId, 200);
  } catch {
    return [];
  }
  if (!records.length) return [];

  const embedder = getEmbeddings();
  if (!embedder) return [];

  let queryVector: number[];
  try {
    queryVector = await embedder.embedQuery(normalizedQuery);
  } catch {
    return [];
  }

  const k = Math.max(1, Math.min(input.k ?? 4, 8));
  const minScore = input.minScore ?? 0.2;
  return records
    .map((r) => ({ role: r.role, text: r.text, score: cosineSimilarity(queryVector, r.embedding) }))
    .filter((hit) => Number.isFinite(hit.score) && hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Bloco de contexto a partir dos trechos recuperados (para injeção no raciocínio). */
export function buildVectorMemoryBlock(hits: VectorMemoryHit[]): string {
  if (!hits.length) return '';
  const lines = hits.map((hit) => `- (${hit.role === 'user' ? 'usuário' : 'assistente'}, antes) ${hit.text}`);
  return (
    'Trechos relevantes de momentos ANTERIORES desta conversa (recuperados por similaridade — use para manter continuidade e resolver referências):\n' +
    lines.join('\n')
  );
}
