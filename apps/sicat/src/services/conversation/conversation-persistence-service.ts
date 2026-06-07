import { createPrefixedId } from '../../lib/ids.js';
import { resolveStoragePath, ensureDir } from '../../lib/files.js';
import { AppError } from '../../lib/problem.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../../lib/retry.js';
import {
  insertConversationDeterministicTrail
} from '../../repositories/conversation-deterministic-trail-repo.js';
import {
  findConversationArtifactById,
  insertConversationArtifact,
  updateConversationArtifact
} from '../../repositories/conversation-artifact-repo.js';
import {
  listActiveConversationMemory,
  upsertConversationMemory
} from '../../repositories/conversation-memory-repo.js';
import { listManifestDocuments } from '../../repositories/manifest-repo.js';
import { findJobById, insertJob, updateJob } from '../../repositories/job-repo.js';
import type { ConversationArtifact } from './tools/tool-types.js';

type LooseRecord = Record<string, unknown>;
type PersistedArtifactRef = {
  artifactId: string;
  artifactType: string;
  status: string;
  title: string;
  jobId: string | null;
};

type PersistedConversationOperationalState = {
  lastManifestSelectionIds: string[];
  askedManifestIds: string[];
  jobIds: string[];
  artifactRefs: PersistedArtifactRef[];
};

type ConversationPersistenceContext = {
  conversationSessionId: string;
  conversationTurnId: string;
  correlationId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  requestedBy: string | null;
};

const CONVERSATION_ARTIFACT_TTL_HOURS = 72;

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function toStringArray(value: unknown, max = 50): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  const seen = new Set<string>();

  for (const item of value.slice(0, max)) {
    const normalized = toNullableString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function nowIso() {
  return new Date().toISOString();
}

function buildArtifactExpiry(hours = CONVERSATION_ARTIFACT_TTL_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function buildMemoryExpiry(hours = 72) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function buildBundleFileName(totalItems: number) {
  const stamp = nowIso().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `chat-manifestos-${Math.max(totalItems, 1)}-itens-${stamp}.zip`;
}

function buildArtifactLinks(artifactId: string) {
  return {
    statusUrl: `/v1/conversations/artifacts/${artifactId}`,
    downloadUrl: `/v1/conversations/artifacts/${artifactId}/content`
  };
}

function toArtifactDescriptor(artifact: {
  id: string;
  artifactType: string;
  title: string;
  status: string;
  jobId: string | null;
  fileName: string | null;
  progressTotal: number;
  progressCompleted: number;
  progressFailed: number;
}) {
  const kind = artifact.artifactType === 'zip' ? 'zip_bundle' : 'document';
  const links = buildArtifactLinks(artifact.id);

  const descriptor: ConversationArtifact = {
    type: kind,
    title: artifact.title,
    payload: {
      artifactId: artifact.id,
      status: artifact.status,
      fileName: artifact.fileName,
      jobId: artifact.jobId,
      progress: {
        total: artifact.progressTotal,
        completed: artifact.progressCompleted,
        failed: artifact.progressFailed,
        pending: Math.max(artifact.progressTotal - artifact.progressCompleted - artifact.progressFailed, 0)
      },
      links
    }
  };

  return descriptor;
}

function extractManifestIdsFromToolResult(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const manifestIds: string[] = [];

  for (const item of Array.isArray(data.affectedItems) ? data.affectedItems : []) {
    const manifestId = toNullableString(toRecord(item).manifestId);
    if (manifestId) manifestIds.push(manifestId);
  }

  for (const item of Array.isArray(data.manifests) ? data.manifests : []) {
    const record = toRecord(item);
    const manifestId = toNullableString(record.manifestId || record.id);
    if (manifestId) manifestIds.push(manifestId);
  }

  return Array.from(new Set(manifestIds)).slice(0, 20);
}

function extractJobIdsFromToolResult(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const collected: string[] = [];

  const topJobId = toNullableString(payload.jobId);
  if (topJobId) collected.push(topJobId);

  const execution = toRecord(data.execution);
  for (const item of Array.isArray(execution.items) ? execution.items : []) {
    const jobId = toNullableString(toRecord(item).jobId);
    if (jobId) collected.push(jobId);
  }

  for (const item of Array.isArray(data.execution) ? data.execution : []) {
    const jobId = toNullableString(toRecord(item).jobId);
    if (jobId) collected.push(jobId);
  }

  return Array.from(new Set(collected)).slice(0, 20);
}

function extractSnapshotTokenFromResult(toolResult: unknown): string | null {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  return toNullableString(data.selectionSnapshot || data.creationSnapshot);
}

function extractCommandIdFromToolResult(toolResult: unknown): string | null {
  const payload = toRecord(toolResult);
  const command = toRecord(payload.command);
  const data = toRecord(payload.data);
  return toNullableString(payload.commandId || command.commandId || toRecord(data.command).commandId);
}

function extractCdfIdsFromToolResult(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const cdfIds: string[] = [];

  for (const item of Array.isArray(data.certificates) ? data.certificates : []) {
    const record = toRecord(item);
    const cdfId = toNullableString(record.documentId || record.id || record.cerHashCode || record.certificateHashCode);
    if (cdfId) cdfIds.push(cdfId);
  }

  for (const item of Array.isArray(data.execution) ? data.execution : []) {
    const record = toRecord(item);
    const cdfId = toNullableString(record.documentId || record.id || record.cerHashCode || record.certificateHashCode);
    if (cdfId) cdfIds.push(cdfId);
  }

  const documentIds = Array.isArray(data.documentIds) ? data.documentIds : [];
  for (const value of documentIds) {
    const cdfId = toNullableString(value);
    if (cdfId) cdfIds.push(cdfId);
  }

  return Array.from(new Set(cdfIds)).slice(0, 40);
}

function extractArtifactRefs(artifacts: ConversationArtifact[]): PersistedArtifactRef[] {
  const refs: PersistedArtifactRef[] = [];

  for (const artifact of artifacts) {
    const payload = toRecord(artifact.payload);
    const artifactId = toNullableString(payload.artifactId);
    if (!artifactId) continue;
    refs.push({
      artifactId,
      artifactType: artifact.type,
      status: toNullableString(payload.status) || 'processing',
      title: artifact.title,
      jobId: toNullableString(payload.jobId)
    });
  }

  return refs.slice(0, 10);
}

function mergeArtifactIntoJobPayload(payload: LooseRecord | null | undefined, artifactPatch: LooseRecord) {
  const basePayload = payload && typeof payload === 'object' ? payload : {};
  return {
    ...basePayload,
    ...artifactPatch
  };
}

async function attachArtifactToJob(jobId: string | null, artifactPatch: LooseRecord) {
  if (!jobId) return;
  const currentJob = await findJobById(jobId);
  if (!currentJob) return;

  await updateJob(jobId, {
    payload: mergeArtifactIntoJobPayload(currentJob.payload, artifactPatch)
  });
}

function buildOperationalMemorySummaryText(prefix: string, values: string[]) {
  if (values.length === 0) return prefix;
  return `${prefix}: ${values.join(', ')}`;
}

export async function loadPersistedConversationOperationalState(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
}): Promise<PersistedConversationOperationalState> {
  const items = await listActiveConversationMemory(input.conversationSessionId, input.integrationAccountId);
  const state: PersistedConversationOperationalState = {
    lastManifestSelectionIds: [],
    askedManifestIds: [],
    jobIds: [],
    artifactRefs: []
  };

  for (const item of items) {
    const payload = toRecord(item?.summaryPayload);
    const payloadIntegrationAccountId = toNullableString(payload.integrationAccountId);

    if (input.integrationAccountId) {
      if (!payloadIntegrationAccountId || payloadIntegrationAccountId !== input.integrationAccountId) {
        continue;
      }
    }

    if (item?.summaryKind === 'manifest_selection') {
      const manifestIds = toStringArray(payload.manifestIds || toRecord(payload.lastManifestSet).manifestIds, 20);
      if (manifestIds.length > 0) {
        state.lastManifestSelectionIds = manifestIds;
      }
      continue;
    }

    if (item?.summaryKind === 'manifest_refs') {
      const askedManifestIds = toStringArray(payload.askedManifestIds, 30);
      if (askedManifestIds.length > 0) {
        state.askedManifestIds = askedManifestIds;
      }
      continue;
    }

    if (item?.summaryKind === 'job_refs') {
      const jobIds = toStringArray(payload.jobIds, 20);
      if (jobIds.length > 0) {
        state.jobIds = jobIds;
      }
      continue;
    }

    if (item?.summaryKind === 'artifacts') {
      const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
      state.artifactRefs = artifacts
        .map((value) => {
          const record = toRecord(value);
          const artifactId = toNullableString(record.artifactId);
          if (!artifactId) return null;
          return {
            artifactId,
            artifactType: toNullableString(record.artifactType) || 'document',
            status: toNullableString(record.status) || 'processing',
            title: toNullableString(record.title) || 'Artifact',
            jobId: toNullableString(record.jobId)
          };
        })
        .filter((value): value is PersistedArtifactRef => Boolean(value))
        .slice(0, 10);
    }
  }

  return state;
}

export async function persistConversationOperationalState(input: {
  context: ConversationPersistenceContext;
  askedManifestIds: string[];
  toolResult?: unknown;
  persistedArtifacts?: ConversationArtifact[];
}) {
  const validUntil = buildMemoryExpiry();
  const manifestIds = input.toolResult ? extractManifestIdsFromToolResult(input.toolResult) : [];
  const jobIds = input.toolResult ? extractJobIdsFromToolResult(input.toolResult) : [];
  const artifactRefs = extractArtifactRefs(input.persistedArtifacts || []);
  const writes: Promise<unknown>[] = [];

  if (input.askedManifestIds.length > 0) {
    writes.push(upsertConversationMemory({
      id: createPrefixedId('cmem'),
      conversationSessionId: input.context.conversationSessionId,
      summaryKind: 'manifest_refs',
      summaryText: buildOperationalMemorySummaryText('Manifestos referenciados', input.askedManifestIds.slice(0, 10)),
      summaryPayload: {
        askedManifestIds: input.askedManifestIds,
        integrationAccountId: input.context.integrationAccountId,
        sessionContextId: input.context.sessionContextId,
        updatedAt: nowIso()
      },
      validUntil
    }));
  }

  if (manifestIds.length > 0) {
    writes.push(upsertConversationMemory({
      id: createPrefixedId('cmem'),
      conversationSessionId: input.context.conversationSessionId,
      summaryKind: 'manifest_selection',
      summaryText: buildOperationalMemorySummaryText('Ultima selecao de manifestos', manifestIds.slice(0, 10)),
      summaryPayload: {
        manifestIds,
        integrationAccountId: input.context.integrationAccountId,
        sessionContextId: input.context.sessionContextId,
        capturedAt: nowIso()
      },
      validUntil
    }));
  }

  if (jobIds.length > 0) {
    writes.push(upsertConversationMemory({
      id: createPrefixedId('cmem'),
      conversationSessionId: input.context.conversationSessionId,
      summaryKind: 'job_refs',
      summaryText: buildOperationalMemorySummaryText('Jobs operacionais recentes', jobIds.slice(0, 10)),
      summaryPayload: {
        jobIds,
        correlationId: input.context.correlationId,
        integrationAccountId: input.context.integrationAccountId,
        sessionContextId: input.context.sessionContextId,
        updatedAt: nowIso()
      },
      validUntil
    }));
  }

  if (artifactRefs.length > 0) {
    writes.push(upsertConversationMemory({
      id: createPrefixedId('cmem'),
      conversationSessionId: input.context.conversationSessionId,
      summaryKind: 'artifacts',
      summaryText: `Artifacts recentes: ${artifactRefs.map((artifact) => artifact.title).join(', ')}`,
      summaryPayload: {
        artifacts: artifactRefs,
        integrationAccountId: input.context.integrationAccountId,
        sessionContextId: input.context.sessionContextId,
        updatedAt: nowIso()
      },
      validUntil
    }));
  }

  await Promise.all(writes);
}

export async function persistConversationDeterministicTrail(input: {
  context: ConversationPersistenceContext;
  phase: 'snapshot' | 'plan' | 'result';
  intent?: string | null;
  executionStatus?: 'processing' | 'available' | 'partial' | 'failed' | 'expired' | 'blocked';
  snapshotToken?: string | null;
  snapshotPayload?: LooseRecord;
  planPayload?: LooseRecord;
  resultPayload?: LooseRecord;
  toolResult?: unknown;
  metadata?: LooseRecord;
}) {
  const manifestIds = input.toolResult ? extractManifestIdsFromToolResult(input.toolResult) : [];
  const cdfIds = input.toolResult ? extractCdfIdsFromToolResult(input.toolResult) : [];
  const jobIds = input.toolResult ? extractJobIdsFromToolResult(input.toolResult) : [];
  const commandId = input.toolResult ? extractCommandIdFromToolResult(input.toolResult) : null;
  const jobId = jobIds[0] || null;

  return insertConversationDeterministicTrail({
    id: createPrefixedId('cdt'),
    conversationSessionId: input.context.conversationSessionId,
    conversationTurnId: input.context.conversationTurnId,
    phase: input.phase,
    intent: input.intent || null,
    executionStatus: input.executionStatus || 'processing',
    snapshotToken: input.snapshotToken || (input.toolResult ? extractSnapshotTokenFromResult(input.toolResult) : null),
    snapshotPayload: input.snapshotPayload || {},
    planPayload: input.planPayload || {},
    resultPayload: input.resultPayload || {},
    metadata: input.metadata
      ? {
        ...input.metadata,
        requestedBy: input.context.requestedBy,
        phase: input.phase,
        recordedAt: nowIso()
      }
      : {
        requestedBy: input.context.requestedBy,
        phase: input.phase,
        recordedAt: nowIso()
      },
    manifestIds,
    cdfIds,
    correlationId: input.context.correlationId,
    jobId,
    commandId,
    integrationAccountId: input.context.integrationAccountId,
    sessionContextId: input.context.sessionContextId
  });
}

export async function registerConversationArtifactsForToolResult(input: {
  context: ConversationPersistenceContext;
  toolName: string;
  toolResult: unknown;
}) {
  const payload = toRecord(input.toolResult);
  const data = toRecord(payload.data);
  const intent = toNullableString(data.intent);
  const operation = toNullableString(data.operation);

  if (operation === 'manifest.print' || input.toolName === 'print_manifest') {
    const manifestId = extractManifestIdsFromToolResult(input.toolResult)[0];
    const sourceJobId = extractJobIdsFromToolResult(input.toolResult)[0] || null;
    if (!manifestId || !sourceJobId) return [];

    const artifact = await insertConversationArtifact({
      id: createPrefixedId('cart'),
      conversationSessionId: input.context.conversationSessionId,
      conversationTurnId: input.context.conversationTurnId,
      artifactType: 'document',
      sourceKind: 'manifest.print',
      status: 'processing',
      title: `PDF do manifesto ${manifestId}`,
      sourceRefs: {
        manifestId,
        sourceJobId,
        intent,
        operation: 'manifest.print'
      },
      metadata: {
        requestedBy: input.context.requestedBy,
        createdByTool: input.toolName
      },
      progressTotal: 1,
      correlationId: input.context.correlationId,
      jobId: sourceJobId,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      expiresAt: buildArtifactExpiry()
    });

    if (artifact) {
      await attachArtifactToJob(sourceJobId, {
        conversationArtifactId: artifact.id
      });
      return [toArtifactDescriptor(artifact)];
    }

    return [];
  }

  if (operation !== 'manifest.batch_print' && intent !== 'manifest.batch_print_selected') {
    return [];
  }

  const execution = toRecord(data.execution);
  const sourceItems = (Array.isArray(execution.items) ? execution.items : [])
    .map((value) => {
      const record = toRecord(value);
      const manifestId = toNullableString(record.manifestId);
      const jobId = toNullableString(record.jobId);
      if (!manifestId || !jobId) return null;
      return { manifestId, jobId };
    })
    .filter((value): value is { manifestId: string; jobId: string } => Boolean(value));

  if (sourceItems.length === 0) {
    return [];
  }

  if (sourceItems.length === 1) {
    const firstSourceItem = sourceItems[0];
    if (!firstSourceItem) {
      return [];
    }

    const singleArtifact = await insertConversationArtifact({
      id: createPrefixedId('cart'),
      conversationSessionId: input.context.conversationSessionId,
      conversationTurnId: input.context.conversationTurnId,
      artifactType: 'document',
      sourceKind: 'manifest.batch_print',
      status: 'processing',
      title: `PDF do manifesto ${firstSourceItem.manifestId}`,
      sourceRefs: {
        manifestId: firstSourceItem.manifestId,
        sourceJobId: firstSourceItem.jobId,
        operation: 'manifest.print',
        intent: 'manifest.batch_print_selected'
      },
      metadata: {
        requestedBy: input.context.requestedBy,
        batchSource: true
      },
      progressTotal: 1,
      correlationId: input.context.correlationId,
      jobId: firstSourceItem.jobId,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      expiresAt: buildArtifactExpiry()
    });

    if (singleArtifact) {
      await attachArtifactToJob(firstSourceItem.jobId, {
        conversationArtifactId: singleArtifact.id
      });
      return [toArtifactDescriptor(singleArtifact)];
    }

    return [];
  }

  const artifactId = createPrefixedId('cart');
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');
  const operationName = 'conversation.bundle_documents';
  const retryConfig = getRetryConfig(operationName);

  const artifact = await insertConversationArtifact({
    id: artifactId,
    conversationSessionId: input.context.conversationSessionId,
    conversationTurnId: input.context.conversationTurnId,
    artifactType: 'zip',
    sourceKind: 'manifest.batch_print',
    status: 'processing',
    title: `ZIP com ${sourceItems.length} PDFs do chat`,
    fileName: buildBundleFileName(sourceItems.length),
    mimeType: 'application/zip',
    sourceRefs: {
      sourceItems,
      intent: 'manifest.batch_print_selected',
      operation: 'manifest.batch_print'
    },
    metadata: {
      requestedBy: input.context.requestedBy,
      partialFailureHandling: 'include_available_documents'
    },
    progressTotal: sourceItems.length,
    correlationId: input.context.correlationId,
    jobId,
    integrationAccountId: input.context.integrationAccountId,
    sessionContextId: input.context.sessionContextId,
    expiresAt: buildArtifactExpiry()
  });

  await insertJob({
    jobId,
    commandId,
    entityType: 'conversation_artifact',
    entityId: artifactId,
    operation: operationName,
    payload: {
      artifactId,
      conversationSessionId: input.context.conversationSessionId,
      conversationTurnId: input.context.conversationTurnId,
      sourceItems,
      requestedBy: input.context.requestedBy,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: input.context.correlationId,
    priority: calculateJobPriority(operationName),
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({
      operation: operationName,
      entityType: 'conversation_artifact',
      status: 'queued'
    })
  });

  return artifact ? [toArtifactDescriptor(artifact)] : [];
}

async function refreshDocumentArtifact(artifact: Awaited<ReturnType<typeof findConversationArtifactById>>) {
  if (!artifact) return artifact;
  if (artifact.storagePath && (artifact.status === 'available' || artifact.status === 'partial')) {
    return artifact;
  }

  const sourceRefs = toRecord(artifact.sourceRefs);
  const manifestId = toNullableString(sourceRefs.manifestId);

  if (manifestId) {
    const documents = await listManifestDocuments(manifestId);
    const document = documents.find((item) => item?.type === 'manifest_pdf') || documents[0];
    if (document?.storagePath) {
      return updateConversationArtifact(artifact.id, {
        status: 'available',
        fileName: document.fileName,
        mimeType: document.mimeType,
        storagePath: document.storagePath,
        metadata: {
          ...artifact.metadata,
          manifestId,
          manifestDocumentId: document.id,
          refreshedAt: nowIso()
        },
        progressTotal: Math.max(artifact.progressTotal, 1),
        progressCompleted: Math.max(artifact.progressCompleted, 1),
        availableAt: nowIso(),
        expiresAt: buildArtifactExpiry()
      });
    }
  }

  const sourceJobId = toNullableString(sourceRefs.sourceJobId) || artifact.jobId;
  if (!sourceJobId) return artifact;

  const job = await findJobById(sourceJobId);
  const jobStatus = String(job?.status || '').toLowerCase();
  if (jobStatus === 'failed' || jobStatus === 'dlq' || jobStatus === 'cancelled') {
    return updateConversationArtifact(artifact.id, {
      status: 'failed',
      metadata: {
        ...artifact.metadata,
        sourceJobId,
        sourceJobStatus: job?.status || null,
        lastErrorCode: job?.lastErrorCode || null,
        lastErrorMessage: job?.lastErrorMessage || null,
        failedAt: nowIso()
      },
      progressTotal: Math.max(artifact.progressTotal, 1),
      progressFailed: 1
    });
  }

  return artifact;
}

async function authorizeArtifactScope(input: {
  artifact: Awaited<ReturnType<typeof findConversationArtifactById>>;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const { artifact } = input;
  if (!artifact) {
    throw new AppError(404, 'Not Found', 'Artifact conversacional nao encontrado.', {
      code: 'CONVERSATION_ARTIFACT_NOT_FOUND'
    });
  }

  if (input.integrationAccountId && artifact.integrationAccountId && input.integrationAccountId !== artifact.integrationAccountId) {
    throw new AppError(403, 'Forbidden', 'Artifact nao pertence a integrationAccountId informada.', {
      code: 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    });
  }

  if (input.sessionContextId && artifact.sessionContextId && input.sessionContextId !== artifact.sessionContextId) {
    throw new AppError(403, 'Forbidden', 'Artifact nao pertence a sessionContextId informada.', {
      code: 'CONVERSATION_ARTIFACT_SCOPE_FORBIDDEN'
    });
  }
}

async function expireArtifactIfNeeded(artifact: Awaited<ReturnType<typeof findConversationArtifactById>>) {
  if (!artifact) return artifact;
  if (artifact.status === 'expired') return artifact;

  const candidateExpiry = toNullableString(artifact.expiresAt)
    || (artifact.availableAt ? new Date(new Date(artifact.availableAt).getTime() + CONVERSATION_ARTIFACT_TTL_HOURS * 60 * 60 * 1000).toISOString() : null);

  if (!candidateExpiry) return artifact;
  if (new Date(candidateExpiry).getTime() > Date.now()) return artifact;

  return updateConversationArtifact(artifact.id, {
    status: 'expired',
    metadata: {
      ...artifact.metadata,
      expiredAt: nowIso()
    },
    expiresAt: candidateExpiry
  });
}

function mapArtifactStatusResponse(artifact: NonNullable<Awaited<ReturnType<typeof findConversationArtifactById>>>) {
  const links = buildArtifactLinks(artifact.id);
  return {
    artifactId: artifact.id,
    title: artifact.title,
    artifactType: artifact.artifactType,
    sourceKind: artifact.sourceKind,
    status: artifact.status,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    correlationId: artifact.correlationId,
    jobId: artifact.jobId,
    integrationAccountId: artifact.integrationAccountId,
    sessionContextId: artifact.sessionContextId,
    conversationSessionId: artifact.conversationSessionId,
    conversationTurnId: artifact.conversationTurnId,
    progress: {
      total: artifact.progressTotal,
      completed: artifact.progressCompleted,
      failed: artifact.progressFailed,
      pending: Math.max(artifact.progressTotal - artifact.progressCompleted - artifact.progressFailed, 0)
    },
    availableAt: artifact.availableAt,
    expiresAt: artifact.expiresAt,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    sourceRefs: artifact.sourceRefs,
    metadata: artifact.metadata,
    links
  };
}

export async function getConversationArtifactStatus(input: {
  artifactId: string;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const artifact = await findConversationArtifactById(input.artifactId);
  await authorizeArtifactScope({
    artifact,
    integrationAccountId: input.integrationAccountId || null,
    sessionContextId: input.sessionContextId || null
  });

  const refreshed = artifact?.artifactType === 'document'
    ? await refreshDocumentArtifact(artifact)
    : artifact;
  const normalized = await expireArtifactIfNeeded(refreshed);

  if (!normalized) {
    throw new AppError(404, 'Not Found', 'Artifact conversacional nao encontrado.', {
      code: 'CONVERSATION_ARTIFACT_NOT_FOUND'
    });
  }

  return mapArtifactStatusResponse(normalized);
}

export async function getConversationArtifactContent(input: {
  artifactId: string;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
}) {
  const artifact = await findConversationArtifactById(input.artifactId);
  await authorizeArtifactScope({
    artifact,
    integrationAccountId: input.integrationAccountId || null,
    sessionContextId: input.sessionContextId || null
  });

  const refreshed = artifact?.artifactType === 'document'
    ? await refreshDocumentArtifact(artifact)
    : artifact;
  const normalized = await expireArtifactIfNeeded(refreshed);

  if (normalized?.status === 'expired') {
    throw new AppError(410, 'Gone', 'Artifact expirou e nao esta mais disponivel para download.', {
      code: 'CONVERSATION_ARTIFACT_EXPIRED'
    });
  }

  if (!normalized?.storagePath || (normalized.status !== 'available' && normalized.status !== 'partial')) {
    throw new AppError(409, 'Conflict', 'Artifact ainda nao esta disponivel para download.', {
      code: 'CONVERSATION_ARTIFACT_NOT_READY'
    });
  }

  return {
    artifactId: normalized.id,
    mimeType: normalized.mimeType || (normalized.artifactType === 'zip' ? 'application/zip' : 'application/pdf'),
    fileName: normalized.fileName || (normalized.artifactType === 'zip' ? 'artifact.zip' : 'artifact.pdf'),
    storagePath: normalized.storagePath,
    status: normalized.status
  };
}

export async function markConversationArtifactDocumentAvailable(input: {
  artifactId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  metadata?: LooseRecord;
}) {
  return updateConversationArtifact(input.artifactId, {
    status: 'available',
    storagePath: input.storagePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    metadata: input.metadata
      ? {
        ...input.metadata,
        availableAt: nowIso()
      }
      : {
        availableAt: nowIso()
      },
    progressTotal: 1,
    progressCompleted: 1,
    availableAt: nowIso(),
    expiresAt: buildArtifactExpiry()
  });
}

export async function markConversationArtifactBundleResult(input: {
  artifactId: string;
  status: 'available' | 'partial' | 'failed';
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  progressTotal: number;
  progressCompleted: number;
  progressFailed: number;
  metadata?: LooseRecord;
}) {
  return updateConversationArtifact(input.artifactId, {
    status: input.status,
    storagePath: input.storagePath || null,
    fileName: input.fileName || null,
    mimeType: input.mimeType || null,
    progressTotal: input.progressTotal,
    progressCompleted: input.progressCompleted,
    progressFailed: input.progressFailed,
    metadata: input.metadata
      ? {
        ...input.metadata,
        updatedAt: nowIso()
      }
      : {
        updatedAt: nowIso()
      },
    availableAt: input.status === 'failed' ? null : nowIso(),
    expiresAt: buildArtifactExpiry()
  });
}

export async function markConversationArtifactFailed(input: {
  artifactId: string;
  reasonCode?: string | null;
  reasonMessage?: string | null;
  jobId?: string | null;
}) {
  const artifact = await findConversationArtifactById(input.artifactId);
  if (!artifact) return null;

  return updateConversationArtifact(input.artifactId, {
    status: 'failed',
    progressTotal: Math.max(artifact.progressTotal, 1),
    progressFailed: Math.max(artifact.progressFailed, 1),
    jobId: input.jobId || artifact.jobId,
    metadata: {
      ...artifact.metadata,
      failure: {
        reasonCode: input.reasonCode || null,
        reasonMessage: input.reasonMessage || null,
        failedAt: nowIso()
      }
    }
  });
}

export async function prepareConversationBundleStorage(artifactId: string, fileName: string) {
  const dir = resolveStoragePath('documents', 'conversation-artifacts', artifactId);
  await ensureDir(dir);
  return {
    dir,
    storagePath: resolveStoragePath('documents', 'conversation-artifacts', artifactId, fileName)
  };
}