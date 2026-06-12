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

  // Graceful shutdown: no rollout o kubelet manda SIGTERM. app.close() para de
  // aceitar conexões novas e espera as requests em voo (hooks onClose dos
  // plugins rodam); depois desconecta o Prisma. Força a saída em 10s para não
  // prender o pod num shutdown pendurado.
  const shutdown = (signal: string) => {
    app.log.info(`${signal} recebido, encerrando...`);
    void app
      .close()
      .then(() => db.$disconnect())
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();
