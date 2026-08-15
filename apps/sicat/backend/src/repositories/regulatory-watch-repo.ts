/**
 * Repositório do Regulatory Watch (PR-H1, DL-103).
 *
 * `regulatory_watch_items`/`regulatory_watch_events` (migration 033) + leitura das fontes
 * monitoradas (`regulatory_sources`, migration 021) e escrita do `source_hash` na aplicação
 * (`aplicar`). SEM tenancy — o catálogo regulatório e seu monitoramento são GLOBAIS neste operador
 * único (mesmo racional de `regulatory-repo.ts`).
 *
 * Padrões da casa: SQL parametrizado, client opcional (`DbClient`) para participar de transações do
 * chamador (molde `regulatory-repo.ts`/`rntrc-verification-repo.ts`).
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import type {
  RegulatoryWatchAiAnalysis,
  RegulatoryWatchDetectedChange,
  RegulatoryWatchEvent,
  RegulatoryWatchEventType,
  RegulatoryWatchItem,
  RegulatoryWatchItemStatus
} from '../lib/transport/regulatory-watch-types.js';
import { REGULATORY_WATCH_PENDING_STATUSES } from '../lib/transport/regulatory-watch-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// =============================================================================
// regulatory_sources — leitura das fontes monitoradas + escrita do source_hash na aplicação
// =============================================================================

export type MonitoredSourceRow = {
  id: string;
  reference: string;
  title: string;
  sourceUrl: string;
  sourceHash: string | null;
};

type SourceRow = {
  id: string;
  reference: string;
  title: string;
  source_url: string | null;
  source_hash: string | null;
  monitoring_status: string;
};

/** Fontes elegíveis para a varredura: `monitoring_status='monitored'` e `source_url` preenchida. */
export async function listMonitoredSourcesWithUrl(client: DbClient = null): Promise<MonitoredSourceRow[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<SourceRow>(
    `select id, reference, title, source_url, source_hash
       from regulatory_sources
      where monitoring_status = 'monitored'
        and source_url is not null
        and source_url <> ''
      order by reference asc`
  );
  return result.rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    sourceUrl: row.source_url as string,
    sourceHash: row.source_hash
  }));
}

export async function getSourceById(sourceId: string, client: DbClient = null): Promise<{ id: string; sourceHash: string | null } | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<{ id: string; source_hash: string | null }>(
    'select id, source_hash from regulatory_sources where id = $1',
    [sourceId]
  );
  const row = result.rows[0];
  return row ? { id: row.id, sourceHash: row.source_hash } : null;
}

/**
 * Atualiza `source_hash` na APLICAÇÃO (`aplicar`, nunca na detecção — senão a próxima varredura
 * perderia a capacidade de detectar a MESMA mudança de novo caso o item seja rejeitado depois).
 */
export async function updateSourceHashOnApply(sourceId: string, newHash: string, client: DbClient = null): Promise<void> {
  const execute = getQueryExecutor(client);
  await execute('update regulatory_sources set source_hash = $2 where id = $1', [sourceId, newHash]);
}

// =============================================================================
// regulatory_watch_items
// =============================================================================

type WatchItemRow = {
  id: string;
  source_id: string;
  status: string;
  detected_change: unknown;
  ingested_content_ref: string | null;
  ai_analysis: unknown;
  human_review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  applied_rule_version_id: string | null;
  job_id: string | null;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapWatchItemRow(row: WatchItemRow | undefined): RegulatoryWatchItem | null {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status as RegulatoryWatchItemStatus,
    detectedChange: toJsonObject(row.detected_change) as RegulatoryWatchDetectedChange | Record<string, never>,
    ingestedContentRef: row.ingested_content_ref,
    aiAnalysis: toJsonObject(row.ai_analysis) as RegulatoryWatchAiAnalysis | Record<string, never>,
    humanReviewNotes: row.human_review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
    appliedRuleVersionId: row.applied_rule_version_id,
    jobId: row.job_id,
    correlationId: row.correlation_id,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

export type InsertWatchItemInput = {
  id: string;
  sourceId: string;
  status: RegulatoryWatchItemStatus;
  detectedChange: RegulatoryWatchDetectedChange;
  jobId?: string | null;
  correlationId: string;
};

export async function insertWatchItem(input: InsertWatchItemInput, client: DbClient = null): Promise<RegulatoryWatchItem> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchItemRow>(
    `insert into regulatory_watch_items (
       id, source_id, status, detected_change, job_id, correlation_id
     ) values ($1, $2, $3, $4::jsonb, $5, $6)
     returning *`,
    [input.id, input.sourceId, input.status, JSON.stringify(input.detectedChange), input.jobId ?? null, input.correlationId]
  );
  const mapped = mapWatchItemRow(result.rows[0]);
  if (!mapped) throw new Error('insertWatchItem: insert não retornou linha');
  return mapped;
}

export async function getWatchItemById(id: string, client: DbClient = null): Promise<RegulatoryWatchItem | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchItemRow>('select * from regulatory_watch_items where id = $1', [id]);
  return mapWatchItemRow(result.rows[0]);
}

/**
 * Existe um item NÃO-TERMINAL para esta fonte com o MESMO `newHash`? — a varredura usa isto para
 * não duplicar o acompanhamento de uma mudança já detectada e ainda pendente de decisão humana
 * (proteção contra retry do job reprocessar a MESMA mudança, já que `source_hash` só muda em
 * `aplicar`).
 */
export async function findPendingWatchItemBySourceAndHash(
  sourceId: string,
  newHash: string,
  client: DbClient = null
): Promise<RegulatoryWatchItem | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchItemRow>(
    `select * from regulatory_watch_items
      where source_id = $1
        and status = any($2::text[])
        and detected_change ->> 'newHash' = $3
      order by created_at desc
      limit 1`,
    [sourceId, [...REGULATORY_WATCH_PENDING_STATUSES], newHash]
  );
  return mapWatchItemRow(result.rows[0]);
}

export type UpdateWatchItemPatch = {
  status: RegulatoryWatchItemStatus;
  ingestedContentRef?: string | null;
  aiAnalysis?: RegulatoryWatchAiAnalysis | Record<string, never>;
  humanReviewNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  appliedRuleVersionId?: string | null;
};

/**
 * Update otimista (`expectedVersion`, molde `updatePartyById`) — devolve `null` quando a versão não
 * bate (outra escrita concorrente já mudou o item), nunca lança.
 */
export async function updateWatchItem(
  id: string,
  expectedVersion: number,
  patch: UpdateWatchItemPatch,
  client: DbClient = null
): Promise<RegulatoryWatchItem | null> {
  const execute = getQueryExecutor(client);
  const sets: string[] = ['status = $3'];
  const values: unknown[] = [id, expectedVersion, patch.status];

  function addSet(column: string, value: unknown, cast = '') {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  }

  if (patch.ingestedContentRef !== undefined) addSet('ingested_content_ref', patch.ingestedContentRef);
  if (patch.aiAnalysis !== undefined) addSet('ai_analysis', JSON.stringify(patch.aiAnalysis), '::jsonb');
  if (patch.humanReviewNotes !== undefined) addSet('human_review_notes', patch.humanReviewNotes);
  if (patch.reviewedBy !== undefined) addSet('reviewed_by', patch.reviewedBy);
  if (patch.reviewedAt !== undefined) addSet('reviewed_at', patch.reviewedAt);
  if (patch.appliedRuleVersionId !== undefined) addSet('applied_rule_version_id', patch.appliedRuleVersionId);

  const result = await execute<WatchItemRow>(
    `update regulatory_watch_items
        set ${sets.join(', ')}
      where id = $1 and version = $2
      returning *`,
    values
  );
  return mapWatchItemRow(result.rows[0]);
}

export type ListWatchItemsFilters = {
  status?: RegulatoryWatchItemStatus | string;
  sourceId?: string;
  page: number;
  pageSize: number;
};

export async function listWatchItems(filters: ListWatchItemsFilters, client: DbClient = null): Promise<{ items: RegulatoryWatchItem[]; totalItems: number }> {
  const execute = getQueryExecutor(client);
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }
  if (filters.sourceId) {
    values.push(filters.sourceId);
    where.push(`source_id = $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (filters.page - 1) * filters.pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(filters.pageSize, offset);

  const rows = await execute<WatchItemRow>(
    `select * from regulatory_watch_items
      ${whereSql}
      order by created_at desc
      limit $${limitIndex} offset $${offsetIndex}`,
    values
  );

  const countParams = values.slice(0, -2);
  const total = await execute<{ count: number }>(
    `select count(*)::int as count from regulatory_watch_items ${whereSql}`,
    countParams
  );

  return {
    items: rows.rows.map(mapWatchItemRow).filter((item): item is RegulatoryWatchItem => item !== null),
    totalItems: total.rows[0]?.count || 0
  };
}

/**
 * Item cuja aplicação criou EXATAMENTE esta versão de regra — usado pela promoção administrativa
 * (`promoteTransportRuleVersionService`, `transporte-regras-service.ts`) para decidir se a
 * promoção também vira um evento em `regulatory_watch_events` (item ligado) ou só auditoria técnica
 * (sem item — versão criada fora do fluxo do Watch, ex.: seed/futuro import manual).
 */
export async function findWatchItemByAppliedRuleVersionId(ruleVersionId: string, client: DbClient = null): Promise<RegulatoryWatchItem | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchItemRow>(
    'select * from regulatory_watch_items where applied_rule_version_id = $1 limit 1',
    [ruleVersionId]
  );
  return mapWatchItemRow(result.rows[0]);
}

/** Contagem de itens em `human_review` — usado pelo Centro Operacional (global, sem tenancy). */
export async function countWatchItemsInHumanReview(client: DbClient = null): Promise<number> {
  const execute = getQueryExecutor(client);
  const result = await execute<{ count: number }>(
    `select count(*)::int as count from regulatory_watch_items where status = 'human_review'`
  );
  return result.rows[0]?.count || 0;
}

// =============================================================================
// regulatory_watch_events — APPEND-ONLY
// =============================================================================

type WatchEventRow = {
  id: string;
  watch_item_id: string | null;
  source_id: string;
  event_type: string;
  detail: unknown;
  correlation_id: string;
  created_at: Date | string;
};

function mapWatchEventRow(row: WatchEventRow | undefined): RegulatoryWatchEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    watchItemId: row.watch_item_id,
    sourceId: row.source_id,
    eventType: row.event_type as RegulatoryWatchEventType,
    detail: toJsonObject(row.detail),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at) ?? ''
  };
}

export type InsertWatchEventInput = {
  id: string;
  watchItemId?: string | null;
  sourceId: string;
  eventType: RegulatoryWatchEventType;
  detail?: Record<string, unknown>;
  correlationId: string;
};

export async function insertWatchEvent(input: InsertWatchEventInput, client: DbClient = null): Promise<RegulatoryWatchEvent> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchEventRow>(
    `insert into regulatory_watch_events (
       id, watch_item_id, source_id, event_type, detail, correlation_id
     ) values ($1, $2, $3, $4, $5::jsonb, $6)
     returning *`,
    [input.id, input.watchItemId ?? null, input.sourceId, input.eventType, JSON.stringify(input.detail || {}), input.correlationId]
  );
  const mapped = mapWatchEventRow(result.rows[0]);
  if (!mapped) throw new Error('insertWatchEvent: insert não retornou linha');
  return mapped;
}

export async function listWatchEventsForItem(watchItemId: string, client: DbClient = null): Promise<RegulatoryWatchEvent[]> {
  const execute = getQueryExecutor(client);
  const result = await execute<WatchEventRow>(
    'select * from regulatory_watch_events where watch_item_id = $1 order by created_at asc',
    [watchItemId]
  );
  return result.rows.map(mapWatchEventRow).filter((event): event is RegulatoryWatchEvent => event !== null);
}
