function pad2(value) {
  return String(value).padStart(2, '0');
}

export function isBrDate(value) {
  return /^(\d{2})\/(\d{2})\/(\d{4})$/.test(String(value || '').trim());
}

export function getTodayBr() {
  const now = new Date();
  const dd = pad2(now.getDate());
  const mm = pad2(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Data de hoje no formato ISO local (yyyy-mm-dd) — para inputs type="date".
export function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Data de N dias atrás, ISO local (yyyy-mm-dd). Usa data LOCAL (sem UTC) para
// não pular um dia perto da meia-noite.
export function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function normalizeBrDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (isBrDate(raw)) return raw;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }

  return raw;
}

export function brDateToIsoDate(value) {
  const normalized = normalizeBrDateInput(value);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const candidate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) return null;

  if (
    candidate.getFullYear() !== Number(yyyy)
    || (candidate.getMonth() + 1) !== Number(mm)
    || candidate.getDate() !== Number(dd)
  ) {
    return null;
  }

  return `${yyyy}-${mm}-${dd}`;
}

export function isoDateToBrDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function safeDateFromUnknown(value) {
  if (value == null || value === '') return null;

  const asIso = isoDateToBrDate(value);
  if (asIso) {
    const [dd, mm, yyyy] = asIso.split('/');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }

  const asBrIso = brDateToIsoDate(value);
  if (asBrIso) {
    return new Date(`${asBrIso}T00:00:00`);
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatDateBr(value) {
  const parsed = safeDateFromUnknown(value);
  if (!parsed) return value ? String(value) : '-';

  const dd = pad2(parsed.getDate());
  const mm = pad2(parsed.getMonth() + 1);
  const yyyy = parsed.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTimeBr(value) {
  const parsed = safeDateFromUnknown(value);
  if (!parsed) return value ? String(value) : '-';

  const dd = pad2(parsed.getDate());
  const mm = pad2(parsed.getMonth() + 1);
  const yyyy = parsed.getFullYear();
  const hh = pad2(parsed.getHours());
  const min = pad2(parsed.getMinutes());
  const sec = pad2(parsed.getSeconds());

  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec}`;
}

export function toApiDate(value) {
  if (!value) return '';
  const asIso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (asIso) return String(value);

  const fromBr = brDateToIsoDate(value);
  return fromBr || '';
}
