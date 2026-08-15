import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';
import type { CiotProviderGateway, CiotQueryResult } from '../gateways/ciot-provider-gateway.js';

// ---------------------------------------------------------------------------------------------
// Reconciliador do ciclo do CIOT (PR-C2) — réplica DELIBERADA dos princípios do DL-102
// (`services/manifest-submit-reconciler.ts`), NÃO reuso: bounded context próprio (D1 do DL-103).
//
// Problema: um `transporte.ciot.register|rectify|cancel|close` pode ficar em estado indeterminado
// quando a resposta do provedor se perde (timeout, pod reiniciado). A linha `ciot_operations` local
// não sabe se a operação (registro/retificação/cancelamento/encerramento) foi PROCESSADA do outro
// lado. Este módulo descobre isso perguntando ao provedor pelo marcador de correlação gravado ANTES
// do dispatch (`lib/transport/ciot-correlation.ts`).
//
// Módulo PURO: recebe `{ queryCiotByMarker }` injetado — não importa o gateway concreto nem toca em
// Postgres. Testável sem provedor e sem banco, mesmo molde do reconciliador do MTR.
// ---------------------------------------------------------------------------------------------

// Mesmos delays do padrão de polling já existente no repo (SUBMIT_RECONCILE_POLLING_DELAYS_MS) —
// não inventar um terceiro esquema de backoff. N tentativas com sleep de delays[attempt] ENTRE
// elas; o último valor nunca vira sleep.
export const CIOT_RECONCILE_POLLING_DELAYS_MS: readonly number[] = Object.freeze([2000, 5000, 10000, 15000, 20000]);

export type QueryCiotByMarkerFn = CiotProviderGateway['queryCiotByMarker'];

export type CiotReconcilerDeps = {
  queryCiotByMarker: QueryCiotByMarkerFn;
  /** Injetável nos testes para não esperar o backoff real. */
  sleep?: (ms: number) => Promise<void>;
  /** Orçamento de polling do chamador; default fiel ao padrão da casa. */
  delaysMs?: readonly number[];
};

export type ReconcileCiotInput = {
  /** Id local da linha `ciot_operations` em estado `request_unconfirmed`. */
  ciotOperationId: string;
  correlationMarker: string;
};

export type ReconcileCiotResult =
  | { outcome: 'found'; ciotOperationId: string; marker: string; attempts: number; match: Extract<CiotQueryResult, { found: true }> }
  | { outcome: 'not-found-after-polling'; ciotOperationId: string; marker: string; attempts: number }
  | { outcome: 'error'; ciotOperationId: string; marker: string; attempts: number; error: AppError };

function toReconcileQueryError(error: unknown, attempt: number): AppError {
  const isAppError = error instanceof AppError;
  return new AppError(502, 'CIOT Reconcile Error', 'Falha ao consultar o provedor de CIOT durante a reconciliação.', {
    code: 'CIOT_RECONCILE_QUERY_FAILED',
    // Erro original em `cause` (não em context): preserva `code`/`remoteStatus` para os
    // classificadores de retry (`lib/retry.ts`) decidirem sem embrulho perdendo a informação.
    cause: error,
    context: { attempt, causeCode: isAppError ? error.code ?? null : null }
  });
}

/**
 * Pergunta ao provedor, com polling, se uma tentativa de CIOT (register/rectify/cancel/close) foi
 * de fato processada do outro lado. Não achar cedo NUNCA é falha — só `not-found-after-polling`
 * depois de esgotar o orçamento tem autoridade para declarar ausência.
 */
export async function reconcileCiotOperation(
  deps: CiotReconcilerDeps,
  input: ReconcileCiotInput
): Promise<ReconcileCiotResult> {
  if (typeof deps?.queryCiotByMarker !== 'function') {
    throw new AppError(500, 'Internal Server Error', 'Dependência queryCiotByMarker é obrigatória para reconciliar o CIOT.', {
      code: 'CIOT_RECONCILE_MISSING_DEPENDENCY'
    });
  }

  const ciotOperationId = String(input?.ciotOperationId ?? '').trim();
  const marker = String(input?.correlationMarker ?? '').trim();
  if (!ciotOperationId || !marker) {
    throw new AppError(400, 'Bad Request', 'ciotOperationId e correlationMarker são obrigatórios para reconciliar o CIOT.', {
      code: 'CIOT_RECONCILE_INVALID_INPUT'
    });
  }

  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.delaysMs ?? CIOT_RECONCILE_POLLING_DELAYS_MS;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    let result: CiotQueryResult;
    try {
      result = await deps.queryCiotByMarker({ correlationMarker: marker });
    } catch (error: unknown) {
      // Erro de consulta é INCONCLUSIVO — nunca "o CIOT não existe".
      return { outcome: 'error', ciotOperationId, marker, attempts: attempt + 1, error: toReconcileQueryError(error, attempt + 1) };
    }

    if (result.found) {
      return { outcome: 'found', ciotOperationId, marker, attempts: attempt + 1, match: result };
    }

    if (attempt < delays.length - 1) {
      await sleep(delays[attempt] ?? 0);
    }
  }

  return { outcome: 'not-found-after-polling', ciotOperationId, marker, attempts: delays.length };
}
