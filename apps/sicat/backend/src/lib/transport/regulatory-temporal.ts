/**
 * Resolução temporal PURA do catálogo regulatório (PR-A1, DL-103).
 *
 * A regra de vigência é UMA só e vive aqui: uma versão vale para a data `d` quando
 * `effective_from <= d` e (`effective_until` nulo OU `effective_until >= d`) — janela
 * inclusiva nas duas pontas, espelhando a exclusion constraint da migration 021
 * (`daterange(..., '[]')`).
 *
 * O repositório (`repositories/regulatory-repo.ts`) DELEGA para cá em vez de duplicar o
 * predicado em SQL, e os testes de fronteira (`tests/regulatory/effective-dates.test.js`)
 * exercitam esta mesma função — um único sítio para a lógica, sem double que "concorda
 * consigo mesmo".
 */

import { AppError } from '../problem.js';

/** Janela de vigência mínima que qualquer versão precisa expor (datas como 'YYYY-MM-DD'). */
export type EffectiveWindow = {
  effectiveFrom: string;
  effectiveUntil?: string | null;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza uma data de referência para 'YYYY-MM-DD'. Aceita timestamps ISO (usa só a parte
 * de data) e lança `AppError(400)` para entrada inválida — a mesma resposta que a superfície
 * HTTP do PR-A2 vai propagar como problem+json.
 */
export function normalizeReferenceDate(referenceDate: string): string {
  const candidate = String(referenceDate ?? '').trim().slice(0, 10);
  if (!ISO_DATE_PATTERN.test(candidate)) {
    throw new AppError(
      400,
      'Bad Request',
      `Data de referência inválida: '${referenceDate}'. Formato esperado: YYYY-MM-DD.`,
      { code: 'REGULATORY_REFERENCE_DATE_INVALID' }
    );
  }
  return candidate;
}

/**
 * Devolve a versão vigente na data de referência, ou `null` se nenhuma janela contém a data
 * (ex.: regra com `effective_from` futuro). Comparação lexicográfica de 'YYYY-MM-DD' é
 * ordem cronológica — sem `Date`/timezone no caminho.
 *
 * A exclusion constraint da migration 021 garante no banco que no máximo UMA janela contém
 * qualquer data; se a lista vier de outra origem (fixture com sobreposição), vence a janela
 * de `effectiveFrom` mais recente, determinística.
 */
export function resolveVersionFromList<T extends EffectiveWindow>(
  versions: readonly T[],
  referenceDate: string
): T | null {
  const date = normalizeReferenceDate(referenceDate);

  let resolved: T | null = null;
  for (const candidate of versions) {
    const from = normalizeReferenceDate(candidate.effectiveFrom);
    const until = candidate.effectiveUntil == null
      ? null
      : normalizeReferenceDate(candidate.effectiveUntil);

    const contains = from <= date && (until === null || until >= date);
    if (!contains) continue;

    if (resolved === null || from > normalizeReferenceDate(resolved.effectiveFrom)) {
      resolved = candidate;
    }
  }

  return resolved;
}
