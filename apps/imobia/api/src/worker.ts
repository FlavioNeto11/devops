// imobia worker — MESMA imagem da api, comando `npm run worker`. F1: conecta ao BullMQ
// (fail-soft: sem REDIS_URL nao registra nada) e sobe um servidor HTTP (/health + /metrics)
// para a liveness. Os handlers de dominio (acm-scrape, ptam-render, vistoria-vision,
// document-validate, whatsapp-inbound, marketing-image, ai-summary) sao adicionados em F4+.

import http from 'node:http';
import { env } from './env';
import { getRedis } from './lib/redis';
import { QUEUE_NAMES } from './lib/queues';

let ticks = 0;
const started = new Date().toISOString();

const redis = getRedis();
if (redis) {
  console.log(`[imobia-worker] Redis conectado — filas prontas: ${QUEUE_NAMES.join(', ')} (handlers em F4+)`);
} else {
  console.log('[imobia-worker] sem REDIS_URL — filas dormentes (fail-soft)');
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'imobia-worker', phase: 'F1', redis: Boolean(redis), ticks, started }));
    return;
  }
  if (req.url === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    res.end(
      `# HELP imobia_worker_ticks Heartbeats desde o boot\n# TYPE imobia_worker_ticks counter\nimobia_worker_ticks ${ticks}\n` +
        `# HELP imobia_worker_redis 1 se conectado ao Redis\n# TYPE imobia_worker_redis gauge\nimobia_worker_redis ${redis ? 1 : 0}\n`,
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(env.WORKER_PORT, env.HOST, () => {
  console.log(`[imobia-worker] ouvindo em ${env.HOST}:${env.WORKER_PORT} (fase F1)`);
});

setInterval(() => {
  ticks += 1;
  if (ticks % 10 === 0) console.log(`[imobia-worker] heartbeat #${ticks}`);
}, 30_000);

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
