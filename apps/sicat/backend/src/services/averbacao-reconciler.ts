import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';
import type { AverbacaoGateway, AverbacaoQueryResult } from '../gateways/averbacao-gateway.js';

// ---------------------------------------------------------------------------------------------
// Reconciliador do ciclo da averbação (PR-I3) — réplica DELIBERADA dos princípios do DL-102
// (`services/ciot-reconciler.ts`), NÃO reuso: bounded context próprio (REQ-SICAT-0034).
//
// Problema: um `transporte.averbacao.declare|rectify|cancel` pode ficar em estado indeterminado
// quando a resposta da seguradora se perde (timeout, pod reiniciado). A linha
// `insurance_shipment_declarations` local não sabe se a operação foi PROCESSADA do outro lado.
// Este módulo descobre isso perguntando ao provedor pelo marcador de correlação gravado ANTES do
// dispatch (`lib/transport/averbacao-correlation.ts`).
//
// Módulo PURO: recebe `{ queryByMarker }` injetado — não importa o gateway concreto nem toca em
// Postgres. Testável sem provedor e sem banco, mesmo molde do reconciliador do CIOT/MTR.
// ---------------------------------------------------------------------------------------------

// Mesmos delays do padrão de polling já existente no repo (CIOT_RECONCILE_POLLING_DELAYS_MS) —
// não inventar um quarto esquema de backoff. N tentativas com sleep de delays[attempt] ENTRE
// elas; o último valor nunca vira sleep.
export const AVERBACAO_RECONCILE_POLLING_DELAYS_MS: readonly number[] = Object.freeze([2000, 5000, 10000, 15000, 20000]);

export type QueryAverbacaoByMarkerFn = AverbacaoGateway['queryByMarker'];

export type AverbacaoReconcilerDeps = {
  queryByMarker: QueryAverbacaoByMarkerFn;
  /** Injetável nos testes para não esperar o backoff real. */
  sleep?: (ms: number) => Promise<void>;
  /** Orçamento de polling do chamador; default fiel ao padrão da casa. */
  delaysMs?: readonly number[];
};

export type ReconcileAverbacaoInput = {
  /** Id local da linha `insurance_shipment_declarations` em estado `*_unconfirmed`. */
  declarationId: string;
  correlationMarker: string;
};

export type ReconcileAverbacaoResult =
  | { outcome: 'found'; declarationId: string; marker: string; attempts: number; match: Extract<AverbacaoQueryResult, { found: true }> }
  | { outcome: 'not-found-after-polling'; declarationId: string; marker: string; attempts: number }
  | { outcome: 'error'; declarationId: string; marker: string; attempts: number; error: AppError };

function toReconcileQueryError(error: unknown, attempt: number): AppError {
  const isAppError = error instanceof AppError;
  return new AppError(502, 'Averbacao Reconcile Error', 'Falha ao consultar a seguradora durante a reconciliação da averbação.', {
    code: 'AVERBACAO_RECONCILE_QUERY_FAILED',
    // Erro original em `cause` (não em context): preserva `code`/`remoteStatus` para os
    // classificadores de retry (`lib/retry.ts`) decidirem sem embrulho perdendo a informação.
    cause: error,
    context: { attempt, causeCode: isAppError ? error.code ?? null : null }
  });
}

/**
 * Pergunta à seguradora, com polling, se uma tentativa de averbação (declare/rectify/cancel) foi de
 * fato processada do outro lado. Não achar cedo NUNCA é falha — só `not-found-after-polling` depois
 * de esgotar o orçamento tem autoridade para declarar ausência.
 */
export async function reconcileAverbacaoDeclaration(
  deps: AverbacaoReconcilerDeps,
  input: ReconcileAverbacaoInput
): Promise<ReconcileAverbacaoResult> {
  if (typeof deps?.queryByMarker !== 'function') {
    throw new AppError(500, 'Internal Server Error', 'Dependência queryByMarker é obrigatória para reconciliar a averbação.', {
      code: 'AVERBACAO_RECONCILE_MISSING_DEPENDENCY'
    });
  }

  const declarationId = String(input?.declarationId ?? '').trim();
  const marker = String(input?.correlationMarker ?? '').trim();
  if (!declarationId || !marker) {
    throw new AppError(400, 'Bad Request', 'declarationId e correlationMarker são obrigatórios para reconciliar a averbação.', {
      code: 'AVERBACAO_RECONCILE_INVALID_INPUT'
    });
  }

  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.delaysMs ?? AVERBACAO_RECONCILE_POLLING_DELAYS_MS;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    let result: AverbacaoQueryResult;
    try {
      result = await deps.queryByMarker({ correlationMarker: marker });
    } catch (error: unknown) {
      // Erro de consulta é INCONCLUSIVO — nunca "a averbação não existe".
      return { outcome: 'error', declarationId, marker, attempts: attempt + 1, error: toReconcileQueryError(error, attempt + 1) };
    }

    if (result.found) {
      return { outcome: 'found', declarationId, marker, attempts: attempt + 1, match: result };
    }

    if (attempt < delays.length - 1) {
      await sleep(delays[attempt] ?? 0);
    }
  }

  return { outcome: 'not-found-after-polling', declarationId, marker, attempts: delays.length };
}
