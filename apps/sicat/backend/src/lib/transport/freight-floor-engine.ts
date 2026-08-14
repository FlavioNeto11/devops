/**
 * `FreightFloorEngine` — motor de cálculo do piso mínimo de frete (PR-B1, DL-103).
 *
 * Módulo PURO — nenhuma chamada a banco/HTTP/relógio, mesmo racional de `rule-evaluators.ts`
 * (linha "Fase A" do programa): tudo entra por parâmetro, tudo sai por retorno. Quem resolve a
 * versão vigente da tabela e os coeficientes reais (`freight-floor-repo.ts`) e persiste o
 * resultado (`freight-floor-service.ts`) fica FORA daqui — este arquivo só sabe multiplicar e
 * mapear texto.
 *
 * Metodologia (Lei 13.703/2018 + Res. ANTT 5.867/2020, metodologia alterada pela Res. ANTT
 * 6.076/2026): piso = CCD (coeficiente de deslocamento, R$/km) × distância (km) + CC (coeficiente
 * de carga e descarga, R$). Arredondamento a 2 casas decimais, HALF-UP (nunca banker's rounding —
 * `Math.round`/`toFixed` nativos do JS têm viés de ponto flutuante perto de `.xx5`, corrigido por
 * `roundHalfUp2`).
 */

import type { CargoRegime } from './transport-operation-types.js';
import type { TransportOperationVehicle } from './transport-operation-types.js';

// =================================================================================================
// Arredondamento — HALF-UP, robusto a erro de representação de ponto flutuante
// =================================================================================================

/**
 * Arredonda para 2 casas decimais com a regra HALF-UP (0,005 sobe, nunca "banker's rounding").
 * `Number.prototype.toFixed` e `Math.round(x * 100) / 100` sozinhos falham em casos como `1.005`
 * (que em IEEE-754 é `1.00499999...`) — o pequeno epsilon somado ANTES do `Math.round` empurra
 * exatamente esses casos de fronteira para o lado certo sem afetar nenhum outro valor.
 */
export function roundHalfUp2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) * 100;
  const rounded = Math.round(scaled + 1e-9);
  return sign * (rounded / 100);
}

// =================================================================================================
// Mapeamento de cargoType (livre, declarado pelo operador em `transport_operation_cargo`) → slug
// canônico das tabelas de piso (`reference-data/freight-floor/*.json`)
// =================================================================================================

/** Os 11 slugs canônicos da Tabela A (Res. ANTT 6.084/2026) — mesmo universo do JSON de referência. */
export const FREIGHT_FLOOR_CARGO_SLUGS = [
  'granel_solido',
  'granel_liquido',
  'frigorificada',
  'conteinerizada',
  'carga_geral',
  'neogranel',
  'perigosa_granel_solido',
  'perigosa_granel_liquido',
  'perigosa_frigorificada',
  'perigosa_conteinerizada',
  'perigosa_carga_geral'
] as const;

export type FreightFloorCargoSlug = (typeof FREIGHT_FLOOR_CARGO_SLUGS)[number];

/**
 * Alias PT-BR (rótulos do JSON de referência e variações comuns) → slug canônico. Chave já
 * normalizada por `normalizeCargoTypeKey` — nunca comparar contra o valor bruto do operador.
 */
const CARGO_TYPE_ALIASES: Record<string, FreightFloorCargoSlug> = {
  granel_solido: 'granel_solido',
  granel_liquido: 'granel_liquido',
  frigorificada: 'frigorificada',
  frigorificada_ou_aquecida: 'frigorificada',
  aquecida: 'frigorificada',
  refrigerada: 'frigorificada',
  conteinerizada: 'conteinerizada',
  container: 'conteinerizada',
  conteiner: 'conteinerizada',
  carga_geral: 'carga_geral',
  geral: 'carga_geral',
  neogranel: 'neogranel',
  perigosa_granel_solido: 'perigosa_granel_solido',
  perigosa_granel_liquido: 'perigosa_granel_liquido',
  perigosa_frigorificada: 'perigosa_frigorificada',
  perigosa_frigorificada_ou_aquecida: 'perigosa_frigorificada',
  perigosa_conteinerizada: 'perigosa_conteinerizada',
  perigosa_carga_geral: 'perigosa_carga_geral'
};

/** minúsculo, sem acento, sem parênteses, separadores viram `_` único — determinístico e puro. */
function normalizeCargoTypeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * `cargoType` de `transport_operation_cargo` (texto livre do operador) → um dos 11 slugs
 * canônicos, ou `null` quando não há correspondência conhecida (o chamador trata como
 * `missing_inputs` — nunca adivinha um slug "parecido").
 */
export function mapCargoTypeToFloorSlug(rawCargoType: string | null | undefined): FreightFloorCargoSlug | null {
  if (typeof rawCargoType !== 'string' || rawCargoType.trim().length === 0) return null;
  const key = normalizeCargoTypeKey(rawCargoType);
  if (CARGO_TYPE_ALIASES[key]) return CARGO_TYPE_ALIASES[key];
  return (FREIGHT_FLOOR_CARGO_SLUGS as readonly string[]).includes(key)
    ? (key as FreightFloorCargoSlug)
    : null;
}

// =================================================================================================
// Resolução de tabela por regime de carga (Fase B: só a Tabela A, carga lotação)
// =================================================================================================

export const FREIGHT_FLOOR_TABLE_CODES = ['A', 'B', 'C', 'D'] as const;
export type FreightFloorTableCode = (typeof FREIGHT_FLOOR_TABLE_CODES)[number];

/**
 * Fase B só resolve a Tabela A (carga lotação) — Tabelas B/C/D aguardam transcrição conferida
 * (pendência P3 do guia). `fracionada`/`unknown` nunca têm piso (Applicability, TR-PMF-001).
 */
export function resolveFloorTableCodeForCargoRegime(cargoRegime: CargoRegime): FreightFloorTableCode | null {
  return cargoRegime === 'lotacao' ? 'A' : null;
}

// =================================================================================================
// Derivação de axlesCount a partir dos veículos vinculados à operação
// =================================================================================================

/** Soma `axlesCount` de todos os `vehicleSnapshot` vinculados; `null` quando não há nenhum eixo declarado. */
export function sumAxlesFromVehicles(
  vehicles: readonly Pick<TransportOperationVehicle, 'vehicleSnapshot'>[]
): number | null {
  let total = 0;
  let sawAny = false;
  for (const vehicle of vehicles) {
    const raw = vehicle.vehicleSnapshot?.axlesCount;
    const num = Number(raw);
    if (raw != null && Number.isFinite(num) && num > 0) {
      total += num;
      sawAny = true;
    }
  }
  return sawAny ? total : null;
}

// =================================================================================================
// Cálculo — puro: coeficientes + insumos → piso mínimo + trace
// =================================================================================================

export type FreightFloorCoefficients = {
  displacement: number;
  loadUnload: number;
};

export type CalculateFreightFloorInput = {
  cargoType: FreightFloorCargoSlug;
  axlesCount: number;
  distanceKm: number;
  coefficients: FreightFloorCoefficients;
};

export type FreightFloorCalculationTrace = {
  formula: 'CCD*km + CC';
  components: {
    cargoType: FreightFloorCargoSlug;
    axlesCount: number;
    distanceKm: number;
    displacementCoefficient: number;
    loadUnloadCoefficient: number;
    displacementSubtotal: number;
    loadUnloadSubtotal: number;
  };
};

export type CalculateFreightFloorResult = {
  minimumAmount: number;
  trace: FreightFloorCalculationTrace;
};

/**
 * `minimum = displacement * distanceKm + loadUnload`, arredondado a 2 casas HALF-UP. Devolve
 * também o `trace` com cada componente ANTES de somar — é o que sustenta o `calculation_trace`
 * persistido (auditoria/reprodutibilidade, NFR-0009/0010).
 */
export function calculateFreightFloor(input: CalculateFreightFloorInput): CalculateFreightFloorResult {
  const { cargoType, axlesCount, distanceKm, coefficients } = input;
  const displacementSubtotal = coefficients.displacement * distanceKm;
  const loadUnloadSubtotal = coefficients.loadUnload;
  const minimumAmount = roundHalfUp2(displacementSubtotal + loadUnloadSubtotal);

  return {
    minimumAmount,
    trace: {
      formula: 'CCD*km + CC',
      components: {
        cargoType,
        axlesCount,
        distanceKm,
        displacementCoefficient: coefficients.displacement,
        loadUnloadCoefficient: coefficients.loadUnload,
        displacementSubtotal: roundHalfUp2(displacementSubtotal),
        loadUnloadSubtotal: roundHalfUp2(loadUnloadSubtotal)
      }
    }
  };
}

// =================================================================================================
// Árvore de decisão — PURA, separada da resolução de dados (I/O fica inteiramente no chamador)
// =================================================================================================

/**
 * `freight-floor-service.ts` resolve TODO o I/O (versão de tabela vigente, par de coeficientes)
 * ANTES de chamar `decideFreightFloorOutcome` — esta função só decide, com os dados JÁ EM MÃO, qual
 * dos 4 outcomes da migration 026 (`calculated|not_applicable|missing_coefficients|missing_inputs`)
 * se aplica, e calcula quando aplicável. Mantém a árvore de decisão inteira testável sem banco.
 */
export type DecideFreightFloorInput = {
  cargoRegime: CargoRegime;
  cargoTypeRaw: string | null;
  axlesCount: number | null;
  distanceKm: number | null;
  /** `false` quando o chamador não achou NENHUMA versão de tabela vigente na `referenceDate`. */
  floorVersionFound: boolean;
  /** `null` quando não há versão vigente OU a versão vigente não tem linha para `(cargoType, axlesCount)`. */
  coefficients: FreightFloorCoefficients | null;
};

export type FreightFloorDecisionNotApplicable = { outcome: 'not_applicable'; reason: string };
export type FreightFloorDecisionMissingInputs = { outcome: 'missing_inputs'; reason: string; cargoFloorSlug: FreightFloorCargoSlug | null };
export type FreightFloorDecisionMissingCoefficients = {
  outcome: 'missing_coefficients';
  reason: string;
  cargoFloorSlug: FreightFloorCargoSlug;
  axlesCount: number;
  distanceKm: number;
};
export type FreightFloorDecisionCalculated = {
  outcome: 'calculated';
  cargoFloorSlug: FreightFloorCargoSlug;
  axlesCount: number;
  distanceKm: number;
  minimumAmount: number;
  trace: FreightFloorCalculationTrace;
};

export type FreightFloorDecision =
  | FreightFloorDecisionNotApplicable
  | FreightFloorDecisionMissingInputs
  | FreightFloorDecisionMissingCoefficients
  | FreightFloorDecisionCalculated;

export function decideFreightFloorOutcome(input: DecideFreightFloorInput): FreightFloorDecision {
  const tableCode = resolveFloorTableCodeForCargoRegime(input.cargoRegime);
  if (!tableCode) {
    return {
      outcome: 'not_applicable',
      reason: `Regime de carga "${input.cargoRegime}" não exige piso mínimo nesta fase (Fase B só `
        + 'resolve a Tabela A, carga lotação — Applicability de TR-PMF-001).'
    };
  }

  const cargoFloorSlug = mapCargoTypeToFloorSlug(input.cargoTypeRaw);
  const missing: string[] = [];
  if (!cargoFloorSlug) {
    missing.push(`cargoType "${input.cargoTypeRaw ?? ''}" não mapeia para nenhum dos 11 slugs canônicos da Tabela A`);
  }
  if (input.axlesCount == null) missing.push('nenhum veículo vinculado com axlesCount declarado');
  if (input.distanceKm == null) missing.push('rota sem distanceKm declarado');

  if (missing.length > 0) {
    return {
      outcome: 'missing_inputs',
      reason: `Insumos insuficientes para calcular o piso: ${missing.join('; ')}.`,
      cargoFloorSlug
    };
  }

  const slug = cargoFloorSlug as FreightFloorCargoSlug;
  const axlesCount = input.axlesCount as number;
  const distanceKm = input.distanceKm as number;

  if (!input.coefficients) {
    const reason = input.floorVersionFound
      ? `Tabela ${tableCode} vigente, mas sem coeficiente para cargoType="${slug}"/axlesCount=${axlesCount}.`
      : `Nenhuma versão da Tabela ${tableCode} está vigente (nenhuma carregada ainda, ou nenhuma `
        + 'com effective_from <= a data de referência — rode `npm run load:freight-floor`).';
    return { outcome: 'missing_coefficients', reason, cargoFloorSlug: slug, axlesCount, distanceKm };
  }

  const { minimumAmount, trace } = calculateFreightFloor({
    cargoType: slug,
    axlesCount,
    distanceKm,
    coefficients: input.coefficients
  });

  return { outcome: 'calculated', cargoFloorSlug: slug, axlesCount, distanceKm, minimumAmount, trace };
}
