// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.
import http from 'node:http';
import client from 'prom-client';
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'contaviva_360_' });
export const M = {
  recordsTotal: new client.Counter({ name: 'contaviva_360_records_total', help: 'records', labelNames: ['outcome'], registers: [registry] }),
  jobsTotal: new client.Counter({ name: 'contaviva_360_jobs_total', help: 'jobs', labelNames: ['status'], registers: [registry] }),
  httpErrors: new client.Counter({ name: 'contaviva_360_http_errors_total', help: 'erros', registers: [registry] }),
  // REQ-CONTAVIVA360-0009: métricas de gateway fiscal
  gatewayCallsTotal: new client.Counter({ name: 'contaviva_360_gateway_calls_total', help: 'Chamadas a sistemas externos (SEFAZ/RFB/e-Social)', labelNames: ['gateway', 'method', 'status'], registers: [registry] }),
  gatewayErrorsTotal: new client.Counter({ name: 'contaviva_360_gateway_errors_total', help: 'Erros em gateways externos', labelNames: ['gateway', 'error_code'], registers: [registry] }),
  gatewayLatencySeconds: new client.Histogram({ name: 'contaviva_360_gateway_latency_seconds', help: 'Latência de chamadas a sistemas externos', labelNames: ['gateway'], buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30], registers: [registry] }),
};
let _metricsSrv = null;
export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {
  if (_metricsSrv) return _metricsSrv;
  const srv = http.createServer(async (req, res) => { if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); } else { res.statusCode = 404; res.end('nf'); } });
  _metricsSrv = srv;
  srv.listen(port, () => console.log('[metrics] :' + port)); return srv; }