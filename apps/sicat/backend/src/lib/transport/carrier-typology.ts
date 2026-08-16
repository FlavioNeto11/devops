/**
 * Tipologia derivada do transportador (PR I1 do plano "Módulo Transportadora", REQ-SICAT-0033).
 *
 * Módulo PURO (sem SQL, sem I/O — molde `transport-state-machine.ts`): o banco guarda FATOS
 * (partes, vínculos de veículo), e a classificação TAC/ETC é sempre DERIVADA deles na leitura.
 * Persistir a tipologia criaria uma segunda verdade que envelhece a cada vínculo criado/encerrado.
 *
 * Semântica (doc Irmãos PADILHA, 2026-08-11 + REQ-SICAT-0033):
 *   - `driver_pf` — motorista pessoa física SEM frota própria (dirige para terceiros);
 *   - `tac`      — Transportador Autônomo de Cargas: até 3 caminhões;
 *   - `etc`      — Empresa de Transporte de Cargas: 4 ou mais (emite CIOT e contrata seguro).
 *
 * O corte é por TAMANHO DE FROTA ATIVA (owned+leased — agregado é frota de OUTRO transportador):
 * 1..3 → `tac`, >=4 → `etc`, independente de PF/PJ. A imprecisão assumida: TAC estritamente designa
 * o autônomo PF, mas uma PJ com frota 0..3 não tem tipologia menor no recorte deste domínio — a
 * divergência com a categoria RNTRC DECLARADA vira `typologyWarning` (aviso), nunca erro.
 */

/** Mesmo universo do enum declarado `rntrc_category` NÃO é este: aqui é a tipologia DERIVADA. */
export const CARRIER_TYPOLOGIES = ['driver_pf', 'tac', 'etc'] as const;
export type CarrierTypology = (typeof CARRIER_TYPOLOGIES)[number];

/** PF = documentType CPF; PJ = CNPJ (o chamador traduz — este módulo não conhece documentos). */
export type CarrierPartyKind = 'PF' | 'PJ';

/** Corte TAC/ETC do circuito TRC: TAC opera até 3 caminhões; 4+ caracteriza ETC. */
export const TAC_MAX_FLEET_SIZE = 3;

export function deriveCarrierTypology({
  partyKind,
  fleetSize
}: {
  partyKind: CarrierPartyKind;
  fleetSize: number;
}): CarrierTypology {
  if (!Number.isInteger(fleetSize) || fleetSize < 0) {
    throw new RangeError(`fleetSize deve ser um inteiro >= 0 (recebido ${fleetSize}).`);
  }

  if (fleetSize > TAC_MAX_FLEET_SIZE) return 'etc';
  if (fleetSize >= 1) return 'tac';

  // Frota zero: PF sem veículo próprio é o motorista que dirige para terceiros (`driver_pf`).
  // PJ sem veículo é aproximada a `tac` — `driver_pf` é exclusivo de pessoa física, e assumir a
  // MENOR tipologia de transportador até a frota ser cadastrada é o chute conservador honesto
  // (nunca promove a ETC por ausência de dado); o `typologyWarning` acusa se o declarado divergir.
  return partyKind === 'PF' ? 'driver_pf' : 'tac';
}

/**
 * Shape mínimo de um vínculo veículo↔parte para a contagem de frota — subconjunto de
 * `TransportVehicleLink` (`transport-party-types.ts`), para a função continuar pura e testável
 * sem arrastar o tipo inteiro do repositório.
 */
export type FleetLinkLike = {
  linkType: string;
  validFrom?: string | null;
  validUntil?: string | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Conta os vínculos de veículo que compõem a FROTA PRÓPRIA ativa: `owned`+`leased` vigentes na
 * data de referência. `aggregated`/`rntrc_fleet` ficam FORA — agregado é veículo de terceiro, e
 * `rntrc_fleet` é declaração RNTRC, não posse verificável (REQ-SICAT-0033: "frota owned+leased
 * ativa"). Vigência: datas nulas não restringem (vínculo sem período declarado conta como ativo,
 * mesma leitura de `transport_vehicle_links` onde ambas são opcionais).
 */
export function countActiveFleet(
  links: readonly FleetLinkLike[],
  referenceDate: string = todayIsoDate()
): number {
  let count = 0;
  for (const link of links) {
    if (link.linkType !== 'owned' && link.linkType !== 'leased') continue;
    if (link.validFrom && link.validFrom > referenceDate) continue;
    if (link.validUntil && link.validUntil < referenceDate) continue;
    count += 1;
  }
  return count;
}

/** Equivalência declarado→derivado usada no aviso — CTC (cooperativa) fica de fora de propósito. */
const DERIVED_BY_DECLARED: Record<string, CarrierTypology> = {
  TAC: 'tac',
  ETC: 'etc'
};

/**
 * Aviso NÃO BLOQUEANTE de divergência entre a categoria RNTRC DECLARADA e a tipologia DERIVADA da
 * frota (REQ-SICAT-0033: "aviso de divergência... validação de serviço, sem regra TR bloqueante
 * neste ciclo"). `CTC` nunca gera aviso: cooperativa é forma societária, não derivável de contagem
 * de frota. Retorna a mensagem pronta (pt-BR, para o payload `typologyWarning`) ou `null`.
 */
export function buildTypologyWarning({
  declaredCategory,
  derivedTypology,
  fleetSize
}: {
  declaredCategory: string | null | undefined;
  derivedTypology: CarrierTypology;
  fleetSize: number;
}): string | null {
  if (!declaredCategory) return null;
  const expected = DERIVED_BY_DECLARED[declaredCategory];
  if (!expected || expected === derivedTypology) return null;

  return (
    `Categoria RNTRC declarada (${declaredCategory}) diverge da tipologia derivada da frota ativa ` +
    `(${derivedTypology}, ${fleetSize} veículo(s) owned/leased vigentes). Revise o cadastro do ` +
    'transportador ou os vínculos de veículo.'
  );
}
