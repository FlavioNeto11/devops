/**
 * Provider de verificação de seguros do transportador (PR-F2, DL-103) — camada ÚNICA autorizada a
 * "falar" com uma fonte externa de seguros (seguradora/ANTT); serviços nunca chamam a interface do
 * provedor diretamente.
 *
 * NÃO EXISTE INTEGRAÇÃO TÉCNICA COM SEGURADORA/ANTT ([EXTERNAL DEPENDENCY] P8 do guia do programa —
 * a ANTT tem cronograma de verificação automática de seguros, mas ele exige credenciamento que o
 * operador ainda não tem). Este arquivo declara a interface ABSTRATA que qualquer integração real
 * implementaria e entrega hoje só `mode: 'mock'` — sandbox determinístico e SEM ESTADO (ao contrário
 * de `ciot-provider-gateway.ts`/`vpo-gateway.ts`: aqui não há "mutação" a lembrar entre chamadas, só
 * CONSULTA — mesmo papel de `antt-rntrc-gateway.ts#lookupCarrier`, mas sem a parte `open_data` real
 * ainda, já que P8 segue pendente).
 *
 * ── Estratégia `mock` — determinística, sem rede ─────────────────────────────────────────────────
 * `verifyCarrier`: documento terminado em dígito PAR → devolve as 3 apólices obrigatórias
 * (RCTR_C/RC_DC/RC_V), todas vigentes por 1 ano a partir de hoje; ÍMPAR → devolve lista vazia (o
 * "não encontrado" do mock, análogo a `not_found` em `antt-rntrc-gateway.ts`). `mockOverrides` (por
 * documento, dígitos) sobrepõe a lista de apólices — é como os testes exercitam vigência vencida/
 * apólice ausente por tipo/seguradora específica.
 * `verifyPolicy`: número de apólice terminado em dígito PAR → `found: true` com uma janela de
 * vigência determinística; ÍMPAR → `found: false`.
 *
 * LGPD: o payload devolvido é o MÍNIMO necessário para compor `insurance_policies` (número/vigência/
 * seguradora/tipo) — nunca condições comerciais completas (franquia, cláusulas, prêmio).
 */

import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../lib/problem.js';
import { config, type InsuranceProviderMode } from '../lib/config.js';
import type { InsurancePolicyType } from '../lib/transport/transport-insurance-types.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type { InsuranceProviderMode };

export type InsuranceCarrierLookupQuery = {
  /** CPF/CNPJ — dígitos ou já mascarado, tanto faz (normalizado aqui). */
  partyDocument: string;
  rntrcNumber?: string | null;
};

/** Payload MÍNIMO de UMA apólice encontrada — LGPD: nunca inclui franquia/cláusulas/prêmio. */
export type InsurancePolicyLookupResult = {
  policyType: InsurancePolicyType;
  policyNumber: string;
  insurerName: string;
  validFrom: string;
  validUntil: string;
  coverageAmount?: number | null;
};

export type InsuranceCarrierLookupResult = {
  policies: InsurancePolicyLookupResult[];
  source: 'mock' | 'provider' | 'antt';
};

export type InsurancePolicyLookupQuery = {
  policyNumber: string;
  policyType: InsurancePolicyType;
};

export type InsurancePolicyVerificationResult =
  | ({ found: true } & InsurancePolicyLookupResult)
  | { found: false; policyType: InsurancePolicyType; policyNumber: string };

export type InsuranceVerificationProvider = {
  mode: InsuranceProviderMode;
  verifyCarrier(query: InsuranceCarrierLookupQuery): Promise<InsuranceCarrierLookupResult>;
  verifyPolicy(query: InsurancePolicyLookupQuery): Promise<InsurancePolicyVerificationResult>;
};

export type InsuranceMockOverride = { policies: InsurancePolicyLookupResult[] };

export type CreateInsuranceVerificationProviderOptions = {
  mode?: InsuranceProviderMode;
  /** Só usado em `mode: 'mock'` — chave por `partyDocument` (dígitos). */
  mockOverrides?: Record<string, InsuranceMockOverride>;
};

// =================================================================================================
// Erros tipados — INSURANCE_PROVIDER_*
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'Insurance Provider Error', detail, { code, ...(context ? { context } : {}) });
}

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

async function mockJitter(): Promise<void> {
  // Jitter mínimo — mantém o shape "assíncrono" sem serializar testes uns atrás dos outros (mesmo
  // padrão de `ciot-provider-gateway.ts#mockJitter`/`antt-rntrc-gateway.ts#lookupMock`).
  await delay(0);
}

const MOCK_INSURER_NAME = 'Seguradora Exemplo S.A.';
const MOCK_COVERAGE_AMOUNT = 500000;
const MOCK_VALIDITY_DAYS = 365;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Número de apólice determinístico a partir do documento + tipo — mesmo documento ⇒ mesma apólice, sempre. */
function deriveMockPolicyNumber(documentDigits: string, policyType: InsurancePolicyType): string {
  const marker = `${documentDigits}:${policyType}`;
  let hash = 0;
  for (let i = 0; i < marker.length; i += 1) {
    hash = (hash * 31 + marker.charCodeAt(i)) >>> 0;
  }
  return `${policyType}-${String(100000 + (hash % 900000))}`;
}

function buildMockPolicies(documentDigits: string): InsurancePolicyLookupResult[] {
  const validFrom = todayIsoDate();
  const validUntil = addDaysIsoDate(validFrom, MOCK_VALIDITY_DAYS);
  const policyTypes: InsurancePolicyType[] = ['RCTR_C', 'RC_DC', 'RC_V'];
  return policyTypes.map((policyType) => ({
    policyType,
    policyNumber: deriveMockPolicyNumber(documentDigits, policyType),
    insurerName: MOCK_INSURER_NAME,
    validFrom,
    validUntil,
    coverageAmount: MOCK_COVERAGE_AMOUNT
  }));
}

function lookupCarrierMock(
  query: InsuranceCarrierLookupQuery,
  overrides: Record<string, InsuranceMockOverride>
): InsuranceCarrierLookupResult {
  const documentDigits = onlyDigits(query.partyDocument);
  const override = documentDigits ? overrides[documentDigits] : undefined;
  if (override) return { policies: override.policies, source: 'mock' };

  const lastDigit = documentDigits ? Number(documentDigits[documentDigits.length - 1]) : 0;
  const isEven = Number.isFinite(lastDigit) && lastDigit % 2 === 0;
  return { policies: isEven ? buildMockPolicies(documentDigits) : [], source: 'mock' };
}

function lookupPolicyMock(query: InsurancePolicyLookupQuery): InsurancePolicyVerificationResult {
  const digits = onlyDigits(query.policyNumber);
  const lastDigit = digits ? Number(digits[digits.length - 1]) : 0;
  const isEven = Number.isFinite(lastDigit) && lastDigit % 2 === 0;

  if (!isEven) {
    return { found: false, policyType: query.policyType, policyNumber: query.policyNumber };
  }

  const validFrom = todayIsoDate();
  const validUntil = addDaysIsoDate(validFrom, MOCK_VALIDITY_DAYS);
  return {
    found: true,
    policyType: query.policyType,
    policyNumber: query.policyNumber,
    insurerName: MOCK_INSURER_NAME,
    validFrom,
    validUntil,
    coverageAmount: MOCK_COVERAGE_AMOUNT
  };
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createInsuranceVerificationProvider(
  options: CreateInsuranceVerificationProviderOptions = {}
): InsuranceVerificationProvider {
  const mode = options.mode ?? config.insuranceProviderMode;
  const mockOverrides = options.mockOverrides ?? {};

  if (mode === 'antt' || mode === 'real') {
    throw gatewayError(
      501,
      'INSURANCE_PROVIDER_NOT_CONFIGURED',
      'Nenhuma integração técnica com seguradora/ANTT credenciada — pendência [EXTERNAL DEPENDENCY] '
        + 'P8 do guia do programa (docs/30-transporte/transporte-guia.md): a ANTT tem cronograma de '
        + 'verificação automática de seguros, mas ele exige credenciamento que o operador ainda não '
        + 'tem. Use INSURANCE_PROVIDER_MODE=mock enquanto P8 não é resolvida pelo operador.',
      { code: 'INSURANCE_PROVIDER_NOT_CONFIGURED', mode }
    );
  }

  return {
    mode,
    async verifyCarrier(query: InsuranceCarrierLookupQuery): Promise<InsuranceCarrierLookupResult> {
      await mockJitter();
      if (!query.partyDocument) {
        throw gatewayError(400, 'INSURANCE_PROVIDER_INVALID_QUERY', 'verifyCarrier exige partyDocument.');
      }
      return lookupCarrierMock(query, mockOverrides);
    },
    async verifyPolicy(query: InsurancePolicyLookupQuery): Promise<InsurancePolicyVerificationResult> {
      await mockJitter();
      if (!query.policyNumber || !query.policyType) {
        throw gatewayError(400, 'INSURANCE_PROVIDER_INVALID_QUERY', 'verifyPolicy exige policyNumber e policyType.');
      }
      return lookupPolicyMock(query);
    }
  };
}
