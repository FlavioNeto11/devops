// imobia API — Fastify (ESM, via tsx). Sob Traefik, o prefixo /imobia/api e' stripado,
// entao o processo ve as rotas na raiz (/health, /meta, /auth/*, ...). F1: DB + auth.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env, aiProviders } from './env';
import { MODULES } from './modules-catalog';
import { dbHealthy } from './lib/prisma';
import { redisHealthy } from './lib/redis';
import { authRoutes } from './modules/auth/routes';
import { aiRoutes } from './modules/ai/routes';
import { imoveisRoutes } from './modules/imoveis/routes';
import { leadsRoutes } from './modules/leads/routes';
import { agendaRoutes } from './modules/agenda/routes';
import { documentosRoutes } from './modules/documentos/routes';
import { vistoriaRoutes } from './modules/vistoria/routes';
import { financeiroRoutes } from './modules/financeiro/routes';
import { corbamRoutes } from './modules/corbam/routes';
import { whatsappRoutes } from './modules/whatsapp/routes';
import { acmRoutes } from './modules/acm/routes';
import { ptamRoutes } from './modules/ptam/routes';
import { engineStatus } from './ai/engine';

const BOOT_TIME = new Date().toISOString();

export function buildServer() {
  const app = Fastify({
    logger: { level: env.isProd ? 'info' : 'debug' },
    trustProxy: true,
  });

  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  // Tratamento de erro uniforme (Zod -> 400; erros com statusCode; fallback 500).
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', issues: err.issues });
    }
    const status = (err as any).statusCode && Number.isInteger((err as any).statusCode) ? (err as any).statusCode : 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: (err as any).code || 'error', message: err.message });
  });

  app.get('/health', async () => {
    const db = env.hasDb ? await dbHealthy() : false;
    return {
      status: 'ok',
      service: 'imobia-api',
      version: '0.1.0',
      phase: 'F7',
      bootTime: BOOT_TIME,
      time: new Date().toISOString(),
      db: env.hasDb ? (db ? 'ok' : 'unreachable') : 'not-configured',
      redis: env.hasRedis ? (await redisHealthy()) ? 'ok' : 'unreachable' : 'not-configured',
      keycloak: env.hasKeycloak ? 'configured' : 'not-configured',
      ai: aiProviders(),
      aiEngine: engineStatus().dormant ? 'dormant' : 'ready',
    };
  });

  app.get('/meta', async () => ({
    app: 'imobia',
    title: 'imobia — Imobiliaria + IA',
    description: 'Ecossistema imobiliario + fintech orquestrado por multiplas IAs (Cortex/GPT/Claude/Gemini).',
    modules: MODULES,
    ai: aiProviders(),
    auth: { local: true, keycloak: env.hasKeycloak },
    phase: 'F1',
  }));

  app.register(authRoutes);
  app.register(aiRoutes);
  app.register(imoveisRoutes);
  app.register(leadsRoutes);
  app.register(agendaRoutes);
  app.register(documentosRoutes);
  app.register(vistoriaRoutes);
  app.register(financeiroRoutes);
  app.register(corbamRoutes);
  app.register(whatsappRoutes);
  app.register(acmRoutes);
  app.register(ptamRoutes);

  app.get('/', async () => ({ service: 'imobia-api', hint: 'ecossistema imobiliario + IA' }));

  return app;
}

async function main() {
  const app = buildServer();
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`imobia-api ouvindo em ${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
