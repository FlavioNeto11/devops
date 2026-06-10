// Métricas Prometheus da camada de IA (F0 da re-engenharia — plataforma de IA).
// Métricas canônicas ai_* vêm do @flavioneto11/ai-core; o kube-prometheus-stack
// raspa via ServiceMonitor na porta dedicada METRICS_PORT (9464) — nunca roteada
// pelo Traefik (o /sicat/api público não a alcança). Telemetria jamais derruba a API.
import http from 'node:http';
import promClient from 'prom-client';
import { createAiMetrics } from '@flavioneto11/ai-core';

promClient.collectDefaultMetrics();

/** Métricas ai_* (latência, tokens, custo, tools, erros, judge, escalation). */
export const aiMetrics = createAiMetrics({ promClient, app: 'sicat' });

let server: http.Server | null = null;

/** Sobe o /metrics numa porta separada (idempotente; chamado por api e worker). */
export function startAiMetricsServer(): void {
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
  server.on('error', (err) => console.warn('[metrics] server error:', (err as Error).message));
  server.listen(port, () => console.log(`[metrics] Prometheus /metrics on :${port}`));
}
