// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.
import http from 'node:http';
import client from 'prom-client';
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'stockpilot_' });
export const M = {
  recordsTotal: new client.Counter({ name: 'stockpilot_records_total', help: 'records por desfecho', labelNames: ['outcome'], registers: [registry] }),
  jobsTotal: new client.Counter({ name: 'stockpilot_jobs_total', help: 'jobs por status', labelNames: ['status'], registers: [registry] }),
  jobDuration: new client.Histogram({ name: 'stockpilot_job_duration_seconds', help: 'duração do job', buckets: [0.05,0.1,0.3,1,3,10], registers: [registry] }),
  gatewayCalls: new client.Counter({ name: 'stockpilot_gateway_calls_total', help: 'chamadas ao gateway', labelNames: ['outcome'], registers: [registry] }),
  queueDepth: new client.Gauge({ name: 'stockpilot_queue_depth', help: 'jobs na fila', labelNames: ['status'], registers: [registry] }),
  httpErrors: new client.Counter({ name: 'stockpilot_http_errors_total', help: 'erros HTTP', registers: [registry] }),
};
export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); }
    else { res.statusCode = 404; res.end('not found'); }
  });
  srv.listen(port, () => console.log('[metrics] :' + port));
  return srv;
}