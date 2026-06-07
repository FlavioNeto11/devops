/**
 * Taxonomia canônica de status operacionais (fase 04 — Centro Operacional SICAT).
 *
 * Define os 13 estados operacionais expostos pelo backend para o Centro
 * Operacional, derivados do status físico de jobs/manifestos somado a sinais
 * de erro/contexto. Utilizado por:
 *   - src/services/operations-service.ts (mapJobToOperationalStatus)
 *   - /v1/operations/overview e /v1/jobs/search (campos enriquecidos)
 *   - frontend (badges, severity, recommendedAction)
 *
 * Fonte de verdade documental:
 *   docs/05-operacao/taxonomia-status-erros-operacionais.md
 *
 * Importante: a tabela é exportada como `OPERATIONAL_STATUS_REGISTRY` e
 * espelha o enum `JobOperationalStatus` no OpenAPI interno
 * (openapi/mtr_automacao_openapi_interna.yaml). Qualquer mudança aqui
 * exige lockstep no contrato + exemplos + operations.ts.
 */

export type OperationalStatusBucket =
  | 'in_flight'
  | 'lifecycle'
  | 'blocked'
  | 'terminal_success'
  | 'terminal_failure';

export type OperationalStatusSeverity =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

export type OperationalStatusRetryable = 'true' | 'false' | 'conditional';

export type OperationalStatusCode =
  | 'ready'
  | 'running'
  | 'retry_wait'
  | 'dlq'
  | 'blocked_external_data'
  | 'blocked_missing_context'
  | 'awaiting_remote_confirmation'
  | 'completed_with_no_items'
  | 'completed_with_document'
  | 'failed_validation'
  | 'failed_remote_auth'
  | 'failed_remote_contract'
  | 'failed_internal_processing';

export interface OperationalStatusDescriptor {
  status: OperationalStatusCode;
  label: string;
  severity: OperationalStatusSeverity;
  recommendedAction: string;
  retryable: OperationalStatusRetryable;
  bucket: OperationalStatusBucket;
}

export const OPERATIONAL_STATUS_REGISTRY: Readonly<
  Record<OperationalStatusCode, OperationalStatusDescriptor>
> = Object.freeze({
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

const VALIDATION_HINTS = ['VALIDATION', 'CONTRACT', 'INVALID', 'SCHEMA'];
const AUTH_HINTS = ['AUTH', 'SESSION_EXPIRED', 'TOKEN'];
const REMOTE_HINTS = ['REMOTE', 'CETESB', 'TIMEOUT', 'GATEWAY', 'UPSTREAM'];
const BLOCKED_EXTERNAL_HINTS = ['EXTERNAL_DATA', 'PARTNER_NOT_FOUND', 'CADASTRO', 'RESIDUO'];
const BLOCKED_CONTEXT_HINTS = ['MISSING_CONTEXT', 'NO_SESSION', 'SESSION_REQUIRED', 'NO_ACCOUNT'];
const AWAITING_HINTS = ['AWAITING', 'PENDING_REMOTE', 'PENDING_CONFIRMATION'];
const NO_ITEMS_HINTS = ['NO_ITEMS', 'EMPTY_RESULT', 'NOTHING_TO_RECEIVE'];

function matchesAny(haystack: string, hints: string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

export interface JobLikeForStatus {
  status: string;
  attempts?: number | null;
  lastErrorCode?: string | null;
  dlqReason?: string | null;
  resultSummary?: string | null;
}

/**
 * Mapeia um job (status físico + sinais de erro) para a taxonomia operacional.
 * Mantém retro-compatibilidade: status físicos desconhecidos retornam o
 * próprio valor (passthrough), igual ao comportamento original do mapper.
 */
export function mapJobToOperationalStatus(job: JobLikeForStatus): string {
  const code = String(job.lastErrorCode || '').toUpperCase();
  const reason = String(job.dlqReason || '').toUpperCase();
  const resultHint = String(job.resultSummary || '').toUpperCase();

  switch (job.status) {
    case 'queued':
      return 'ready';
    case 'running':
      return 'running';
    case 'retry_wait':
      if (matchesAny(code, BLOCKED_EXTERNAL_HINTS)) return 'blocked_external_data';
      if (matchesAny(code, BLOCKED_CONTEXT_HINTS)) return 'blocked_missing_context';
      if (matchesAny(code, AWAITING_HINTS)) return 'awaiting_remote_confirmation';
      return 'retry_wait';
    case 'dlq':
      if (matchesAny(reason, BLOCKED_EXTERNAL_HINTS)) return 'blocked_external_data';
      if (matchesAny(reason, BLOCKED_CONTEXT_HINTS)) return 'blocked_missing_context';
      return 'dlq';
    case 'cancelled':
      return 'failed_internal_processing';
    case 'failed': {
      if (matchesAny(code, VALIDATION_HINTS)) return 'failed_validation';
      if (matchesAny(code, AUTH_HINTS)) return 'failed_remote_auth';
      if (matchesAny(code, REMOTE_HINTS)) return 'failed_remote_contract';
      return 'failed_internal_processing';
    }
    case 'succeeded':
      if (matchesAny(resultHint, NO_ITEMS_HINTS)) return 'completed_with_no_items';
      return 'completed_with_document';
    default:
      return job.status;
  }
}

/**
 * Retorna o descritor canônico (label, severity, recommendedAction, retryable,
 * bucket) para um operationalStatus. Aceita strings desconhecidas e retorna
 * um descritor neutro de fallback (não lança), preservando compatibilidade.
 */
export function describeOperationalStatus(
  status: string
): OperationalStatusDescriptor {
  const known = OPERATIONAL_STATUS_REGISTRY[status as OperationalStatusCode];
  if (known) return known;
  return {
    status: status as OperationalStatusCode,
    label: status,
    severity: 'neutral',
    recommendedAction: 'Status fora da taxonomia canônica — investigar o emissor.',
    retryable: 'false',
    bucket: 'lifecycle'
  };
}

/**
 * Conveniência: aplica `mapJobToOperationalStatus` e retorna o descritor.
 */
export function describeJobOperationalStatus(
  job: JobLikeForStatus
): OperationalStatusDescriptor {
  return describeOperationalStatus(mapJobToOperationalStatus(job));
}

/**
 * Mapeamento canônico do ciclo declaratório DMR para a taxonomia operacional.
 *
 * Fase 06-domain-rules (cadeia `dmr-fluxo-base`). Espelha
 * `docs/04-arquitetura/dmr-sicat.md §3.2`. Os 10 status físicos da DMR
 * (draft → cancelled) são reduzidos aos 13 estados canônicos sem
 * inventar novos buckets.
 *
 * `failed_remote` é resolvido em runtime com base em `lastErrorCode`:
 *   - hint AUTH/SESSION/TOKEN → `failed_remote_auth`;
 *   - default                 → `failed_remote_contract`.
 *
 * O caso especial `DMR_GATEWAY_PENDING_HAR` (stub do gateway, fase 03
 * adiada) cai em `failed_remote_contract` — é uma falha de contrato
 * remoto pendente de evidência, não uma falha de auth.
 */
export type DmrLifecycleStatus =
  | 'draft'
  | 'consolidating'
  | 'pending_review'
  | 'enqueued'
  | 'submitting'
  | 'awaiting_remote'
  | 'submitted'
  | 'failed_validation'
  | 'failed_remote'
  | 'cancelled';

const DMR_STATUS_TO_OPERATIONAL: Readonly<Record<DmrLifecycleStatus, OperationalStatusCode>> = Object.freeze({
  draft: 'ready',
  consolidating: 'running',
  pending_review: 'blocked_external_data',
  enqueued: 'ready',
  submitting: 'running',
  awaiting_remote: 'awaiting_remote_confirmation',
  submitted: 'completed_with_document',
  failed_validation: 'failed_validation',
  failed_remote: 'failed_remote_contract',
  cancelled: 'failed_internal_processing'
});

export const DMR_OPERATIONAL_STATUS_REGISTRY: Readonly<Record<DmrLifecycleStatus, OperationalStatusCode>> =
  DMR_STATUS_TO_OPERATIONAL;

export function mapDmrStatusToOperational(
  status: DmrLifecycleStatus | string,
  lastErrorCode?: string | null
): OperationalStatusCode {
  if (status === 'failed_remote') {
    const code = String(lastErrorCode || '').toUpperCase();
    if (matchesAny(code, AUTH_HINTS)) return 'failed_remote_auth';
    return 'failed_remote_contract';
  }
  const mapped = DMR_STATUS_TO_OPERATIONAL[status as DmrLifecycleStatus];
  return mapped ?? 'ready';
}

export function describeDmrOperationalStatus(
  status: DmrLifecycleStatus | string,
  lastErrorCode?: string | null
): OperationalStatusDescriptor {
  return describeOperationalStatus(mapDmrStatusToOperational(status, lastErrorCode));
}

/**
 * Mapeamento canônico do ciclo MTR provisório para a taxonomia
 * operacional (fase 06-domain-rules — cadeia
 * `mtr-provisorio-fluxo-base`).
 *
 * Espelha
 * [src/lib/validators/mtr-provisorio-validator.ts](./validators/mtr-provisorio-validator.ts)
 * e a interface `MtrProvisorioStatus` em
 * [src/repositories/mtr-provisorio-repo.ts](../repositories/mtr-provisorio-repo.ts).
 *
 * Decisão R5 (resolvida nesta fase): pós-impressão o status físico
 * permanece `submitted` (não introduzimos `printed`). Por isso
 * `submitted → completed_with_document` cobre tanto o ponto "CETESB
 * confirmou" quanto "PDF disponível" — a UI distingue ambos via
 * `payload.jobResults['manifest.print']`.
 *
 * `failed_submit` é resolvido em runtime por `lastErrorCode`:
 *   - hint AUTH/SESSION/TOKEN → `failed_remote_auth`;
 *   - hint VALIDATION/CONTRACT/SCHEMA → `failed_validation`;
 *   - hint REMOTE/CETESB/TIMEOUT/GATEWAY/UPSTREAM → `failed_remote_contract`;
 *   - default                 → `failed_internal_processing`.
 */
export type MtrProvisorioLifecycleStatus =
  | 'draft'
  | 'queued_submit'
  | 'submitting'
  | 'awaiting_remote'
  | 'submitted'
  | 'failed_submit'
  | 'queued_print'
  | 'cancelled';

const MTR_PROVISORIO_STATUS_TO_OPERATIONAL: Readonly<
  Record<MtrProvisorioLifecycleStatus, OperationalStatusCode>
> = Object.freeze({
  draft: 'ready',
  queued_submit: 'ready',
  submitting: 'running',
  awaiting_remote: 'awaiting_remote_confirmation',
  submitted: 'completed_with_document',
  failed_submit: 'failed_remote_contract',
  queued_print: 'running',
  cancelled: 'failed_internal_processing'
});

export const MTR_PROVISORIO_OPERATIONAL_STATUS_REGISTRY: Readonly<
  Record<MtrProvisorioLifecycleStatus, OperationalStatusCode>
> = MTR_PROVISORIO_STATUS_TO_OPERATIONAL;

export function mapMtrProvisorioStatusToOperational(
  status: MtrProvisorioLifecycleStatus | string,
  lastErrorCode?: string | null
): OperationalStatusCode {
  if (status === 'failed_submit') {
    const code = String(lastErrorCode || '').toUpperCase();
    if (matchesAny(code, AUTH_HINTS)) return 'failed_remote_auth';
    if (matchesAny(code, VALIDATION_HINTS)) return 'failed_validation';
    if (matchesAny(code, REMOTE_HINTS)) return 'failed_remote_contract';
    return 'failed_internal_processing';
  }
  const mapped = MTR_PROVISORIO_STATUS_TO_OPERATIONAL[status as MtrProvisorioLifecycleStatus];
  return mapped ?? 'ready';
}

export function describeMtrProvisorioOperationalStatus(
  status: MtrProvisorioLifecycleStatus | string,
  lastErrorCode?: string | null
): OperationalStatusDescriptor {
  return describeOperationalStatus(
    mapMtrProvisorioStatusToOperational(status, lastErrorCode)
  );
}
