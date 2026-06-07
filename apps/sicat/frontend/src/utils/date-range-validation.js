import { toApiDate } from './date-format.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateAtMidnight(value) {
  const iso = toApiDate(value);
  if (!iso) {
    return null;
  }

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    iso,
    date: parsed
  };
}

export function evaluateDateRange({
  dateFrom,
  dateTo,
  fromLabel = 'Data inicial',
  toLabel = 'Data final',
  maxDays = null
} = {}) {
  const rawFrom = String(dateFrom || '').trim();
  const rawTo = String(dateTo || '').trim();

  const parsedFrom = rawFrom ? parseDateAtMidnight(rawFrom) : null;
  const parsedTo = rawTo ? parseDateAtMidnight(rawTo) : null;

  if (rawFrom && !parsedFrom) {
    return {
      isValid: false,
      errorMessage: `${fromLabel} invalida. Revise o valor informado.`,
      fromIso: '',
      toIso: '',
      spanDays: null
    };
  }

  if (rawTo && !parsedTo) {
    return {
      isValid: false,
      errorMessage: `${toLabel} invalida. Revise o valor informado.`,
      fromIso: parsedFrom?.iso || '',
      toIso: '',
      spanDays: null
    };
  }

  if (!parsedFrom || !parsedTo) {
    return {
      isValid: true,
      errorMessage: '',
      fromIso: parsedFrom?.iso || '',
      toIso: parsedTo?.iso || '',
      spanDays: null
    };
  }

  if (parsedFrom.date > parsedTo.date) {
    return {
      isValid: false,
      errorMessage: `${fromLabel} nao pode ser maior que ${toLabel}.`,
      fromIso: parsedFrom.iso,
      toIso: parsedTo.iso,
      spanDays: null
    };
  }

  const spanDays = Math.floor((parsedTo.date.getTime() - parsedFrom.date.getTime()) / MS_PER_DAY) + 1;
  const normalizedMaxDays = Number(maxDays);
  const hasMaxDaysLimit = maxDays !== null
    && maxDays !== undefined
    && String(maxDays).trim() !== ''
    && Number.isFinite(normalizedMaxDays)
    && normalizedMaxDays > 0;

  if (hasMaxDaysLimit && spanDays > normalizedMaxDays) {
    return {
      isValid: false,
      errorMessage: `O intervalo entre as datas nao pode ser maior que ${normalizedMaxDays} dias.`,
      fromIso: parsedFrom.iso,
      toIso: parsedTo.iso,
      spanDays
    };
  }

  return {
    isValid: true,
    errorMessage: '',
    fromIso: parsedFrom.iso,
    toIso: parsedTo.iso,
    spanDays
  };
}