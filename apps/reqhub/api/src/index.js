// Bootstrap do reqhub-api (IA de autoria). MEMORIA DURAVEL (Postgres+pgvector) e OPCIONAL e
// FAIL-SOFT: sem DATABASE_URL/DB fora, o chat funciona com a memoria da conversa (history) e o
// resto do reqhub segue read-only. HTTP sobe imediato; /health nao depende de key/DB.
import express from 'express';
import { buildRouter, statusForError } from './routes.js';
import { buildDurableMemory } from './ai/memory.js';
import { startAiMetricsServer } from './usage/ai-metrics.js';

const PORT = Number.parseInt(process.env.PORT || '8080', 10);

// Constroi a memoria duravel ANTES do router (best-effort; undefined -> grafo usa history).
const memory = await buildDurableMemory();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(buildRouter({ memory }));

// 404 no envelope de erro.
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `route ${req.method} ${req.path} not found` } });
});

// Handler central: JSON invalido -> 400; erros tipados do contrato AiTool -> status
// mapeado; resto -> 500. Nunca vaza stack para o cliente.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'request body is not valid JSON' } });
  }
  if (err && err.code && err.name && String(err.name).startsWith('AiTool')) {
    const status = statusForError(err);
    if (status >= 500) console.error(`[reqhub-api] tool error ${err.code}:`, err.message);
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('[reqhub-api] unhandled error:', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'internal server error' } });
});

const server = app.listen(PORT, () => {
  console.log(`[reqhub-api] listening on :${PORT} (ai=${Boolean((process.env.OPENAI_API_KEY || '').trim())})`);
});

// Métricas ai_* do reqhub (porta separada 9464, scrape do kube-prometheus). Best-effort.
try { startAiMetricsServer(); } catch (err) { console.error('[reqhub-api] metrics off:', err && err.message); }

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[reqhub-api] ${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  if (typeof forceExit.unref === 'function') forceExit.unref();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
