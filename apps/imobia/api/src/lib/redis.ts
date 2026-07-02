// Conexao Redis fail-soft (padrao GymOps): sem REDIS_URL, getRedis() -> null e tudo degrada
// graciosamente. Usado pelo BullMQ (queues.ts) e por caches futuros.
import { Redis } from 'ioredis';
import { env } from '../env';

let client: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;
  if (!env.REDIS_URL) {
    console.log('[imobia] REDIS_URL ausente — filas/cache desativados (fail-soft)');
    return null;
  }
  try {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // exigido pelo BullMQ
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => console.error('[imobia] redis error:', err.message));
  } catch (err) {
    console.error('[imobia] falha ao iniciar redis:', err);
    client = null;
  }
  return client;
}

export async function redisHealthy(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const pong = await r.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
