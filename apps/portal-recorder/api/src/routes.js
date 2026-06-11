// routes.js — superfície HTTP do portal-recorder-api.
// Envelope: sucesso { data }, erro { error: { code, message } }. Leituras abertas;
// escritas exigem Bearer PORTAL_REC_TOKEN (fail-closed). /health nunca falha por DB.
import express from 'express';
import { requireWriteAuth } from './auth.js';
import { getPool, pingDbQuick } from './db.js';
import fs from 'node:fs';
import {
  validateCreatePortal, validateCreateSession, createPortal, listPortals, getPortal,
  createSession, listSessions, getSession, setSessionStatus,
  validateCreateAnnotation, createAnnotation, listAnnotations, getTimeline, getScreenshot,
  loadResponseEventsForNormalize, saveContract, getContract,
  deleteSession, deletePortal, listActiveSessionIds,
} from './store.js';
import { normalizeEvents } from './normalize.js';

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

  // Excluir portal + tudo dele (para os browsers ativos antes de apagar).
  router.delete('/v1/portals/:id', requireWriteAuth, async (req, res, next) => {
    try {
      const portal = await getPortal(getPool(), req.params.id);
      if (!portal) return res.status(404).json({ error: { code: 'PORTAL_NOT_FOUND', message: 'portal not found' } });
      const active = await listActiveSessionIds(getPool(), portal.id);
      for (const sid of active) await callRecorder(`/internal/sessions/${sid}/stop`, sid);
      await deletePortal(getPool(), portal.id);
      res.json({ data: { deleted: true, id: portal.id, stopped_sessions: active.length } });
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

  // Excluir uma sessão (para o browser remoto se ainda ativo).
  router.delete('/v1/sessions/:id', requireWriteAuth, async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      if (session.status === 'created' || session.status === 'running') {
        await callRecorder(`/internal/sessions/${session.id}/stop`, session.id);
      }
      await deleteSession(getPool(), session.id);
      res.json({ data: { deleted: true, id: session.id } });
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

  // ── Anotações + timeline + screenshots (A4) ───────────────────────────────
  router.post('/v1/sessions/:id/annotations', requireWriteAuth, async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      const v = validateCreateAnnotation(req.body);
      if (!v.ok) return sendValidation(res, v);
      res.status(201).json({ data: await createAnnotation(getPool(), session.id, v.value) });
    } catch (e) { next(e); }
  });

  router.get('/v1/sessions/:id/annotations', async (req, res, next) => {
    try { res.json({ data: await listAnnotations(getPool(), req.params.id) }); } catch (e) { next(e); }
  });

  router.get('/v1/sessions/:id/timeline', async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      res.json({ data: await getTimeline(getPool(), session.id) });
    } catch (e) { next(e); }
  });

  // Print: a api pede ao recorder tirar o screenshot da sessão ativa.
  router.post('/v1/sessions/:id/screenshots', requireWriteAuth, async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      const base = (process.env.RECORDER_INTERNAL_URL || '').replace(/\/+$/, '');
      if (!base) return res.status(503).json({ error: { code: 'RECORDER_UNAVAILABLE', message: 'recorder not configured' } });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const resp = await fetch(`${base}/internal/sessions/${session.id}/screenshot`, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RECORDER_INTERNAL_TOKEN || ''}` },
          body: JSON.stringify({ caption: req.body?.caption, annotationId: req.body?.annotationId }),
        });
        const body = await resp.json().catch(() => ({}));
        res.status(resp.status).json(body);
      } finally { clearTimeout(timer); }
    } catch (e) { next(e); }
  });

  router.get('/v1/sessions/:id/screenshots/:shotId/blob', async (req, res, next) => {
    try {
      const shot = await getScreenshot(getPool(), req.params.id, req.params.shotId);
      if (!shot || !fs.existsSync(shot.blob_ref)) return res.status(404).json({ error: { code: 'SCREENSHOT_NOT_FOUND', message: 'not found' } });
      res.setHeader('Content-Type', 'image/png');
      fs.createReadStream(shot.blob_ref).pipe(res);
    } catch (e) { next(e); }
  });

  // ── Normalização → contrato + leitura (A5) ────────────────────────────────
  router.post('/v1/sessions/:id/normalize', requireWriteAuth, async (req, res, next) => {
    try {
      const session = await getSession(getPool(), req.params.id);
      if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'session not found' } });
      const portal = await getPortal(getPool(), session.portal_id);
      const apiOrigins = portal?.api_origins || [];
      const events = await loadResponseEventsForNormalize(getPool(), session.id, apiOrigins);
      const endpoints = normalizeEvents(events);
      const { contractId, version } = await saveContract(getPool(), session.portal_id, session.id, endpoints);
      await setSessionStatus(getPool(), session.id, 'normalized');
      res.status(201).json({ data: { contract_id: contractId, version, endpoint_count: endpoints.length } });
    } catch (e) { next(e); }
  });

  router.get('/v1/contracts/:id', async (req, res, next) => {
    try {
      const contract = await getContract(getPool(), req.params.id);
      if (!contract) return res.status(404).json({ error: { code: 'CONTRACT_NOT_FOUND', message: 'not found' } });
      res.json({ data: contract });
    } catch (e) { next(e); }
  });

  return router;
}
