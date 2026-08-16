/**
 * `InsurancePremiumEngine` — motor de cálculo do prêmio de averbação (PR-I2 do Módulo
 * Transportadora, REQ-SICAT-0028 rev.2 + REQ-SICAT-0034).
 *
 * Módulo PURO — nenhuma chamada a banco/HTTP/relógio, mesmo racional de
 * `freight-floor-engine.ts` (o molde deste arquivo): tudo entra por parâmetro, tudo sai por
 * retorno. Quem resolve as taxas cadastradas (`transport-insurance-repo.ts`) e persiste a
 * averbação (PR-I3, `averbarOperacaoService`) fica FORA daqui — este arquivo só sabe multiplicar,
 * arredondar e escolher a taxa vigente.
 *
 * ARITMÉTICA EM CENTAVOS INTEIROS: dinheiro nunca trafega como float de reais dentro do cálculo —
 * `cargoAmountCents` entra inteiro e o prêmio sai inteiro, com UM único arredondamento HALF-UP no
 * fim. Caso de ouro do circuito real (doc Irmãos PADILHA, REQ-SICAT-0034):
 *
 *   carga R$ 25.000,00 (2_500_000 centavos):
 *     × 0,025% (RC-DC)          → R$ 6,25  (625 centavos)
 *     × 0,072% (RCTR-C)         → R$ 18,00 (1_800 centavos)
 *     × 0,097% (taxa somada)    → R$ 24,25 (2_425 centavos)
 */

// =================================================================================================
// Arredondamento — HALF-UP em centavos INTEIROS, robusto a erro de representação de ponto flutuante
// =================================================================================================

/**
 * Arredonda um valor em centavos (possivelmente fracionário após a multiplicação pela taxa) para o
 * centavo inteiro mais próximo, HALF-UP (0,5 centavo sobe — nunca "banker's rounding"). Mesmo
 * racional de `freight-floor-engine.ts#roundHalfUp2`: `Math.round` sozinho falha perto de `.5`
 * quando o produto float ficou um epsilon ABAIXO do valor exato (ex.: `12.499999999...` que
 * deveria ser `12.5`) — o epsilon somado ANTES do `Math.round` empurra exatamente esses casos de
 * fronteira para o lado certo sem afetar nenhum outro valor.
 */
export function roundHalfUpCents(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) + 1e-9);
}

// =================================================================================================
// Prêmio de UMA declaração — centavos × taxa percentual
// =================================================================================================

export type ComputeDeclarationPremiumInput = {
  /** Valor declarado da carga em CENTAVOS inteiros (R$ 25.000,00 → 2_500_000). */
  cargoAmountCents: number;
  /** Taxa PERCENTUAL literal, como gravada em `insurance_rate_schedules.rate_percent` (0,072% → 0.072). */
  ratePercent: number;
};

/**
 * `premium = cargoAmountCents × ratePercent / 100`, arredondado a centavo inteiro HALF-UP.
 * A divisão por 100 converte o PERCENTUAL literal em fração — deliberadamente aqui (uma vez, no
 * motor) e nunca no cadastro: gravar a fração no banco já causou bug clássico de "taxa 100× menor"
 * em sistemas de averbação; o contrato é inequívoco: 0,072% grava `0.072` e o motor divide.
 *
 * Lança em entrada inválida (nunca devolve NaN silencioso): `cargoAmountCents` precisa ser inteiro
 * >= 0; `ratePercent` precisa ser finito > 0 (o CHECK `chk_insrate_rate_percent` já impede taxa
 * zero no banco — aqui é a mesma regra, defendida no motor para chamadas com dado fora do banco).
 */
export function computeDeclarationPremiumCents(input: ComputeDeclarationPremiumInput): number {
  const { cargoAmountCents, ratePercent } = input;

  if (!Number.isInteger(cargoAmountCents) || cargoAmountCents < 0) {
    throw new Error(
      `computeDeclarationPremiumCents: cargoAmountCents deve ser um inteiro >= 0 (recebido ${String(cargoAmountCents)}).`
    );
  }
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) {
    throw new Error(
      `computeDeclarationPremiumCents: ratePercent deve ser finito e > 0 (recebido ${String(ratePercent)}).`
    );
  }

  return roundHalfUpCents((cargoAmountCents * ratePercent) / 100);
}

// =================================================================================================
// Seleção da taxa aplicável — vigência cobre a data; percurso exato vence o default
// =================================================================================================

/**
 * Recorte de `insurance_rate_schedules` que a seleção precisa — o repo mapeia a linha completa,
 * mas o motor só conhece vigência, escopo e status (nada de evidence/correlation).
 */
export type RateScheduleForSelection = {
  ratePercent: number;
  /** `null` = taxa default da apólice; string = percurso específico (RCV, ex. 'SP-PR'). */
  routeScope: string | null;
  monthlyMinimumAmount: number;
  validFrom: string;
  validUntil: string | null;
  status: 'active' | 'superseded' | 'cancelled';
};

export type SelectApplicableRateInput = {
  /** Data de referência 'YYYY-MM-DD' (a data da OPERAÇÃO/averbação, nunca "hoje" implícito). */
  referenceDate: string;
  /** Percurso da operação (ex. 'SP-PR') — `null`/ausente cai direto na taxa default. */
  routeScope?: string | null;
};

/**
 * Escolhe a taxa aplicável dentre as cadastradas de uma apólice. Regras, nesta ordem:
 *
 *   1. Só concorre taxa cuja VIGÊNCIA cobre `referenceDate` (`validFrom <= data` e `validUntil`
 *      nulo ou `>= data`). `cancelled` nunca concorre; `superseded` CONCORRE — é o histórico que
 *      reproduz prêmios de datas passadas (a taxa nova que a supersedeu só vence pela regra 3,
 *      quando a data já está dentro da vigência dela).
 *   2. Match EXATO de `routeScope` vence o default (`routeScope: null`) — o RCV por percurso do
 *      circuito real: a taxa 'SP-PR' vale para operações SP-PR; qualquer outro percurso (ou
 *      operação sem percurso) cai na default da apólice.
 *   3. Empate (mesma classe de escopo, mais de uma vigência cobrindo a data) resolve pela
 *      `validFrom` MAIS RECENTE — é o que faz o versionamento por vigência funcionar sem cirurgia
 *      de datas na taxa anterior.
 *
 * Devolve `null` quando nenhuma taxa é aplicável (o chamador decide o que isso significa — na
 * averbação do PR-I3, recusa com erro explícito; nunca um default silencioso).
 */
export function selectApplicableRate(
  schedules: readonly RateScheduleForSelection[],
  input: SelectApplicableRateInput
): RateScheduleForSelection | null {
  const { referenceDate } = input;
  const routeScope = input.routeScope ?? null;

  const covering = schedules.filter((schedule) => {
    if (schedule.status === 'cancelled') return false;
    if (schedule.validFrom > referenceDate) return false;
    if (schedule.validUntil != null && schedule.validUntil < referenceDate) return false;
    return true;
  });
  if (covering.length === 0) return null;

  const exactMatches = routeScope != null
    ? covering.filter((schedule) => schedule.routeScope === routeScope)
    : [];
  const candidates = exactMatches.length > 0
    ? exactMatches
    : covering.filter((schedule) => schedule.routeScope == null);
  if (candidates.length === 0) return null;

  // Empate resolve pela validFrom mais recente — comparação lexicográfica basta para 'YYYY-MM-DD'.
  return candidates.reduce((best, candidate) => (candidate.validFrom > best.validFrom ? candidate : best));
}
