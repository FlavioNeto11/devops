// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.
import http from 'node:http';
import client from 'prom-client';
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'forjademo_' });
export const M = {
  recordsTotal: new client.Counter({ name: 'forjademo_records_total', help: 'records por desfecho', labelNames: ['outcome'], registers: [registry] }),
  httpErrors: new client.Counter({ name: 'forjademo_http_errors_total', help: 'erros HTTP', registers: [registry] }),
};
export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); }
    else { res.statusCode = 404; res.end('not found'); }
  });
  srv.listen(port, () => console.log('[metrics] :' + port));
  return srv;
}