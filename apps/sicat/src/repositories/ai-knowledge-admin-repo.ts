import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIntOrZero(value: unknown): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

type AiKnowledgeSourceRow = {
  id: string;
  source_key: string;
  source_type: string;
  title: string | null;
  path_or_uri: string | null;
  enabled: boolean;
  embedding_model: string | null;
  last_indexed_at: IsoLike;
  chunk_count: number;
  status: string;
  metadata_json: JsonObject | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

export type AiKnowledgeSourceRecord = {
  id: string;
  sourceKey: string;
  sourceType: string;
  title: string | null;
  pathOrUri: string | null;
  enabled: boolean;
  embeddingModel: string | null;
  lastIndexedAt: string | null;
  chunkCount: number;
  status: string;
  metadata: JsonObject;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapAiKnowledgeSource(row: AiKnowledgeSourceRow): AiKnowledgeSourceRecord {
  return {
    id: row.id,
    sourceKey: row.source_key,
    sourceType: row.source_type,
    title: row.title,
    pathOrUri: row.path_or_uri,
    enabled: row.enabled,
    embeddingModel: row.embedding_model,
    lastIndexedAt: toIso(row.last_indexed_at),
    chunkCount: toIntOrZero(row.chunk_count),
    status: row.status,
    metadata: row.metadata_json || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function listAiKnowledgeSources(): Promise<AiKnowledgeSourceRecord[]> {
  const result = await query<AiKnowledgeSourceRow>(`select * from ai_knowledge_sources order by source_key asc`);
  return result.rows.map(mapAiKnowledgeSource);
}

export async function findAiKnowledgeSource(sourceKey: string): Promise<AiKnowledgeSourceRecord | null> {
  const result = await query<AiKnowledgeSourceRow>(
    `select * from ai_knowledge_sources where source_key = $1`,
    [sourceKey]
  );
  const row = result.rows[0];
  return row ? mapAiKnowledgeSource(row) : null;
}

export async function upsertAiKnowledgeSource(input: {
  sourceKey: string;
  sourceType?: string;
  title?: string | null;
  pathOrUri?: string | null;
  enabled?: boolean;
  embeddingModel?: string | null;
  lastIndexedAt?: string | null;
  chunkCount?: number;
  status?: string;
  metadata?: JsonObject;
}): Promise<AiKnowledgeSourceRecord | null> {
  const result = await query<AiKnowledgeSourceRow>(
    `insert into ai_knowledge_sources(
      id, source_key, source_type, title, path_or_uri, enabled,
      embedding_model, last_indexed_at, chunk_count, status, metadata_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    on conflict (source_key) do update set
      source_type = excluded.source_type,
      title = coalesce(excluded.title, ai_knowledge_sources.title),
      path_or_uri = coalesce(excluded.path_or_uri, ai_knowledge_sources.path_or_uri),
      enabled = excluded.enabled,
      embedding_model = coalesce(excluded.embedding_model, ai_knowledge_sources.embedding_model),
      last_indexed_at = coalesce(excluded.last_indexed_at, ai_knowledge_sources.last_indexed_at),
      chunk_count = excluded.chunk_count,
      status = excluded.status,
      metadata_json = excluded.metadata_json,
      updated_at = now()
    returning *`,
    [
      createPrefixedId('aiksrc'),
      input.sourceKey,
      input.sourceType || 'file',
      input.title ?? null,
      input.pathOrUri ?? null,
      input.enabled ?? true,
      input.embeddingModel ?? null,
      input.lastIndexedAt ?? null,
      input.chunkCount ?? 0,
      input.status || 'unknown',
      JSON.stringify(input.metadata || {})
    ]
  );
  const row = result.rows[0];
  return row ? mapAiKnowledgeSource(row) : null;
}

export async function setAiKnowledgeSourceEnabled(sourceKey: string, enabled: boolean): Promise<AiKnowledgeSourceRecord | null> {
  const result = await query<AiKnowledgeSourceRow>(
    `update ai_knowledge_sources set enabled = $2, updated_at = now() where source_key = $1 returning *`,
    [sourceKey, enabled]
  );
  const row = result.rows[0];
  return row ? mapAiKnowledgeSource(row) : null;
}
