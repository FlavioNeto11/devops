/**
 * Administração da memória conversacional: inspeção (working/patch/vetorial +
 * IDs ativos), export, limpeza (com confirmação) e rebuild de resumo.
 * Toda mutação registra `ai_memory_admin_events` (auditoria).
 */
import {
  loadWorkingMemory,
  updateAndPersistWorkingMemory,
  operationalTodayIso
} from '../conversation/memory/conversation-working-memory-service.js';
import { findConversationMemory } from '../../repositories/conversation-memory-repo.js';
import { listConversationMessages } from '../../repositories/conversation-message-repo.js';
import { listConversationSemanticMemory } from '../../repositories/conversation-semantic-memory-repo.js';
import {
  insertAiMemoryAdminEvent,
  listAiMemoryAdminEvents,
  clearSessionMemory,
  type AiMemoryAdminEventRecord
} from '../../repositories/ai-memory-admin-repo.js';
import type { AiMemorySnapshot } from './ai-control-types.js';

const MEMORY_PATCH_KIND = 'memory_patch';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clampText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function readDateRange(record: Record<string, unknown> | null): { dateFrom: string | null; dateTo: string | null } | null {
  if (!record) return null;
  const dateFrom = typeof record.dateFrom === 'string' ? record.dateFrom : null;
  const dateTo = typeof record.dateTo === 'string' ? record.dateTo : null;
  if (!dateFrom && !dateTo) return null;
  return { dateFrom, dateTo };
}

export async function getMemorySnapshot(
  conversationSessionId: string,
  integrationAccountId: string | null
): Promise<AiMemorySnapshot> {
  const wm = await loadWorkingMemory({ conversationSessionId, integrationAccountId });
  const patchRow = await findConversationMemory(conversationSessionId, integrationAccountId, MEMORY_PATCH_KIND).catch(() => null);
  const patchPayload = patchRow ? asRecord(patchRow.summaryPayload) : null;
  const messages = await listConversationMessages(conversationSessionId, integrationAccountId, 30).catch(() => []);
  const semantic = await listConversationSemanticMemory(conversationSessionId, integrationAccountId, 20).catch(() => []);

  const wmRecord = wm ? ({ ...wm } as Record<string, unknown>) : null;
  const focus = wm ? asRecord((wm as Record<string, unknown>).operationalFocus) : null;

  const wmManifests = focus ? asStringArray(focus.activeManifestIds) : [];
  const wmJobs = focus ? asStringArray(focus.activeJobIds) : [];
  const wmWindow = focus ? asRecord(focus.activeDateWindow) : null;

  const patchManifests = patchPayload ? asStringArray(patchPayload.activeManifestIds) : [];
  const patchAsked = patchPayload ? asStringArray(patchPayload.askedManifestIds) : [];
  const patchJobs = patchPayload ? asStringArray(patchPayload.activeJobIds) : [];
  const patchArtifacts = patchPayload ? asStringArray(patchPayload.artifactIds) : [];

  const dateRange = readDateRange(wmWindow) ?? readDateRange(patchPayload ? asRecord(patchPayload.dateRange) : null);

  const recentMessages = messages.map((message) => ({
    role: message?.role ?? 'unknown',
    text: message?.messageText ?? null,
    createdAt: message?.createdAt ?? null
  }));

  const wmUpdatedAt = wm && typeof (wm as Record<string, unknown>).updatedAt === 'string'
    ? ((wm as Record<string, unknown>).updatedAt as string)
    : null;

  return {
    conversationSessionId,
    integrationAccountId,
    workingMemory: wmRecord,
    memoryPatches: patchPayload ? [patchPayload] : [],
    vectorMemory: {
      count: semantic.length,
      hits: semantic.slice(0, 10).map((record) => ({
        role: record.role,
        text: clampText(record.text, 400),
        score: 0
      }))
    },
    activeManifestIds: uniq([...wmManifests, ...patchManifests]),
    askedManifestIds: uniq(patchAsked),
    activeJobIds: uniq([...wmJobs, ...patchJobs]),
    artifactIds: uniq(patchArtifacts),
    dateRange,
    messagesCount: recentMessages.length,
    lastUpdatedAt: wmUpdatedAt ?? recentMessages[0]?.createdAt ?? null,
    recentMessages: recentMessages.slice(0, 15)
  };
}

export async function clearMemory(
  conversationSessionId: string,
  integrationAccountId: string | null,
  actorUserId: string,
  correlationId: string | null
): Promise<{ memoryRows: number; semanticRows: number }> {
  const before = await getMemorySnapshot(conversationSessionId, integrationAccountId);
  const cleared = await clearSessionMemory(conversationSessionId, integrationAccountId);
  await insertAiMemoryAdminEvent({
    conversationSessionId,
    action: 'memory.clear',
    beforePayload: before as unknown as Record<string, unknown>,
    afterPayload: { cleared },
    requestedBy: actorUserId,
    correlationId
  });
  return cleared;
}

export async function exportMemorySnapshot(
  conversationSessionId: string,
  integrationAccountId: string | null,
  actorUserId: string,
  correlationId: string | null
): Promise<AiMemorySnapshot> {
  const snapshot = await getMemorySnapshot(conversationSessionId, integrationAccountId);
  await insertAiMemoryAdminEvent({
    conversationSessionId,
    action: 'memory.export',
    afterPayload: { messagesCount: snapshot.messagesCount, activeManifestIds: snapshot.activeManifestIds.length },
    requestedBy: actorUserId,
    correlationId
  });
  return snapshot;
}

export async function rebuildMemorySummary(
  conversationSessionId: string,
  integrationAccountId: string | null,
  sessionContextId: string | null,
  actorUserId: string,
  correlationId: string | null
): Promise<AiMemorySnapshot> {
  const messages = await listConversationMessages(conversationSessionId, integrationAccountId, 20).catch(() => []);
  const reversed = [...messages].reverse();
  const lastUser = reversed.find((message) => message?.role === 'user');
  const lastAssistant = reversed.find((message) => message?.role === 'assistant');

  await updateAndPersistWorkingMemory({
    conversationSessionId,
    integrationAccountId,
    sessionContextId: sessionContextId ?? null,
    userMessage: lastUser?.messageText || 'rebuild administrativo de memoria',
    assistantText: lastAssistant?.messageText || '',
    today: operationalTodayIso()
  });

  const snapshot = await getMemorySnapshot(conversationSessionId, integrationAccountId);
  await insertAiMemoryAdminEvent({
    conversationSessionId,
    action: 'memory.rebuild_summary',
    afterPayload: { goal: snapshot.workingMemory?.goal ?? null },
    requestedBy: actorUserId,
    correlationId
  });
  return snapshot;
}

export async function listMemoryAdminHistory(conversationSessionId: string): Promise<AiMemoryAdminEventRecord[]> {
  return listAiMemoryAdminEvents(conversationSessionId);
}
