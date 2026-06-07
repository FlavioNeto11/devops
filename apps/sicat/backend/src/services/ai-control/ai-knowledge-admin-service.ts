/**
 * Administração da base de conhecimento (RAG). Lê o índice prebuilt
 * (artifacts/conversation-knowledge-index.json), espelha fontes em
 * ai_knowledge_sources, testa retrieval e dispara reindex via o script existente.
 * Não altera o fluxo atual de retrieval (conversation-knowledge-service).
 */
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '../../lib/problem.js';
import {
  KNOWLEDGE_EMBEDDING_MODEL,
  retrieveKnowledge
} from '../conversation/knowledge/conversation-knowledge-service.js';
import {
  listAiKnowledgeSources,
  upsertAiKnowledgeSource,
  setAiKnowledgeSourceEnabled,
  findAiKnowledgeSource,
  type AiKnowledgeSourceRecord
} from '../../repositories/ai-knowledge-admin-repo.js';
import type {
  AiKnowledgeChunk,
  AiKnowledgeIndexStatus,
  AiKnowledgeRetrievalHit,
  AiKnowledgeSource
} from './ai-control-types.js';

const execFileAsync = promisify(execFile);
const INDEX_PATH = resolve(process.cwd(), 'artifacts', 'conversation-knowledge-index.json');

type RawIndexChunk = { id?: string; source?: string; title?: string; text?: string; embedding?: unknown };
type RawIndex = { version?: number; model?: string; builtAt?: string; chunks?: RawIndexChunk[] };

async function readIndex(): Promise<RawIndex | null> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    return JSON.parse(raw) as RawIndex;
  } catch {
    return null;
  }
}

function clampText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function recordToSourceDto(record: AiKnowledgeSourceRecord): AiKnowledgeSource {
  return {
    sourceKey: record.sourceKey,
    sourceType: record.sourceType,
    title: record.title || record.sourceKey,
    pathOrUri: record.pathOrUri,
    enabled: record.enabled,
    embeddingModel: record.embeddingModel,
    lastIndexedAt: record.lastIndexedAt,
    chunkCount: record.chunkCount,
    status: record.status
  };
}

function inferSourceType(sourceKey: string): string {
  if (sourceKey === 'intent-catalog') return 'catalog';
  if (sourceKey.endsWith('.md') || sourceKey.includes('/')) return 'docs';
  return 'file';
}

export async function getKnowledgeIndexStatus(): Promise<AiKnowledgeIndexStatus> {
  const index = await readIndex();
  const dbSources = await listAiKnowledgeSources().catch(() => []);
  const dbByKey = new Map(dbSources.map((source) => [source.sourceKey, source]));

  if (!index || !Array.isArray(index.chunks)) {
    return {
      available: false,
      embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
      totalChunks: 0,
      builtAt: null,
      sources: dbSources.map(recordToSourceDto)
    };
  }

  const counts = new Map<string, number>();
  for (const chunk of index.chunks) {
    const key = chunk.source || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sources: AiKnowledgeSource[] = [];
  const seen = new Set<string>();
  for (const [sourceKey, chunkCount] of counts) {
    seen.add(sourceKey);
    const db = dbByKey.get(sourceKey) ?? null;
    sources.push({
      sourceKey,
      sourceType: db?.sourceType || inferSourceType(sourceKey),
      title: db?.title || sourceKey,
      pathOrUri: db?.pathOrUri || (sourceKey.includes('/') ? sourceKey : null),
      enabled: db ? db.enabled : true,
      embeddingModel: index.model || KNOWLEDGE_EMBEDDING_MODEL,
      lastIndexedAt: index.builtAt || db?.lastIndexedAt || null,
      chunkCount,
      status: db && !db.enabled ? 'disabled' : 'indexed'
    });
  }
  for (const db of dbSources) {
    if (!seen.has(db.sourceKey)) sources.push(recordToSourceDto(db));
  }

  return {
    available: true,
    embeddingModel: index.model || KNOWLEDGE_EMBEDDING_MODEL,
    totalChunks: index.chunks.length,
    builtAt: index.builtAt || null,
    sources: sources.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))
  };
}

export async function listKnowledgeChunks(filters: {
  source?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<AiKnowledgeChunk[]> {
  const index = await readIndex();
  if (!index || !Array.isArray(index.chunks)) return [];
  const limit = filters.limit && filters.limit > 0 ? Math.min(500, Math.trunc(filters.limit)) : 100;
  const search = (filters.search || '').trim().toLowerCase();

  let chunks = index.chunks;
  if (filters.source) {
    chunks = chunks.filter((chunk) => chunk.source === filters.source);
  }
  if (search) {
    chunks = chunks.filter(
      (chunk) => (chunk.text || '').toLowerCase().includes(search) || (chunk.title || '').toLowerCase().includes(search)
    );
  }
  return chunks.slice(0, limit).map((chunk) => ({
    chunkKey: chunk.id || '',
    sourceKey: chunk.source || null,
    title: chunk.title || null,
    text: clampText(chunk.text || '', 1200),
    score: null
  }));
}

export async function testKnowledgeRetrieval(question: string, k?: number): Promise<AiKnowledgeRetrievalHit[]> {
  const text = (question || '').trim();
  if (!text) {
    throw new AppError(400, 'Bad Request', 'Campo question e obrigatorio.', { code: 'QUESTION_REQUIRED' });
  }
  const topK = k && k > 0 ? Math.min(12, Math.trunc(k)) : 6;
  const hits = await retrieveKnowledge(text, { k: topK });
  return hits.map((hit) => ({
    source: hit.source,
    title: hit.title ?? null,
    text: clampText(hit.text, 1200),
    score: hit.score
  }));
}

export async function setKnowledgeSourceEnabledByKey(sourceKey: string, enabled: boolean): Promise<AiKnowledgeSource> {
  const existing = await findAiKnowledgeSource(sourceKey);
  if (!existing) {
    await upsertAiKnowledgeSource({
      sourceKey,
      sourceType: inferSourceType(sourceKey),
      title: sourceKey,
      enabled,
      status: enabled ? 'indexed' : 'disabled'
    });
  }
  const updated = await setAiKnowledgeSourceEnabled(sourceKey, enabled);
  if (!updated) {
    throw new AppError(404, 'Not Found', `Fonte de conhecimento ${sourceKey} nao encontrada.`, { code: 'KNOWLEDGE_SOURCE_NOT_FOUND' });
  }
  return recordToSourceDto(updated);
}

export type KnowledgeReindexResult = {
  ok: boolean;
  status: string;
  logTail: string;
  index: AiKnowledgeIndexStatus;
};

export async function reindexKnowledge(): Promise<KnowledgeReindexResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['scripts/rag/build-knowledge-index.mjs'],
      { cwd: process.cwd(), timeout: 180_000, maxBuffer: 8 * 1024 * 1024, env: process.env }
    );
    const logTail = `${stdout}\n${stderr}`.trim().split('\n').slice(-15).join('\n');
    const index = await getKnowledgeIndexStatus();
    // espelha fontes no banco
    for (const source of index.sources) {
      await upsertAiKnowledgeSource({
        sourceKey: source.sourceKey,
        sourceType: source.sourceType,
        title: source.title,
        pathOrUri: source.pathOrUri,
        enabled: source.enabled,
        embeddingModel: source.embeddingModel,
        lastIndexedAt: source.lastIndexedAt,
        chunkCount: source.chunkCount,
        status: source.status
      }).catch(() => undefined);
    }
    return { ok: true, status: 'reindexed', logTail, index };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'reindex falhou';
    throw new AppError(502, 'Reindex Failed', `Falha ao reindexar base de conhecimento: ${message}`, {
      code: 'KNOWLEDGE_REINDEX_FAILED'
    });
  }
}
