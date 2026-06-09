import express from 'express';
import cors from 'cors';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import projects from './routes/projects.js';
import items from './routes/items.js';
import tasks from './routes/tasks.js';
import me from './routes/me.js';
import admin from './routes/admin.js';
import { authContext, requireAdmin } from './auth.js';
import { seed } from '../scripts/seed.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const api = express.Router();

// /health e publico (probe do k8s) e nao depende de auth.
api.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ data: { status: 'ok' } });
  } catch (e) {
    res.status(503).json({ error: { code: 'DB_DOWN', message: e.message } });
  }
});

// Contexto de identidade (papel/grupos via headers da borda) para TODAS as rotas abaixo.
api.use(authContext);

// Re-seed idempotente sob demanda (admin apenas).
api.post('/admin/seed', requireAdmin, async (_req, res, next) => {
  try {
    res.json({ data: await seed() });
  } catch (e) {
    next(e);
  }
});

api.use(me);
api.use(admin);
api.use(projects);
api.use(items);
api.use(tasks);

// Traefik faz StripPrefix de /devops/api/pm -> o backend ve "/". Tambem montamos em
// /api/pm para chamadas diretas em dev (vite proxy).
app.use('/', api);
app.use('/api/pm', api);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[pm-api]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
});

const PORT = process.env.PORT || 3002;

async function start() {
  if ((process.env.AUTO_MIGRATE ?? 'true') !== 'false') await migrate();
  if (process.env.AUTO_SEED === 'true') {
    try {
      await seed();
    } catch (e) {
      console.warn('[seed] ignorado:', e.message);
    }
  }
  app.listen(PORT, () => console.info(`[pm-api] listening on ${PORT}`));
}

start().catch((e) => {
  console.error('[pm-api] startup falhou:', e);
  process.exit(1);
});
