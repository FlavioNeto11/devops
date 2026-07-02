// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.
import http from 'node:http';
import client from 'prom-client';
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'contaviva_pro_' });
export const M = { recordsTotal: new client.Counter({ name: 'contaviva_pro_records_total', help: 'records', labelNames: ['outcome'], registers: [registry] }),
  jobsTotal: new client.Counter({ name: 'contaviva_pro_jobs_total', help: 'jobs', labelNames: ['status'], registers: [registry] }),
  httpErrors: new client.Counter({ name: 'contaviva_pro_http_errors_total', help: 'erros', registers: [registry] }) };
export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {
  const srv = http.createServer(async (req, res) => { if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); } else { res.statusCode = 404; res.end('nf'); } });
  srv.listen(port, () => console.log('[metrics] :' + port)); return srv; }