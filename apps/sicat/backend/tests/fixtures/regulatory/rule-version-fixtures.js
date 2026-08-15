// Fixtures de `RegulatoryRuleVersion` para a categoria `tests/regulatory/` (PR-A6) — versões
// SINTÉTICAS que não existem no catálogo real, usadas para exercitar o motor (resolução temporal
// + clamp de enforcement) em cenários que o seed real não cobre hoje: regra ainda não vigente,
// regra revogada, e o par antes/depois de uma virada normativa (molde: `TR-CIOT-001`).
//
// Molde: `buildRuleVersion()` local de `tests/unit/rule-evaluators.test.js` (PR-A5) — aqui vira
// fixture reaproveitável. Função PURA: cada chamada devolve um objeto NOVO.

const FIXTURE_TIMESTAMP = '2026-08-13T00:00:00Z';

export function buildRuleVersion(overrides = {}) {
  return {
    id: 'regrulev_fixture',
    ruleId: 'regrule_fixture',
    versionLabel: 'v-fixture',
    legalBasis: [{ reference: 'Lei 13.703/2018' }],
    summary: 'Versão fixture — não existe no catálogo real.',
    effectiveFrom: '2018-08-09',
    effectiveUntil: null,
    implementationState: 'ACTIVE',
    blocking: false,
    severity: 'warning',
    applicability: {},
    reasonCodes: [],
    sourceHash: null,
    reviewedBy: null,
    reviewedAt: null,
    version: 1,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

/** Regra com vigência FUTURA — `effectiveFrom` além de qualquer data de referência usada nos testes. */
export function buildFutureRuleVersion(overrides = {}) {
  return buildRuleVersion({
    versionLabel: 'v-future-fixture',
    effectiveFrom: '2099-01-01',
    effectiveUntil: null,
    implementationState: 'FUTURE',
    ...overrides
  });
}

/** Regra REVOGADA — vigência fechada no passado, fora de qualquer `referenceDate` atual. */
export function buildRevokedRuleVersion(overrides = {}) {
  return buildRuleVersion({
    versionLabel: 'v-revoked-fixture',
    effectiveFrom: '2010-01-01',
    effectiveUntil: '2015-12-31',
    implementationState: 'REVOKED',
    ...overrides
  });
}

/**
 * Par ANTES/DEPOIS estilo `TR-CIOT-001` (virada do CIOT universal, 23/24-05-2026): `before` fecha
 * exatamente no dia anterior à abertura de `after` — nenhuma sobreposição, nenhum buraco entre as
 * duas janelas. `overrides.before`/`overrides.after` mesclam por cima de cada versão individualmente.
 */
export function buildSupersededPair(overrides = {}) {
  const boundary = overrides.boundary ?? '2026-05-24';
  const dayBefore = overrides.dayBefore ?? '2026-05-23';

  const before = buildRuleVersion({
    versionLabel: 'v-before-fixture',
    effectiveFrom: '2019-01-28',
    effectiveUntil: dayBefore,
    implementationState: 'SUPERSEDED',
    severity: 'warning',
    ...overrides.before
  });

  const after = buildRuleVersion({
    versionLabel: 'v-after-fixture',
    effectiveFrom: boundary,
    effectiveUntil: null,
    implementationState: 'ACTIVE',
    severity: 'critical',
    ...overrides.after
  });

  return { before, after };
}
