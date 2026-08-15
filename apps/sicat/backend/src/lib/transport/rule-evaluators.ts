/**
 * Evaluators puros do motor de compliance (PR-A5, DL-103).
 *
 * Módulo PURO — nenhuma chamada a banco/HTTP/gateway. Cada evaluator recebe o agregado
 * `TransportOperation` (já carregado por `transport-compliance-service.ts`), a versão da regra
 * RESOLVIDA na data de referência (`regulatory-repo.listRulesWithVersionAt`) e devolve um
 * `RuleOutcome` — o motor (`transport-compliance-service.ts`) é quem aplica o clamp de enforcement
 * (`applyEnforcementClamp`) e persiste.
 *
 * Fase A = avaliação DECLARATIVA sobre dados locais do agregado, sem chamada externa (RNTRC/CIOT/
 * fiscal/seguros verificados de verdade são fases futuras — ver `RULES_WITHOUT_EVALUATOR_YET`
 * abaixo). Um evaluator aqui NUNCA lê o banco, a rede ou o relógio: tudo vem de `ctx`.
 */

import type {
  CargoRegime,
  TransportOperationAggregate,
  TransportOperationParty
} from './transport-operation-types.js';
import type { RegulatoryRuleVersion } from './regulatory-types.js';
import type { RuleCode } from './regulatory-types.js';

export type ComplianceCheckStatus = 'pass' | 'warn' | 'block' | 'not_applicable';

/** Resultado de UM evaluator sobre UMA regra — puro, sem status derivado de enforcement (isso é o clamp). */
export type RuleOutcome = {
  status: ComplianceCheckStatus;
  reasonCode?: string;
  humanMessage: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type RuleEvaluatorContext = {
  operation: TransportOperationAggregate;
  ruleVersion: RegulatoryRuleVersion;
  referenceDate: string;
};

export type RuleEvaluator = (ctx: RuleEvaluatorContext) => RuleOutcome;

// =================================================================================================
// Helpers puros compartilhados entre evaluators
// =================================================================================================

function findPartyByRole(
  parties: TransportOperationParty[],
  role: TransportOperationParty['role']
): TransportOperationParty | null {
  return parties.find((party) => party.role === role) ?? null;
}

/** Mesma leitura de aplicabilidade em TR-PMF-001/002/003/004: só `lotacao` exige piso na Fase A. */
function isFloorApplicable(cargoRegime: CargoRegime): boolean {
  return cargoRegime === 'lotacao';
}

function outcome(
  status: ComplianceCheckStatus,
  humanMessage: string,
  opts: { reasonCode?: string; inputs?: Record<string, unknown>; result?: Record<string, unknown> } = {}
): RuleOutcome {
  return {
    status,
    humanMessage,
    reasonCode: opts.reasonCode,
    inputs: opts.inputs ?? {},
    result: opts.result ?? {}
  };
}

// =================================================================================================
// TR-RNTRC-001 — RNTRC regular para a operação (GATE_CONTRACT)
// =================================================================================================

const IRREGULAR_RNTRC_STATUSES = new Set(['suspended', 'cancelled', 'expired']);

function evaluateRntrc001(ctx: RuleEvaluatorContext): RuleOutcome {
  const carrier = findPartyByRole(ctx.operation.parties, 'carrier');
  const inputs = { carrierLinked: Boolean(carrier) };

  if (!carrier) {
    return outcome('block', 'Nenhum transportador (carrier) vinculado à operação — o RNTRC não pode ser verificado.', {
      reasonCode: 'CARRIER_RNTRC_MISSING',
      inputs,
      result: { carrierLinked: false }
    });
  }

  const rntrcNumber = carrier.partySnapshot.rntrcNumber as string | null | undefined;
  const rntrcStatus = (carrier.partySnapshot.rntrcStatus as string | null | undefined) ?? 'unknown';
  const checkInputs = { ...inputs, rntrcNumber: rntrcNumber ?? null, rntrcStatus };

  if (!rntrcNumber) {
    return outcome('block', 'RNTRC do transportador vinculado não está preenchido no cadastro.', {
      reasonCode: 'CARRIER_RNTRC_MISSING',
      inputs: checkInputs,
      result: { rntrcNumber: null }
    });
  }

  if (IRREGULAR_RNTRC_STATUSES.has(rntrcStatus)) {
    return outcome('block', `RNTRC do transportador está "${rntrcStatus}" — situação irregular para operar.`, {
      reasonCode: 'CARRIER_RNTRC_IRREGULAR',
      inputs: checkInputs,
      result: { rntrcStatus }
    });
  }

  if (rntrcStatus === 'unknown') {
    return outcome('warn', 'RNTRC declarado, mas o status ainda não foi verificado (declaração do operador).', {
      reasonCode: 'RNTRC_NOT_VERIFIED',
      inputs: checkInputs,
      result: { rntrcStatus }
    });
  }

  return outcome('pass', `RNTRC do transportador regular ("${rntrcStatus}").`, {
    inputs: checkInputs,
    result: { rntrcNumber, rntrcStatus }
  });
}

// =================================================================================================
// TR-PMF-001 — determinar aplicabilidade do piso (GATE_PROPOSAL)
// =================================================================================================

function evaluatePmf001(ctx: RuleEvaluatorContext): RuleOutcome {
  const cargoRegime = ctx.operation.operation.cargoRegime;
  const inputs = { cargoRegime };

  if (cargoRegime === 'lotacao') {
    return outcome('pass', 'Regime de carga "lotacao" — piso mínimo de frete aplicável.', {
      inputs,
      result: { floorApplicable: true }
    });
  }

  if (cargoRegime === 'fracionada') {
    return outcome('pass', 'Regime de carga "fracionada" — piso mínimo de frete não aplicável nesta modalidade.', {
      inputs,
      result: { floorApplicable: false, note: 'Piso mínimo (Lei 13.703/2018) incide sobre lotação, não carga fracionada.' }
    });
  }

  return outcome('warn', 'Regime de carga não declarado ("unknown") — aplicabilidade do piso não pôde ser determinada.', {
    reasonCode: 'CARGO_REGIME_UNKNOWN',
    inputs,
    result: { floorApplicable: null }
  });
}

// =================================================================================================
// TR-PMF-002 — não permitir oferta abaixo do piso (GATE_PROPOSAL)
// =================================================================================================

function evaluatePmf002(ctx: RuleEvaluatorContext): RuleOutcome {
  const { cargoRegime, freightFloorAmount, freightOfferedAmount } = ctx.operation.operation;
  const inputs = { cargoRegime, freightFloorAmount, freightOfferedAmount };

  if (!isFloorApplicable(cargoRegime)) {
    return outcome('not_applicable', 'Piso não aplicável a este regime de carga — nada a checar na oferta.', {
      reasonCode: 'FLOOR_NOT_APPLICABLE',
      inputs
    });
  }

  if (freightFloorAmount == null) {
    return outcome('warn', 'Piso aplicável, mas ainda não calculado (o motor de cálculo chega na Fase B).', {
      reasonCode: 'FLOOR_NOT_CALCULATED',
      inputs
    });
  }

  const compliant = freightOfferedAmount != null && freightOfferedAmount >= freightFloorAmount;
  if (compliant) {
    return outcome('pass', 'Frete ofertado igual ou acima do piso vigente.', {
      inputs,
      result: { freightFloorAmount, freightOfferedAmount }
    });
  }

  return outcome('block', 'Frete ofertado abaixo do piso mínimo vigente.', {
    reasonCode: 'FREIGHT_BELOW_FLOOR',
    inputs,
    result: { freightFloorAmount, freightOfferedAmount }
  });
}

// =================================================================================================
// TR-PMF-003 — não permitir contratação abaixo do piso (GATE_CONTRACT) — análogo ao 002
// =================================================================================================

function evaluatePmf003(ctx: RuleEvaluatorContext): RuleOutcome {
  const { cargoRegime, freightFloorAmount, freightContractedAmount } = ctx.operation.operation;
  const inputs = { cargoRegime, freightFloorAmount, freightContractedAmount };

  if (!isFloorApplicable(cargoRegime)) {
    return outcome('not_applicable', 'Piso não aplicável a este regime de carga — nada a checar na contratação.', {
      reasonCode: 'FLOOR_NOT_APPLICABLE',
      inputs
    });
  }

  if (freightFloorAmount == null) {
    return outcome('warn', 'Piso aplicável, mas ainda não calculado (o motor de cálculo chega na Fase B).', {
      reasonCode: 'FLOOR_NOT_CALCULATED',
      inputs
    });
  }

  const compliant = freightContractedAmount != null && freightContractedAmount >= freightFloorAmount;
  if (compliant) {
    return outcome('pass', 'Frete contratado igual ou acima do piso vigente.', {
      inputs,
      result: { freightFloorAmount, freightContractedAmount }
    });
  }

  return outcome('block', 'Frete contratado abaixo do piso mínimo vigente.', {
    reasonCode: 'FREIGHT_BELOW_FLOOR',
    inputs,
    result: { freightFloorAmount, freightContractedAmount }
  });
}

// =================================================================================================
// TR-PMF-004 — usar versão do piso vigente na data (GATE_PROPOSAL)
// =================================================================================================

function evaluatePmf004(ctx: RuleEvaluatorContext): RuleOutcome {
  const cargoRegime = ctx.operation.operation.cargoRegime;
  const inputs = { cargoRegime };

  if (!isFloorApplicable(cargoRegime)) {
    return outcome('not_applicable', 'Piso não aplicável a este regime de carga — nenhuma tabela a resolver.', {
      reasonCode: 'FLOOR_NOT_APPLICABLE',
      inputs
    });
  }

  // Fase A: `freight_floor_versions`/`coefficients` (migration 022) nascem SEM coeficiente
  // semeado (pendência P3 do guia) — nenhuma versão de tabela está disponível ainda.
  return outcome('warn', 'Piso aplicável, mas nenhuma tabela de coeficientes está disponível ainda (pendência P3 do guia).', {
    reasonCode: 'FLOOR_VERSION_UNAVAILABLE',
    inputs
  });
}

// =================================================================================================
// TR-PAY-001 — prazo/forma de pagamento conforme norma vigente (GATE_CONTRACT)
// =================================================================================================

const PAYMENT_TERM_LIMIT_DAYS = 30;

function evaluatePay001(ctx: RuleEvaluatorContext): RuleOutcome {
  const paymentTermDays = ctx.operation.operation.paymentTermDays;
  const inputs = { paymentTermDays };

  if (paymentTermDays == null) {
    return outcome('warn', 'Prazo de pagamento não declarado.', {
      reasonCode: 'PAYMENT_TERM_NOT_DECLARED',
      inputs
    });
  }

  if (paymentTermDays <= PAYMENT_TERM_LIMIT_DAYS) {
    return outcome('pass', `Prazo de pagamento declarado (${paymentTermDays} dias) dentro do limite legal.`, {
      inputs,
      result: { limitDays: PAYMENT_TERM_LIMIT_DAYS }
    });
  }

  return outcome(
    'block',
    `Prazo de pagamento declarado (${paymentTermDays} dias) excede o limite da Lei 15.485/2026 `
      + `(30 dias ÚTEIS — a contagem legal é em dias úteis, a declaração deste campo é em dias corridos).`,
    {
      reasonCode: 'PAYMENT_TERM_EXCEEDS_LIMIT',
      inputs,
      result: { limitDays: PAYMENT_TERM_LIMIT_DAYS }
    }
  );
}

// =================================================================================================
// TR-VPO-001 — determinar aplicabilidade do VPO (GATE_PRE_BOARDING)
// =================================================================================================

function evaluateVpo001(ctx: RuleEvaluatorContext): RuleOutcome {
  const tollExpected = ctx.operation.route?.tollExpected ?? null;
  const inputs = { tollExpected };

  if (tollExpected === true) {
    return outcome('pass', 'Rota com pedágio esperado — VPO provavelmente aplicável.', {
      inputs,
      result: { vpoLikelyApplicable: true }
    });
  }

  if (tollExpected === false) {
    return outcome('pass', 'Rota sem pedágio esperado — VPO provavelmente não aplicável.', {
      inputs,
      result: { vpoLikelyApplicable: false }
    });
  }

  return outcome('warn', 'Expectativa de pedágio da rota não informada — aplicabilidade do VPO indeterminada.', {
    reasonCode: 'TOLL_EXPECTATION_UNKNOWN',
    inputs,
    result: { vpoLikelyApplicable: null }
  });
}

// =================================================================================================
// TR-VPO-003 — valor do VPO separado do frete (GATE_CONTRACT)
// =================================================================================================

function evaluateVpo003(ctx: RuleEvaluatorContext): RuleOutcome {
  const { vpoAmount, freightOfferedAmount, freightContractedAmount } = ctx.operation.operation;
  const inputs = { vpoAmount, freightOfferedAmount, freightContractedAmount };

  if (vpoAmount == null || vpoAmount <= 0) {
    return outcome('not_applicable', 'VPO não declarado para esta operação.', {
      reasonCode: 'VPO_NOT_DECLARED',
      inputs
    });
  }

  // Checagem possível na Fase A: `vpoAmount` é um campo DECOMPOSTO, nunca somado a
  // `freightOfferedAmount`/`freightContractedAmount` no agregado (migration 024) — a garantia de
  // que o valor não está "embutido" é estrutural (schema), não uma comparação numérica aqui.
  return outcome('pass', 'Valor do VPO declarado em campo separado do frete (frete nunca inclui VPO no agregado).', {
    inputs,
    result: { vpoAmount, freightOfferedAmount, freightContractedAmount }
  });
}

// =================================================================================================
// TR-CIOT-004 — dados obrigatórios do CIOT completos (GATE_CIOT)
// =================================================================================================

function evaluateCiot004(ctx: RuleEvaluatorContext): RuleOutcome {
  const { parties, cargo, route } = ctx.operation;
  const { freightOfferedAmount } = ctx.operation.operation;

  const missing: string[] = [];
  if (!findPartyByRole(parties, 'carrier')) missing.push('carrier');
  if (!findPartyByRole(parties, 'contractor')) missing.push('contractor');
  if (cargo.length === 0) missing.push('cargo');
  if (!route) missing.push('route');
  if (freightOfferedAmount == null) missing.push('freightOfferedAmount');

  const inputs = {
    hasCarrier: Boolean(findPartyByRole(parties, 'carrier')),
    hasContractor: Boolean(findPartyByRole(parties, 'contractor')),
    cargoCount: cargo.length,
    hasRoute: Boolean(route),
    freightOfferedAmount
  };

  if (missing.length > 0) {
    return outcome('block', `Dados mínimos para o CIOT incompletos: ${missing.join(', ')}.`, {
      reasonCode: 'CIOT_DATA_INCOMPLETE',
      inputs,
      result: { missing }
    });
  }

  return outcome('pass', 'Conjunto mínimo de dados do CIOT completo (transportador, contratante, carga, rota e frete ofertado).', {
    inputs,
    result: { missing: [] }
  });
}

// =================================================================================================
// TR-COMP-001 — conjunto mínimo para liberação aprovado (GATE_RELEASE)
// =================================================================================================

function evaluateComp001(): RuleOutcome {
  // Regra agregadora: na Fase A não há CIOT/fiscal/seguros implementados para agregar — nunca
  // `pass` aqui, sempre `warn` (fases C+ trazem os pré-requisitos reais).
  return outcome('warn', 'Pré-requisitos de liberação (CIOT, fiscal, seguros) ainda não são avaliados nesta fase do programa.', {
    reasonCode: 'RELEASE_PREREQUISITES_PENDING',
    inputs: {},
    result: {}
  });
}

// =================================================================================================
// Registro de evaluators da Fase A
// =================================================================================================

export const RULE_EVALUATORS: Partial<Record<RuleCode, RuleEvaluator>> = {
  'TR-RNTRC-001': evaluateRntrc001,
  'TR-PMF-001': evaluatePmf001,
  'TR-PMF-002': evaluatePmf002,
  'TR-PMF-003': evaluatePmf003,
  'TR-PMF-004': evaluatePmf004,
  'TR-PAY-001': evaluatePay001,
  'TR-VPO-001': evaluateVpo001,
  'TR-VPO-003': evaluateVpo003,
  'TR-CIOT-004': evaluateCiot004,
  'TR-COMP-001': evaluateComp001
};

/**
 * Regras do seed SEM evaluator ainda — o motor devolve `not_applicable` com
 * `EVALUATOR_NOT_IMPLEMENTED` para elas (não é erro: é o desenho declarado desde o PR-A1, cada
 * regra entra no catálogo antes do evaluator que a avalia de verdade). `targetPhase` é a fase do
 * programa (ver `docs/30-transporte/transporte-guia.md`, seção "Ondas do programa") que traz a
 * integração/dado necessário para avaliar a regra de verdade — mapeada por domínio regulatório:
 * RNTRC (verificação ANTT) e CIOT (ciclo completo) → Fase C; VPO (antecipação/meio de pagamento) →
 * Fase D; NF-e/CT-e/MDF-e (importação fiscal) → Fase E; seguros/PGR → Fase F.
 */
export const RULES_WITHOUT_EVALUATOR_YET: Partial<Record<RuleCode, { targetPhase: string }>> = {
  'TR-RNTRC-002': { targetPhase: 'C' },
  'TR-RNTRC-003': { targetPhase: 'C' },
  'TR-CIOT-001': { targetPhase: 'C' },
  'TR-CIOT-002': { targetPhase: 'C' },
  'TR-CIOT-003': { targetPhase: 'C' },
  'TR-CIOT-005': { targetPhase: 'E' },
  'TR-VPO-002': { targetPhase: 'D' },
  'TR-VPO-004': { targetPhase: 'E' },
  'TR-NFE-001': { targetPhase: 'E' },
  'TR-CTE-001': { targetPhase: 'E' },
  'TR-MDFE-001': { targetPhase: 'E' },
  'TR-MDFE-002': { targetPhase: 'E' },
  'TR-SEG-001': { targetPhase: 'F' },
  'TR-SEG-002': { targetPhase: 'F' },
  'TR-SEG-003': { targetPhase: 'F' },
  'TR-PGR-001': { targetPhase: 'F' }
};

// =================================================================================================
// Clamp de enforcement — PURO, testado isoladamente (`transport-compliance-clamp.test.js`)
// =================================================================================================

export type ClampedOutcome = {
  status: ComplianceCheckStatus;
  /** Status ANTES do clamp, só quando o clamp de fato mudou o status; `null` quando não houve clamp. */
  rawStatus: ComplianceCheckStatus | null;
  reasonCode?: string;
  humanMessage: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
};

/**
 * Regra de ouro do programa em código: um `block` só é ENFORÇÁVEL de verdade quando a versão da
 * regra está `implementationState === 'ACTIVE'` E `blocking === true` (o par que a migration 021
 * já trava via `chk_regrulev_blocking_reviewed` — só chega aqui com revisão humana registrada). Em
 * qualquer outro caso, um `block` vira `warn`: o `rawStatus` original fica registrado (auditoria) e
 * o `reasonCode` ganha `RULE_NOT_ENFORCEABLE` — o motivo original some do campo, mas continua em
 * `result.clamp.originalReasonCode`. `pass`/`warn`/`not_applicable` NUNCA são clampados.
 */
export function applyEnforcementClamp(outcome: RuleOutcome, ruleVersion: RegulatoryRuleVersion): ClampedOutcome {
  const enforceable = ruleVersion.implementationState === 'ACTIVE' && ruleVersion.blocking === true;

  if (outcome.status !== 'block' || enforceable) {
    return { ...outcome, rawStatus: null };
  }

  return {
    status: 'warn',
    rawStatus: 'block',
    reasonCode: 'RULE_NOT_ENFORCEABLE',
    humanMessage: outcome.humanMessage,
    inputs: outcome.inputs,
    result: {
      ...outcome.result,
      clamp: {
        originalStatus: 'block',
        originalReasonCode: outcome.reasonCode ?? null,
        implementationState: ruleVersion.implementationState,
        blocking: ruleVersion.blocking
      }
    }
  };
}
