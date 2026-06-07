/**
 * Helpers de UI para MTR Provisório
 * (cadeia mtr-provisorio-fluxo-base, fase 07-frontend-ux).
 *
 * Lockstep com a máquina de estados publicada em
 * src/lib/validators/mtr-provisorio-validator.ts e a taxonomia operacional
 * espelhada em frontend/src/modules/command-center/operationalStatus.js
 * (mapMtrProvisorioStatusToOperational).
 */

export const MTR_PROVISORIO_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'queued_submit',
  'submitting',
  'awaiting_remote',
  'submitted',
  'failed_submit',
  'queued_print',
  'cancelled'
]);

export const MTR_PROVISORIO_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'queued_submit', label: 'Enfileirado (envio)' },
  { value: 'submitting', label: 'Enviando' },
  { value: 'awaiting_remote', label: 'Aguardando CETESB' },
  { value: 'submitted', label: 'Submetido' },
  { value: 'failed_submit', label: 'Falha no envio' },
  { value: 'queued_print', label: 'Enfileirado (impressão)' },
  { value: 'cancelled', label: 'Cancelado' }
]);

const STATUS_LABEL_INDEX = Object.freeze(
  MTR_PROVISORIO_STATUS_OPTIONS.reduce((acc, opt) => {
    if (opt.value) acc[opt.value] = opt.label;
    return acc;
  }, {})
);

/**
 * Códigos de problem+json conhecidos do validador / service MTR provisório
 * (lockstep com src/lib/validators/mtr-provisorio-validator.ts).
 */
export const MTR_PROVISORIO_PROBLEM_CODES = Object.freeze({
  PAYLOAD_INVALID: 'MTR_PROVISORIO_PAYLOAD_INVALID',
  STATUS_TRANSITION_INVALID: 'MTR_PROVISORIO_STATUS_TRANSITION_INVALID',
  NOT_CANCELLABLE: 'MTR_PROVISORIO_NOT_CANCELLABLE',
  NOT_PRINTABLE: 'MTR_PROVISORIO_NOT_PRINTABLE',
  PERSISTENCE_NOT_IMPLEMENTED: 'MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED'
});

export function statusLabel(status) {
  const normalized = String(status || '').trim();
  return STATUS_LABEL_INDEX[normalized] || normalized || '';
}

export function isCancellableStatus(status) {
  return ['draft'].includes(String(status || ''));
}

export function isPrintableStatus(status) {
  // Imprime após submissão concluída; também permite reimpressão pós submitted.
  return ['submitted'].includes(String(status || ''));
}

/**
 * Extrai código canônico de erro problem+json. Aceita tanto error.code
 * direto quanto error.payload.code (resposta serializada pelo transport).
 */
export function extractProblemCode(error) {
  if (!error) return '';
  return String(error?.payload?.code || error?.code || '').trim();
}

/**
 * Mensagem amigável para problem+json de MTR provisório. Sem vazar stack.
 */
export function describeMtrProvisorioError(error, fallback = 'Erro inesperado.') {
  if (!error) return fallback;

  const code = extractProblemCode(error);

  if (code === MTR_PROVISORIO_PROBLEM_CODES.PERSISTENCE_NOT_IMPLEMENTED) {
    return 'Persistência MTR provisório ainda não implementada — endpoint responde 501 enquanto a fase 05 não estiver ativa em runtime.';
  }
  if (code === MTR_PROVISORIO_PROBLEM_CODES.PAYLOAD_INVALID) {
    return error.detail || 'Payload inválido para MTR provisório — corrija os campos sinalizados e tente novamente.';
  }
  if (code === MTR_PROVISORIO_PROBLEM_CODES.STATUS_TRANSITION_INVALID) {
    return error.detail || 'Transição de status não permitida para este MTR provisório.';
  }
  if (code === MTR_PROVISORIO_PROBLEM_CODES.NOT_CANCELLABLE) {
    return error.detail || 'MTR provisório não pode ser cancelado neste estado.';
  }
  if (code === MTR_PROVISORIO_PROBLEM_CODES.NOT_PRINTABLE) {
    return error.detail || 'MTR provisório não pode ser impresso neste estado.';
  }

  return error.detail || error.title || error.message || fallback;
}

/**
 * Indica se a presença do PDF (jobResults['manifest.print']) sinaliza
 * documento disponível — paridade com decisão R5.
 */
export function hasPrintedDocument(mtrProvisorio) {
  if (!mtrProvisorio) return false;
  const jobResults = mtrProvisorio?.payload?.jobResults || mtrProvisorio?.jobResults || null;
  if (!jobResults) return false;
  const printResult = jobResults['manifest.print'];
  if (!printResult) return false;
  return Boolean(printResult.documentUrl || printResult.pdfUrl || printResult.url || printResult.success);
}
