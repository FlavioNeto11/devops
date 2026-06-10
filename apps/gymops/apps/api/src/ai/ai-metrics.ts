// Métricas Prometheus da camada de IA (F0 da re-engenharia — plano "Re-engenharia
// da camada de IA"). Métricas canônicas ai_* vêm do @flavioneto11/ai-core; o
// kube-prometheus-stack raspa via ServiceMonitor na porta dedicada METRICS_PORT
// (9464) — NUNCA exposta pelo Traefik (o /gymops/api público não a alcança).
import http from 'node:http';
import promClient from 'prom-client';
import { createAiMetrics } from '@flavioneto11/ai-core';

promClient.collectDefaultMetrics();

/** Métricas ai_* (latência, tokens, custo, tools, erros, judge, escalation). */
export const aiMetrics = createAiMetrics({ promClient, app: 'gymops' });

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
