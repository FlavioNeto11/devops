// SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.
// format.js — formatadores PUROS (sem dependências). Usados pelo DataTable/Detail.
export function humanize(field) {
  if (!field) return '';
  return String(field)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(d); } catch { return d.toISOString().slice(0, 10); }
}

export function formatDateTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d); } catch { return d.toISOString(); }
}

export function formatCurrency(value, currency = 'BRL') {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n); } catch { return 'R$ ' + n.toFixed(2); }
}

export function formatNumber(value) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  try { return new Intl.NumberFormat('pt-BR').format(n); } catch { return String(n); }
}

// formato declarado numa coluna/campo -> string exibível.
export function formatValue(value, format) {
  if (typeof format === 'function') return format(value);
  switch (format) {
    case 'date': return formatDate(value);
    case 'datetime': return formatDateTime(value);
    case 'currency': return formatCurrency(value);
    case 'number': return formatNumber(value);
    case 'boolean': return value ? 'Sim' : 'Não';
    default: return value === null || value === undefined || value === '' ? '—' : String(value);
  }
}
