/**
 * Gateway de PESQUISA CADASTRAL de risco (PR-I5, REQ-SICAT-0036) — camada ÚNICA autorizada a falar
 * com a gerenciadora de risco; serviços/worker nunca chamam a interface do provedor diretamente.
 *
 * NÃO EXISTE GERENCIADORA CONTRATADA ([EXTERNAL DEPENDENCY], mesma classe da pendência P8): as
 * seguradoras indicam empresas específicas de pesquisa cadastral, e cada uma tem contrato próprio.
 * Este arquivo declara a interface ABSTRATA e entrega hoje `mode: 'sandbox'` — determinístico e
 * STATEFUL EM MEMÓRIA POR PROCESSO (molde EXATO de `averbacao-gateway.ts`/`ciot-provider-gateway.ts`).
 * `mode: 'off'` (default de `RISK_SCREENING_MODE`) recusa criar a instância com
 * `RISK_SCREENING_DISABLED` (501).
 *
 * ── LGPD (restrição DURA, não estética) ──────────────────────────────────────────────────────────
 * O resultado carrega o VEREDITO (`approved`/`rejected`/`inconclusive`) e a VALIDADE — jamais
 * antecedentes, processos, endereços ou qualquer dado sensível da pessoa. Mesma postura de
 * `insurance-verification-provider.ts`, que exclui condições comerciais por minimização. Uma
 * gerenciadora real devolve muito mais que isso; a fronteira deste gateway é onde o excesso morre.
 *
 * ── Padrão DL-102 ────────────────────────────────────────────────────────────────────────────────
 * O `screeningRef` nasce na RESPOSTA; só o `correlationMarker` (gravado pelo service ANTES da
 * chamada) viaja no request. `queryByMarker` é a pergunta que o reconciliador faz quando a resposta
 * se perde.
 *
 * ── Cenários determinísticos do sandbox — decididos pelo ÚLTIMO DÍGITO do documento/placa ───────
 * - termina em `7` → `rejected` (recusa da gerenciadora: motorista/veículo reprovado);
 * - termina em `9` → `inconclusive` (pesquisa sem conclusão — cadastro incompleto na origem);
 * - termina em `3` → grava no store e LANÇA `RISK_SCREENING_LOST_RESPONSE_TEST` (resposta perdida:
 *   o cenário DL-102, que só `queryByMarker` resolve);
 * - qualquer outro → `approved` com validade de 30 dias a partir da data de referência.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../lib/problem.js';
import { config } from '../lib/config.js';
import type { RiskScreeningMode } from '../lib/config.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type RiskScreeningOutcome = 'approved' | 'rejected' | 'inconclusive';

export type RiskScreeningDriverPayload = {
  correlationMarker: string;
  /** CPF do motorista (só dígitos) — o ÚLTIMO dígito decide o cenário do sandbox. */
  driverDocument: string;
  cnhNumber: string;
  /** Data de referência 'YYYY-MM-DD' — a validade sai a partir dela (nunca "hoje" implícito). */
  referenceDate: string;
};

export type RiskScreeningVehiclePayload = {
  correlationMarker: string;
  /** Placa do veículo — o ÚLTIMO caractere numérico decide o cenário do sandbox. */
  plate: string;
  renavam?: string | null;
  referenceDate: string;
};

export type RiskScreeningResult = {
  outcome: RiskScreeningOutcome;
  screeningRef: string;
  /** Validade do resultado ('YYYY-MM-DD'); `null` quando o veredito não gera validade (rejected). */
  validUntil: string | null;
  /** Payload MÍNIMO (LGPD): veredito + validade + referência. Nunca dado sensível da pessoa. */
  raw: Record<string, unknown>;
};

export type RiskScreeningQueryResult =
  | { found: true; outcome: RiskScreeningOutcome; screeningRef: string; validUntil: string | null; raw: Record<string, unknown> }
  | { found: false };

export type RiskScreeningGateway = {
  mode: RiskScreeningMode;
  screenDriver(payload: RiskScreeningDriverPayload): Promise<RiskScreeningResult>;
  screenVehicle(payload: RiskScreeningVehiclePayload): Promise<RiskScreeningResult>;
  queryByMarker(args: { correlationMarker: string }): Promise<RiskScreeningQueryResult>;
};

export type CreateRiskScreeningGatewayOptions = {
  mode?: RiskScreeningMode;
};

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'Risk Screening Gateway Error', detail, { code, ...(context ? { context } : {}) });
}

// =================================================================================================
// Estado do sandbox — módulo-level (um retry cria nova instância e precisa enxergar o que já gravou)
// =================================================================================================

type SandboxScreeningRecord = {
  screeningRef: string;
  outcome: RiskScreeningOutcome;
  validUntil: string | null;
  raw: Record<string, unknown>;
};

const sandboxScreeningStore = new Map<string, SandboxScreeningRecord>();

/** Exposto só para testes — nenhum código de produção reseta o estado do "provedor". */
export function resetRiskScreeningSandboxStoreForTests(): void {
  sandboxScreeningStore.clear();
}

function deriveScreeningRef(correlationMarker: string): string {
  let hash = 0;
  for (let i = 0; i < correlationMarker.length; i += 1) {
    hash = (hash * 31 + correlationMarker.charCodeAt(i)) >>> 0;
  }
  return `GRS${String(1_000_000_000 + (hash % 900_000_000))}`;
}

/** Último dígito do identificador — o "dial" dos cenários. Sem dígito nenhum ⇒ 0 (aprovado). */
function lastDigitOf(value: string): number {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits[digits.length - 1]);
}

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${String(isoDate).slice(0, 10)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

async function sandboxJitter(): Promise<void> {
  await delay(0);
}

const SANDBOX_VALIDITY_DAYS = 30;

function runSandboxScreening(args: {
  correlationMarker: string;
  identifier: string;
  referenceDate: string;
  subjectType: 'driver' | 'vehicle';
}): RiskScreeningResult {
  const { correlationMarker, identifier, referenceDate, subjectType } = args;
  const screeningRef = deriveScreeningRef(correlationMarker);
  const digit = lastDigitOf(identifier);

  const existing = sandboxScreeningStore.get(correlationMarker);
  if (existing) {
    // Idempotência: mesmo marcador ⇒ mesmo resultado (retry de job nunca produz veredito novo).
    return { outcome: existing.outcome, screeningRef: existing.screeningRef, validUntil: existing.validUntil, raw: existing.raw };
  }

  let outcome: RiskScreeningOutcome = 'approved';
  if (digit === 7) outcome = 'rejected';
  else if (digit === 9) outcome = 'inconclusive';

  const validUntil = outcome === 'approved' ? addDaysIso(referenceDate, SANDBOX_VALIDITY_DAYS) : null;
  const raw: Record<string, unknown> = {
    provider: 'sandbox',
    subjectType,
    outcome,
    referenceDate,
    // LGPD: nada além do veredito e da janela. Nenhum dado da pessoa entra no `raw`.
    validityDays: outcome === 'approved' ? SANDBOX_VALIDITY_DAYS : 0
  };

  const record: SandboxScreeningRecord = { screeningRef, outcome, validUntil, raw };
  sandboxScreeningStore.set(correlationMarker, record);

  // Cenário DL-102: o "provedor" processou (já gravou acima) e a resposta se perde no caminho.
  if (digit === 3) {
    throw gatewayError(504, 'RISK_SCREENING_LOST_RESPONSE_TEST', 'Resposta da gerenciadora de risco perdida (cenário de teste).', {
      correlationMarker
    });
  }

  return { outcome, screeningRef, validUntil, raw };
}

function createSandboxGateway(): RiskScreeningGateway {
  return {
    mode: 'sandbox',
    async screenDriver(payload) {
      await sandboxJitter();
      return runSandboxScreening({
        correlationMarker: payload.correlationMarker,
        identifier: payload.driverDocument,
        referenceDate: payload.referenceDate,
        subjectType: 'driver'
      });
    },
    async screenVehicle(payload) {
      await sandboxJitter();
      return runSandboxScreening({
        correlationMarker: payload.correlationMarker,
        identifier: payload.plate,
        referenceDate: payload.referenceDate,
        subjectType: 'vehicle'
      });
    },
    async queryByMarker({ correlationMarker }) {
      await sandboxJitter();
      const existing = sandboxScreeningStore.get(correlationMarker);
      if (!existing) return { found: false };
      return {
        found: true,
        outcome: existing.outcome,
        screeningRef: existing.screeningRef,
        validUntil: existing.validUntil,
        raw: existing.raw
      };
    }
  };
}

/**
 * Fábrica do gateway. `off` (default) RECUSA — não devolve um gateway "que não faz nada": pesquisa
 * cadastral que silenciosamente não acontece é pior que erro explícito (o gate de GR passaria a
 * avaliar um vazio como se fosse resposta).
 */
export function createRiskScreeningGateway(options: CreateRiskScreeningGatewayOptions = {}): RiskScreeningGateway {
  const mode = options.mode || config.riskScreeningMode;
  if (mode !== 'sandbox') {
    throw gatewayError(
      501,
      'RISK_SCREENING_DISABLED',
      'Pesquisa cadastral de risco desabilitada: defina RISK_SCREENING_MODE=sandbox para usar o provedor de testes.',
      { mode }
    );
  }
  return createSandboxGateway();
}
