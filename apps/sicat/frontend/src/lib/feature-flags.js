/**
 * Feature flags do frontend — lidas em BUILD TIME via `import.meta.env` (Vite).
 *
 * Não havia mecanismo de feature flag no frontend antes deste módulo (busca
 * por "feature flag"/`featureFlag`/`FEATURE_` em `src/` não encontrou nada) —
 * esta é a primeira flag do app. Convenção adotada aqui, para as próximas
 * flags reaproveitarem: env var `VITE_FEATURE_<NOME>`, textual (`'true'` ou
 * `'1'` liga; qualquer outro valor — incluindo ausente — desliga). Default
 * SEMPRE desligado: uma vertical nova atrás de flag não pode "vazar" para
 * produção só porque a env var não foi setada no manifesto do cluster.
 *
 * `isEnvFlagOn` é PURA (sem `import.meta`) de propósito — é o que
 * `frontend/tests/unit/feature-flags.test.js` exercita. A constante exportada
 * abaixo é só o valor já resolvido pelo Vite no bundle; `import.meta.env` não
 * existe fora de um módulo Vite/ESM (por isso o optional chaining — sem ele
 * este módulo não seria importável em `node:test`).
 */

export function isEnvFlagOn(rawValue) {
  const normalized = String(rawValue ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/** Flag da vertical Transporte (DL-103, programa "SICAT Transporte", Onda 1.5/PR-F1). */
export const TRANSPORTE_FEATURE_FLAG = isEnvFlagOn(import.meta.env?.VITE_FEATURE_TRANSPORTE);
