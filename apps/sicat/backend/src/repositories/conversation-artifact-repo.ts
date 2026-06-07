import { query } from '../db/pool.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationArtifactRow = {
  id: string;
  conversation_session_id: string;
  conversation_turn_id: string;
  artifact_type: string;
  source_kind: string;
  status: string;
  title: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  source_refs: JsonObject | null;
  metadata: JsonObject | null;
  progress_total: number;
  progress_completed: number;
  progress_failed: number;
  correlation_id: string;
  job_id: string | null;
  integration_account_id: string | null;
  session_context_id: string | null;
  available_at: IsoLike;
  expires_at: IsoLike;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapConversationArtifact(row?: ConversationArtifactRow) {
  if (!row) return null;

  return {
    id: row.id,
    conversationSessionId: row.conversation_session_id,
    conversationTurnId: row.conversation_turn_id,
    artifactType: row.artifact_type,
    sourceKind: row.source_kind,
    status: row.status,
    title: row.title,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    sourceRefs: row.source_refs || {},
    metadata: row.metadata || {},
    progressTotal: row.progress_total,
    progressCompleted: row.progress_completed,
    progressFailed: row.progress_failed,
    correlationId: row.correlation_id,
    jobId: row.job_id,
    integrationAccountId: row.integration_account_id,
    sessionContextId: row.session_context_id,
    availableAt: toIso(row.available_at),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function insertConversationArtifact(input: {
  id: string;
  conversationSessionId: string;
  conversationTurnId: string;
  artifactType: 'document' | 'zip';
  sourceKind: string;
  status: 'processing' | 'available' | 'partial' | 'failed' | 'expired';
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
  sourceRefs?: JsonObject;
  metadata?: JsonObject;
  progressTotal?: number;
  progressCompleted?: number;
  progressFailed?: number;
  correlationId: string;
  jobId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  availableAt?: string | null;
  expiresAt?: string | null;
}) {
  const result = await query<ConversationArtifactRow>(
    `insert into conversation_artifacts(
      id,
      conversation_session_id,
      conversation_turn_id,
      artifact_type,
      source_kind,
      status,
      title,
      file_name,
      mime_type,
      storage_path,
      source_refs,
      metadata,
      progress_total,
      progress_completed,
      progress_failed,
      correlation_id,
      job_id,
      integration_account_id,
      session_context_id,
      available_at,
      expires_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    returning *`,
    [
      input.id,
      input.conversationSessionId,
      input.conversationTurnId,
      input.artifactType,
      input.sourceKind,
      input.status,
      input.title,
      input.fileName || null,
      input.mimeType || null,
      input.storagePath || null,
      JSON.stringify(input.sourceRefs || {}),
      JSON.stringify(input.metadata || {}),
      input.progressTotal ?? 0,
      input.progressCompleted ?? 0,
      input.progressFailed ?? 0,
      input.correlationId,
      input.jobId || null,
      input.integrationAccountId || null,
      input.sessionContextId || null,
      input.availableAt || null,
      input.expiresAt || null
    ]
  );

  return mapConversationArtifact(result.rows[0]);
}

export async function findConversationArtifactById(id: string) {
  const result = await query<ConversationArtifactRow>(
    `select * from conversation_artifacts where id = $1 limit 1`,
    [id]
  );
  return mapConversationArtifact(result.rows[0]);
}

export async function updateConversationArtifact(id: string, patch: {
  status?: 'processing' | 'available' | 'partial' | 'failed' | 'expired';
  title?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
  sourceRefs?: JsonObject;
  metadata?: JsonObject;
  progressTotal?: number;
  progressCompleted?: number;
  progressFailed?: number;
  jobId?: string | null;
  availableAt?: string | null;
  expiresAt?: string | null;
}) {
  const result = await query<ConversationArtifactRow>(
    `update conversation_artifacts set
       status = coalesce($2, status),
       title = coalesce($3, title),
       file_name = coalesce($4, file_name),
       mime_type = coalesce($5, mime_type),
       storage_path = coalesce($6, storage_path),
       source_refs = coalesce($7::jsonb, source_refs),
       metadata = coalesce($8::jsonb, metadata),
       progress_total = coalesce($9, progress_total),
       progress_completed = coalesce($10, progress_completed),
       progress_failed = coalesce($11, progress_failed),
       job_id = coalesce($12, job_id),
       available_at = coalesce($13, available_at),
       expires_at = coalesce($14, expires_at),
       updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      patch.status || null,
      patch.title || null,
      patch.fileName || null,
      patch.mimeType || null,
      patch.storagePath || null,
      patch.sourceRefs ? JSON.stringify(patch.sourceRefs) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
      patch.progressTotal ?? null,
      patch.progressCompleted ?? null,
      patch.progressFailed ?? null,
      patch.jobId || null,
      patch.availableAt || null,
      patch.expiresAt || null
    ]
  );

  return mapConversationArtifact(result.rows[0]);
}