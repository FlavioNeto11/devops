import { createPrefixedId } from '../../../lib/ids.js';
import { upsertConversationMemory } from '../../../repositories/conversation-memory-repo.js';
import type { LlmPlan } from '../llm-provider.js';
import { resolveConversationDateRange } from '../planning/conversation-date-range-resolver.js';
import type { ConversationMemoryPatch } from './conversation-memory-types.js';

type LooseRecord = Record<string, unknown>;

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

function toStringArray(value: unknown, max = 30): string[] {
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

function collectManifestIdsFromResult(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const fromAffected = (Array.isArray(data.affectedItems) ? data.affectedItems : [])
    .map((item) => toNullableString(toRecord(item).manifestId))
    .filter((value): value is string => Boolean(value));
  const fromManifests = (Array.isArray(data.manifests) ? data.manifests : [])
    .map((item) => {
      const record = toRecord(item);
      return toNullableString(record.manifestId || record.id);
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set([...fromAffected, ...fromManifests])).slice(0, 30);
}

function collectJobIdsFromResult(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const topJobId = toNullableString(payload.jobId);
  const executionItems = Array.isArray(toRecord(data.execution).items)
    ? toRecord(data.execution).items as unknown[]
    : [];
  const executionJobIds = executionItems
    .map((item) => toNullableString(toRecord(item).jobId))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set([...(topJobId ? [topJobId] : []), ...executionJobIds])).slice(0, 20);
}

function collectArtifactIds(toolResult: unknown): string[] {
  const payload = toRecord(toolResult);
  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];

  return artifacts
    .map((artifact) => toNullableString(toRecord(toRecord(artifact).payload).artifactId))
    .filter((value): value is string => Boolean(value))
    .slice(0, 20);
}

function resolveIntent(llmPlan: LlmPlan): string | null {
  const toolCall = llmPlan.toolCall;
  if (toolCall && typeof toolCall.name === 'string' && toolCall.name.trim()) {
    const args = toRecord(toolCall.arguments);
    return toNullableString(args.intent) || toolCall.name;
  }

  const classifier = toRecord(llmPlan.orchestration?.classifier as unknown);
  return toNullableString(classifier.intent);
}

export function buildConversationMemoryPatch(input: {
  llmPlan: LlmPlan;
  askedManifestIds: string[];
  toolResult?: unknown;
}): ConversationMemoryPatch {
  const toolCallArgs = toRecord(input.llmPlan.toolCall?.arguments);
  const classifierEntities = toRecord(input.llmPlan.orchestration?.classifier?.entities);
  const dateRange = resolveConversationDateRange({
    toolArgs: toolCallArgs,
    entities: classifierEntities
  });
  // Filtro/agrupamento do recorte ativo (orchestrate_manifest_operation.selection) — persistidos
  // junto da janela para follow-ups reusarem o recorte (não só o período). status pode vir array.
  const selection = toRecord(toolCallArgs.selection);
  const selectionStatus = Array.isArray(selection.status)
    ? (selection.status.map((s) => toNullableString(s)).filter(Boolean).join(', ') || null)
    : toNullableString(selection.status);
  const selectionGroupBy = toNullableString(selection.groupBy) || toNullableString((selection as Record<string, unknown>).group_by);

  return {
    patchVersion: 'conversation-memory.v1',
    intent: resolveIntent(input.llmPlan),
    lastToolName: input.llmPlan.toolCall?.name || null,
    askedManifestIds: toStringArray(input.askedManifestIds, 30),
    activeManifestIds: collectManifestIdsFromResult(input.toolResult),
    activeJobIds: collectJobIdsFromResult(input.toolResult),
    artifactIds: collectArtifactIds(input.toolResult),
    dateRange: dateRange.dateFrom || dateRange.dateTo
      ? {
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        status: selectionStatus,
        groupBy: selectionGroupBy
      }
      : null,
    updatedAt: new Date().toISOString()
  };
}

export async function persistConversationMemoryPatch(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  patch: ConversationMemoryPatch;
}) {
  await upsertConversationMemory({
    id: createPrefixedId('cmem'),
    conversationSessionId: input.conversationSessionId,
    summaryKind: 'memory_patch',
    summaryText: `Intent: ${input.patch.intent || 'unknown'} | tool: ${input.patch.lastToolName || 'none'}`,
    summaryPayload: {
      ...input.patch,
      integrationAccountId: input.integrationAccountId,
      sessionContextId: input.sessionContextId
    },
    validUntil: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  });
}
