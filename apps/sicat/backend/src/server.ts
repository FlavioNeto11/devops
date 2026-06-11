import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { ensureStartup } from './bootstrap/startup.js';
import { createApp } from './app.js';
import { config } from './lib/config.js';
import { startAiMetricsServer } from './lib/ai-metrics.js';
import { initPlanningCheckpointer } from './services/conversation/llm-provider.js';

export function createServer() {
  return http.createServer(createApp());
}

export async function startServer(port = config.port) {
  await ensureStartup();
  startAiMetricsServer(); // Prometheus /metrics em porta dedicada (fora do Traefik)
  initPlanningCheckpointer(); // F3: threads do planning em Postgres (api↔worker)
  const server = createServer();

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[mtr-api] listening on port ${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
