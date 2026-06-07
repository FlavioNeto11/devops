import { Router } from 'express';
import { pool } from '../db/pool.js';

type OpenApiLike = {
  info?: {
    version?: string;
  };
};

export function createSystemRouter(openApiSpec: OpenApiLike) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    let db = 'ok';
    try {
      await pool.query('select 1');
    } catch (_error: unknown) {
      db = 'degraded';
    }

    res.json({
      status: db === 'ok' ? 'ok' : 'degraded',
      database: db,
      service: 'mtr-node-backend-postgres-queue',
      version: openApiSpec?.info?.version || 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  return router;
}
