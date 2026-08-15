/**
 * `VpoApplicabilityEngine` (PR-D1, DL-103) — decide se o Vale-Pedágio Obrigatório (VPO) é devido
 * numa operação de transporte (Lei 10.209/2001 + Res. ANTT 6.024/2023).
 *
 * Módulo PURO — nenhuma chamada a banco/HTTP/gateway/relógio, mesmo molde de `rule-evaluators.ts`:
 * recebe o agregado `TransportOperationAggregate` já carregado e devolve um veredito determinístico.
 * `transport-vpo-service.ts` é quem chama este engine, persiste o resultado em `vpo_allocations`
 * (`avaliarAplicabilidade`) e grava o evento `applicability_evaluated`.
 *
 * ── VPO NÃO é checkbox universal ───────────────────────────────────────────────────────────────
 * Ao contrário do CIOT (obrigatório para toda operação remunerada, `TR-CIOT-001`), o VPO só é
 * devido quando a rota tem pedágio esperado E a operação é uma lotação — carga fracionada e
 * operações com múltiplos embarcadores caem em exceções regulatórias que a Res. 6.024/2023 não
 * resolve com um simples if/else; a Res. ANTT prevê hipóteses de dispensa e casos que dependem de
 * análise humana. Por isso o resultado pode ser `applicable: null` ("não determinável
 * automaticamente, precisa de revisão"), nunca só `true`/`false`.
 *
 * ── Toda saída carrega a base legal ────────────────────────────────────────────────────────────
 * Cada `VpoApplicabilityResult` inclui `legalBasis` — inclusive quando `applicable: null` (a
 * exigência do guia do programa é que ATÉ um `NOT_APPLICABLE`/indeterminado carregue justificativa
 * rastreável, nunca "o sistema decidiu e não disse por quê").
 *
 * ── Limitação documentada (não implementada nesta fase) ────────────────────────────────────────
 * A Res. 6.024/2023 também prevê dispensa para VIAGEM DE RETORNO COM VEÍCULO VAZIO — o schema desta
 * fase (`transport_operation_cargo`/`transport_operations`) não modela "veículo vazio" nem
 * "trecho de retorno" como fatos de primeira classe. Esta regra fica documentada aqui como
 * LIMITAÇÃO CONHECIDA: o engine nunca AFIRMA "veículo vazio" (não tem como saber), então operações
 * desse tipo caem nas regras gerais acima (tipicamente `VPO_TOLL_EXPECTATION_UNKNOWN` ou
 * `VPO_FRACTIONAL_CARGO_REVIEW`) até um campo dedicado existir.
 */

import type { CargoRegime, TransportOperationAggregate } from './transport-operation-types.js';

export type VpoApplicabilityReasonCode =
  | 'VPO_NO_TOLL_ON_ROUTE'
  | 'VPO_REQUIRED_TOLL_ROUTE'
  | 'VPO_FRACTIONAL_CARGO_REVIEW'
  | 'VPO_TOLL_EXPECTATION_UNKNOWN'
  | 'VPO_CARGO_REGIME_UNKNOWN'
  | 'VPO_APPLICABILITY_INDETERMINATE';

export type VpoApplicabilityInputs = {
  tollExpected: boolean | null;
  cargoRegime: CargoRegime;
  shipperCount: number;
};

export type VpoApplicabilityResult = {
  /** `true` = VPO devido; `false` = VPO dispensado; `null` = não determinável automaticamente (exige análise humana). */
  applicable: boolean | null;
  reasonCode: VpoApplicabilityReasonCode;
  humanMessage: string;
  inputs: VpoApplicabilityInputs;
  /** Base legal do veredito — presente em TODO resultado, inclusive `applicable: null`. */
  legalBasis: { reference: string }[];
};

/** Mesma referência de `LEGAL_VPO` em `bootstrap/regulatory-rules-seed.ts` — duplicada de propósito (engine não depende do seed). */
const VPO_LEGAL_BASIS: { reference: string }[] = [
  { reference: 'Lei 10.209/2001' },
  { reference: 'Res. ANTT 6.024/2023' }
];

function countShippers(operation: TransportOperationAggregate): number {
  return operation.parties.filter((party) => party.role === 'shipper').length;
}

function buildResult(
  applicable: boolean | null,
  reasonCode: VpoApplicabilityReasonCode,
  humanMessage: string,
  inputs: VpoApplicabilityInputs
): VpoApplicabilityResult {
  return { applicable, reasonCode, humanMessage, inputs, legalBasis: VPO_LEGAL_BASIS };
}

export type DetermineVpoApplicabilityInput = {
  operation: TransportOperationAggregate;
};

/**
 * Regras declarativas da Res. ANTT 6.024/2023, implementáveis com dados já disponíveis no agregado
 * local (sem chamada externa) — avaliadas em ORDEM DE PRECEDÊNCIA (a primeira que casar decide):
 *
 * 1. `route.tollExpected === false` → `not_applicable` (`VPO_NO_TOLL_ON_ROUTE`) — sem pedágio
 *    esperado na rota, o VPO não incide, INDEPENDENTE do regime de carga (sinal mais forte).
 * 2. Carga fracionada OU múltiplos embarcadores (>1 parte com papel `shipper`) → `applicable: null`
 *    (`VPO_FRACTIONAL_CARGO_REVIEW`) — as exceções regulatórias para esses cenários exigem análise
 *    humana; verificado ANTES da regra 3 de propósito: uma operação `lotacao` com múltiplos
 *    embarcadores (carga consolidada) AINDA é o cenário de exceção, mesmo que a rota tenha pedágio
 *    esperado — o engine nunca decide sozinho aqui.
 * 3. `route.tollExpected === true` E `cargoRegime === 'lotacao'` (com UM só embarcador) →
 *    `applicable` (`VPO_REQUIRED_TOLL_ROUTE`) — o caso típico de incidência da Res. 6.024/2023.
 * 4. `route.tollExpected === null` (rota sem expectativa de pedágio declarada, ou operação sem
 *    rota) → `applicable: null` (`VPO_TOLL_EXPECTATION_UNKNOWN`).
 * 5. `cargoRegime === 'unknown'` (chegou até aqui só quando `tollExpected === true`, um só
 *    embarcador, e o regime nem é lotação nem fracionada) → `applicable: null`
 *    (`VPO_CARGO_REGIME_UNKNOWN`), mesmo padrão de `evaluatePmf001` (`rule-evaluators.ts`) para
 *    regime não declarado.
 * 6. Fallback teórico (não deveria ser alcançável com `CARGO_REGIMES` atual) → `applicable: null`
 *    (`VPO_APPLICABILITY_INDETERMINATE`) — nunca lança, sempre devolve um veredito explicável.
 */
export function determineVpoApplicability(input: DetermineVpoApplicabilityInput): VpoApplicabilityResult {
  const { operation } = input;
  const tollExpected = operation.route?.tollExpected ?? null;
  const cargoRegime = operation.operation.cargoRegime;
  const shipperCount = countShippers(operation);
  const inputs: VpoApplicabilityInputs = { tollExpected, cargoRegime, shipperCount };

  if (tollExpected === false) {
    return buildResult(
      false,
      'VPO_NO_TOLL_ON_ROUTE',
      'Rota sem pedágio esperado — VPO dispensado (Res. ANTT 6.024/2023 incide sobre trechos com pedágio).',
      inputs
    );
  }

  // Verificado ANTES do par "toll+lotação → applicable" de propósito: uma operação `lotacao` com
  // múltiplos embarcadores (carga consolidada) ainda é o cenário de exceção que exige análise — a
  // regra de "múltiplos embarcadores"/fracionada tem PRECEDÊNCIA sobre a determinação padrão, não é
  // um caso alternativo dela.
  if (cargoRegime === 'fracionada' || shipperCount > 1) {
    return buildResult(
      null,
      'VPO_FRACTIONAL_CARGO_REVIEW',
      'Carga fracionada ou múltiplos embarcadores vinculados — as exceções regulatórias da '
        + 'Res. ANTT 6.024/2023 para esse cenário exigem análise humana; o motor não decide sozinho.',
      inputs
    );
  }

  if (tollExpected === true && cargoRegime === 'lotacao') {
    return buildResult(
      true,
      'VPO_REQUIRED_TOLL_ROUTE',
      'Rota com pedágio esperado e operação em regime de lotação — VPO devido (Res. ANTT 6.024/2023).',
      inputs
    );
  }

  if (tollExpected === null) {
    return buildResult(
      null,
      'VPO_TOLL_EXPECTATION_UNKNOWN',
      'Expectativa de pedágio da rota não informada (ou operação sem rota vinculada) — '
        + 'aplicabilidade do VPO indeterminada.',
      inputs
    );
  }

  if (cargoRegime === 'unknown') {
    return buildResult(
      null,
      'VPO_CARGO_REGIME_UNKNOWN',
      'Regime de carga não declarado ("unknown") — aplicabilidade do VPO não pôde ser determinada.',
      inputs
    );
  }

  return buildResult(
    null,
    'VPO_APPLICABILITY_INDETERMINATE',
    'Combinação de dados da operação não corresponde a nenhuma hipótese conhecida do motor — '
      + 'requer análise humana.',
    inputs
  );
}
