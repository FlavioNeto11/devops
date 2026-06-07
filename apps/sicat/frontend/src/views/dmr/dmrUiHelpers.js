/**
 * Helpers de UI para DMR (cadeia dmr-fluxo-base, fase 07).
 * Detecção de pendência funcional do gateway DMR (Caminho B).
 */

export const DMR_GATEWAY_PENDING_CODE = 'DMR_GATEWAY_PENDING_HAR';

export const DMR_ROLE_OPTIONS = Object.freeze([
  { value: 'gerador', label: 'Gerador' },
  { value: 'transportador', label: 'Transportador' },
  { value: 'destinador', label: 'Destinador' },
  { value: 'armazenador_temporario', label: 'Armazenador temporário' }
]);

export const DMR_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'consolidating', label: 'Consolidando' },
  { value: 'pending_review', label: 'Em revisão' },
  { value: 'enqueued', label: 'Enfileirada' },
  { value: 'submitting', label: 'Enviando' },
  { value: 'awaiting_remote', label: 'Aguardando CETESB' },
  { value: 'submitted', label: 'Submetida' },
  { value: 'failed_validation', label: 'Falha de validação' },
  { value: 'failed_remote', label: 'Falha remota' },
  { value: 'cancelled', label: 'Cancelada' }
]);

export const DMR_QUANTITY_UNITS = Object.freeze(['kg', 't', 'm3', 'L']);
export const DMR_ITEM_PARTNER_ROLES = Object.freeze([
  { value: 'transportador', label: 'Transportador' },
  { value: 'destinador', label: 'Destinador' },
  { value: 'armazenador', label: 'Armazenador' }
]);

/**
 * Retorna true se o erro veio da camada `application/problem+json`
 * com código DMR_GATEWAY_PENDING_HAR (gateway DMR ainda em stub).
 */
export function isDmrGatewayPending(error) {
  if (!error) return false;
  const status = Number(error.status || 0);
  const code = String(error?.payload?.code || error?.code || '').trim();
  if (code === DMR_GATEWAY_PENDING_CODE) return true;
  if (status === 503) {
    const detail = String(error?.detail || error?.message || '').toUpperCase();
    if (detail.includes('DMR_GATEWAY_PENDING_HAR')) return true;
  }
  return false;
}

/**
 * Mensagem amigável para problem+json. Sem vazar stack.
 */
export function describeDmrError(error, fallback = 'Erro inesperado.') {
  if (!error) return fallback;
  if (isDmrGatewayPending(error)) {
    return 'Aguardando captura HAR DMR — declaração consolidada e pronta, envio remoto pendente.';
  }
  return error.detail || error.title || error.message || fallback;
}

export function formatDmrPeriodLabel(dmr) {
  if (!dmr) return '';
  if (dmr.periodLabel) return String(dmr.periodLabel);
  const start = String(dmr.periodStart || '').slice(0, 10);
  const end = String(dmr.periodEnd || '').slice(0, 10);
  return start && end ? `${start} → ${end}` : start || end || '';
}

export function roleLabel(role) {
  return DMR_ROLE_OPTIONS.find((opt) => opt.value === role)?.label || role || '';
}

export function statusLabel(status) {
  return DMR_STATUS_OPTIONS.find((opt) => opt.value === status)?.label || status || '';
}
