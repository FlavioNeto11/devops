// routes.js — superfície HTTP do portal-recorder-api.
// Envelope: sucesso { data }, erro { error: { code, message } }. Leituras abertas;
// escritas exigem Bearer PORTAL_REC_TOKEN (fail-closed). /health nunca falha por DB.
import express from 'express';
import { requireWriteAuth } from './auth.js';
import { getPool, pingDbQuick } from './db.js';
import {
  validateCreatePortal, validateCreateSession, createPortal, listPortals, getPortal,
  createSession, listSessions, getSession, setSessionStatus,
} from './store.js';

function sendValidation(res, result) {
  return res.status(result.status).json({ error: { code: result.code, message: result.message } });
}

// Aciona o recorder (serviço separado) para alocar/derrubar o browser da sessão.
// Best-effort: o recorder pode estar indisponível; a sessão fica 'created' e o
// frontend reabre. O token interno NÃO é o mesmo do write público.
async function callRecorder(pathname, sessionId) {
  const base = (process.env.RECORDER_INTERNAL_URL || '').replace(/\/+$/, '');
  if (!base) return { ok: false, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const resp = await fetch(`${base}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RECORDER_INTERNAL_TOKEN || ''}` },
      body: JSON.stringify({ sessionId }),
      signal: controller.signal,
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export function buildRouter() {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    const db = await pingDbQuick();
    res.json({ status: 'ok', db });
  });

  // ── Portais ───────────────────────────────────────────────────────────────
  router.post('/v1/portals', requireWriteAuth, async (req, res, next) => {
    const v = validateCreatePortal(req.body);
    if (!v.ok) return sendValidation(res, v);
    try {
      const portal = await createPortal(getPool(), v.value);
      res.status(201).json({ data: portal });
    } catch (e) { next(e); }
  });

  router.get('/v1/portals', async (_req, res, next) => {
    try { res.json({ data: await listPortals(getPool()) }); } catch (e) { next(e); }
  });

  router.get('/v1/portals/:id', async (req, res, next) => {
    try {
      const portal = await getPortal(getPool(), req.params.id);
      if (!portal) return res.status(404).json({ error: { code: 'PORTAL_NOT_FOUND', message: 'portal not found' } });
      res.json({ data: portal });
    } catch (e) { next(e); }
  });

  // ── Sessões ─────────────────────────────────────────────────────────────--
  router.post('/v1/portals/:id/sessions', requireWriteAuth, async (req, res, next) => {
    try {
      const portal = await getPortal(getPool(), req.params.id);
      if (!portal) return res.status(404).json({ error: { code: 'PORTAL_NOT_FOUND', message: 'portal not found' } });
      const v = validateCreateSession(req.body);
      const session = await createSession(getPool(), portal.id, v.value);
      const recorder = await callRecorder(`/internal/sessions/${session.id}/start`, session.id);
      res.status(201).json({ data: session, recorder });
    } catch (e) { next(e); }
  });

  router.get('/v1/sessions', async (req, res, next) => {
    try {
      const sessions = await listSessions(getPool(), {
        portalId: req.query.portal, status: req.query.status, limit: req.query.limit,
      });
      res.json({ data: sessions });
    } catch (e) { next(e); }
  });

  router.get('/v1/sessions/:id', async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      res.json({ data: session });
    } catch (e) { next(e); }
  });

  router.post('/v1/sessions/:id/stop', requireWriteAuth, async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      await callRecorder(`/internal/sessions/${session.id}/stop`, session.id);
      const updated = await setSessionStatus(getPool(), session.id, 'finalizing', { ended_at: true });
      res.json({ data: updated });
    } catch (e) { next(e); }
  });

  return router;
}
