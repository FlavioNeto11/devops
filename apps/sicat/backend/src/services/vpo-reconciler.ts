import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';
import type { VpoProviderGateway, VpoQueryResult } from '../gateways/vpo-gateway.js';

// ---------------------------------------------------------------------------------------------
// Reconciliador do ciclo de aquisição do VPO (PR-D1) — réplica DELIBERADA dos princípios do DL-102
// (`services/ciot-reconciler.ts`), NÃO reuso: bounded context próprio (VPO não acopla ao CIOT).
//
// Problema: um `transporte.vpo.acquire` pode ficar em estado indeterminado quando a resposta do
// provedor se perde (timeout, pod reiniciado). A linha `vpo_allocations` local não sabe se a
// aquisição foi PROCESSADA do outro lado. Este módulo descobre isso perguntando ao provedor pelo
// marcador de correlação gravado ANTES do dispatch (`lib/transport/vpo-correlation.ts`).
//
// Módulo PURO: recebe `{ queryVpoByMarker }` injetado — não importa o gateway concreto nem toca em
// Postgres. Testável sem provedor e sem banco, mesmo molde do reconciliador do CIOT.
// ---------------------------------------------------------------------------------------------

// Mesmos delays do padrão de polling já existente no repo (CIOT_RECONCILE_POLLING_DELAYS_MS) — não
// inventar um terceiro esquema de backoff. N tentativas com sleep de delays[attempt] ENTRE elas; o
// último valor nunca vira sleep.
export const VPO_RECONCILE_POLLING_DELAYS_MS: readonly number[] = Object.freeze([2000, 5000, 10000, 15000, 20000]);

export type QueryVpoByMarkerFn = VpoProviderGateway['queryVpoByMarker'];

export type VpoReconcilerDeps = {
  queryVpoByMarker: QueryVpoByMarkerFn;
  /** Injetável nos testes para não esperar o backoff real. */
  sleep?: (ms: number) => Promise<void>;
  /** Orçamento de polling do chamador; default fiel ao padrão da casa. */
  delaysMs?: readonly number[];
};

export type ReconcileVpoInput = {
  /** Id local da linha `vpo_allocations` em estado `acquisition_unconfirmed`. */
  vpoAllocationId: string;
  correlationMarker: string;
};

export type ReconcileVpoResult =
  | { outcome: 'found'; vpoAllocationId: string; marker: string; attempts: number; match: Extract<VpoQueryResult, { found: true }> }
  | { outcome: 'not-found-after-polling'; vpoAllocationId: string; marker: string; attempts: number }
  | { outcome: 'error'; vpoAllocationId: string; marker: string; attempts: number; error: AppError };

function toReconcileQueryError(error: unknown, attempt: number): AppError {
  const isAppError = error instanceof AppError;
  return new AppError(502, 'VPO Reconcile Error', 'Falha ao consultar o provedor de VPO durante a reconciliação.', {
    code: 'VPO_RECONCILE_QUERY_FAILED',
    // Erro original em `cause` (não em context): preserva `code`/`remoteStatus` para os
    // classificadores de retry (`lib/retry.ts`) decidirem sem embrulho perdendo a informação.
    cause: error,
    context: { attempt, causeCode: isAppError ? error.code ?? null : null }
  });
}

/**
 * Pergunta ao provedor, com polling, se uma solicitação de aquisição de VPO foi de fato processada
 * do outro lado. Não achar cedo NUNCA é falha — só `not-found-after-polling` depois de esgotar o
 * orçamento tem autoridade para declarar ausência.
 */
export async function reconcileVpoAllocation(
  deps: VpoReconcilerDeps,
  input: ReconcileVpoInput
): Promise<ReconcileVpoResult> {
  if (typeof deps?.queryVpoByMarker !== 'function') {
    throw new AppError(500, 'Internal Server Error', 'Dependência queryVpoByMarker é obrigatória para reconciliar o VPO.', {
      code: 'VPO_RECONCILE_MISSING_DEPENDENCY'
    });
  }

  const vpoAllocationId = String(input?.vpoAllocationId ?? '').trim();
  const marker = String(input?.correlationMarker ?? '').trim();
  if (!vpoAllocationId || !marker) {
    throw new AppError(400, 'Bad Request', 'vpoAllocationId e correlationMarker são obrigatórios para reconciliar o VPO.', {
      code: 'VPO_RECONCILE_INVALID_INPUT'
    });
  }

  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.delaysMs ?? VPO_RECONCILE_POLLING_DELAYS_MS;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    let result: VpoQueryResult;
    try {
      result = await deps.queryVpoByMarker({ correlationMarker: marker });
    } catch (error: unknown) {
      // Erro de consulta é INCONCLUSIVO — nunca "a aquisição não existe".
      return { outcome: 'error', vpoAllocationId, marker, attempts: attempt + 1, error: toReconcileQueryError(error, attempt + 1) };
    }

    if (result.found) {
      return { outcome: 'found', vpoAllocationId, marker, attempts: attempt + 1, match: result };
    }

    if (attempt < delays.length - 1) {
      await sleep(delays[attempt] ?? 0);
    }
  }

  return { outcome: 'not-found-after-polling', vpoAllocationId, marker, attempts: delays.length };
}
