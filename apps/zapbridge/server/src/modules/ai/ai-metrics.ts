// =============================================================================
// Métricas Prometheus da camada de IA (porta dedicada METRICS_PORT, default 9464).
// As métricas canônicas ai_* vêm do @flavioneto11/ai-core; o kube-prometheus-stack
// raspa via ServiceMonitor nessa porta — NUNCA roteada pelo Traefik (o /zapbridge/api
// público não a alcança). Telemetria jamais derruba o app.
//
// Como o ai-core é ESM-only e este backend é CJS, `createAiMetrics` é carregado lazy.
// Antes da inicialização, getAiMetrics() devolve um no-op (a camada de IA pode chamar
// addTokens/observeTurn sem crashar).
// =============================================================================
import http from 'node:http';
import promClient from 'prom-client';
import { env } from '../../config/env';
import { loadAiCore } from './ai-core-loader';

// Interface estrutural espelhando a AiMetrics do ai-core (evita acoplar tipos ESM ao CJS).
export interface AiMetricsLike {
  enabled: boolean;
  observeTurn(stage: string, outcome: 'ok' | 'error', seconds: number): void;
  addTokens(model: string, inputTokens: number, outputTokens: number): void;
  addCost(model: string, usd: number): void;
  countToolCall(tool: string, outcome: string): void;
  countError(stage: string, code?: string): void;
  observeJudgeScore(dimension: string, score: number): void;
  countEscalation(reason: string): void;
  countFeedback(surface: string, kind: string): void;
}

const noop: AiMetricsLike = {
  enabled: false,
  observeTurn() {},
  addTokens() {},
  addCost() {},
  countToolCall() {},
  countError() {},
  observeJudgeScore() {},
  countEscalation() {},
  countFeedback() {},
};

let _metrics: AiMetricsLike = noop;

/** Métricas ativas (ou no-op antes da init). Usado por ai.service e pelo grafo. */
export function getAiMetrics(): AiMetricsLike {
  return _metrics;
}

let _started = false;
let _collected = false;

/** Inicializa as métricas ai_* e sobe o /metrics na porta dedicada (idempotente, fail-soft). */
export async function startAiMetricsServer(): Promise<void> {
  if (_started) return;
  _started = true;
  try {
    if (!_collected) {
      promClient.collectDefaultMetrics();
      _collected = true;
    }
    const { createAiMetrics } = await loadAiCore();
    _metrics = createAiMetrics({ promClient, app: 'zapbridge' }) as AiMetricsLike;
  } catch (e) {
    console.warn('[ai/metrics] init das métricas ai_* falhou:', (e as Error).message);
  }

  const port = env.ai.metricsPort;
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      promClient.register
        .metrics()
        .then((body) => {
          res.setHeader('Content-Type', promClient.register.contentType);
          res.end(body);
        })
        .catch(() => {
          res.statusCode = 500;
          res.end();
        });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.on('error', (err) => console.warn('[ai/metrics] server error:', (err as Error).message));
  server.listen(port, () => console.log(`[ai/metrics] Prometheus /metrics on :${port}`));
}
