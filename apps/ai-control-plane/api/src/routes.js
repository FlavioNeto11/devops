// Rotas HTTP do ai-control-plane (Express Router).
// Convenções: respostas JSON; sucesso { data }, erro { error: { code, message } }.
// O Traefik strippa /ai-control/api antes de chegar aqui — o processo vê tudo na raiz.
import { Router } from 'express';
import { requireWriteAuth } from './auth.js';
import { getPool, pingDbQuick } from './db.js';
import * as store from './store.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Resolve e valida :name; responde 400 e retorna null quando inválido.
function promptNameOr400(req, res) {
  const name = store.normalizePromptName(req.params.name);
  if (!name) {
    sendError(
      res,
      400,
      'INVALID_PROMPT_NAME',
      'prompt name must match [a-zA-Z0-9][a-zA-Z0-9._-]{0,199} (e.g. gymops.chat.system)'
    );
    return null;
  }
  return name;
}

export function buildRouter() {
  const router = Router();

  // -------------------------------------------------------------------------
  // Health — NUNCA falha por DB fora do ar: reporta db:false e segue ok.
  // -------------------------------------------------------------------------
  router.get('/health', wrap(async (_req, res) => {
    const db = await pingDbQuick();
    res.json({ status: 'ok', db });
  }));

  // -------------------------------------------------------------------------
  // Prompts versionados (promote/rollback)
  // -------------------------------------------------------------------------
  router.get('/v1/prompts', wrap(async (_req, res) => {
    const data = await store.listPrompts(getPool());
    res.json({ data });
  }));

  router.get('/v1/prompts/:name/active', wrap(async (req, res) => {
    const name = promptNameOr400(req, res);
    if (!name) return;
    const { found, active } = await store.getActivePrompt(getPool(), name);
    if (!found) return sendError(res, 404, 'PROMPT_NOT_FOUND', `prompt '${name}' not found`);
    if (!active) {
      return sendError(res, 404, 'NO_ACTIVE_VERSION', `prompt '${name}' has no active version`);
    }
    res.json({ data: active });
  }));

  router.get('/v1/prompts/:name/versions', wrap(async (req, res) => {
    const name = promptNameOr400(req, res);
    if (!name) return;
    const versions = await store.listVersions(getPool(), name);
    if (versions === null) {
      return sendError(res, 404, 'PROMPT_NOT_FOUND', `prompt '${name}' not found`);
    }
    res.json({ data: versions });
  }));

  router.post('/v1/prompts/:name/versions', requireWriteAuth, wrap(async (req, res) => {
    const name = promptNameOr400(req, res);
    if (!name) return;
    const v = store.validateCreateVersionPayload(req.body);
    if (!v.ok) return sendError(res, 400, v.error.code, v.error.message);
    const data = await store.createVersion(getPool(), name, v.value);
    res.status(201).json({ data });
  }));

  router.post('/v1/prompts/:name/activate', requireWriteAuth, wrap(async (req, res) => {
    const name = promptNameOr400(req, res);
    if (!name) return;
    const v = store.validateActivatePayload(req.body);
    if (!v.ok) return sendError(res, 400, v.error.code, v.error.message);
    const result = await store.activateVersion(getPool(), name, v.value.versionId);
    if (result.error === 'PROMPT_NOT_FOUND') {
      return sendError(res, 404, 'PROMPT_NOT_FOUND', `prompt '${name}' not found`);
    }
    if (result.error === 'VERSION_NOT_FOUND') {
      return sendError(
        res,
        404,
        'VERSION_NOT_FOUND',
        `version '${v.value.versionId}' not found for prompt '${name}'`
      );
    }
    res.json({ data: result.data });
  }));

  // -------------------------------------------------------------------------
  // Feedback (thumbs) — eventos + rollup agregado
  // -------------------------------------------------------------------------
  router.post('/v1/feedback', requireWriteAuth, wrap(async (req, res) => {
    const v = store.validateFeedbackPayload(req.body);
    if (!v.ok) return sendError(res, 400, v.error.code, v.error.message);
    const data = await store.insertFeedback(getPool(), v.value);
    res.status(201).json({ data });
  }));

  router.get('/v1/feedback/summary', wrap(async (req, res) => {
    const app = typeof req.query.app === 'string' && req.query.app.trim() !== ''
      ? req.query.app.trim()
      : null;
    const days = store.parseDays(req.query.days);
    const data = await store.feedbackSummary(getPool(), { app, days });
    res.json({ data });
  }));

  // -------------------------------------------------------------------------
  // Eval runs — registro histórico das execuções de avaliação dos apps
  // -------------------------------------------------------------------------
  router.post('/v1/eval-runs', requireWriteAuth, wrap(async (req, res) => {
    const v = store.validateEvalRunPayload(req.body);
    if (!v.ok) return sendError(res, 400, v.error.code, v.error.message);
    const data = await store.insertEvalRun(getPool(), v.value);
    res.status(201).json({ data });
  }));

  router.get('/v1/eval-runs', wrap(async (req, res) => {
    const app = typeof req.query.app === 'string' && req.query.app.trim() !== ''
      ? req.query.app.trim()
      : null;
    const limit = store.parseLimit(req.query.limit);
    const data = await store.listEvalRuns(getPool(), { app, limit });
    res.json({ data });
  }));

  // -------------------------------------------------------------------------
  // Overview — visão geral para dashboards/console
  // -------------------------------------------------------------------------
  router.get('/v1/overview', wrap(async (_req, res) => {
    const data = await store.overview(getPool());
    res.json({ data });
  }));

  return router;
}
