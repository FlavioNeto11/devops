// Métricas Prometheus da camada de IA (F0 da re-engenharia — plano "Re-engenharia
// da camada de IA"). Métricas canônicas ai_* vêm do @flavioneto11/ai-core; o
// kube-prometheus-stack raspa via ServiceMonitor na porta dedicada METRICS_PORT
// (9464) — NUNCA exposta pelo Traefik (o /gymops/api público não a alcança).
import http from 'node:http';
import promClient from 'prom-client';
import { createAiMetrics, type AiMetrics } from '@flavioneto11/ai-core';

// BUG-013: o vitest (pool forks + singleFork) re-avalia este módulo a cada arquivo
// de teste no MESMO processo, mas o prom-client (node_modules, não isolado) mantém
// o registry global — re-registrar lançava "metric already registered" e derrubava
// a coleta da suite. Guard idempotente: registra só na primeira avaliação e cacheia
// o objeto de métricas em globalThis; em produção o módulo é avaliado uma única
// vez, então o comportamento de runtime é INALTERADO.
const globalCache = globalThis as typeof globalThis & { __gymopsAiMetrics?: AiMetrics };

if (!promClient.register.getSingleMetric('process_cpu_user_seconds_total')) {
  promClient.collectDefaultMetrics();
}

/** Métricas ai_* (latência, tokens, custo, tools, erros, judge, escalation). */
export const aiMetrics: AiMetrics =
  globalCache.__gymopsAiMetrics ??
  (globalCache.__gymopsAiMetrics = createAiMetrics({ promClient, app: 'gymops' }));

let server: http.Server | null = null;

/** Sobe o endpoint /metrics numa porta separada (idempotente; nunca derruba a API). */
export function startMetricsServer(): void {
  if (server) return;
  const port = Number(process.env.METRICS_PORT || 9464);
  server = http.createServer((req, res) => {
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
  server.on('error', (err) => console.warn('[metrics] server error:', err.message));
  server.listen(port, () => console.info(`[metrics] Prometheus /metrics on :${port}`));
}
