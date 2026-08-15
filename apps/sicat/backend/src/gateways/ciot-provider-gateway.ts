/**
 * Gateway do provedor de CIOT (PR-C2, DL-103) — camada ÚNICA autorizada a "falar" com o provedor de
 * CIOT; serviços/worker nunca chamam a interface do provedor diretamente.
 *
 * NÃO EXISTE PROVEDOR CONTRATADO ([EXTERNAL DEPENDENCY] P5 do guia do programa — credenciamento/
 * homologação de instituição habilitada ANTT/Bacen ainda pendente do operador). Este arquivo declara
 * a interface ABSTRATA que qualquer provedor real implementaria e entrega hoje só `mode: 'mock'` —
 * um sandbox determinístico e STATEFUL EM MEMÓRIA POR PROCESSO, suficiente para o ciclo completo
 * (pré-validação → solicitação → registro → retificação → cancelamento → encerramento) nascer
 * testável sem depender de P5. `mode: 'real'` existe na assinatura para a interface já nascer
 * pronta, mas `createCiotProviderGateway({mode:'real'})` recusa com `CIOT_PROVIDER_NOT_CONFIGURED`.
 *
 * ── Padrão DL-102 aplicado ao domínio CIOT ────────────────────────────────────────────────────────
 * O número do CIOT nasce na RESPOSTA — nenhum identificador nosso viaja no request. `queryCiotByMarker`
 * é a "pergunta ao provedor" que o reconciliador (`services/transport-ciot-reconciler.ts`) faz quando
 * uma resposta se perde: o mock responde por essa pergunta consultando o MESMO Map que `registerCiot`/
 * `rectifyCiot`/`cancelCiot`/`closeCiot` escrevem, chaveado pelo `correlationMarker` que o service
 * grava ANTES de qualquer chamada (`lib/transport/ciot-correlation.ts`).
 *
 * ── Estratégia `mock` — determinística ────────────────────────────────────────────────────────────
 * - `registerCiot`: `freightAmount < 100` → rejeita com `CIOT_PROVIDER_REJECTED_TEST` (cenário de
 *   rejeição do provedor, testável sem depender de heurística de rede). Caso contrário, gera um
 *   número de CIOT determinístico a partir do `correlationMarker` e grava no Map — uma SEGUNDA
 *   chamada com o MESMO marcador (retry de job após falha transitória) é IDEMPOTENTE: devolve o
 *   MESMO número, nunca cria um segundo registro (o requisito central de não duplicar efeito
 *   externo em reprocessamento de job).
 * - `testFlags.simulateLostResponse: true` (qualquer operação): a operação AINDA É aplicada no Map
 *   (o "provedor" processou de verdade) mas o método LANÇA um erro de timeout — é o cenário DL-102
 *   por excelência: dispatch aconteceu, resposta se perdeu, e só `queryCiotByMarker` (via
 *   reconciliador) descobre o que aconteceu de verdade.
 * - `queryCiotByMarker`: consulta pura do Map — nunca lança, sempre `{found, ...}`.
 */

import { AppError } from '../lib/problem.js';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../lib/config.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type CiotProviderGatewayMode = 'mock' | 'real';

export type CiotPartySnapshot = {
  role: string;
  document: string | null;
  legalName?: string | null;
};

export type CiotRegisterPayload = {
  /** Marcador DL-102 — gravado pelo service ANTES da chamada; chave de correlação no provedor. */
  correlationMarker: string;
  operationId: string;
  parties: CiotPartySnapshot[];
  cargo: { cargoType: string; weightKg: number | null }[];
  route: { originUf: string; destinationUf: string } | null;
  freight: { offeredAmount: number | null; contractedAmount: number | null };
  payment: { method: string | null; termDays: number | null };
  /** Só usado em `mode: 'mock'` — nunca chega perto de um provedor real. */
  testFlags?: { simulateLostResponse?: boolean };
};

export type CiotMutationPayload = {
  correlationMarker: string;
  ciotNumber?: string | null;
  reason?: string | null;
  testFlags?: { simulateLostResponse?: boolean };
};

export type CiotProviderResult = {
  ciotNumber: string;
  externalStatus: 'REGISTERED' | 'RECTIFIED' | 'CANCELLED' | 'CLOSED';
  raw: Record<string, unknown>;
};

export type CiotQueryResult =
  | { found: true; ciotNumber: string; externalStatus: string; raw: Record<string, unknown> }
  | { found: false };

export type CiotProviderGateway = {
  mode: CiotProviderGatewayMode;
  registerCiot(payload: CiotRegisterPayload): Promise<CiotProviderResult>;
  rectifyCiot(payload: CiotMutationPayload): Promise<CiotProviderResult>;
  cancelCiot(payload: CiotMutationPayload): Promise<CiotProviderResult>;
  closeCiot(payload: CiotMutationPayload): Promise<CiotProviderResult>;
  queryCiotByMarker(args: { correlationMarker: string }): Promise<CiotQueryResult>;
};

export type CreateCiotProviderGatewayOptions = {
  mode?: CiotProviderGatewayMode;
  /** Mínimo aceito pelo provedor mock antes de rejeitar — testável, não é regra de negócio real. */
  minAcceptedFreightAmount?: number;
};

// =================================================================================================
// Erros tipados — CIOT_PROVIDER_*
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'CIOT Provider Error', detail, { code, ...(context ? { context } : {}) });
}

// =================================================================================================
// Estado do mock — STATEFUL EM MEMÓRIA POR PROCESSO (módulo-level, não por instância de gateway):
// um retry de job cria uma NOVA instância via `createCiotProviderGateway`, mas precisa enxergar o
// que uma tentativa anterior já gravou — daí o Map viver no escopo do módulo, não da fábrica.
// =================================================================================================

type MockCiotRecord = {
  ciotNumber: string;
  externalStatus: CiotProviderResult['externalStatus'];
  raw: Record<string, unknown>;
};

const mockCiotStore = new Map<string, MockCiotRecord>();

/** Exposto só para testes — nenhum código de produção deve resetar o estado do provedor "real". */
export function resetCiotProviderMockStoreForTests(): void {
  mockCiotStore.clear();
}

const DEFAULT_MIN_ACCEPTED_FREIGHT_AMOUNT = 100;

/** Número determinístico a partir do marcador — mesmo marcador ⇒ mesmo número, sempre. */
function deriveMockCiotNumber(correlationMarker: string): string {
  let hash = 0;
  for (let i = 0; i < correlationMarker.length; i += 1) {
    hash = (hash * 31 + correlationMarker.charCodeAt(i)) >>> 0;
  }
  return String(1_000_000_000 + (hash % 900_000_000));
}

async function mockJitter(): Promise<void> {
  // Jitter mínimo — mantém o shape "assíncrono" sem serializar testes uns atrás dos outros (mesmo
  // padrão de `antt-rntrc-gateway.ts#lookupMock`).
  await delay(0);
}

function requireExistingMockRecord(correlationMarker: string, action: string): MockCiotRecord {
  const existing = mockCiotStore.get(correlationMarker);
  if (!existing) {
    throw gatewayError(
      404,
      'CIOT_PROVIDER_NOT_FOUND_TEST',
      `Nenhum CIOT registrado sob o marcador "${correlationMarker}" para ${action}.`,
      { correlationMarker, action }
    );
  }
  return existing;
}

function throwIfLostResponse(testFlags: CiotMutationPayload['testFlags'] | undefined, action: string, correlationMarker: string): void {
  if (!testFlags?.simulateLostResponse) return;
  throw gatewayError(
    504,
    'CIOT_PROVIDER_LOST_RESPONSE_TEST',
    `Simulação de resposta perdida (${action}) para o marcador "${correlationMarker}" — o provedor `
      + 'processou a operação, mas esta chamada nunca vê a confirmação.',
    { correlationMarker, action }
  );
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createCiotProviderGateway(options: CreateCiotProviderGatewayOptions = {}): CiotProviderGateway {
  const mode = options.mode ?? config.ciotProviderMode;
  const minAcceptedFreightAmount = options.minAcceptedFreightAmount ?? DEFAULT_MIN_ACCEPTED_FREIGHT_AMOUNT;

  if (mode === 'real') {
    throw gatewayError(
      501,
      'CIOT_PROVIDER_NOT_CONFIGURED',
      'Nenhum provedor de CIOT contratado/homologado (instituição habilitada ANTT/Bacen) — '
        + 'pendência [EXTERNAL DEPENDENCY] P5 do guia do programa (docs/30-transporte/transporte-guia.md). '
        + 'Use CIOT_PROVIDER_MODE=mock enquanto P5 não é resolvida pelo operador.',
      { code: 'CIOT_PROVIDER_NOT_CONFIGURED' }
    );
  }

  async function registerCiot(payload: CiotRegisterPayload): Promise<CiotProviderResult> {
    await mockJitter();

    const freightAmount = payload.freight.contractedAmount ?? payload.freight.offeredAmount ?? 0;
    if (freightAmount < minAcceptedFreightAmount) {
      throw gatewayError(
        422,
        'CIOT_PROVIDER_REJECTED_TEST',
        `Provedor CIOT (mock) rejeitou a solicitação: frete (${freightAmount}) abaixo do mínimo `
          + `aceito pelo provedor (${minAcceptedFreightAmount}).`,
        { correlationMarker: payload.correlationMarker, freightAmount, minAcceptedFreightAmount }
      );
    }

    const existing = mockCiotStore.get(payload.correlationMarker);
    const record: MockCiotRecord = existing ?? {
      ciotNumber: deriveMockCiotNumber(payload.correlationMarker),
      externalStatus: 'REGISTERED',
      raw: {
        correlationMarker: payload.correlationMarker,
        operationId: payload.operationId,
        registeredAt: new Date().toISOString()
      }
    };
    mockCiotStore.set(payload.correlationMarker, record);

    throwIfLostResponse(payload.testFlags, 'registerCiot', payload.correlationMarker);

    return { ciotNumber: record.ciotNumber, externalStatus: record.externalStatus, raw: record.raw };
  }

  async function applyMutation(
    payload: CiotMutationPayload,
    action: string,
    nextStatus: CiotProviderResult['externalStatus']
  ): Promise<CiotProviderResult> {
    await mockJitter();

    const existing = requireExistingMockRecord(payload.correlationMarker, action);
    const record: MockCiotRecord = {
      ...existing,
      externalStatus: nextStatus,
      raw: { ...existing.raw, [`${action}At`]: new Date().toISOString(), reason: payload.reason ?? null }
    };
    mockCiotStore.set(payload.correlationMarker, record);

    throwIfLostResponse(payload.testFlags, action, payload.correlationMarker);

    return { ciotNumber: record.ciotNumber, externalStatus: record.externalStatus, raw: record.raw };
  }

  return {
    mode,
    registerCiot,
    rectifyCiot: (payload) => applyMutation(payload, 'rectifyCiot', 'RECTIFIED'),
    cancelCiot: (payload) => applyMutation(payload, 'cancelCiot', 'CANCELLED'),
    closeCiot: (payload) => applyMutation(payload, 'closeCiot', 'CLOSED'),
    async queryCiotByMarker({ correlationMarker }): Promise<CiotQueryResult> {
      await mockJitter();
      const existing = mockCiotStore.get(correlationMarker);
      if (!existing) return { found: false };
      return { found: true, ciotNumber: existing.ciotNumber, externalStatus: existing.externalStatus, raw: existing.raw };
    }
  };
}
