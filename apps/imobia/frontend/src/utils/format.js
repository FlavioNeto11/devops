export function brl(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
export function dateBr(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '—'; }
}
export function dateTimeBr(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}
export const STATUS_TONE = {
  captacao: 'amber', disponivel: 'green', reservado: 'blue', vendido: 'muted', locado: 'muted', inativo: 'muted',
  novo: 'blue', qualificando: 'amber', qualificado: 'green', negociando: 'amber', fechado: 'green', perdido: 'danger',
  agendado: 'blue', confirmado: 'green', concluido: 'muted', cancelado: 'danger',
  aberto: 'amber', analisando: 'blue', proposta: 'amber', acordo: 'green', concluido2: 'muted',
};
