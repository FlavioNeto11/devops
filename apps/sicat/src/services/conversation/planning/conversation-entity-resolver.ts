import { resolveConversationDateRange, type ResolvedDateRange } from './conversation-date-range-resolver.js';

type LooseRecord = Record<string, unknown>;

export type ConversationResolvedEntities = {
  manifestIds: string[];
  excludeManifestIds: string[];
  manifestNumber: string | null;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  dateRange: ResolvedDateRange;
  top: number | null;
  skipMostRecent: number | null;
  orderBy: string | null;
  grouping: string | null;
  aggregateBy: string | null;
  compareBy: string | null;
  previewOnly: boolean;
  selectionSnapshot: string | null;
};

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

function toNonNegativeInt(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  const integer = Math.trunc(normalized);
  return integer >= 0 ? integer : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'sim';
  }
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return false;
}

function toUniqueStringList(value: unknown, max = 25): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of value.slice(0, max)) {
    const normalized = toNullableString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

export function resolveConversationEntities(input: {
  toolArgs?: LooseRecord;
  classifierEntities?: LooseRecord;
  context: {
    integrationAccountId: string | null;
    sessionContextId: string | null;
    manifestId: string | null;
  };
}): ConversationResolvedEntities {
  const toolArgs = toRecord(input.toolArgs);
  const entities = toRecord(input.classifierEntities);
  const selection = toRecord(toolArgs.selection);

  const manifestIds = Array.from(new Set([
    ...toUniqueStringList(toolArgs.manifestIds),
    ...toUniqueStringList(entities.manifestIds),
    ...toUniqueStringList(selection.manifestIds),
    ...(() => {
      const single = toNullableString(toolArgs.manifestId || entities.manifestId || input.context.manifestId);
      return single ? [single] : [];
    })()
  ])).slice(0, 25);

  const excludeManifestIds = Array.from(new Set([
    ...toUniqueStringList(toolArgs.excludeManifestIds),
    ...toUniqueStringList(entities.excludeManifestIds),
    ...toUniqueStringList(selection.excludeManifestIds)
  ])).slice(0, 25);

  return {
    manifestIds,
    excludeManifestIds,
    manifestNumber: toNullableString(toolArgs.manifestNumber || entities.manifestNumber),
    integrationAccountId:
      toNullableString(toolArgs.integrationAccountId)
      || toNullableString(entities.integrationAccountId)
      || input.context.integrationAccountId,
    sessionContextId:
      toNullableString(toolArgs.sessionContextId)
      || toNullableString(entities.sessionContextId)
      || input.context.sessionContextId,
    dateRange: resolveConversationDateRange({ toolArgs, entities }),
    top: toNonNegativeInt(selection.top ?? toolArgs.top ?? entities.top),
    skipMostRecent: toNonNegativeInt(selection.skipMostRecent ?? toolArgs.skipMostRecent ?? entities.skipMostRecent),
    orderBy: toNullableString(selection.orderBy ?? toolArgs.orderBy ?? entities.orderBy),
    grouping: toNullableString(selection.groupBy ?? toolArgs.groupBy ?? entities.groupBy ?? entities.grouping),
    aggregateBy: toNullableString(selection.aggregateBy ?? toolArgs.aggregateBy ?? entities.aggregateBy),
    compareBy: toNullableString(selection.compareBy ?? toolArgs.compareBy ?? entities.compareBy),
    previewOnly: toBoolean(selection.previewOnly ?? toolArgs.previewOnly ?? entities.previewOnly),
    selectionSnapshot: toNullableString(toolArgs.selectionSnapshot ?? entities.selectionSnapshot ?? selection.selectionSnapshot)
  };
}
