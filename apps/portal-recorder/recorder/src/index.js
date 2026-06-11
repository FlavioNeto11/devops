// index.js — recorder: HTTP interno (api↔recorder) na 8090 + WS de streaming na 8091.
// A api (ClusterIP) pede start/stop/screenshot; o frontend conecta o WS para ver
// o browser remoto e enviar input. Estado em memória → Deployment replicas:1.
import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session.js';
import { getSessionPortal } from './store.js';

const HTTP_PORT = Number(process.env.PORT || 8090);
const WS_PORT = Number(process.env.WS_PORT || 8091);
const INTERNAL_TOKEN = process.env.RECORDER_INTERNAL_TOKEN || '';

const manager = new SessionManager();

// ── HTTP interno (token próprio; NÃO roteado pelo Traefik) ──────────────────
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function requireInternal(req, res, next) {
  if (!INTERNAL_TOKEN) return next(); // sem token configurado: ambiente de dev/local
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m || m[1].trim() !== INTERNAL_TOKEN) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  next();
}

app.get('/health', (_req, res) => res.json({ status: 'ok', sessions: manager.sessions.size }));

app.post('/internal/sessions/:id/start', requireInternal, async (req, res) => {
  try {
    const portal = await getSessionPortal(req.params.id);
    if (!portal) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND' } });
    await manager.start(req.params.id, portal);
    res.json({ data: { started: true } });
  } catch (e) {
    const status = e.code === 'MAX_CONCURRENT' ? 429 : 500;
    res.status(status).json({ error: { code: e.code || 'START_FAILED', message: e.message } });
  }
});

app.post('/internal/sessions/:id/stop', requireInternal, async (req, res) => {
  await manager.stop(req.params.id, 'finalizing');
  res.json({ data: { stopped: true } });
});

app.post('/internal/sessions/:id/screenshot', requireInternal, async (req, res) => {
  const s = manager.get(req.params.id);
  if (!s) return res.status(404).json({ error: { code: 'SESSION_NOT_ACTIVE' } });
  try {
    const shotId = await s.screenshot(req.body?.caption, req.body?.annotationId);
    res.json({ data: { id: shotId } });
  } catch (e) {
    res.status(500).json({ error: { code: 'SCREENSHOT_FAILED', message: e.message } });
  }
});

const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, () => console.log(`[recorder] internal HTTP on :${HTTP_PORT}`));

// ── WebSocket de streaming (frontend ↔ browser remoto) ──────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('session');
  const session = sessionId && manager.get(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'status', status: 'not_found' }));
    ws.close();
    return;
  }
  ws.send(JSON.stringify({ type: 'status', status: 'running', url: session.portal.entry_url }));
  session.onFrame((frame) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'frame', ...frame }));
  });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    session.dispatchInput(msg);
  });
  ws.on('close', () => { session.onFrame(null); });
});
console.log(`[recorder] streaming WS on :${WS_PORT}`);

async function shutdown(signal) {
  console.log(`[recorder] ${signal} — encerrando sessões`);
  for (const id of [...manager.sessions.keys()]) await manager.stop(id, 'finalizing').catch(() => {});
  httpServer.close();
  wss.close();
  setTimeout(() => process.exit(0), 1_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
