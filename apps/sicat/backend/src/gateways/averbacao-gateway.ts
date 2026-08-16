/**
 * Gateway de averbação eletrônica (PR-I3, REQ-SICAT-0034) — camada ÚNICA autorizada a "falar" com a
 * seguradora/averbadora; serviços/worker nunca chamam a interface do provedor diretamente.
 *
 * NÃO EXISTE AVERBADORA CONTRATADA ([EXTERNAL DEPENDENCY], mesmo racional da pendência P8 dos
 * seguros — a verificação/averbação real exige contrato com seguradora ou averbadora homologada).
 * Este arquivo declara a interface ABSTRATA que qualquer averbadora real implementaria e entrega
 * hoje `mode: 'sandbox'` — um sandbox determinístico e STATEFUL EM MEMÓRIA POR PROCESSO, molde
 * EXATO de `ciot-provider-gateway.ts`. `mode: 'off'` (default de `AVERBACAO_GATEWAY_MODE`) recusa
 * criar a instância com `AVERBACAO_GATEWAY_DISABLED` (501) — mesmo desenho "off recusa tudo" de
 * `dfe-issuance-gateway.ts`.
 *
 * ── Padrão DL-102 aplicado à averbação ────────────────────────────────────────────────────────────
 * O `declarationRef` nasce na RESPOSTA — nenhum identificador nosso viaja no request além do
 * `correlationMarker` (campo de "referência do cliente" que averbadoras reais aceitam).
 * `queryByMarker` é a "pergunta ao provedor" que o reconciliador (`services/averbacao-reconciler.ts`)
 * faz quando uma resposta se perde: o sandbox responde consultando o MESMO Map que
 * `declareShipment`/`rectifyShipment`/`cancelShipment` escrevem, chaveado pelo `correlationMarker`
 * gravado pelo service ANTES de qualquer chamada (`lib/transport/averbacao-correlation.ts`).
 *
 * ── Cenários determinísticos do sandbox — decididos pelos CENTAVOS de `cargoAmount` ──────────────
 * - centavos `.99` no declare → `outcome: 'rejected'` (recusa DEFINITIVA da seguradora, código
 *   `AVERBACAO_REJECTED_TEST` no raw) — decisão de negócio conhecida, nunca "resposta perdida".
 * - centavos `.98` (declare OU rectify) → o sandbox GRAVA no Map (o "provedor" processou de
 *   verdade) e LANÇA `AVERBACAO_LOST_RESPONSE_TEST` — o cenário DL-102 por excelência: dispatch
 *   aconteceu, resposta se perdeu, e só `queryByMarker` (via reconciliador) descobre a verdade.
 * - qualquer outro valor → confirma normalmente, com `declarationRef` determinístico do marcador
 *   (mesmo marcador ⇒ mesmo ref, sempre — retry de job é idempotente, nunca duplica averbação).
 */

import { AppError } from '../lib/problem.js';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../lib/config.js';
import type { AverbacaoGatewayMode } from '../lib/config.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type AverbacaoDeclarePayload = {
  /** Marcador DL-102 — gravado pelo service ANTES da chamada; chave de correlação no provedor. */
  correlationMarker: string;
  policyType: string;
  policyNumber: string;
  /** Valor declarado da carga em REAIS — os CENTAVOS decidem os cenários do sandbox. */
  cargoAmount: number;
  routeScope: string | null;
  operationRef: string;
};

export type AverbacaoRectifyPayload = {
  correlationMarker: string;
  /** NOVO valor declarado da carga (reais) — os centavos `.98` também simulam resposta perdida aqui. */
  cargoAmount: number;
  reason?: string | null;
};

export type AverbacaoCancelPayload = {
  correlationMarker: string;
  reason?: string | null;
};

export type AverbacaoDeclareResult = {
  outcome: 'declared' | 'rejected';
  /** Nasce NA RESPOSTA (DL-102) — `null` quando `rejected`. */
  declarationRef: string | null;
  raw: Record<string, unknown>;
};

export type AverbacaoMutationResult = {
  outcome: 'rectified' | 'cancelled';
  declarationRef: string;
  raw: Record<string, unknown>;
};

export type AverbacaoQueryResult =
  | { found: true; declarationRef: string; externalStatus: string; raw: Record<string, unknown> }
  | { found: false };

export type AverbacaoGateway = {
  mode: AverbacaoGatewayMode;
  declareShipment(payload: AverbacaoDeclarePayload): Promise<AverbacaoDeclareResult>;
  rectifyShipment(payload: AverbacaoRectifyPayload): Promise<AverbacaoMutationResult>;
  cancelShipment(payload: AverbacaoCancelPayload): Promise<AverbacaoMutationResult>;
  queryByMarker(args: { correlationMarker: string }): Promise<AverbacaoQueryResult>;
};

export type CreateAverbacaoGatewayOptions = {
  mode?: AverbacaoGatewayMode;
};

// =================================================================================================
// Erros tipados — AVERBACAO_*
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'Averbacao Gateway Error', detail, { code, ...(context ? { context } : {}) });
}

// =================================================================================================
// Estado do sandbox — STATEFUL EM MEMÓRIA POR PROCESSO (módulo-level, não por instância de
// gateway): um retry de job cria uma NOVA instância via `createAverbacaoGateway`, mas precisa
// enxergar o que uma tentativa anterior já gravou — daí o Map viver no escopo do módulo, não da
// fábrica (mesmo racional do `mockCiotStore`).
// =================================================================================================

type SandboxDeclarationRecord = {
  declarationRef: string;
  externalStatus: 'DECLARED' | 'RECTIFIED' | 'CANCELLED';
  raw: Record<string, unknown>;
};

const sandboxDeclarationStore = new Map<string, SandboxDeclarationRecord>();

/** Exposto só para testes — nenhum código de produção deve resetar o estado do "provedor". */
export function resetAverbacaoSandboxStoreForTests(): void {
  sandboxDeclarationStore.clear();
}

/** `declarationRef` determinístico a partir do marcador — mesmo marcador ⇒ mesmo ref, sempre. */
function deriveSandboxDeclarationRef(correlationMarker: string): string {
  let hash = 0;
  for (let i = 0; i < correlationMarker.length; i += 1) {
    hash = (hash * 31 + correlationMarker.charCodeAt(i)) >>> 0;
  }
  return `AVB${String(1_000_000_000 + (hash % 900_000_000))}`;
}

/** Centavos do valor (2 casas, half-up) — é o "dial" dos cenários do sandbox: `.99` rejeita, `.98` perde a resposta. */
function extractCents(amount: number): number {
  const cents = Math.round(Math.abs(amount) * 100 + 1e-9);
  return cents % 100;
}

async function sandboxJitter(): Promise<void> {
  // Jitter mínimo — mantém o shape "assíncrono" sem serializar testes (padrão `mockJitter` do CIOT).
  await delay(0);
}

function requireExistingSandboxRecord(correlationMarker: string, action: string): SandboxDeclarationRecord {
  const existing = sandboxDeclarationStore.get(correlationMarker);
  if (!existing) {
    throw gatewayError(
      404,
      'AVERBACAO_NOT_FOUND_TEST',
      `Nenhuma averbação registrada sob o marcador "${correlationMarker}" para ${action}.`,
      { correlationMarker, action }
    );
  }
  return existing;
}

function throwLostResponse(action: string, correlationMarker: string): never {
  throw gatewayError(
    504,
    'AVERBACAO_LOST_RESPONSE_TEST',
    `Simulação de resposta perdida (${action}) para o marcador "${correlationMarker}" — a seguradora `
      + 'processou a operação, mas esta chamada nunca vê a confirmação.',
    { correlationMarker, action }
  );
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createAverbacaoGateway(options: CreateAverbacaoGatewayOptions = {}): AverbacaoGateway {
  const mode = options.mode ?? config.averbacaoGatewayMode;

  if (mode === 'off') {
    throw gatewayError(
      501,
      'AVERBACAO_GATEWAY_DISABLED',
      'Averbação eletrônica desligada (AVERBACAO_GATEWAY_MODE=off) — nenhuma seguradora/averbadora '
        + 'integrada ([EXTERNAL DEPENDENCY], mesmo racional da pendência P8 dos seguros). '
        + 'Use AVERBACAO_GATEWAY_MODE=sandbox para o ciclo determinístico local.',
      { code: 'AVERBACAO_GATEWAY_DISABLED' }
    );
  }

  async function declareShipment(payload: AverbacaoDeclarePayload): Promise<AverbacaoDeclareResult> {
    await sandboxJitter();

    const cents = extractCents(payload.cargoAmount);

    // Recusa DEFINITIVA da seguradora — decisão de negócio conhecida, devolvida como OUTCOME (nunca
    // exceção): o job marca `rejected` diretamente, sem passar pela topologia de resposta perdida.
    if (cents === 99) {
      return {
        outcome: 'rejected',
        declarationRef: null,
        raw: {
          reasonCode: 'AVERBACAO_REJECTED_TEST',
          message: 'Seguradora (sandbox) recusou a declaração: cenário determinístico de rejeição (centavos .99).',
          correlationMarker: payload.correlationMarker,
          cargoAmount: payload.cargoAmount
        }
      };
    }

    const existing = sandboxDeclarationStore.get(payload.correlationMarker);
    const record: SandboxDeclarationRecord = existing ?? {
      declarationRef: deriveSandboxDeclarationRef(payload.correlationMarker),
      externalStatus: 'DECLARED',
      raw: {
        correlationMarker: payload.correlationMarker,
        policyType: payload.policyType,
        policyNumber: payload.policyNumber,
        cargoAmount: payload.cargoAmount,
        routeScope: payload.routeScope,
        operationRef: payload.operationRef,
        declaredAt: new Date().toISOString()
      }
    };
    sandboxDeclarationStore.set(payload.correlationMarker, record);

    // DL-102: o store JÁ FOI escrito — o "provedor" processou; só a resposta se perde.
    if (cents === 98) throwLostResponse('declareShipment', payload.correlationMarker);

    return { outcome: 'declared', declarationRef: record.declarationRef, raw: record.raw };
  }

  async function rectifyShipment(payload: AverbacaoRectifyPayload): Promise<AverbacaoMutationResult> {
    await sandboxJitter();

    const existing = requireExistingSandboxRecord(payload.correlationMarker, 'rectifyShipment');
    const record: SandboxDeclarationRecord = {
      ...existing,
      externalStatus: 'RECTIFIED',
      raw: {
        ...existing.raw,
        cargoAmount: payload.cargoAmount,
        rectifiedAt: new Date().toISOString(),
        reason: payload.reason ?? null
      }
    };
    sandboxDeclarationStore.set(payload.correlationMarker, record);

    if (extractCents(payload.cargoAmount) === 98) throwLostResponse('rectifyShipment', payload.correlationMarker);

    return { outcome: 'rectified', declarationRef: record.declarationRef, raw: record.raw };
  }

  async function cancelShipment(payload: AverbacaoCancelPayload): Promise<AverbacaoMutationResult> {
    await sandboxJitter();

    const existing = requireExistingSandboxRecord(payload.correlationMarker, 'cancelShipment');
    const record: SandboxDeclarationRecord = {
      ...existing,
      externalStatus: 'CANCELLED',
      raw: { ...existing.raw, cancelledAt: new Date().toISOString(), reason: payload.reason ?? null }
    };
    sandboxDeclarationStore.set(payload.correlationMarker, record);

    return { outcome: 'cancelled', declarationRef: record.declarationRef, raw: record.raw };
  }

  return {
    mode,
    declareShipment,
    rectifyShipment,
    cancelShipment,
    async queryByMarker({ correlationMarker }): Promise<AverbacaoQueryResult> {
      await sandboxJitter();
      const existing = sandboxDeclarationStore.get(correlationMarker);
      if (!existing) return { found: false };
      return { found: true, declarationRef: existing.declarationRef, externalStatus: existing.externalStatus, raw: existing.raw };
    }
  };
}
