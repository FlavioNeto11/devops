/**
 * Espelho frontend da taxonomia operacional (13 estados) definida em
 * docs/05-operacao/taxonomia-status-erros-operacionais.md e implementada no
 * backend em src/lib/operational-status.ts.
 *
 * Importante: este arquivo é uma cópia intencional para evitar acoplamento
 * direto entre frontend e backend (proibido importar de src/**). Qualquer
 * mudança aqui exige paridade com o backend (lockstep com a taxonomia).
 */

export const OPERATIONAL_STATUS_REGISTRY = Object.freeze({
  ready: {
    status: 'ready',
    label: 'Aguardando execução',
    severity: 'info',
    recommendedAction: 'Aguardar o worker iniciar a execução.',
    retryable: 'false',
    bucket: 'lifecycle'
  },
  running: {
    status: 'running',
    label: 'Em execução',
    severity: 'info',
    recommendedAction: 'Acompanhar até a conclusão; verificar lease se exceder o SLA.',
    retryable: 'false',
    bucket: 'in_flight'
  },
  retry_wait: {
    status: 'retry_wait',
    label: 'Aguardando reprocessamento',
    severity: 'warning',
    recommendedAction: 'Aguardar o próximo retry agendado ou disparar retry manual após análise.',
    retryable: 'conditional',
    bucket: 'in_flight'
  },
  dlq: {
    status: 'dlq',
    label: 'Em fila morta (DLQ)',
    severity: 'danger',
    recommendedAction: 'Inspecionar a causa, corrigir dados/contexto e reenfileirar via /v1/jobs/{id}/retry.',
    retryable: 'true',
    bucket: 'blocked'
  },
  blocked_external_data: {
    status: 'blocked_external_data',
    label: 'Bloqueado por dado externo',
    severity: 'warning',
    recommendedAction: 'Validar parceiros, resíduos ou cadastros na CETESB antes de tentar novamente.',
    retryable: 'conditional',
    bucket: 'blocked'
  },
  blocked_missing_context: {
    status: 'blocked_missing_context',
    label: 'Bloqueado por contexto ausente',
    severity: 'warning',
    recommendedAction: 'Reautenticar a conta CETESB ou revalidar a sessão antes de reprocessar.',
    retryable: 'conditional',
    bucket: 'blocked'
  },
  awaiting_remote_confirmation: {
    status: 'awaiting_remote_confirmation',
    label: 'Aguardando confirmação remota',
    severity: 'info',
    recommendedAction: 'Aguardar a CETESB confirmar a operação; reconciliar via job de sincronização se exceder a janela.',
    retryable: 'false',
    bucket: 'in_flight'
  },
  completed_with_no_items: {
    status: 'completed_with_no_items',
    label: 'Concluído sem itens',
    severity: 'neutral',
    recommendedAction: 'Revisar filtros/parâmetros — operação concluída mas não retornou registros.',
    retryable: 'false',
    bucket: 'terminal_success'
  },
  completed_with_document: {
    status: 'completed_with_document',
    label: 'Concluído com documento',
    severity: 'success',
    recommendedAction: 'Disponibilizar o documento (MTR/CDF) para o operador; registrar ciência.',
    retryable: 'false',
    bucket: 'terminal_success'
  },
  failed_validation: {
    status: 'failed_validation',
    label: 'Falha de validação',
    severity: 'danger',
    recommendedAction: 'Corrigir o payload conforme as mensagens de validação e reenviar o comando.',
    retryable: 'conditional',
    bucket: 'terminal_failure'
  },
  failed_remote_auth: {
    status: 'failed_remote_auth',
    label: 'Falha de autenticação remota',
    severity: 'danger',
    recommendedAction: 'Reautenticar a conta CETESB (sessão expirada/revogada) e tentar novamente.',
    retryable: 'true',
    bucket: 'terminal_failure'
  },
  failed_remote_contract: {
    status: 'failed_remote_contract',
    label: 'Falha no contrato remoto (CETESB)',
    severity: 'danger',
    recommendedAction: 'Inspecionar exchange auditado; abrir incidente se a CETESB retornou erro inesperado.',
    retryable: 'conditional',
    bucket: 'terminal_failure'
  },
  failed_internal_processing: {
    status: 'failed_internal_processing',
    label: 'Falha de processamento interno',
    severity: 'danger',
    recommendedAction: 'Verificar logs/correlationId; corrigir o defeito e reprocessar via retry.',
    retryable: 'conditional',
    bucket: 'terminal_failure'
  }
});

const SEVERITY_TO_VUETIFY_COLOR = Object.freeze({
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  neutral: 'grey'
});

export function describeOperationalStatus(status) {
  const normalized = String(status || '').trim();
  if (!normalized) {
    return null;
  }

  return OPERATIONAL_STATUS_REGISTRY[normalized] || {
    status: normalized,
    label: normalized,
    severity: 'neutral',
    recommendedAction: 'Status desconhecido — consultar logs e auditoria.',
    retryable: 'false',
    bucket: 'lifecycle'
  };
}

export function describeJobOperationalStatus(job) {
  if (!job) {
    return null;
  }

  const status = job.operationalStatus || job.status;
  return describeOperationalStatus(status);
}

export function severityToVuetifyColor(severity) {
  return SEVERITY_TO_VUETIFY_COLOR[String(severity || '').trim()] || 'grey';
}

export function isRetryable(retryable) {
  return retryable === 'true' || retryable === 'conditional';
}

/**
 * Mapeamento canônico DMR → taxonomia operacional.
 * Espelho de src/lib/operational-status.ts (mapDmrStatusToOperational) —
 * lockstep com o backend (cadeia dmr-fluxo-base, fase 06).
 */
const DMR_AUTH_HINTS = ['AUTH', 'SESSION', 'TOKEN'];

const DMR_STATUS_TO_OPERATIONAL = Object.freeze({
  draft: 'ready',
  enqueued: 'ready',
  consolidating: 'running',
  submitting: 'running',
  pending_review: 'blocked_external_data',
  awaiting_remote: 'awaiting_remote_confirmation',
  submitted: 'completed_with_document',
  failed_validation: 'failed_validation',
  cancelled: 'failed_internal_processing'
});

function lastErrorMatchesAuthHint(lastErrorCode) {
  const upper = String(lastErrorCode || '').toUpperCase();
  if (!upper) return false;
  return DMR_AUTH_HINTS.some((hint) => upper.includes(hint));
}

export function mapDmrStatusToOperational(status, lastErrorCode = '') {
  const normalized = String(status || '').trim();
  if (!normalized) return null;

  if (normalized === 'failed_remote') {
    return lastErrorMatchesAuthHint(lastErrorCode)
      ? 'failed_remote_auth'
      : 'failed_remote_contract';
  }

  return DMR_STATUS_TO_OPERATIONAL[normalized] || null;
}

export function describeDmrOperationalStatus(dmr) {
  if (!dmr) return null;
  // Quando o backend já retornou operationalStatus enriquecido (GET /v1/dmr/:id/status), usar direto.
  if (dmr.operationalStatus) {
    return describeOperationalStatus(dmr.operationalStatus);
  }
  const mapped = mapDmrStatusToOperational(dmr.status, dmr.lastErrorCode);
  return describeOperationalStatus(mapped || dmr.status);
}

/**
 * Mapeamento canônico MTR provisório → taxonomia operacional.
 * Espelho de src/lib/operational-status.ts (mapMtrProvisorioStatusToOperational) —
 * lockstep com o backend (cadeia mtr-provisorio-fluxo-base, fase 06).
 *
 * Decisão R5: pós-impressão o status físico permanece `submitted`
 * (mapeado para `completed_with_document`) — a presença do PDF é
 * sinalizada via `payload.jobResults['manifest.print']` no detalhe.
 */
const MTR_PROVISORIO_STATUS_TO_OPERATIONAL = Object.freeze({
  draft: 'ready',
  queued_submit: 'ready',
  submitting: 'running',
  awaiting_remote: 'awaiting_remote_confirmation',
  submitted: 'completed_with_document',
  queued_print: 'running',
  cancelled: 'failed_internal_processing'
});

const MTR_PROVISORIO_AUTH_HINTS = ['AUTH', 'SESSION', 'TOKEN'];
const MTR_PROVISORIO_VALIDATION_HINTS = ['VALIDATION', 'CONTRACT', 'SCHEMA'];
const MTR_PROVISORIO_REMOTE_HINTS = ['REMOTE', 'CETESB', 'TIMEOUT', 'GATEWAY', 'UPSTREAM'];

function mtrProvisorioMatchesAny(code, hints) {
  const upper = String(code || '').toUpperCase();
  if (!upper) return false;
  return hints.some((hint) => upper.includes(hint));
}

export function mapMtrProvisorioStatusToOperational(status, lastErrorCode = '') {
  const normalized = String(status || '').trim();
  if (!normalized) return null;

  if (normalized === 'failed_submit') {
    if (mtrProvisorioMatchesAny(lastErrorCode, MTR_PROVISORIO_AUTH_HINTS)) return 'failed_remote_auth';
    if (mtrProvisorioMatchesAny(lastErrorCode, MTR_PROVISORIO_VALIDATION_HINTS)) return 'failed_validation';
    if (mtrProvisorioMatchesAny(lastErrorCode, MTR_PROVISORIO_REMOTE_HINTS)) return 'failed_remote_contract';
    return 'failed_internal_processing';
  }

  return MTR_PROVISORIO_STATUS_TO_OPERATIONAL[normalized] || null;
}

export function describeMtrProvisorioOperationalStatus(mtrProvisorio) {
  if (!mtrProvisorio) return null;
  if (mtrProvisorio.operationalStatus) {
    return describeOperationalStatus(mtrProvisorio.operationalStatus);
  }
  const mapped = mapMtrProvisorioStatusToOperational(
    mtrProvisorio.status,
    mtrProvisorio.lastErrorCode
  );
  return describeOperationalStatus(mapped || mtrProvisorio.status);
}
