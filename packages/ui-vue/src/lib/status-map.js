// status-map.js — resolve um status arbitrário (string) num TOM semântico + rótulo legível.
// Genérico/domain-agnostic: por palavra-chave (sem mapa chumbado de domínio). PURO.
// Tons: success | warning | error | running | neutral. A cor NUNCA é o único sinal (sempre há rótulo).
import { humanize } from './format.js';

const KEYWORDS = [
  ['success', ['done', 'paid', 'approved', 'active', 'completed', 'ok', 'success', 'aprovado', 'pago', 'concluido', 'concluído', 'ativo', 'sucesso', 'authorized', 'autorizado', 'enviado', 'sent']],
  ['error', ['error', 'failed', 'dlq', 'rejected', 'cancelled', 'canceled', 'erro', 'falhou', 'rejeitado', 'cancelado', 'inactive', 'inativo', 'blocked', 'bloqueado']],
  ['warning', ['pending', 'warning', 'waiting', 'retry', 'overdue', 'pendente', 'aguardando', 'atrasado', 'review', 'revisao', 'revisão', 'low', 'baixo']],
  ['running', ['running', 'processing', 'submitting', 'queued', 'in_progress', 'progress', 'processando', 'em andamento', 'fila', 'enfileirado']],
];

export function resolveTone(status) {
  if (!status) return 'neutral';
  const s = String(status).toLowerCase().trim();
  for (const [tone, words] of KEYWORDS) { if (words.some((w) => s === w || s.includes(w))) return tone; }
  return 'neutral';
}

// Dicionário canônico EN->PT dos status mais comuns de CRUD/agendamento — para não mostrar a chave crua
// do banco na UI ("no_show", "cancelled"). Chave normalizada (lower + separadores -> _). Domain-agnostic.
const STATUS_PT = {
  pending: 'Pendente', active: 'Ativo', inactive: 'Inativo', done: 'Concluído', completed: 'Concluído',
  cancelled: 'Cancelado', canceled: 'Cancelado', no_show: 'Faltou', noshow: 'Faltou', absent: 'Ausente',
  approved: 'Aprovado', rejected: 'Rejeitado', paid: 'Pago', unpaid: 'Não pago', overdue: 'Atrasado',
  in_progress: 'Em andamento', processing: 'Processando', queued: 'Na fila', scheduled: 'Agendado',
  confirmed: 'Confirmado', open: 'Aberto', closed: 'Fechado', draft: 'Rascunho', archived: 'Arquivado',
  blocked: 'Bloqueado', failed: 'Falhou', error: 'Erro', success: 'Sucesso', sent: 'Enviado',
  delivered: 'Entregue', new: 'Novo', review: 'Em revisão', waiting: 'Aguardando', expired: 'Expirado',
  refunded: 'Reembolsado', authorized: 'Autorizado', suspended: 'Suspenso', enabled: 'Ativo', disabled: 'Inativo',
};

export function statusLabel(status, explicit) {
  if (explicit) return explicit;
  const key = String(status || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (STATUS_PT[key]) return STATUS_PT[key];
  return humanize(status); // desconhecido: pelo menos "no_show" -> "No show"
}
