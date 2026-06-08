import { Redis } from 'ioredis';
import { env } from '../env.js';

let _client: Redis | null = null;
let _initialized = false;

function getClient(): Redis | null {
  if (_initialized) return _client;
  _initialized = true;

  if (!env.REDIS_URL) return null;

  try {
    _client = new Redis(env.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    _client.on('error', () => {
      _client = null;
    });
  } catch {
    _client = null;
  }

  return _client;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    return (await getClient()?.get(key)) ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getClient()?.set(key, value, 'EX', ttlSeconds);
  } catch {
    // graceful — cache miss is acceptable
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getClient()?.del(key);
  } catch {
    // graceful
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const r = getClient();
    if (!r) return;
    const keys = await r.keys(pattern);
    if (keys.length > 0) await r.del(...keys);
  } catch {
    // graceful
  }
}
