// SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.
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

export function statusLabel(status, explicit) {
  if (explicit) return explicit;
  return humanize(status);
}
