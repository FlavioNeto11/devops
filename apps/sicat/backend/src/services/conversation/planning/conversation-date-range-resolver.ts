type LooseRecord = Record<string, unknown>;

export type ResolvedDateRange = {
  dateFrom: string | null;
  dateTo: string | null;
  source: 'explicit' | 'relative' | 'none';
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

function toIsoDate(value: unknown): string | null {
  const normalized = toNullableString(value);
  if (!normalized) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatIsoDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveRelativeRange(entities: LooseRecord): ResolvedDateRange {
  const lastDays = Number(entities.lastDays || entities.recentDays || entities.daysWindow);
  if (Number.isFinite(lastDays) && lastDays > 0 && lastDays <= 365) {
    const end = new Date();
    const start = new Date(end.getTime() - Math.trunc(lastDays - 1) * 86_400_000);
    return {
      dateFrom: formatIsoDate(start),
      dateTo: formatIsoDate(end),
      source: 'relative'
    };
  }

  const relativeToken = toNullableString(entities.relativePeriod)?.toLowerCase();
  if (relativeToken === 'today') {
    const today = formatIsoDate(new Date());
    return {
      dateFrom: today,
      dateTo: today,
      source: 'relative'
    };
  }

  return {
    dateFrom: null,
    dateTo: null,
    source: 'none'
  };
}

export function resolveConversationDateRange(input: {
  toolArgs?: LooseRecord;
  entities?: LooseRecord;
}): ResolvedDateRange {
  const toolArgs = toRecord(input.toolArgs);
  const entities = toRecord(input.entities);
  const selection = toRecord(toolArgs.selection);

  let dateFrom =
    toIsoDate(selection.dateFrom)
    || toIsoDate(selection.from)
    || toIsoDate(toolArgs.dateFrom)
    || toIsoDate(toolArgs.from)
    || toIsoDate(entities.dateFrom)
    || toIsoDate(entities.from)
    || null;

  let dateTo =
    toIsoDate(selection.dateTo)
    || toIsoDate(selection.to)
    || toIsoDate(toolArgs.dateTo)
    || toIsoDate(toolArgs.to)
    || toIsoDate(entities.dateTo)
    || toIsoDate(entities.to)
    || null;

  if (dateFrom || dateTo) {
    return {
      dateFrom,
      dateTo,
      source: 'explicit'
    };
  }

  return resolveRelativeRange(entities);
}
