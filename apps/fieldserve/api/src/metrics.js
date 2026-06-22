// metrics.js — observabilidade por padrão (bloco observabilidade): métricas Prometheus numa porta
// dedicada FORA do Traefik (:9464). Séries de domínio fieldserve_* + métricas default do prom-client.
import http from 'node:http';
import client from 'prom-client';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'fieldserve_' });

export const M = {
  ordersTotal: new client.Counter({ name: 'fieldserve_orders_total', help: 'ordens por desfecho', labelNames: ['outcome'], registers: [registry] }),
  submitTotal: new client.Counter({ name: 'fieldserve_submit_total', help: 'submissões enfileiradas', registers: [registry] }),
  jobsTotal: new client.Counter({ name: 'fieldserve_jobs_total', help: 'jobs processados por status', labelNames: ['status'], registers: [registry] }),
  jobDuration: new client.Histogram({ name: 'fieldserve_job_duration_seconds', help: 'duração do processamento do job', buckets: [0.05, 0.1, 0.3, 1, 3, 10], registers: [registry] }),
  gatewayCalls: new client.Counter({ name: 'fieldserve_gateway_calls_total', help: 'chamadas ao gateway externo por desfecho', labelNames: ['outcome'], registers: [registry] }),
  queueDepth: new client.Gauge({ name: 'fieldserve_queue_depth', help: 'jobs na fila por status', labelNames: ['status'], registers: [registry] }),
  httpErrors: new client.Counter({ name: 'fieldserve_http_errors_total', help: 'erros HTTP da API', registers: [registry] }),
};

export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); }
    else { res.statusCode = 404; res.end('not found'); }
  });
  srv.listen(port, () => console.log(`[metrics] /metrics em :${port}`));
  return srv;
}
