// routes.js — roteador da IA de autoria do Reqhub.
//   GET  /health                         -> liveness + flag ai (key presente?)
//   POST /v1/authoring/draft             -> req.authoring.draft        (R1)
//   POST /v1/authoring/analyze           -> req.authoring.analyze      (R1)
//   POST /v1/authoring/suggest-links     -> req.authoring.suggest_links(R1)
// As rotas de autoria exigem Bearer token (requireAuthoringAuth) E OPENAI_API_KEY
// (getLlm != null) — ambos fail-closed (503). O dispatchTool do ai-core aplica o
// contrato (authorize -> execute -> validar saida) e os erros sao tipados.
import express from 'express';
import { createToolRegistry, dispatchTool } from '@flavioneto11/ai-core';
import { buildAuthoringTools, buildForgeTools } from './tools.js';
import { requireAuthoringAuth } from './auth.js';
import { aiEnabled, getLlm } from './llm.js';

// Mapeia erros tipados do contrato AiTool -> HTTP.
function statusForError(err) {
  switch (err && err.code) {
    case 'TOOL_DENIED': return 403;
    case 'TOOL_INVALID_INPUT': return 400;
    case 'TOOL_CONFIRMATION_REQUIRED': return 409;
    case 'AI_DISABLED': return 503;
    case 'LLM_INVALID_JSON':
    case 'TOOL_INVALID_OUTPUT': return 502;
    default: return 500;
  }
}

export function buildRouter({ registry, llm } = {}) {
  const reg = registry || createToolRegistry([...buildAuthoringTools(), ...buildForgeTools()]);
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'reqhub-api', ai: aiEnabled(), tools: reg.list().map((t) => t.name) });
  });

  const run = (toolName) => async (req, res, next) => {
    try {
      const theLlm = llm || (await getLlm());
      if (!theLlm) {
        return res.status(503).json({ error: { code: 'AI_DISABLED', message: 'OPENAI_API_KEY nao configurado; geracao de IA desabilitada' } });
      }
      const tool = reg.get(toolName);
      const result = await dispatchTool(tool, req.body || {}, { llm: theLlm, authenticated: true, identity: req.identity });
      res.json({ status: result.status, ...result.output });
    } catch (err) {
      next(err);
    }
  };

  router.post('/v1/authoring/draft', requireAuthoringAuth, run('req.authoring.draft'));
  router.post('/v1/authoring/analyze', requireAuthoringAuth, run('req.authoring.analyze'));
  router.post('/v1/authoring/suggest-links', requireAuthoringAuth, run('req.authoring.suggest_links'));

  // Forge (greenfield): propor requisitos/arquitetura — geram conteudo, nao escrevem git.
  router.post('/v1/forge/propose-requirements', requireAuthoringAuth, run('forge.propose_requirements'));
  router.post('/v1/forge/propose-architecture', requireAuthoringAuth, run('forge.propose_architecture'));

  return router;
}

export { statusForError };
