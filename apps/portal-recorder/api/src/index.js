// Bootstrap do portal-recorder-api.
// Ordem: HTTP sobe IMEDIATAMENTE (o /health não depende do banco) e a
// migration roda em background com retry — banco fora do ar não derruba
// o processo nem segura o boot (serviço fora do caminho crítico).
import express from 'express';
import { buildRouter } from './routes.js';
import { closePool, isDbConnectionError, startMigrateLoop } from './db.js';

const PORT = Number.parseInt(process.env.PORT || '8080', 10);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(buildRouter());

// 404 padrão no envelope de erro.
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `route ${req.method} ${req.path} not found` },
  });
});

// Handler central de erros: JSON inválido -> 400; banco fora -> 503; resto -> 500.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'request body is not valid JSON' } });
  }
  if (isDbConnectionError(err)) {
    console.error(`[api] db unavailable: ${err.message}`);
    return res.status(503).json({
      error: { code: 'DB_UNAVAILABLE', message: 'database is unavailable, try again later' },
    });
  }
  console.error('[api] unhandled error:', err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'internal server error' } });
});

// Migration idempotente em background (retry com backoff; nunca crasha o boot).
startMigrateLoop();

const server = app.listen(PORT, () => {
  console.log(`[portal-recorder] api listening on :${PORT}`);
});

// Shutdown gracioso (SIGTERM do kubelet / Ctrl+C local).
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[portal-recorder] ${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  if (typeof forceExit.unref === 'function') forceExit.unref();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
