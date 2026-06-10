import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './env.js';
import { db } from './lib/prisma.js';
import { startMetricsServer } from './ai/ai-metrics.js';

async function start() {
  const app = await buildApp();
  startMetricsServer(); // Prometheus /metrics em porta dedicada (fora do Traefik)

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    console.log(`🚀 API running on http://${env.API_HOST}:${env.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    await db.$disconnect();
    process.exit(1);
  }
}

void start();
