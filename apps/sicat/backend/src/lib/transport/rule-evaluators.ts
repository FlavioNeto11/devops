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

/** Referência (SEM id interno) da versão de tabela de piso usada num cálculo — espelha `freight-floor-repo.ts`. */
export type FreightFloorCalculationVersionRef = {
  normativeReference: string;
  tableCode: string;
  reviewStatus: 'pending_review' | 'reviewed' | 'rejected';
  effectiveFrom: string;
};

/**
 * Recorte do cálculo de piso mais recente da operação (`freight_floor_calculations`, PR-B1) — só
 * os campos que os evaluators TR-PMF-002/003/004 precisam, montado pelo motor de compliance
 * (`transport-compliance-service.ts`) a partir de `freight-floor-repo.findLatestFreightFloorCalculation`.
 * `null` quando a operação nunca teve `calcular-piso` rodado.
 */
export type FreightFloorCalculationContext = {
  outcome: 'calculated' | 'not_applicable' | 'missing_coefficients' | 'missing_inputs';
  referenceDate: string;
  minimumAmount: number | null;
  floorVersion: FreightFloorCalculationVersionRef | null;
};

/**
 * Recorte da última verificação RNTRC SUCEDIDA do carrier vinculado à operação (PR-C1,
 * `rntrc_verifications`), montado por `transport-compliance-service.ts` a partir de
 * `rntrc-verification-repo.findLatestSucceededRntrcVerificationForParty`. `null` quando o carrier
 * nunca teve uma verificação concluída com sucesso (falhas de rede não contam — ver
 * `completeVerificationFailed`, nunca `succeeded`).
 */
export type CarrierRntrcVerificationContext = {
  strategy: 'open_data' | 'manual' | 'antt';
  resultStatus: 'active' | 'suspended' | 'cancelled' | 'expired' | 'not_found' | 'unknown';
  /** Data-base do dado consultado (só `open_data`) — a defasagem que o relatório precisa mostrar. */
  dataReferenceDate: string | null;
  /** Quando a verificação terminou — é o que decide o frescor dos 90 dias, não `dataReferenceDate`. */
  completedAt: string;
};

/**
 * Recorte da tentativa de CIOT MAIS RECENTE da operação (PR-C2, `ciot_operations`), montado por
 * `transport-compliance-service.ts` a partir de `ciot-repo.findLatestCiotOperationForOperation`.
 * `undefined`/`null` = nenhum `solicitar` foi feito ainda (operação nunca entrou no ciclo do CIOT).
 * Recorte deliberadamente MÍNIMO — os evaluators só precisam saber "o que aconteceu", nunca o
 * payload/resposta crus do provedor.
 */
export type CiotOperationEvaluationContext = {
  status: 'pre_validation' | 'requested' | 'request_unconfirmed' | 'registered' | 'rectified' | 'cancelled' | 'closed' | 'rejected' | 'blocked';
  ciotNumber: string | null;
  requestPayloadSnapshot: Record<string, unknown>;
};

/**
 * Recorte da alocação de VPO da operação (PR-D1, `vpo_allocations` — recurso MUTÁVEL, uma linha
 * por operação, ao contrário de `ciot_operations`), montado por `transport-compliance-service.ts`
 * a partir de `vpo-repo.ts#findVpoAllocationByOperationId`. `undefined`/`null` = a operação nunca
 * rodou `avaliar-aplicabilidade`. Recorte deliberadamente MÍNIMO — os evaluators só precisam saber
 * "o que se sabe hoje", nunca o snapshot de rota/evidência crus.
 */
export type VpoAllocationEvaluationContext = {
  status: 'pending' | 'applicable' | 'not_applicable' | 'acquisition_requested' | 'acquisition_unconfirmed' | 'acquired' | 'cancelled';
  applicable: boolean | null;
  applicabilityReasonCode: string | null;
  amount: number | null;
  providerId: string | null;
  evidenceSource: string | null;
  /** Referência do VPO no MDF-e (PR-E1, `vpo_allocations.mdfe_reference`) — `null` até `transport-fiscal-service.ts` aplicar o side-effect (MDF-e com valePed vinculado + allocation `acquired`). Consumido por TR-VPO-004. */
  mdfeReference: string | null;
};

/**
 * Recorte de UM documento fiscal (`fiscal_documents`, PR-E1) vinculado à operação — montado por
 * `transport-compliance-service.ts` a partir de `transport-fiscal-repo.ts#listFiscalDocumentsForOperation`.
 * `validationIssueCodes` é a lista de `code` de `validation_issues` (não o objeto inteiro) — é o que
 * TR-MDFE-002 usa para saber SE o schema registry exigiu CIOT (`MDFE_CIOT_MISSING`) sem duplicar a
 * decisão do perfil (`dfe-validator.ts` já decidiu isso na validação — o motor de compliance só LÊ
 * o resultado, nunca recalcula a regra da NT MDF-e 2026.001 por conta própria).
 */
export type FiscalDocumentEvaluationContext = {
  id: string;
  documentType: 'NFE' | 'CTE' | 'MDFE';
  validationStatus: 'pending' | 'valid' | 'invalid' | 'warnings';
  authorizationStatus: 'unknown' | 'authorized' | 'cancelled' | 'denied';
  validationIssueCodes: string[];
  ciotNumbers: string[];
  hasValePedagio: boolean;
};

export type RuleEvaluatorContext = {
  operation: TransportOperationAggregate;
  ruleVersion: RegulatoryRuleVersion;
  referenceDate: string;
  /** Cálculo de piso mais recente da operação (PR-B1) — `undefined`/`null` tratados iguais (nenhum cálculo ainda). */
  floorCalculation?: FreightFloorCalculationContext | null;
  /** Última verificação RNTRC bem-sucedida do carrier vinculado (PR-C1) — `undefined`/`null` = nunca verificado. */
  carrierRntrcVerification?: CarrierRntrcVerificationContext | null;
  /**
   * Tipo de vínculo (`owned|leased|aggregated|rntrc_fleet`) entre o veículo de TRAÇÃO da operação e
   * o carrier (PR-C1, `transport_vehicle_links`). `undefined`/`null` = sem veículo de tração OU sem
   * vínculo — TR-RNTRC-002 distingue os dois casos olhando `operation.vehicles` diretamente.
   */
  carrierTractionVehicleLinkType?: string | null;
  /** Tentativa de CIOT mais recente da operação (PR-C2) — `undefined`/`null` = nunca solicitado. */
  ciotOperation?: CiotOperationEvaluationContext | null;
  /** Alocação de VPO da operação (PR-D1) — `undefined`/`null` = `avaliar-aplicabilidade` nunca rodou. */
  vpoAllocation?: VpoAllocationEvaluationContext | null;
  /** Documentos fiscais (NF-e/CT-e/MDF-e) vinculados à operação (PR-E1) — lista vazia/`undefined` = nenhum documento importado ou vinculado ainda. */
  fiscalDocuments?: FiscalDocumentEvaluationContext[];
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

const IRREGULAR_RNTRC_RESULT_STATUSES = new Set(['suspended', 'cancelled', 'expired', 'not_found']);

/**
 * Janela de frescor de uma verificação RNTRC (PR-C1, guia do programa — pendência P4). Acima disso
 * o dado é tratado como STALE (`RNTRC_VERIFICATION_STALE`), mesmo que o último resultado conhecido
 * tenha sido `active` — o mundo pode ter mudado desde então, e nem `open_data` nem `manual` provam
 * o contrário retroativamente.
 */
const RNTRC_VERIFICATION_FRESHNESS_DAYS = 90;

/** Dias entre `referenceDate` (YYYY-MM-DD) e um timestamp ISO qualquer — puro, sem `new Date()` do relógio real. */
function daysBetween(referenceDate: string, isoTimestamp: string): number {
  const refMs = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const otherMs = new Date(`${isoTimestamp.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.floor((refMs - otherMs) / 86400000);
}

function buildRntrc001PassMessage(verification: CarrierRntrcVerificationContext): string {
  if (verification.strategy === 'open_data') {
    return `RNTRC ativo conforme dados abertos da ANTT (dataDate=${verification.dataReferenceDate ?? 'desconhecida'}) — `
      + 'cache informativo, não é certidão de regularidade emitida pela ANTT.';
  }
  return 'RNTRC verificado manualmente como ativo (evidência declarada pelo operador).';
}

/**
 * TR-RNTRC-001 — RNTRC regular para a operação (GATE_CONTRACT). Evoluído no PR-C1: agora considera
 * a verificação mais recente do carrier (`ctx.carrierRntrcVerification`), não só o `rntrcStatus`
 * DECLARADO no cadastro (esse continua sendo o gate de "RNTRC preenchido" — `CARRIER_RNTRC_MISSING`
 * é sobre o CADASTRO, nunca sobre a verificação).
 *
 * `not_found` entra no MESMO bloco bruto de suspended/cancelled/expired: o dado aberto da ANTT só
 * lista registros ATIVO/PENDENTE (ver `antt-rntrc-gateway.ts`), então "não encontrado" é o único
 * sinal de irregularidade que `open_data` consegue produzir — e o clamp de enforcement
 * (`applyEnforcementClamp`) rebaixa qualquer `block` bruto para `warn` enquanto a regra não estiver
 * `ACTIVE`+`blocking=true` (que TR-RNTRC-001 já é, ver seed — logo aqui BLOQUEIA de verdade).
 */
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
  const declaredRntrcStatus = (carrier.partySnapshot.rntrcStatus as string | null | undefined) ?? 'unknown';
  const checkInputs = { ...inputs, rntrcNumber: rntrcNumber ?? null, declaredRntrcStatus };

  if (!rntrcNumber) {
    return outcome('block', 'RNTRC do transportador vinculado não está preenchido no cadastro.', {
      reasonCode: 'CARRIER_RNTRC_MISSING',
      inputs: checkInputs,
      result: { rntrcNumber: null }
    });
  }

  const verification = ctx.carrierRntrcVerification ?? null;

  if (!verification) {
    return outcome('warn', 'RNTRC preenchido, mas o transportador nunca teve uma verificação de regularidade concluída (nem dados abertos, nem manual).', {
      reasonCode: 'RNTRC_NOT_VERIFIED',
      inputs: checkInputs,
      result: { rntrcNumber, declaredRntrcStatus }
    });
  }

  const resultInputs = {
    ...checkInputs,
    verificationStrategy: verification.strategy,
    verificationResultStatus: verification.resultStatus,
    verificationDataReferenceDate: verification.dataReferenceDate,
    verificationCompletedAt: verification.completedAt
  };

  if (IRREGULAR_RNTRC_RESULT_STATUSES.has(verification.resultStatus)) {
    const label = verification.resultStatus === 'not_found'
      ? 'não encontrado no dado consultado'
      : `"${verification.resultStatus}"`;
    return outcome('block', `Última verificação RNTRC do transportador (${verification.strategy}): ${label} — situação irregular para operar.`, {
      reasonCode: 'CARRIER_RNTRC_IRREGULAR',
      inputs: resultInputs,
      result: { resultStatus: verification.resultStatus, strategy: verification.strategy }
    });
  }

  const ageDays = daysBetween(ctx.referenceDate, verification.completedAt);
  const isFresh = ageDays <= RNTRC_VERIFICATION_FRESHNESS_DAYS;

  if (verification.resultStatus === 'active' && isFresh) {
    return outcome('pass', buildRntrc001PassMessage(verification), {
      inputs: resultInputs,
      result: {
        rntrcNumber,
        strategy: verification.strategy,
        resultStatus: verification.resultStatus,
        dataReferenceDate: verification.dataReferenceDate,
        ageDays
      }
    });
  }

  if (verification.resultStatus === 'active') {
    // Fresco vs. stale é sobre QUANDO verificamos, não sobre o que a verificação encontrou.
    return outcome(
      'warn',
      `Última verificação RNTRC (${verification.strategy}) tem ${ageDays} dia(s) — acima da janela de frescor `
        + `de ${RNTRC_VERIFICATION_FRESHNESS_DAYS} dias. Reverifique antes de considerar a operação regular.`,
      {
        reasonCode: 'RNTRC_VERIFICATION_STALE',
        inputs: resultInputs,
        result: { ageDays, freshnessLimitDays: RNTRC_VERIFICATION_FRESHNESS_DAYS }
      }
    );
  }

  // `unknown` — ex.: `PENDENTE` no dado aberto da ANTT (nem regular nem irregular). Mesmo rótulo
  // de "nunca verificado": o operador não tem uma confirmação de regularidade em mãos.
  return outcome('warn', `Última verificação RNTRC (${verification.strategy}) não confirmou regularidade (resultado: ${verification.resultStatus}).`, {
    reasonCode: 'RNTRC_NOT_VERIFIED',
    inputs: resultInputs,
    result: { resultStatus: verification.resultStatus }
  });
}

// =================================================================================================
// TR-RNTRC-002 — veículo de tração vinculado ao carrier (GATE_PRE_BOARDING)
// =================================================================================================

/**
 * TR-RNTRC-002 (PR-C1, sai de `RULES_WITHOUT_EVALUATOR_YET`): o veículo de TRAÇÃO da operação
 * precisa ter um vínculo formal (`owned|leased|aggregated|rntrc_fleet`) com o carrier no cadastro-
 * base (`transport_vehicle_links`) — sem isso não há como afirmar que o veículo compõe a frota
 * RNTRC do transportador. `GATE_PRE_BOARDING` já pressupõe veículo definido (a operação não embarca
 * sem um); por isso a AUSÊNCIA de veículo de tração aqui é `block` bruto, não `not_applicable`.
 */
function evaluateRntrc002(ctx: RuleEvaluatorContext): RuleOutcome {
  const tractionVehicle = ctx.operation.vehicles.find((vehicle) => vehicle.position === 'traction') ?? null;
  const inputs = { hasTractionVehicle: Boolean(tractionVehicle) };

  if (!tractionVehicle) {
    return outcome('block', 'Nenhum veículo de tração vinculado à operação — obrigatório para o embarque.', {
      reasonCode: 'VEHICLE_MISSING',
      inputs,
      result: {}
    });
  }

  const linkType = ctx.carrierTractionVehicleLinkType ?? null;
  const checkInputs = { ...inputs, vehicleId: tractionVehicle.vehicleId, linkType };

  if (!linkType) {
    return outcome('warn', 'Veículo de tração da operação não tem vínculo formal com o transportador (carrier) no cadastro-base.', {
      reasonCode: 'VEHICLE_NOT_LINKED_TO_CARRIER',
      inputs: checkInputs,
      result: {}
    });
  }

  return outcome('pass', `Veículo de tração vinculado ao transportador (tipo de vínculo: "${linkType}").`, {
    inputs: checkInputs,
    result: { linkType }
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

/**
 * Quando o piso é compatível (oferta/contratação >= piso), decide entre `pass` "limpo" e `warn
 * FLOOR_TABLE_PENDING_REVIEW` — a tabela de coeficientes usada no cálculo mais recente ainda não
 * foi conferida contra o DOU (pendência P3 do guia): um `pass` nessas condições estaria afirmando
 * conformidade com um dado ainda não revisado por humano, então o motor rebaixa para `warn` e
 * registra o motivo em `humanMessage`/`result.floorVersionRef`.
 */
function evaluateFloorComplianceOutcome(
  ctx: RuleEvaluatorContext,
  inputs: Record<string, unknown>,
  result: Record<string, unknown>,
  passMessage: string
): RuleOutcome {
  const floorVersion = ctx.floorCalculation?.floorVersion ?? null;
  if (floorVersion && floorVersion.reviewStatus === 'pending_review') {
    return outcome(
      'warn',
      `${passMessage} Porém a tabela de coeficientes usada no cálculo (${floorVersion.normativeReference}, `
        + `Tabela ${floorVersion.tableCode}) ainda não foi revisada juridicamente contra o DOU — `
        + 'confirme antes de considerar a operação aprovada.',
      { reasonCode: 'FLOOR_TABLE_PENDING_REVIEW', inputs, result: { ...result, floorVersionRef: floorVersion } }
    );
  }

  return outcome('pass', passMessage, { inputs, result: { ...result, floorVersionRef: floorVersion } });
}

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
    return evaluateFloorComplianceOutcome(
      ctx,
      inputs,
      { freightFloorAmount, freightOfferedAmount },
      'Frete ofertado igual ou acima do piso vigente.'
    );
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
    return evaluateFloorComplianceOutcome(
      ctx,
      inputs,
      { freightFloorAmount, freightContractedAmount },
      'Frete contratado igual ou acima do piso vigente.'
    );
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

  const calculation = ctx.floorCalculation ?? null;
  const floorVersion = calculation?.floorVersion ?? null;

  // Fase B: sem cálculo ainda, ou cálculo que não resolveu nenhuma versão de tabela vigente
  // (`missing_coefficients` sem `floorVersion`) — mesmo reasonCode da Fase A, agora coberto pelo
  // caminho real do `FreightFloorEngine`, não mais "nasce sempre vazio" (pendência P3 do guia).
  if (!calculation || !floorVersion) {
    return outcome(
      'warn',
      'Piso aplicável, mas nenhum cálculo recente resolveu uma tabela de coeficientes vigente '
        + '(rode `calcular-piso`, ou verifique se há tabela carregada para a data de referência).',
      { reasonCode: 'FLOOR_VERSION_UNAVAILABLE', inputs, result: { floorVersion: null } }
    );
  }

  if (floorVersion.effectiveFrom > ctx.referenceDate) {
    return outcome(
      'warn',
      `A tabela usada no último cálculo (${floorVersion.normativeReference}) só entra em vigor em `
        + `${floorVersion.effectiveFrom} — posterior à data de referência ${ctx.referenceDate}.`,
      { reasonCode: 'FLOOR_VERSION_UNAVAILABLE', inputs, result: { floorVersionRef: floorVersion } }
    );
  }

  if (floorVersion.reviewStatus === 'pending_review') {
    return outcome(
      'warn',
      `O cálculo do piso usou a versão vigente da tabela (${floorVersion.normativeReference}, `
        + `Tabela ${floorVersion.tableCode}), mas ela ainda não foi revisada juridicamente contra o DOU.`,
      { reasonCode: 'FLOOR_TABLE_PENDING_REVIEW', inputs, result: { floorVersionRef: floorVersion } }
    );
  }

  return outcome(
    'pass',
    `Cálculo do piso usou a tabela vigente na data de referência (${floorVersion.normativeReference}, `
      + `Tabela ${floorVersion.tableCode}, revisada).`,
    { inputs, result: { floorVersionRef: floorVersion } }
  );
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
// TR-VPO-001 — determinar aplicabilidade do VPO (GATE_PRE_BOARDING). Evoluído no PR-D1: usa o
// `VpoApplicabilityEngine` (via `ctx.vpoAllocation`, persistida por `avaliarAplicabilidade`), não
// mais só `route.tollExpected` isolado — a exigência de ouro do programa é que ATÉ um
// NOT_APPLICABLE deixe justificativa evidenciada, e isso só existe depois de o engine rodar.
// =================================================================================================

/** Status de `vpo_allocations` que implicam "aplicabilidade decidida como APLICÁVEL" (inclui o ciclo de aquisição em curso/concluído). */
function isVpoConsideredApplicable(allocation: VpoAllocationEvaluationContext): boolean {
  return allocation.status === 'applicable'
    || allocation.status === 'acquisition_requested'
    || allocation.status === 'acquisition_unconfirmed'
    || allocation.status === 'acquired';
}

function evaluateVpo001(ctx: RuleEvaluatorContext): RuleOutcome {
  const allocation = ctx.vpoAllocation ?? null;

  if (!allocation) {
    return outcome('warn', 'Aplicabilidade do VPO ainda não foi avaliada para esta operação (rode avaliar-aplicabilidade).', {
      reasonCode: 'VPO_APPLICABILITY_NOT_EVALUATED',
      inputs: {}
    });
  }

  const inputs = { status: allocation.status, applicabilityReasonCode: allocation.applicabilityReasonCode };

  if (allocation.status === 'not_applicable') {
    return outcome(
      'pass',
      `VPO dispensado para esta operação — motivo evidenciado: ${allocation.applicabilityReasonCode ?? 'sem código'}.`,
      { inputs, result: { vpoRequired: false, reasonCode: allocation.applicabilityReasonCode } }
    );
  }

  if (isVpoConsideredApplicable(allocation)) {
    return outcome('pass', 'VPO aplicável para esta operação (Res. ANTT 6.024/2023).', {
      inputs,
      result: { vpoRequired: true, reasonCode: allocation.applicabilityReasonCode }
    });
  }

  // `pending` (engine devolveu `applicable: null` — exceção regulatória exige análise humana) ou
  // qualquer outro estado não mapeado acima (ex.: `cancelled`, reservado, sem rota nesta fase).
  return outcome(
    'warn',
    `Aplicabilidade do VPO indeterminada — exige análise humana (motivo: ${allocation.applicabilityReasonCode ?? 'não informado'}).`,
    { reasonCode: allocation.applicabilityReasonCode ?? 'VPO_APPLICABILITY_REVIEW_PENDING', inputs }
  );
}

// =================================================================================================
// TR-VPO-002 — VPO antecipado antes do embarque quando aplicável (GATE_PRE_BOARDING). NOVO
// evaluator do PR-D1 (sai de `RULES_WITHOUT_EVALUATOR_YET`).
// =================================================================================================

function evaluateVpo002(ctx: RuleEvaluatorContext): RuleOutcome {
  const allocation = ctx.vpoAllocation ?? null;

  if (!allocation) {
    return outcome('warn', 'Aplicabilidade do VPO ainda não foi avaliada para esta operação (rode avaliar-aplicabilidade).', {
      reasonCode: 'VPO_APPLICABILITY_NOT_EVALUATED',
      inputs: {}
    });
  }

  const inputs = { status: allocation.status, amount: allocation.amount };

  if (allocation.status === 'not_applicable') {
    return outcome(
      'not_applicable',
      `VPO dispensado para esta operação — motivo evidenciado: ${allocation.applicabilityReasonCode ?? 'sem código'}.`,
      { reasonCode: allocation.applicabilityReasonCode ?? undefined, inputs }
    );
  }

  if (allocation.status === 'acquired') {
    const hasEvidence = (allocation.amount ?? 0) > 0 && (Boolean(allocation.providerId) || allocation.evidenceSource === 'manual');
    if (hasEvidence) {
      return outcome('pass', `VPO antecipado antes do embarque (evidência: ${allocation.evidenceSource ?? 'desconhecida'}).`, {
        inputs,
        result: { amount: allocation.amount, evidenceSource: allocation.evidenceSource }
      });
    }
    // Defensivo: `acquired` sem valor/evidência coerente não deveria acontecer (constraints do
    // repositório garantem os dois juntos) — nunca afirma `pass` sobre um dado incompleto.
    return outcome('warn', 'VPO marcado como adquirido, mas sem valor/evidência completos — revise antes do embarque.', {
      reasonCode: 'VPO_ACQUISITION_DATA_INCOMPLETE',
      inputs
    });
  }

  if (isVpoConsideredApplicable(allocation)) {
    // `applicable` (ainda não adquirido) ou em trânsito (`acquisition_requested`/`acquisition_unconfirmed`).
    return outcome('block', 'VPO aplicável ainda NÃO foi antecipado ao transportador antes do embarque (Lei 10.209/2001).', {
      reasonCode: 'VPO_NOT_ACQUIRED',
      inputs
    });
  }

  // `pending` — aplicabilidade indeterminada; GATE_PRE_BOARDING não pode afirmar exigência nem
  // dispensa, mas também não bloqueia sobre uma incerteza que o motor já sinaliza em TR-VPO-001.
  return outcome(
    'warn',
    `Aplicabilidade do VPO ainda indeterminada — exige análise antes do embarque (motivo: ${allocation.applicabilityReasonCode ?? 'não informado'}).`,
    { reasonCode: allocation.applicabilityReasonCode ?? 'VPO_APPLICABILITY_REVIEW_PENDING', inputs }
  );
}

// =================================================================================================
// TR-VPO-003 — valor do VPO separado do frete (GATE_CONTRACT). Evoluído no PR-D1: além da separação
// ESTRUTURAL (campo decomposto), agora confere se o valor bate com o que a alocação registrou como
// efetivamente adquirido.
// =================================================================================================

function evaluateVpo003(ctx: RuleEvaluatorContext): RuleOutcome {
  const { vpoAmount, freightOfferedAmount, freightContractedAmount } = ctx.operation.operation;
  const allocation = ctx.vpoAllocation ?? null;
  const inputs = { vpoAmount, freightOfferedAmount, freightContractedAmount, allocationStatus: allocation?.status ?? null, allocationAmount: allocation?.amount ?? null };

  if (vpoAmount == null || vpoAmount <= 0) {
    return outcome('not_applicable', 'VPO não declarado para esta operação.', {
      reasonCode: 'VPO_NOT_DECLARED',
      inputs
    });
  }

  if (allocation?.status === 'acquired' && allocation.amount != null && allocation.amount === vpoAmount) {
    return outcome('pass', 'Valor do VPO na operação bate com o valor efetivamente adquirido (separação comprovada, nunca somado ao frete).', {
      inputs,
      result: { vpoAmount, allocationAmount: allocation.amount }
    });
  }

  if (allocation?.status === 'acquired') {
    return outcome(
      'warn',
      `Valor do VPO na operação (${vpoAmount}) diverge do valor registrado na aquisição (${allocation.amount ?? 'desconhecido'}).`,
      { reasonCode: 'VPO_AMOUNT_MISMATCH', inputs, result: { vpoAmount, allocationAmount: allocation.amount } }
    );
  }

  // `vpoAmount` preenchido, mas a alocação não confirma uma aquisição — mesma divergência
  // (o valor está no cabeçalho da operação sem lastro na aquisição rastreada).
  // `vpoAmount` preenchido, mas a alocação não confirma uma aquisição — mesma divergência (o valor
  // está no cabeçalho da operação sem lastro na aquisição rastreada). Checagem estrutural
  // preservada da Fase A: `vpoAmount` é um campo DECOMPOSTO, nunca somado a `freightOfferedAmount`/
  // `freightContractedAmount` no agregado (migration 024) — a garantia de que o valor não está
  // "embutido" é estrutural (schema); esta divergência é sobre RASTREABILIDADE, não sobre o schema.
  return outcome(
    'warn',
    `Valor do VPO declarado na operação (${vpoAmount}) sem aquisição confirmada na alocação (status: ${allocation?.status ?? 'nenhuma avaliação'}).`,
    { reasonCode: 'VPO_AMOUNT_MISMATCH', inputs }
  );
}

// =================================================================================================
// TR-CIOT-001/002/003 — ciclo do CIOT (PR-C2). `ctx.ciotOperation` é a tentativa MAIS RECENTE
// (`ciot_operations`), montada por `transport-compliance-service.ts` a partir de
// `ciot-repo.findLatestCiotOperationForOperation`. `undefined`/`null` = nenhum `solicitar` ainda.
// =================================================================================================

/** Frete declarado (ofertado OU contratado) > 0 — mesmo critério dos dois evaluators de obrigatoriedade/liberação. */
function isOperationRemunerated(operation: TransportOperationAggregate): boolean {
  const { freightOfferedAmount, freightContractedAmount } = operation.operation;
  return (freightOfferedAmount != null && freightOfferedAmount > 0) || (freightContractedAmount != null && freightContractedAmount > 0);
}

/** CIOT considerado "vigente" para fins de obrigatoriedade/liberação — `registered` ou `rectified` (retificação não invalida o registro). */
function isCiotConsideredRegistered(ciot: CiotOperationEvaluationContext | null | undefined): boolean {
  return ciot?.status === 'registered' || ciot?.status === 'rectified';
}

/**
 * TR-CIOT-001 — Obrigatoriedade do CIOT (GATE_CIOT). CIOT universal desde 24/05/2026 (Res. ANTT
 * 6.078/2026): toda operação REMUNERADA exige CIOT. Neste gate a ausência é `warn` (não `block`) —
 * quem de fato IMPEDE a liberação sem CIOT é TR-CIOT-002 (GATE_RELEASE); aqui o gate só sinaliza
 * cedo, antes de a operação avançar. `REGISTERED ≠ COMPLIANT` (FAQ ANTT, recusa registrada no
 * DL-103): o `pass` deixa isso explícito na mensagem — o motor nunca afirma "conforme" a partir só
 * do registro do CIOT.
 */
function evaluateCiot001(ctx: RuleEvaluatorContext): RuleOutcome {
  const remunerated = isOperationRemunerated(ctx.operation);
  const inputs = { remunerated };

  if (!remunerated) {
    return outcome('not_applicable', 'Operação sem frete remunerado declarado — CIOT não é obrigatório (Res. ANTT 6.078/2026 incide sobre transporte remunerado de cargas).', {
      reasonCode: 'CIOT_NOT_APPLICABLE_UNPAID',
      inputs
    });
  }

  const ciot = ctx.ciotOperation ?? null;
  const checkInputs = { ...inputs, ciotStatus: ciot?.status ?? null };

  if (isCiotConsideredRegistered(ciot)) {
    return outcome(
      'pass',
      `CIOT registrado (número ${ciot?.ciotNumber ?? 'desconhecido'}) — REGISTRADO não é o mesmo que `
        + 'CONFORME (FAQ ANTT): o registro não substitui as demais obrigações do ciclo.',
      { inputs: checkInputs, result: { ciotNumber: ciot?.ciotNumber ?? null, ciotStatus: ciot?.status ?? null } }
    );
  }

  return outcome('warn', 'Operação remunerada exige CIOT (Res. ANTT 6.078/2026) e ainda não tem um registrado.', {
    reasonCode: 'CIOT_NOT_REGISTERED',
    inputs: checkInputs
  });
}

/**
 * TR-CIOT-002 — CIOT antes do início da operação (GATE_RELEASE). Diferente de TR-CIOT-001: aqui a
 * ausência é `block` BRUTO — este é o gate que de fato impede `ready_for_release` sem CIOT vigente.
 * O clamp de enforcement (`applyEnforcementClamp`) rebaixa para `warn` enquanto a versão do seed
 * não estiver `ACTIVE`+`blocking=true` revisada — hoje `blocking=false` (regra de ouro da Fase A/B),
 * então o `block` bruto sobrevive só em `raw_status` (`RULE_NOT_ENFORCEABLE`).
 */
function evaluateCiot002(ctx: RuleEvaluatorContext): RuleOutcome {
  const remunerated = isOperationRemunerated(ctx.operation);
  const inputs = { remunerated };

  if (!remunerated) {
    return outcome('not_applicable', 'Operação sem frete remunerado declarado — CIOT não é pré-requisito de liberação.', {
      reasonCode: 'CIOT_NOT_APPLICABLE_UNPAID',
      inputs
    });
  }

  const ciot = ctx.ciotOperation ?? null;
  const checkInputs = { ...inputs, ciotStatus: ciot?.status ?? null };

  if (isCiotConsideredRegistered(ciot)) {
    return outcome('pass', 'CIOT registrado antes da liberação da operação.', {
      inputs: checkInputs,
      result: { ciotNumber: ciot?.ciotNumber ?? null, ciotStatus: ciot?.status ?? null }
    });
  }

  const label = ciot?.status === 'request_unconfirmed'
    ? 'a última solicitação ainda não teve resposta confirmada pelo provedor'
    : ciot?.status === 'rejected'
      ? 'a última solicitação foi rejeitada pelo provedor'
      : 'nenhuma solicitação de CIOT foi concluída';
  return outcome('block', `CIOT ausente para a liberação da operação — ${label} (Res. ANTT 6.078/2026, obrigatório ANTES do início).`, {
    reasonCode: 'CIOT_MISSING_FOR_RELEASE',
    inputs: checkInputs
  });
}

/**
 * TR-CIOT-003 — Responsável pelo CIOT conforme enquadramento (GATE_CIOT). Declarativo (Fase A/C
 * deste PR): a solicitação (`requestCiot`) grava `responsibleParty` no `request_payload_snapshot`
 * (default `contractor`; `subcontractor` quando a operação é uma subcontratação — "quem contratou o
 * TAC" no enquadramento da Lei 15.485/2026). O evaluator só confere que o campo foi DECLARADO e é
 * coerente com um papel vinculado à operação — a checagem estrutural de vínculo já acontece em
 * `transport-ciot-service.ts#resolveResponsibleParty` no momento da solicitação.
 */
function evaluateCiot003(ctx: RuleEvaluatorContext): RuleOutcome {
  const ciot = ctx.ciotOperation ?? null;

  if (!ciot) {
    return outcome('warn', 'Operação ainda não solicitou CIOT — responsável pela declaração ainda não foi definido.', {
      reasonCode: 'CIOT_RESPONSIBLE_UNDECLARED',
      inputs: {}
    });
  }

  const responsibleParty = ciot.requestPayloadSnapshot?.responsibleParty;
  const inputs = { responsibleParty: typeof responsibleParty === 'string' ? responsibleParty : null };

  if (typeof responsibleParty === 'string' && responsibleParty.trim().length > 0) {
    return outcome('pass', `Responsável pela declaração do CIOT informado na solicitação (papel "${responsibleParty}").`, {
      inputs,
      result: { responsibleParty }
    });
  }

  return outcome('warn', 'Responsável pela declaração do CIOT (enquadramento — contratante ou quem contratou o TAC em subcontratação) não foi declarado na solicitação.', {
    reasonCode: 'CIOT_RESPONSIBLE_UNDECLARED',
    inputs
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
// TR-NFE-001/TR-CTE-001/TR-MDFE-001/TR-MDFE-002 — documentos fiscais (PR-E1, GATE_FISCAL).
// `ctx.fiscalDocuments` é montado por `transport-compliance-service.ts` a partir de
// `transport-fiscal-repo.ts#listFiscalDocumentsForOperation` — nenhum evaluator aqui lê banco/XML.
// =================================================================================================

/**
 * Quando mais de um documento do MESMO tipo está vinculado (ex.: reimportação após cancelamento),
 * prioriza um que já é "bom" (autorizado + válido/warnings) — senão, o MAIS RECENTE da lista (a
 * ordem que `listFiscalDocumentsForOperation` devolve, `created_at asc`). Nunca "o pior", nunca
 * "o primeiro" cegamente: um documento cancelado antigo não deveria mascarar um substituto válido.
 */
function findMostRelevantFiscalDocument(
  fiscalDocuments: FiscalDocumentEvaluationContext[],
  documentType: FiscalDocumentEvaluationContext['documentType']
): FiscalDocumentEvaluationContext | null {
  const matches = fiscalDocuments.filter((document) => document.documentType === documentType);
  if (matches.length === 0) return null;
  const good = matches.find(
    (document) => document.authorizationStatus === 'authorized'
      && (document.validationStatus === 'valid' || document.validationStatus === 'warnings')
  );
  return good ?? matches[matches.length - 1] ?? null;
}

/**
 * Molde comum de TR-NFE-001/TR-CTE-001/TR-MDFE-001: documento do tipo presente + autorizado +
 * validation_status `valid`/`warnings` → pass/warn; `invalid`/`cancelled`/`denied` → block bruto;
 * ausente → o desfecho de `opts.missingSeverity` (NF-e/CT-e podem legitimamente faltar conforme o
 * arranjo — `warn`; MDF-e ausente é `block` bruto, obrigatório para o transporte).
 */
function evaluateFiscalDocumentPresenceRule(
  ctx: RuleEvaluatorContext,
  documentType: FiscalDocumentEvaluationContext['documentType'],
  opts: { missingReasonCode: string; missingSeverity: 'warn' | 'block'; missingMessage: string }
): RuleOutcome {
  const fiscalDocuments = ctx.fiscalDocuments ?? [];
  const document = findMostRelevantFiscalDocument(fiscalDocuments, documentType);
  const inputs = {
    documentType,
    documentsOfTypeCount: fiscalDocuments.filter((entry) => entry.documentType === documentType).length
  };

  if (!document) {
    return outcome(opts.missingSeverity, opts.missingMessage, { reasonCode: opts.missingReasonCode, inputs });
  }

  const checkInputs = {
    ...inputs,
    validationStatus: document.validationStatus,
    authorizationStatus: document.authorizationStatus
  };

  if (document.authorizationStatus === 'cancelled') {
    return outcome('block', `${documentType} vinculado está CANCELADO na SEFAZ (protocolo de cancelamento presente no XML).`, {
      reasonCode: `DFE_${documentType}_CANCELLED`,
      inputs: checkInputs
    });
  }

  if (document.authorizationStatus === 'denied') {
    return outcome('block', `${documentType} vinculado teve autorização DENEGADA na SEFAZ.`, {
      reasonCode: `DFE_${documentType}_DENIED`,
      inputs: checkInputs
    });
  }

  if (document.validationStatus === 'invalid') {
    return outcome('block', `${documentType} vinculado com validação local INVÁLIDA — ver validationIssues do documento (GET .../documentos-fiscais/${document.id}).`, {
      reasonCode: `DFE_${documentType}_INVALID`,
      inputs: checkInputs
    });
  }

  if (document.validationStatus === 'warnings') {
    return outcome('warn', `${documentType} vinculado com validação local em AVISO — ver validationIssues do documento (GET .../documentos-fiscais/${document.id}).`, {
      reasonCode: `DFE_${documentType}_WARNINGS`,
      inputs: checkInputs
    });
  }

  // `validationStatus === 'valid'` implica `authorizationStatus === 'authorized'`: `DFE_NOT_AUTHORIZED`
  // (dfe-validator.ts) é ele mesmo um warning que empurraria o status para `warnings`, nunca `valid`.
  return outcome('pass', `${documentType} vinculado autorizado e validado sem pendências.`, {
    inputs: checkInputs,
    result: { documentId: document.id }
  });
}

function evaluateNfe001(ctx: RuleEvaluatorContext): RuleOutcome {
  return evaluateFiscalDocumentPresenceRule(ctx, 'NFE', {
    missingReasonCode: 'DFE_MISSING_NFE',
    missingSeverity: 'warn',
    missingMessage: 'Nenhuma NF-e vinculada à operação — pode ser legítimo conforme o arranjo (nem toda '
      + 'operação de transporte tem NF-e própria vinculada).'
  });
}

function evaluateCte001(ctx: RuleEvaluatorContext): RuleOutcome {
  return evaluateFiscalDocumentPresenceRule(ctx, 'CTE', {
    missingReasonCode: 'DFE_MISSING_CTE',
    missingSeverity: 'warn',
    missingMessage: 'Nenhum CT-e vinculado à operação — pode ser legítimo conforme o arranjo.'
  });
}

/** MDF-e é o ÚNICO dos três com ausência em `block` bruto — obrigatório para o transporte (ao contrário de NF-e/CT-e, que podem legitimamente faltar). */
function evaluateMdfe001(ctx: RuleEvaluatorContext): RuleOutcome {
  return evaluateFiscalDocumentPresenceRule(ctx, 'MDFE', {
    missingReasonCode: 'MDFE_MISSING',
    missingSeverity: 'block',
    missingMessage: 'Nenhum MDF-e vinculado à operação — documento obrigatório para o transporte rodoviário de cargas.'
  });
}

/**
 * TR-MDFE-002 — CIOT presente no MDF-e quando obrigatório (a antecipação em TESTE da NT MDF-e
 * 2026.001). NÃO recalcula "o perfil exige CIOT" aqui — LÊ `MDFE_CIOT_MISMATCH`/`MDFE_CIOT_MISSING`
 * de `document.validationIssueCodes`, já decididos por `dfe-validator.ts` na importação/revalidação
 * (única fonte de verdade do perfil do schema registry).
 */
function evaluateMdfe002(ctx: RuleEvaluatorContext): RuleOutcome {
  const fiscalDocuments = ctx.fiscalDocuments ?? [];
  const mdfe = findMostRelevantFiscalDocument(fiscalDocuments, 'MDFE');

  if (!mdfe) {
    return outcome('not_applicable', 'Sem MDF-e vinculado à operação — a ausência em si é tratada por TR-MDFE-001.', {
      reasonCode: 'MDFE_NOT_PRESENT',
      inputs: {}
    });
  }

  const inputs = { ciotNumbers: mdfe.ciotNumbers, validationIssueCodes: mdfe.validationIssueCodes };

  if (mdfe.validationIssueCodes.includes('MDFE_CIOT_MISSING')) {
    return outcome(
      'block',
      'MDF-e vinculado está sem CIOT (infCIOT) — obrigatório sob o perfil vigente do schema registry '
        + '(antecipação em TESTE da NT MDF-e 2026.001, transporte remunerado por terceiros).',
      { reasonCode: 'MDFE_CIOT_MISSING', inputs }
    );
  }

  if (mdfe.validationIssueCodes.includes('MDFE_CIOT_MISMATCH')) {
    return outcome('block', 'CIOT registrado na operação não aparece no infCIOT do MDF-e vinculado (divergência detectada na importação/vínculo).', {
      reasonCode: 'MDFE_CIOT_MISMATCH',
      inputs
    });
  }

  if (mdfe.ciotNumbers.length > 0) {
    return outcome('pass', 'MDF-e vinculado traz CIOT (infCIOT) coerente com a operação.', {
      inputs,
      result: { ciotNumbers: mdfe.ciotNumbers }
    });
  }

  return outcome(
    'pass',
    'MDF-e vinculado sem CIOT no infCIOT, mas o perfil vigente do schema registry não exige (fora da '
      + 'janela da NT MDF-e 2026.001, ou operação não caracterizada como remunerada por terceiros).',
    { inputs }
  );
}

// =================================================================================================
// TR-CIOT-005 — CIOT vinculado ao MDF-e quando aplicável (PR-E1, GATE_FISCAL). Sai de
// `RULES_WITHOUT_EVALUATOR_YET` — dependia do vínculo CIOT↔MDF-e, que só existe a partir desta fase.
// =================================================================================================

function evaluateCiot005(ctx: RuleEvaluatorContext): RuleOutcome {
  const ciotOperation = ctx.ciotOperation ?? null;

  if (!isCiotConsideredRegistered(ciotOperation)) {
    return outcome('not_applicable', 'CIOT ainda não registrado — o vínculo CIOT↔MDF-e não se aplica ainda.', {
      reasonCode: 'CIOT_NOT_REGISTERED',
      inputs: { ciotStatus: ciotOperation?.status ?? null }
    });
  }

  const fiscalDocuments = ctx.fiscalDocuments ?? [];
  const mdfe = findMostRelevantFiscalDocument(fiscalDocuments, 'MDFE');
  const ciotNumber = ciotOperation?.ciotNumber ?? null;
  const inputs = { ciotNumber, mdfePresent: Boolean(mdfe) };

  if (!mdfe) {
    return outcome('warn', 'CIOT registrado, mas ainda não há MDF-e vinculado à operação para conferir o vínculo.', {
      reasonCode: 'CIOT_MDFE_LINK_PENDING',
      inputs
    });
  }

  if (ciotNumber && mdfe.ciotNumbers.includes(ciotNumber)) {
    return outcome('pass', `CIOT registrado (${ciotNumber}) presente no infCIOT do MDF-e vinculado.`, {
      inputs,
      result: { ciotNumber }
    });
  }

  return outcome('warn', 'CIOT registrado, mas o MDF-e vinculado ainda não confirma o vínculo (ver validationIssues do documento).', {
    reasonCode: 'CIOT_MDFE_LINK_PENDING',
    inputs
  });
}

// =================================================================================================
// TR-VPO-004 — referência do VPO no MDF-e quando exigida (PR-E1, GATE_FISCAL). Sai de
// `RULES_WITHOUT_EVALUATOR_YET` — dependia do vínculo VPO↔MDF-e, que só existe a partir desta fase.
// =================================================================================================

function evaluateVpo004(ctx: RuleEvaluatorContext): RuleOutcome {
  const allocation = ctx.vpoAllocation ?? null;

  if (!allocation) {
    return outcome('warn', 'Aplicabilidade do VPO ainda não foi avaliada para esta operação (rode avaliar-aplicabilidade).', {
      reasonCode: 'VPO_APPLICABILITY_NOT_EVALUATED',
      inputs: {}
    });
  }

  if (allocation.status === 'not_applicable') {
    return outcome(
      'not_applicable',
      `VPO dispensado para esta operação — motivo evidenciado: ${allocation.applicabilityReasonCode ?? 'sem código'}.`,
      { reasonCode: allocation.applicabilityReasonCode ?? undefined, inputs: { status: allocation.status } }
    );
  }

  if (allocation.status !== 'acquired') {
    return outcome('warn', 'VPO ainda não foi adquirido — a referência no MDF-e não pode ser conferida ainda (ver TR-VPO-002).', {
      reasonCode: 'VPO_NOT_ACQUIRED',
      inputs: { status: allocation.status }
    });
  }

  const fiscalDocuments = ctx.fiscalDocuments ?? [];
  const mdfe = findMostRelevantFiscalDocument(fiscalDocuments, 'MDFE');
  const inputs = { status: allocation.status, mdfeReference: allocation.mdfeReference, mdfeHasValePedagio: mdfe?.hasValePedagio ?? false };

  if (mdfe && mdfe.hasValePedagio && allocation.mdfeReference) {
    return outcome('pass', 'VPO adquirido e referenciado no MDF-e vinculado (infANTT/valePed/disp presente).', {
      inputs,
      result: { mdfeReference: allocation.mdfeReference }
    });
  }

  return outcome('warn', 'VPO adquirido, mas o MDF-e vinculado ainda não traz referência de vale-pedágio (infANTT/valePed/disp ausente ou vínculo pendente).', {
    reasonCode: 'VPO_MDFE_REFERENCE_MISSING',
    inputs
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
  'TR-RNTRC-002': evaluateRntrc002,
  'TR-PMF-001': evaluatePmf001,
  'TR-PMF-002': evaluatePmf002,
  'TR-PMF-003': evaluatePmf003,
  'TR-PMF-004': evaluatePmf004,
  'TR-PAY-001': evaluatePay001,
  'TR-VPO-001': evaluateVpo001,
  'TR-VPO-002': evaluateVpo002,
  'TR-VPO-003': evaluateVpo003,
  'TR-CIOT-001': evaluateCiot001,
  'TR-CIOT-002': evaluateCiot002,
  'TR-CIOT-003': evaluateCiot003,
  'TR-CIOT-004': evaluateCiot004,
  'TR-CIOT-005': evaluateCiot005,
  'TR-NFE-001': evaluateNfe001,
  'TR-CTE-001': evaluateCte001,
  'TR-MDFE-001': evaluateMdfe001,
  'TR-MDFE-002': evaluateMdfe002,
  'TR-VPO-004': evaluateVpo004,
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
 *
 * TR-RNTRC-002 SAIU deste mapa no PR-C1 (evaluator declarativo, `evaluateRntrc002` acima).
 * TR-RNTRC-003 CONTINUA aqui — regra de revalidação anual da Lei 15.485/2026, ainda sem
 * regulamentação ANTT complementar (pendência P2 do guia; a versão do seed já nasce
 * `implementationState: 'AWAITING_REGULATION'`). Sem uma norma que diga COMO a revalidação anual
 * deve ser checada, não há o que um evaluator avaliaria — permanece `EVALUATOR_NOT_IMPLEMENTED`
 * até a regulamentação existir, mesmo a versão da regra já estando vigente por data.
 * TR-CIOT-001/002/003 SAÍRAM deste mapa no PR-C2 (evaluators declarativos com o ciclo completo do
 * CIOT, `evaluateCiot001/002/003` acima). TR-CIOT-005 SAIU no PR-E1 (`evaluateCiot005` acima) — o
 * vínculo CIOT↔MDF-e que faltava agora existe via `ctx.fiscalDocuments`.
 * TR-VPO-002 SAIU deste mapa no PR-D1 (evaluator declarativo entregue, `evaluateVpo002` acima —
 * ciclo de aquisição via `VpoApplicabilityEngine` + `vpo_allocations`). TR-VPO-004 SAIU no PR-E1
 * (`evaluateVpo004` acima) — mesmo racional de TR-CIOT-005, vínculo VPO↔MDF-e via
 * `vpo_allocations.mdfe_reference` (aplicado por `transport-fiscal-service.ts`).
 * TR-NFE-001/TR-CTE-001/TR-MDFE-001/TR-MDFE-002 SAÍRAM deste mapa no PR-E1 (importação/validação de
 * DF-e, `ctx.fiscalDocuments` montado por `transport-compliance-service.ts` a partir de
 * `transport-fiscal-repo.ts#listFiscalDocumentsForOperation`).
 *
 * Único código que CONTINUA aqui: TR-RNTRC-003 — regra de revalidação anual da Lei 15.485/2026,
 * ainda sem regulamentação ANTT complementar (pendência P2 do guia; a versão do seed já nasce
 * `implementationState: 'AWAITING_REGULATION'`). Sem uma norma que diga COMO a revalidação anual
 * deve ser checada, não há o que um evaluator avaliaria.
 */
export const RULES_WITHOUT_EVALUATOR_YET: Partial<Record<RuleCode, { targetPhase: string }>> = {
  'TR-RNTRC-003': { targetPhase: 'C' },
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
