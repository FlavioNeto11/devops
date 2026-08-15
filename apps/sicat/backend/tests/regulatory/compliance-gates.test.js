import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRegulatoryCatalogSeed } from '../../src/bootstrap/regulatory-rules-seed.js';
import { resolveVersionFromList } from '../../src/lib/transport/regulatory-temporal.js';
import { COMPLIANCE_GATES } from '../../src/lib/transport/regulatory-types.js';
import { RULE_EVALUATORS, applyEnforcementClamp } from '../../src/lib/transport/rule-evaluators.js';
import {
  buildCtcSubcontratadaOperation,
  buildEtcFracionadaOperation,
  buildIncompleteDraftOperation,
  buildTacLotacaoOperation
} from '../fixtures/regulatory/operation-aggregates.js';

/**
 * Matriz gate × regra × resultado (PR-A6) — evaluators PUROS (`rule-evaluators.ts`) rodando contra
 * os agregados de fixture, resolvidos com as VERSÕES REAIS do seed (`buildRegulatoryCatalogSeed()`).
 * Nada de banco: é o mesmo par (evaluator + versão resolvida) que
 * `transport-compliance-service.ts` monta em `buildCheckForRule`, só que sem I/O.
 */

const REFERENCE_DATE = '2026-08-13'; // data da baseline — toda regra ACTIVE do seed resolve aqui.

const seed = buildRegulatoryCatalogSeed();

/** Seed → shape mínimo de `RegulatoryRuleVersion` que `applyEnforcementClamp` precisa (implementationState + blocking). */
function toClampableVersion(seedVersion) {
  return {
    id: 'regrulev_seed_snapshot',
    ruleId: 'regrule_seed_snapshot',
    versionLabel: seedVersion.versionLabel,
    legalBasis: seedVersion.legalBasis,
    summary: seedVersion.summary,
    effectiveFrom: seedVersion.effectiveFrom,
    effectiveUntil: seedVersion.effectiveUntil ?? null,
    implementationState: seedVersion.implementationState,
    // Regra de ouro do programa: TODA versão do seed nasce blocking=false (o insert grava o
    // literal `false` — ver header de bootstrap/regulatory-rules-seed.ts). A estrutura declarativa
    // nem carrega o campo, então reproduzimos aqui a mesma realidade do banco.
    blocking: false,
    severity: seedVersion.severity,
    applicability: {},
    reasonCodes: [],
    sourceHash: null,
    reviewedBy: null,
    reviewedAt: null,
    version: 1,
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-08-13T00:00:00Z'
  };
}

/** Resolve a versão vigente da regra na data e roda o evaluator puro (quando existe um). `ciotOperation` (PR-C2)/`vpoAllocation` (PR-D1) são opcionais. */
function resolveAndEvaluate(rule, aggregate, referenceDate = REFERENCE_DATE, ciotOperation = undefined, vpoAllocation = undefined) {
  const seedVersion = resolveVersionFromList(rule.versions, referenceDate);
  if (!seedVersion) return { version: null, outcome: null, clamped: null };

  const evaluator = RULE_EVALUATORS[rule.code];
  if (!evaluator) return { version: seedVersion, outcome: null, clamped: null };

  const clampableVersion = toClampableVersion(seedVersion);
  const outcome = evaluator({ operation: aggregate, ruleVersion: clampableVersion, referenceDate, ciotOperation, vpoAllocation });
  const clamped = applyEnforcementClamp(outcome, clampableVersion);
  return { version: seedVersion, outcome, clamped };
}

/** Fixture mínima de `ctx.ciotOperation` (PR-C2) — recorte que os evaluators TR-CIOT-001/002/003 consomem. */
function buildCiotOperationFixture(overrides = {}) {
  return {
    status: 'registered',
    ciotNumber: '1234567890',
    requestPayloadSnapshot: { responsibleParty: 'contractor' },
    ...overrides
  };
}

/** Fixture mínima de `ctx.vpoAllocation` (PR-D1) — recorte que os evaluators TR-VPO-001/002/003 consomem. */
function buildVpoAllocationFixture(overrides = {}) {
  return {
    status: 'applicable',
    applicable: true,
    applicabilityReasonCode: 'VPO_REQUIRED_TOLL_ROUTE',
    amount: null,
    providerId: null,
    evidenceSource: null,
    ...overrides
  };
}

function ruleByCode(code) {
  const rule = seed.rules.find((entry) => entry.code === code);
  assert.ok(rule, `regra ${code} não existe no seed`);
  return rule;
}

// ===================================================================================================
// Cobertura estrutural: mapa gate → regras do catálogo atual
// ===================================================================================================

// GATE_IN_TRANSIT/GATE_COMPLETION são os gates das transições `request_completion`/`complete`
// (Fase C do grafo, `transport-state-machine.ts`) — nenhuma regra TR-* da baseline atual tem
// `defaultGate` apontando para eles ainda (nenhuma regra de "em viagem"/"conclusão" no catálogo
// desta fase). Não é bug: `evaluateGateService` sobre um gate sem regra mapeada devolve
// `checks: []` e `overallStatus: 'pass'` por vacuidade — comportamento coberto por este teste, não
// escondido dele.
const GATES_WITHOUT_RULE_YET = ['GATE_IN_TRANSIT', 'GATE_COMPLETION'];

describe('compliance-gates — mapa gate → regras do catálogo atual', () => {
  it('6 dos 8 GATES têm defaultGate correspondente em pelo menos uma regra TR-*; os 2 restantes são os documentados em GATES_WITHOUT_RULE_YET', () => {
    for (const gate of COMPLIANCE_GATES) {
      const rulesOfGate = seed.rules.filter((rule) => rule.defaultGate === gate);
      if (GATES_WITHOUT_RULE_YET.includes(gate)) {
        assert.equal(
          rulesOfGate.length,
          0,
          `${gate} ganhou regra(s) no catálogo — atualize GATES_WITHOUT_RULE_YET (e o teste de vacuidade abaixo deixou de valer)`
        );
      } else {
        assert.ok(rulesOfGate.length > 0, `gate ${gate} sem nenhuma regra no catálogo`);
      }
    }
  });
});

// ===================================================================================================
// Casos pontuais pedidos pelo PR-A6 — GATE_CIOT/TR-CIOT-004 e GATE_PROPOSAL/TR-PMF-002
// ===================================================================================================

describe('compliance-gates — GATE_CIOT / TR-CIOT-004 (dados obrigatórios do CIOT completos)', () => {
  it('agregado TAC lotação COMPLETO → pass', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-004'), buildTacLotacaoOperation());
    assert.equal(outcome.status, 'pass');
  });

  it('rascunho INCOMPLETO → block (raw, antes do clamp) CIOT_DATA_INCOMPLETE', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-004'), buildIncompleteDraftOperation());
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'CIOT_DATA_INCOMPLETE');
  });
});

describe('compliance-gates — GATE_CIOT / TR-CIOT-001 (obrigatoriedade do CIOT)', () => {
  it('operação remunerada SEM ciot solicitado → warn CIOT_NOT_REGISTERED', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-001'), buildTacLotacaoOperation());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'CIOT_NOT_REGISTERED');
  });

  it('operação remunerada com ciot registered → pass (REGISTERED ≠ COMPLIANT na mensagem)', () => {
    const ciotOperation = buildCiotOperationFixture({ status: 'registered' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-001'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'pass');
    assert.match(outcome.humanMessage, /REGISTRADO não é o mesmo que CONFORME/);
  });

  it('operação SEM frete declarado → not_applicable CIOT_NOT_APPLICABLE_UNPAID', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-001'), buildIncompleteDraftOperation());
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'CIOT_NOT_APPLICABLE_UNPAID');
  });
});

describe('compliance-gates — GATE_RELEASE / TR-CIOT-002 (CIOT antes do início da operação)', () => {
  it('operação remunerada SEM ciot registered → block (raw) CIOT_MISSING_FOR_RELEASE', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-002'), buildTacLotacaoOperation());
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'CIOT_MISSING_FOR_RELEASE');
  });

  it('operação remunerada com ciot registered → pass', () => {
    const ciotOperation = buildCiotOperationFixture({ status: 'registered' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-002'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'pass');
  });

  it('ciot rectified TAMBÉM conta como vigente para a liberação → pass', () => {
    const ciotOperation = buildCiotOperationFixture({ status: 'rectified' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-002'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'pass');
  });

  it('ciot rejected → block (raw) CIOT_MISSING_FOR_RELEASE, nunca confundido com pass', () => {
    const ciotOperation = buildCiotOperationFixture({ status: 'rejected', ciotNumber: null });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-002'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'CIOT_MISSING_FOR_RELEASE');
  });
});

describe('compliance-gates — GATE_CIOT / TR-CIOT-003 (responsável pelo CIOT conforme enquadramento)', () => {
  it('sem ciot solicitado ainda → warn CIOT_RESPONSIBLE_UNDECLARED', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-003'), buildTacLotacaoOperation());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'CIOT_RESPONSIBLE_UNDECLARED');
  });

  it('responsibleParty declarado (contractor, default) → pass', () => {
    const ciotOperation = buildCiotOperationFixture({ requestPayloadSnapshot: { responsibleParty: 'contractor' } });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-003'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.responsibleParty, 'contractor');
  });

  it('subcontratação: responsibleParty=subcontractor (quem contratou o TAC) → pass', () => {
    const ciotOperation = buildCiotOperationFixture({ requestPayloadSnapshot: { responsibleParty: 'subcontractor' } });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-003'), buildCtcSubcontratadaOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.responsibleParty, 'subcontractor');
  });

  it('ciot existe mas responsibleParty não foi declarado → warn CIOT_RESPONSIBLE_UNDECLARED', () => {
    const ciotOperation = buildCiotOperationFixture({ requestPayloadSnapshot: {} });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-CIOT-003'), buildTacLotacaoOperation(), REFERENCE_DATE, ciotOperation);
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'CIOT_RESPONSIBLE_UNDECLARED');
  });
});

describe('compliance-gates — GATE_PRE_BOARDING / TR-VPO-001 (aplicabilidade do VPO)', () => {
  it('sem avaliação (vpoAllocation ausente) → warn VPO_APPLICABILITY_NOT_EVALUATED', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-001'), buildTacLotacaoOperation());
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'VPO_APPLICABILITY_NOT_EVALUATED');
  });

  it('allocation not_applicable com reason → pass (justificativa evidenciada, nunca "block silencioso")', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'not_applicable', applicable: false, applicabilityReasonCode: 'VPO_NO_TOLL_ON_ROUTE' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-001'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
  });

  it('allocation applicable → pass vpoRequired=true', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'applicable' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-001'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.result.vpoRequired, true);
  });

  it('allocation pending (indeterminado — exceção regulatória) → warn com o reasonCode do engine', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'pending', applicable: null, applicabilityReasonCode: 'VPO_FRACTIONAL_CARGO_REVIEW' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-001'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'VPO_FRACTIONAL_CARGO_REVIEW');
  });
});

describe('compliance-gates — GATE_PRE_BOARDING / TR-VPO-002 (VPO antecipado antes do embarque)', () => {
  it('applicable SEM acquired → block (raw) VPO_NOT_ACQUIRED', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'applicable' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-002'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'block');
    assert.equal(outcome.reasonCode, 'VPO_NOT_ACQUIRED');
  });

  it('applicable e acquired (amount>0 + provider) → pass', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'acquired', amount: 350.5, providerId: 'vpoprov_x', evidenceSource: 'provider' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-002'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'pass');
  });

  it('not_applicable → not_applicable com o reason evidenciado (nunca block)', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'not_applicable', applicable: false, applicabilityReasonCode: 'VPO_NO_TOLL_ON_ROUTE' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-002'), buildTacLotacaoOperation(), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'VPO_NO_TOLL_ON_ROUTE');
  });
});

describe('compliance-gates — GATE_CONTRACT / TR-VPO-003 (valor do VPO separado do frete)', () => {
  it('vpoAmount ausente → not_applicable VPO_NOT_DECLARED', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-003'), buildTacLotacaoOperation({ operation: { vpoAmount: null } }));
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'VPO_NOT_DECLARED');
  });

  it('vpoAmount preenchido e allocation acquired com amount IGUAL → pass (separação comprovada)', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'acquired', amount: 250.5, providerId: 'vpoprov_x' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-003'), buildTacLotacaoOperation({ operation: { vpoAmount: 250.5 } }), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'pass');
  });

  it('vpoAmount preenchido e allocation com amount DIVERGENTE → warn VPO_AMOUNT_MISMATCH', () => {
    const vpoAllocation = buildVpoAllocationFixture({ status: 'acquired', amount: 300, providerId: 'vpoprov_x' });
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-VPO-003'), buildTacLotacaoOperation({ operation: { vpoAmount: 250.5 } }), REFERENCE_DATE, undefined, vpoAllocation);
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'VPO_AMOUNT_MISMATCH');
  });
});

describe('compliance-gates — GATE_PROPOSAL / TR-PMF-002 (oferta não pode ficar abaixo do piso)', () => {
  it('lotação sem piso calculado ainda → warn FLOOR_NOT_CALCULATED', () => {
    const aggregate = buildTacLotacaoOperation(); // freightFloorAmount é null por padrão no fixture
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-PMF-002'), aggregate);
    assert.equal(outcome.status, 'warn');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_CALCULATED');
  });

  it('regime fracionada → not_applicable FLOOR_NOT_APPLICABLE (piso não incide sobre fracionada)', () => {
    const { outcome } = resolveAndEvaluate(ruleByCode('TR-PMF-002'), buildEtcFracionadaOperation());
    assert.equal(outcome.status, 'not_applicable');
    assert.equal(outcome.reasonCode, 'FLOOR_NOT_APPLICABLE');
  });
});

// ===================================================================================================
// O teste que prova "nada bloqueia na Fase A": clamp fim-a-fim com as versões REAIS do seed
// ===================================================================================================

describe('compliance-gates — clamp fim-a-fim: NENHUM status final é "block" com o catálogo REAL', () => {
  it('aplicando applyEnforcementClamp em toda combinação gate×regra×agregado, nenhum clamped.status é "block"', () => {
    const scenarios = [
      { label: 'TAC lotação completo', aggregate: buildTacLotacaoOperation() },
      { label: 'ETC fracionada completo', aggregate: buildEtcFracionadaOperation() },
      { label: 'rascunho incompleto', aggregate: buildIncompleteDraftOperation() }
    ];

    let checkedCount = 0;
    for (const gate of COMPLIANCE_GATES) {
      const rulesOfGate = seed.rules.filter((rule) => rule.defaultGate === gate);
      for (const rule of rulesOfGate) {
        if (!RULE_EVALUATORS[rule.code]) continue; // RULES_WITHOUT_EVALUATOR_YET: sempre not_applicable, nunca block

        for (const scenario of scenarios) {
          const { version, outcome, clamped } = resolveAndEvaluate(rule, scenario.aggregate);
          if (!version || !outcome) continue;

          checkedCount += 1;
          assert.notEqual(
            clamped.status,
            'block',
            `${rule.code} (${gate}, ${scenario.label}): status final "block" com o catálogo REAL — `
              + 'a regra de ouro da Fase A é que NENHUMA versão semeada é blocking=true, então nenhum '
              + 'clamp deveria deixar um block sobreviver. Se isto falhou, o seed mudou para uma versão '
              + 'blocking=true (ver meta-guarda 1 em rule-catalog-invariants.test.js).'
          );
        }
      }
    }

    assert.ok(
      checkedCount > 0,
      'nenhuma combinação gate×regra×cenário foi de fato avaliada — o teste ficaria verde por omissão'
    );
  });
});
