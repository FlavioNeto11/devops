/**
 * HTTP dos adapters de provedor — com TETO DE TEMPO obrigatório.
 *
 * ┌─ POR QUE ISTO EXISTE ─────────────────────────────────────────────────────────────────────────┐
 * │ `fetch` do Node NÃO tem timeout. Um provedor que aceita a conexão TCP e nunca responde deixa a │
 * │ promise pendurada para sempre; no worker isso significa: o job continua `running`, o heartbeat │
 * │ de claim continua renovando o lease (o job NUNCA vira stale) e o consumidor — que é SERIAL —   │
 * │ para de puxar qualquer outra coisa. Enquanto `WORKER_LANE` não estiver aplicado no cluster     │
 * │ (`resolveWorkerLane()` devolve 'all' por default), esse mesmo worker é o que processa          │
 * │ `manifest.submit`: um travamento da Meta viraria parada de emissão de MTR.                     │
 * │                                                                                                │
 * │ O teto de turno (`withTurnTimeout`, 120 s) NÃO cobre isto — ele envolve só `processTurn`.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Módulo compartilhado (e não uma cópia em cada adapter) porque a parte sutil é o RECONHECIMENTO do
 * aborto: dependendo da versão do undici, o `fetch` abortado rejeita com o `reason` do sinal
 * (`DOMException` `TimeoutError`) ou com um `AbortError` próprio, e o aborto pode chegar aninhado em
 * `cause` quando estoura durante a leitura do corpo. Duplicar esse predicado é duplicar o risco de
 * uma cópia deixar de reconhecer um dos formatos e o timeout voltar a ser um erro genérico.
 */

import { config } from '../../../../lib/config.js';
import { AppError } from '../../../../lib/problem.js';

/** Erro estável de teto estourado. DISTINTO de `WHATSAPP_SEND_FAILED` (o provedor respondeu, com erro). */
export const WHATSAPP_PROVIDER_TIMEOUT_CODE = 'WHATSAPP_PROVIDER_TIMEOUT';

/**
 * `AbortSignal.timeout()` rejeita com `DOMException('…', 'TimeoutError')`; o undici pode traduzir para
 * `AbortError`/`ABORT_ERR` e, quando o estouro pega a leitura do corpo, embrulhar em `cause`.
 */
const ABORT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);
const ABORT_ERROR_CODES = new Set(['ABORT_ERR', 'ERR_CANCELED', 'UND_ERR_ABORTED']);
const MAX_CAUSE_DEPTH = 4;

export function isAbortTimeoutError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const candidate = current as { name?: unknown; code?: unknown; cause?: unknown };
    if (typeof candidate.name === 'string' && ABORT_ERROR_NAMES.has(candidate.name)) return true;
    if (typeof candidate.code === 'string' && ABORT_ERROR_CODES.has(candidate.code)) return true;
    current = candidate.cause;
  }
  return false;
}

export type ProviderCallKind = 'api' | 'upload';

/** O teto vem SEMPRE da config — nunca literal no adapter. Fallback só para valor inválido/zerado. */
export function resolveProviderTimeoutMs(kind: ProviderCallKind): number {
  const raw = kind === 'upload'
    ? Number(config.whatsappProviderUploadTimeoutMs)
    : Number(config.whatsappProviderTimeoutMs);

  if (Number.isFinite(raw) && raw > 0) return raw;
  return kind === 'upload' ? 30000 : 15000;
}

/**
 * Executa uma chamada ao provedor sob teto de tempo.
 *
 * O `signal` é entregue ao chamador (que o repassa ao `fetch`) e o try/catch envolve TAMBÉM a leitura
 * do corpo: um provedor que responde o cabeçalho e depois trava no corpo é o mesmo travamento.
 */
export async function withProviderTimeout<T>(
  context: { providerName: string; operation: string; kind?: ProviderCallKind },
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeoutMs = resolveProviderTimeoutMs(context.kind || 'api');

  try {
    return await run(AbortSignal.timeout(timeoutMs));
  } catch (error) {
    if (!isAbortTimeoutError(error)) throw error;

    throw new AppError(
      504,
      'Gateway Timeout',
      `Provedor WhatsApp (${context.providerName}) não respondeu em ${timeoutMs} ms na operação ${context.operation}.`,
      { code: WHATSAPP_PROVIDER_TIMEOUT_CODE }
    );
  }
}
