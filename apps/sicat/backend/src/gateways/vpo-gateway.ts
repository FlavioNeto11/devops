/**
 * Gateway do provedor de VPO (PR-D1, DL-103) — camada ÚNICA autorizada a "falar" com uma fornecedora
 * de VPO; serviços/worker nunca chamam a interface do provedor diretamente.
 *
 * NÃO EXISTE FORNECEDORA DE VPO INTEGRADA ([EXTERNAL DEPENDENCY] P6 do guia do programa — o
 * cadastro de fornecedoras habilitadas é CONFIGURÁVEL, `vpo_providers`/`load-vpo-providers.js`, mas
 * nenhuma integração técnica com uma delas existe ainda). Este arquivo declara a interface ABSTRATA
 * que qualquer fornecedora real implementaria e entrega hoje só `mode: 'mock'` — um sandbox
 * determinístico e STATEFUL EM MEMÓRIA POR PROCESSO, réplica DELIBERADA da estratégia de
 * `gateways/ciot-provider-gateway.ts` (NÃO reuso — bounded context próprio, sem import cruzado).
 *
 * ── Padrão DL-102 aplicado ao domínio VPO (decisão do PR-D1) ──────────────────────────────────────
 * A referência remota do VPO (`providerReference`) nasce na RESPOSTA — nenhum identificador nosso
 * viaja no request. `queryVpoByMarker` é a "pergunta ao provedor" que o reconciliador
 * (`services/vpo-reconciler.ts`) faz quando uma resposta se perde: o mock responde consultando o
 * MESMO Map que `acquireVpo` escreve, chaveado pelo `correlationMarker` que o service grava ANTES
 * de qualquer chamada (`lib/transport/vpo-correlation.ts`).
 *
 * ── Estratégia `mock` — determinística ────────────────────────────────────────────────────────────
 * - `acquireVpo`: o valor do VPO é CALCULADO pelo provedor a partir da rota (é assim no mundo real —
 *   o valor nasce de pedágios ao longo do trajeto, nunca é um input do cliente). Sem `route`/
 *   `distanceKm` válidos, o mock REJEITA com `VPO_PROVIDER_REJECTED_TEST` (cenário de rejeição
 *   testável sem depender de heurística de rede — mesmo papel do "frete abaixo do mínimo" no mock
 *   do CIOT). Caso contrário, calcula um valor determinístico (`VPO_MOCK_RATE_PER_KM_CENTS`, tarifa
 *   de SANDBOX — nunca uma tarifa real) e gera uma referência determinística a partir do
 *   `correlationMarker`, gravando no Map — uma SEGUNDA chamada com o MESMO marcador (retry de job
 *   após falha transitória) é IDEMPOTENTE: devolve a MESMA referência/valor, nunca "adquire" duas
 *   vezes.
 * - `testFlags.simulateLostResponse: true`: a operação AINDA É aplicada no Map (o "provedor"
 *   processou de verdade) mas o método LANÇA um erro de timeout — cenário DL-102: dispatch
 *   aconteceu, resposta se perdeu, e só `queryVpoByMarker` (via reconciliador) descobre o que
 *   aconteceu de verdade.
 * - `queryVpoByMarker`: consulta pura do Map — nunca lança, sempre `{found, ...}`.
 */

import { AppError } from '../lib/problem.js';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../lib/config.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type VpoProviderGatewayMode = 'mock' | 'real';

export type VpoAcquirePayload = {
  /** Marcador DL-102 — gravado pelo service ANTES da chamada; chave de correlação no provedor. */
  correlationMarker: string;
  operationId: string;
  providerId: string;
  route: { originUf: string; destinationUf: string; distanceKm: number | null } | null;
  /** Só usado em `mode: 'mock'` — nunca chega perto de um provedor real. */
  testFlags?: { simulateLostResponse?: boolean };
};

export type VpoProviderResult = {
  providerReference: string;
  amount: number;
  raw: Record<string, unknown>;
};

export type VpoQueryResult =
  | { found: true; providerReference: string; amount: number; raw: Record<string, unknown> }
  | { found: false };

export type VpoProviderGateway = {
  mode: VpoProviderGatewayMode;
  acquireVpo(payload: VpoAcquirePayload): Promise<VpoProviderResult>;
  queryVpoByMarker(args: { correlationMarker: string }): Promise<VpoQueryResult>;
};

export type CreateVpoProviderGatewayOptions = {
  mode?: VpoProviderGatewayMode;
};

// =================================================================================================
// Erros tipados — VPO_PROVIDER_*
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'VPO Provider Error', detail, { code, ...(context ? { context } : {}) });
}

// =================================================================================================
// Estado do mock — STATEFUL EM MEMÓRIA POR PROCESSO (módulo-level, não por instância de gateway):
// um retry de job cria uma NOVA instância via `createVpoProviderGateway`, mas precisa enxergar o
// que uma tentativa anterior já gravou — daí o Map viver no escopo do módulo, não da fábrica.
// =================================================================================================

type MockVpoRecord = {
  providerReference: string;
  amount: number;
  raw: Record<string, unknown>;
};

const mockVpoStore = new Map<string, MockVpoRecord>();

/** Exposto só para testes — nenhum código de produção deve resetar o estado do provedor "real". */
export function resetVpoProviderMockStoreForTests(): void {
  mockVpoStore.clear();
}

/** Tarifa de SANDBOX (centavos por km) — nunca uma tarifa real de pedágio; só dá forma ao valor calculado. */
const VPO_MOCK_RATE_PER_KM_CENTS = 35;
const VPO_MOCK_MIN_AMOUNT = 20;

/** Referência determinística a partir do marcador — mesmo marcador ⇒ mesma referência, sempre. */
function deriveMockProviderReference(correlationMarker: string): string {
  let hash = 0;
  for (let i = 0; i < correlationMarker.length; i += 1) {
    hash = (hash * 31 + correlationMarker.charCodeAt(i)) >>> 0;
  }
  return `VPO${String(100000000 + (hash % 900000000))}`;
}

function deriveMockAmount(distanceKm: number): number {
  const raw = (distanceKm * VPO_MOCK_RATE_PER_KM_CENTS) / 100;
  return Math.max(Math.round(raw * 100) / 100, VPO_MOCK_MIN_AMOUNT);
}

async function mockJitter(): Promise<void> {
  // Jitter mínimo — mantém o shape "assíncrono" sem serializar testes uns atrás dos outros (mesmo
  // padrão de `ciot-provider-gateway.ts#mockJitter`).
  await delay(0);
}

function throwIfLostResponse(testFlags: VpoAcquirePayload['testFlags'] | undefined, action: string, correlationMarker: string): void {
  if (!testFlags?.simulateLostResponse) return;
  throw gatewayError(
    504,
    'VPO_PROVIDER_LOST_RESPONSE_TEST',
    `Simulação de resposta perdida (${action}) para o marcador "${correlationMarker}" — o provedor `
      + 'processou a operação, mas esta chamada nunca vê a confirmação.',
    { correlationMarker, action }
  );
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createVpoProviderGateway(options: CreateVpoProviderGatewayOptions = {}): VpoProviderGateway {
  const mode = options.mode ?? config.vpoProviderMode;

  if (mode === 'real') {
    throw gatewayError(
      501,
      'VPO_PROVIDER_NOT_CONFIGURED',
      'Nenhuma fornecedora de VPO integrada tecnicamente — pendência [EXTERNAL DEPENDENCY] P6 do '
        + 'guia do programa (docs/30-transporte/transporte-guia.md). O cadastro de fornecedoras '
        + 'habilitadas é configurável (`vpo_providers`, `npm run load:vpo-providers`), mas isso não '
        + 'implica integração técnica. Use VPO_PROVIDER_MODE=mock enquanto P6 não é resolvida pelo operador.',
      { code: 'VPO_PROVIDER_NOT_CONFIGURED' }
    );
  }

  async function acquireVpo(payload: VpoAcquirePayload): Promise<VpoProviderResult> {
    await mockJitter();

    const distanceKm = payload.route?.distanceKm ?? null;
    if (distanceKm == null || distanceKm <= 0) {
      throw gatewayError(
        422,
        'VPO_PROVIDER_REJECTED_TEST',
        'Provedor VPO (mock) rejeitou a solicitação: sem distância de rota válida para calcular o '
          + 'valor do pedágio.',
        { correlationMarker: payload.correlationMarker, distanceKm }
      );
    }

    const existing = mockVpoStore.get(payload.correlationMarker);
    const record: MockVpoRecord = existing ?? {
      providerReference: deriveMockProviderReference(payload.correlationMarker),
      amount: deriveMockAmount(distanceKm),
      raw: {
        correlationMarker: payload.correlationMarker,
        operationId: payload.operationId,
        providerId: payload.providerId,
        acquiredAt: new Date().toISOString()
      }
    };
    mockVpoStore.set(payload.correlationMarker, record);

    throwIfLostResponse(payload.testFlags, 'acquireVpo', payload.correlationMarker);

    return { providerReference: record.providerReference, amount: record.amount, raw: record.raw };
  }

  return {
    mode,
    acquireVpo,
    async queryVpoByMarker({ correlationMarker }): Promise<VpoQueryResult> {
      await mockJitter();
      const existing = mockVpoStore.get(correlationMarker);
      if (!existing) return { found: false };
      return { found: true, providerReference: existing.providerReference, amount: existing.amount, raw: existing.raw };
    }
  };
}
