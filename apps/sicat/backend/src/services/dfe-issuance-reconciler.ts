import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';
import type { DfeIssuanceGateway, DfeIssuanceQueryResult } from '../gateways/dfe-issuance-gateway.js';

// ---------------------------------------------------------------------------------------------
// Reconciliador da emissão de DF-e (PR-G) — réplica DELIBERADA dos princípios do DL-102
// (`services/manifest-submit-reconciler.ts`, `services/ciot-reconciler.ts`), NÃO reuso: bounded
// context próprio.
//
// Problema: um `transporte.dfe.issue` pode ficar em estado indeterminado se algo falhar ENTRE o
// dispatch ao gateway (`submitDocument`) e o commit local do resultado. A linha `dfe_issuances`
// local não sabe se a autorização foi PROCESSADA do outro lado. Este módulo descobre isso
// perguntando ao gateway pelo marcador de correlação gravado ANTES do dispatch
// (`lib/transport/dfe-issuance-correlation.ts`).
//
// Módulo PURO: recebe `{ queryByMarker }` injetado — não importa o gateway concreto nem toca em
// Postgres. Testável sem provedor e sem banco, mesmo molde de `ciot-reconciler.ts`.
// ---------------------------------------------------------------------------------------------

// Mesmo orçamento de polling do CIOT (`CIOT_RECONCILE_POLLING_DELAYS_MS`) — não inventar um terceiro
// esquema de backoff. N tentativas com sleep entre elas; o último valor nunca vira sleep.
export const DFE_ISSUANCE_RECONCILE_POLLING_DELAYS_MS: readonly number[] = Object.freeze([2000, 5000, 10000, 15000, 20000]);

export type QueryDfeIssuanceByMarkerFn = DfeIssuanceGateway['queryByMarker'];

export type DfeIssuanceReconcilerDeps = {
  queryByMarker: QueryDfeIssuanceByMarkerFn;
  /** Injetável nos testes para não esperar o backoff real. */
  sleep?: (ms: number) => Promise<void>;
  /** Orçamento de polling do chamador; default fiel ao padrão da casa. */
  delaysMs?: readonly number[];
};

export type ReconcileDfeIssuanceInput = {
  /** Id local da linha `dfe_issuances` em estado `submit_unconfirmed`. */
  issuanceId: string;
  correlationMarker: string;
};

export type ReconcileDfeIssuanceResult =
  | { outcome: 'found'; issuanceId: string; marker: string; attempts: number; match: Extract<DfeIssuanceQueryResult, { found: true }> }
  | { outcome: 'not-found-after-polling'; issuanceId: string; marker: string; attempts: number }
  | { outcome: 'error'; issuanceId: string; marker: string; attempts: number; error: AppError };

function toReconcileQueryError(error: unknown, attempt: number): AppError {
  const isAppError = error instanceof AppError;
  return new AppError(502, 'DF-e Issuance Reconcile Error', 'Falha ao consultar o gateway de emissão de DF-e durante a reconciliação.', {
    code: 'TRANSPORTE_DFE_ISSUANCE_RECONCILE_QUERY_FAILED',
    cause: error,
    context: { attempt, causeCode: isAppError ? error.code ?? null : null }
  });
}

/**
 * Pergunta ao gateway, com polling, se uma submissão de emissão de DF-e foi de fato processada do
 * outro lado. Não achar cedo NUNCA é falha — só `not-found-after-polling` depois de esgotar o
 * orçamento tem autoridade para declarar ausência.
 */
export async function reconcileDfeIssuance(
  deps: DfeIssuanceReconcilerDeps,
  input: ReconcileDfeIssuanceInput
): Promise<ReconcileDfeIssuanceResult> {
  if (typeof deps?.queryByMarker !== 'function') {
    throw new AppError(500, 'Internal Server Error', 'Dependência queryByMarker é obrigatória para reconciliar a emissão de DF-e.', {
      code: 'TRANSPORTE_DFE_ISSUANCE_RECONCILE_MISSING_DEPENDENCY'
    });
  }

  const issuanceId = String(input?.issuanceId ?? '').trim();
  const marker = String(input?.correlationMarker ?? '').trim();
  if (!issuanceId || !marker) {
    throw new AppError(400, 'Bad Request', 'issuanceId e correlationMarker são obrigatórios para reconciliar a emissão de DF-e.', {
      code: 'TRANSPORTE_DFE_ISSUANCE_RECONCILE_INVALID_INPUT'
    });
  }

  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.delaysMs ?? DFE_ISSUANCE_RECONCILE_POLLING_DELAYS_MS;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    let result: DfeIssuanceQueryResult;
    try {
      result = await deps.queryByMarker({ correlationMarker: marker });
    } catch (error: unknown) {
      // Erro de consulta é INCONCLUSIVO — nunca "a emissão não existe".
      return { outcome: 'error', issuanceId, marker, attempts: attempt + 1, error: toReconcileQueryError(error, attempt + 1) };
    }

    if (result.found) {
      return { outcome: 'found', issuanceId, marker, attempts: attempt + 1, match: result };
    }

    if (attempt < delays.length - 1) {
      await sleep(delays[attempt] ?? 0);
    }
  }

  return { outcome: 'not-found-after-polling', issuanceId, marker, attempts: delays.length };
}
