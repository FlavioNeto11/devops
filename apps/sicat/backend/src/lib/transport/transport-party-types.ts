/**
 * Tipos e constantes do cadastro-base de transportadores/veículos (PR-A3, DL-103).
 *
 * Bounded context TRANSPORTE, separado do ambiental: nada aqui referencia manifests/CETESB.
 * As constantes espelham 1:1 os CHECKs da migration `023_transport_parties_vehicles.sql` —
 * mudou lá, muda aqui no mesmo PR (e vice-versa).
 *
 * SEM verificação externa: os campos `rntrc*` guardam o estado DECLARADO pelo operador. A
 * verificação real de regularidade via ANTT é Fase C (rotas `/regularidade`/`/verificar` não
 * existem neste PR).
 */

export const PARTY_DOCUMENT_TYPES = ['CNPJ', 'CPF'] as const;
export type PartyDocumentType = (typeof PARTY_DOCUMENT_TYPES)[number];

export const RNTRC_CATEGORIES = ['TAC', 'ETC', 'CTC'] as const;
export type RntrcCategory = (typeof RNTRC_CATEGORIES)[number];

export const RNTRC_STATUSES = ['unknown', 'active', 'suspended', 'cancelled', 'expired'] as const;
export type RntrcStatus = (typeof RNTRC_STATUSES)[number];

export const RNTRC_VERIFICATION_SOURCES = ['manual', 'open_data', 'antt'] as const;
export type RntrcVerificationSource = (typeof RNTRC_VERIFICATION_SOURCES)[number];

export const PARTY_ROLES = [
  'contractor',
  'shipper',
  'carrier',
  'subcontractor',
  'consignee',
  'driver'
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const VEHICLE_TYPES = ['tractor', 'truck', 'semi_trailer', 'trailer', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_LINK_TYPES = ['owned', 'leased', 'aggregated', 'rntrc_fleet'] as const;
export type VehicleLinkType = (typeof VEHICLE_LINK_TYPES)[number];

/** As 27 UFs brasileiras (26 estados + DF) — mesmo universo do CHECK `chk_trparty_uf`. */
export const BRAZILIAN_STATE_CODES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
] as const;
export type BrazilianStateCode = (typeof BRAZILIAN_STATE_CODES)[number];

/** Linha de `transport_parties` já mapeada para camelCase. */
export interface TransportParty {
  id: string;
  integrationAccountId: string;
  documentType: PartyDocumentType;
  documentNumber: string;
  legalName: string;
  tradeName: string | null;
  rntrcNumber: string | null;
  rntrcCategory: RntrcCategory | null;
  rntrcStatus: RntrcStatus;
  rntrcVerifiedAt: string | null;
  rntrcVerificationSource: RntrcVerificationSource;
  municipality: string | null;
  uf: BrazilianStateCode | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransportPartyRole {
  id: string;
  partyId: string;
  role: PartyRole;
  createdAt: string;
}

/** Linha de `transport_vehicles` já mapeada para camelCase. */
export interface TransportVehicle {
  id: string;
  integrationAccountId: string;
  plate: string;
  renavam: string | null;
  vehicleType: VehicleType;
  axlesCount: number | null;
  cargoBodyType: string | null;
  ownerPartyId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransportVehicleLink {
  id: string;
  vehicleId: string;
  partyId: string;
  linkType: VehicleLinkType;
  validFrom: string | null;
  validUntil: string | null;
  source: string;
  evidenceRef: string | null;
  createdAt: string;
}
