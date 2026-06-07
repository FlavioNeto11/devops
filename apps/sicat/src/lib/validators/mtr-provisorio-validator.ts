/**
 * MTR provisório validator — fase 06-domain-rules (cadeia
 * `mtr-provisorio-fluxo-base`).
 *
 * Regras de domínio do ramo `kind = 'provisorio'` (R3-C). Reusa
 * `validateManifestPayload` para os campos compartilhados com o MTR
 * comum (decisão R3-C: o discriminador SICAT é `kind`, mantendo o
 * mesmo schema `ManifestCreateRequest` na borda HTTP — ver
 * `openapi/mtr_automacao_openapi_interna.yaml` →
 * `MtrProvisorioCreateRequest = ManifestCreateRequest + {kind: 'provisorio'}`).
 *
 * Erros são `AppError` com `code` estável (`MTR_PROVISORIO_*`),
 * serializados em `application/problem+json` por
 * `src/middlewares/error-handler.ts`.
 *
 * Códigos canônicos:
 *   - MTR_PROVISORIO_PAYLOAD_INVALID            → payload de criação inválido
 *   - MTR_PROVISORIO_STATUS_TRANSITION_INVALID  → transição proibida
 *   - MTR_PROVISORIO_NOT_CANCELLABLE            → status fora do conjunto
 *                                                 cancelável
 *   - MTR_PROVISORIO_NOT_PRINTABLE              → registro sem
 *                                                 externalHashCode ou em
 *                                                 status incompatível
 *
 * Boundary: este módulo só faz validação. Não acessa SQL nem CETESB.
 */

import { AppError } from '../problem.js';
import { validateManifestPayload } from './manifest-validator.js';
import type { MtrProvisorioRecord, MtrProvisorioStatus } from '../../repositories/mtr-provisorio-repo.js';

/**
 * Tabela canônica de transições válidas do ciclo MTR provisório.
 *
 * Origem → destinos permitidos. Cobre transições humanas (service:
 * create/cancel/print) e automáticas (worker: submit/print). Estados
 * sem saída são terminais.
 *
 * Estados típicos:
 *   draft → queued_submit → submitting → awaiting_remote → submitted
 *                                     ↘ failed_submit
 *   submitted → queued_print → submitted (PDF anexado em
 *               payload.jobResults['manifest.print'])
 *   draft|queued_submit|failed_submit → cancelled
 *
 * Decisão R5 (resolvida nesta fase): o status pós-impressão **permanece
 * `submitted`** (não introduzimos um estado `printed` separado). A
 * presença do PDF é sinalizada via `payload.jobResults['manifest.print']`
 * (printUrl + documentId), preservando idempotência do worker handler
 * `manifest.print` e simplicidade da máquina de estados. O mapeamento
 * canônico abaixo usa `submitted` → `completed_with_document`, que é
 * coerente para ambos os pontos do ciclo (CETESB confirmou + PDF
 * disponível ou prestes a ser gerado on-demand).
 */
const STATUS_TRANSITIONS: Readonly<Record<MtrProvisorioStatus, ReadonlySet<MtrProvisorioStatus>>> = {
  draft: new Set(['queued_submit', 'cancelled']),
  queued_submit: new Set(['submitting', 'failed_submit', 'cancelled']),
  submitting: new Set(['awaiting_remote', 'submitted', 'failed_submit', 'draft']),
  awaiting_remote: new Set(['submitted', 'failed_submit']),
  submitted: new Set(['queued_print', 'submitted']),
  failed_submit: new Set(['queued_submit', 'cancelled']),
  queued_print: new Set(['submitted', 'failed_submit']),
  cancelled: new Set()
};

const CANCELLABLE_FROM: ReadonlySet<MtrProvisorioStatus> = new Set([
  'draft',
  'queued_submit',
  'failed_submit'
]);

const PRINTABLE_FROM: ReadonlySet<MtrProvisorioStatus> = new Set([
  'submitted'
]);

function provisorioError(
  status: number,
  title: string,
  detail: string,
  code: string,
  context?: Record<string, unknown>
): AppError {
  return new AppError(status, title, detail, {
    code,
    ...(context ? { context } : {})
  });
}

/**
 * Valida o payload de criação de MTR provisório
 * (`POST /v1/mtr-provisorio`).
 *
 * Reusa `validateManifestPayload` (campos obrigatórios CETESB —
 * gerador, transportador, destinador, expedição, resíduos, estado etc.)
 * e converte o erro em `MTR_PROVISORIO_PAYLOAD_INVALID` para que
 * frontend/observabilidade reconheçam o ramo.
 */
export function validateMtrProvisorioCreatePayload(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw provisorioError(
      400,
      'MTR Provisorio Payload Invalid',
      'Payload de criação de MTR provisório deve ser um objeto JSON.',
      'MTR_PROVISORIO_PAYLOAD_INVALID'
    );
  }
  try {
    validateManifestPayload(payload as Parameters<typeof validateManifestPayload>[0]);
  } catch (err) {
    if (err instanceof AppError) {
      throw provisorioError(
        err.status,
        'MTR Provisorio Payload Invalid',
        err.message,
        'MTR_PROVISORIO_PAYLOAD_INVALID',
        (err.context as Record<string, unknown>) || undefined
      );
    }
    throw err;
  }
}

/**
 * Valida transição de status segundo o ciclo MTR provisório.
 * `to === from` é considerado no-op idempotente (válido).
 */
export function validateStatusTransition(
  from: MtrProvisorioStatus,
  to: MtrProvisorioStatus
): void {
  if (from === to) return;
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw provisorioError(
      400,
      'MTR Provisorio Status Transition Invalid',
      `Transição de status proibida: ${from} → ${to}.`,
      'MTR_PROVISORIO_STATUS_TRANSITION_INVALID',
      { from, to, allowed: Array.from(allowed ?? []) }
    );
  }
}

/**
 * Valida se o registro pode ser cancelado pelo operador
 * (`DELETE /v1/mtr-provisorio/{id}`). Estados terminais (`submitted`,
 * `cancelled`) ou em voo (`submitting`, `awaiting_remote`,
 * `queued_print`) NÃO são canceláveis pelo SICAT — a CETESB não
 * suporta cancelamento de provisórios já reconhecidos pelo gateway.
 */
export function validateCancellable(record: Pick<MtrProvisorioRecord, 'id' | 'status'>): void {
  if (!CANCELLABLE_FROM.has(record.status)) {
    throw provisorioError(
      400,
      'MTR Provisorio Not Cancellable',
      `Manifesto provisório em status ${record.status} não pode ser cancelado.`,
      'MTR_PROVISORIO_NOT_CANCELLABLE',
      { id: record.id, status: record.status, allowed: Array.from(CANCELLABLE_FROM) }
    );
  }
}

/**
 * Valida se o registro pode ser enviado para impressão
 * (`POST /v1/mtr-provisorio/{id}/print`). Exige que a CETESB já tenha
 * confirmado a submissão (`status='submitted'` + `externalHashCode`
 * persistido).
 */
export function validatePrintable(
  record: Pick<MtrProvisorioRecord, 'id' | 'status' | 'externalHashCode'>
): void {
  if (!PRINTABLE_FROM.has(record.status)) {
    throw provisorioError(
      400,
      'MTR Provisorio Not Printable',
      `Manifesto provisório em status ${record.status} não pode ser impresso (exige 'submitted').`,
      'MTR_PROVISORIO_NOT_PRINTABLE',
      { id: record.id, status: record.status, allowed: Array.from(PRINTABLE_FROM) }
    );
  }
  if (!record.externalHashCode) {
    throw provisorioError(
      400,
      'MTR Provisorio Not Printable',
      `Manifesto provisório ${record.id} não possui externalHashCode — submissão CETESB ainda não confirmada.`,
      'MTR_PROVISORIO_NOT_PRINTABLE',
      { id: record.id, status: record.status, missingField: 'externalHashCode' }
    );
  }
}

/**
 * Conjunto público de transições — exportado para uso por testes,
 * documentação e mapeamento taxonômico em `operational-status.ts`.
 */
export const MTR_PROVISORIO_STATUS_TRANSITIONS = STATUS_TRANSITIONS;
export const MTR_PROVISORIO_CANCELLABLE_FROM = CANCELLABLE_FROM;
export const MTR_PROVISORIO_PRINTABLE_FROM = PRINTABLE_FROM;
