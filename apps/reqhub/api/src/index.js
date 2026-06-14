// Bootstrap do reqhub-api (IA de autoria). Sem banco: o servico e stateless e
// fica FORA do caminho critico do Reqhub (o workbench funciona read-only sem ele;
// a IA so enriquece o Editor). HTTP sobe imediato; /health nao depende da key.
import express from 'express';
import { buildRouter, statusForError } from './routes.js';

const PORT = Number.parseInt(process.env.PORT || '8080', 10);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(buildRouter());

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
