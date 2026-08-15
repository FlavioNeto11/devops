/**
 * Gateway do Regulatory Watch (PR-H1, DL-103) — única camada autorizada a baixar o conteúdo de uma
 * `source_url` (`regulatory_sources`, migration 021); rotas/serviços/worker nunca chamam `fetch`
 * diretamente para um portal normativo (mesmo padrão de `antt-rntrc-gateway.ts`/`cetesb-gateway.js`).
 *
 * ── O que este gateway PROVA e o que ele NÃO prova ─────────────────────────────────────────────────
 * A verificação REAL possível hoje é DETECÇÃO DE MUDANÇA — baixar a URL e comparar hash/etag/
 * last-modified contra o que já se conhecia. Isto NUNCA é interpretação jurídica do conteúdo (essa
 * responsabilidade é humana, opcionalmente assistida por um resumo de IA — ver
 * `transport-regulatory-watch-service.ts`). `fetchSource` devolve o fato bruto; quem decide o que
 * fazer com ele é o chamador.
 *
 * ── Modo `off` (default) — NO-OP LIMPO, nunca falha ────────────────────────────────────────────────
 * Ao contrário dos demais gateways da vertical (`dfe-issuance-gateway.ts`/`ciot-provider-gateway.ts`),
 * que RECUSAM (fail-closed) chamadas em modo desligado, este gateway devolve
 * `{ skipped: true, reason: 'watch_mode_off' }` sem tocar a rede e SEM lançar — a regra de ouro do
 * programa é "a máquina nunca ativa regra bloqueante sozinha", não "a máquina trava sem avisar";
 * verificar uma fonte é uma operação de LEITURA sem efeito colateral em produção, então desligar o
 * modo não deveria transformar um disparo manual (`POST .../watch/verificar-agora`) num erro 5xx.
 *
 * ── Modo `live` ────────────────────────────────────────────────────────────────────────────────────
 * GET real com timeout curto e User-Agent identificado (portais governamentais costumam
 * bloquear/registrar clientes anônimos). Resposta não-2xx vira erro RETRYABLE (mesma classificação
 * por status de `lib/retry.ts`). Resposta 2xx: calcula sha256 do corpo, compara com `previousHash`
 * (o `source_hash` conhecido) — só grava o corpo em `STORAGE_DIR/regulatory-watch/<hash>` quando o
 * hash MUDOU (ou é a primeira verificação da fonte); hash igual não grava nada (a fonte não mudou,
 * não há conteúdo novo a preservar).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { AppError } from '../lib/problem.js';
import { ensureDir, resolveStoragePath } from '../lib/files.js';
import { config, type RegulatoryWatchMode } from '../lib/config.js';

export type { RegulatoryWatchMode };

export type RegulatoryWatchGatewayExchange = {
  request: {
    httpMethod: string;
    endpoint: string;
    sanitizedHeaders?: Record<string, unknown>;
  };
  response: {
    httpMethod: string;
    endpoint: string;
    httpStatus: number | null;
    latencyMs: number | null;
    sanitizedHeaders?: Record<string, unknown>;
  };
};

export type RegulatoryWatchFetchInput = {
  url: string;
  /** `source_hash` conhecido hoje — `null`/`undefined` = primeira verificação desta fonte. */
  previousHash?: string | null;
};

export type RegulatoryWatchFetchResult =
  | { skipped: true; reason: 'watch_mode_off' }
  | {
      skipped: false;
      /** `false` quando o hash bate com `previousHash` — a fonte NÃO mudou. */
      changed: boolean;
      httpStatus: number;
      contentHash: string;
      etag: string | null;
      lastModified: string | null;
      /** Preenchido só quando `changed=true` — ponteiro para `STORAGE_DIR/regulatory-watch/`. */
      contentRef: string | null;
      exchange: RegulatoryWatchGatewayExchange;
    };

export interface RegulatoryWatchGateway {
  mode: RegulatoryWatchMode;
  fetchSource(input: RegulatoryWatchFetchInput): Promise<RegulatoryWatchFetchResult>;
}

export type CreateRegulatoryWatchGatewayOptions = {
  mode?: RegulatoryWatchMode;
  timeoutMs?: number;
  userAgent?: string;
};

const REGULATORY_WATCH_STORAGE_DIRNAME = 'regulatory-watch';

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'Regulatory Watch Gateway Error', detail, { code, ...(context ? { context } : {}) });
}

function computeContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function persistContent(hash: string, buffer: Buffer): Promise<string> {
  const dir = resolveStoragePath(REGULATORY_WATCH_STORAGE_DIRNAME);
  await ensureDir(dir);
  const filePath = resolveStoragePath(REGULATORY_WATCH_STORAGE_DIRNAME, `${hash}.bin`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export function createRegulatoryWatchGateway(options: CreateRegulatoryWatchGatewayOptions = {}): RegulatoryWatchGateway {
  const mode = options.mode ?? config.regulatoryWatchMode;
  const timeoutMs = options.timeoutMs ?? config.regulatoryWatchGatewayTimeoutMs;
  const userAgent = options.userAgent ?? config.regulatoryWatchUserAgent;

  async function fetchSource(input: RegulatoryWatchFetchInput): Promise<RegulatoryWatchFetchResult> {
    if (mode === 'off') {
      return { skipped: true, reason: 'watch_mode_off' };
    }

    const url = String(input.url || '').trim();
    if (!url) {
      throw gatewayError(400, 'REGULATORY_WATCH_GATEWAY_INVALID_URL', 'fetchSource exige url não vazia.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xml,application/xhtml+xml,*/*' }
      });
      const latencyMs = Date.now() - startedAt;

      const exchange: RegulatoryWatchGatewayExchange = {
        request: { httpMethod: 'GET', endpoint: url, sanitizedHeaders: { 'user-agent': userAgent } },
        response: {
          httpMethod: 'GET',
          endpoint: url,
          httpStatus: response.status,
          latencyMs,
          sanitizedHeaders: {
            etag: response.headers.get('etag'),
            'last-modified': response.headers.get('last-modified'),
            'content-type': response.headers.get('content-type')
          }
        }
      };

      if (!response.ok) {
        throw gatewayError(
          502,
          'REGULATORY_WATCH_GATEWAY_HTTP_ERROR',
          `Fonte normativa respondeu ${response.status} para ${url}.`,
          { remoteStatus: response.status, url }
        );
      }

      const body = Buffer.from(await response.arrayBuffer());
      const contentHash = computeContentHash(body);
      const previousHash = input.previousHash ?? null;
      const changed = previousHash == null || previousHash !== contentHash;

      const contentRef = changed ? await persistContent(contentHash, body) : null;

      return {
        skipped: false,
        changed,
        httpStatus: response.status,
        contentHash,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        contentRef,
        exchange
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (isAbort) {
        throw gatewayError(504, 'REGULATORY_WATCH_GATEWAY_TIMEOUT', `Timeout (${timeoutMs}ms) consultando fonte normativa (${url}).`, { url });
      }
      throw gatewayError(
        502,
        'REGULATORY_WATCH_GATEWAY_NETWORK_ERROR',
        `Falha de rede consultando fonte normativa (${url}): ${error instanceof Error ? error.message : String(error)}.`,
        { url }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { mode, fetchSource };
}
