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

// Rotulos pt-BR para valores de enum crus que vazavam na UI (ex.: "limpa_nome", "admin",
// "captacao" sem acento). humanize() e o fallback seguro para valores nao mapeados:
// troca "_" por espaco e capitaliza a 1a letra, sem depender de text-transform.
export function humanize(v) {
  if (v == null || v === '') return '—';
  const s = String(v).replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const STATUS_LABEL = {
  captacao: 'Captação', disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', locado: 'Locado', inativo: 'Inativo',
  novo: 'Novo', qualificando: 'Qualificando', qualificado: 'Qualificado', negociando: 'Negociando', fechado: 'Fechado', perdido: 'Perdido',
  agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado',
  aberto: 'Aberto', analisando: 'Analisando', proposta: 'Proposta', acordo: 'Acordo',
  valido: 'Válido', invalido: 'Inválido', pendente: 'Pendente', ilegivel: 'Ilegível', vencido: 'Vencido',
};
export function statusLabel(s) { return STATUS_LABEL[s] || humanize(s); }
export const ROLE_LABEL = { admin: 'Administrador', corretor: 'Corretor', financeiro: 'Financeiro', vistoriador: 'Vistoriador' };
export function roleLabel(r) { return ROLE_LABEL[r] || humanize(r); }
export const GOAL_LABEL = { limpa_nome: 'Limpa nome', score: 'Aumento de score', rating: 'Rating comercial' };
export function goalLabel(g) { return GOAL_LABEL[g] || humanize(g); }
