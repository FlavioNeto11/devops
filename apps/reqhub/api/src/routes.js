// routes.js — roteador da IA de autoria do Reqhub.
//   GET  /health                         -> liveness + flag ai (key presente?)
//   POST /v1/authoring/draft             -> req.authoring.draft        (R1)
//   POST /v1/authoring/analyze           -> req.authoring.analyze      (R1)
//   POST /v1/authoring/suggest-links     -> req.authoring.suggest_links(R1)
//   POST /v1/authoring/assist            -> req.authoring.assist       (R1, single-shot — fallback)
//   POST /v1/authoring/chat              -> motor de GRAFO (router->deep ReAct->judge)  (R1)
//   POST /v1/authoring/classify          -> req.authoring.classify_change   (R1)
//   POST /v1/authoring/draft-refinement  -> req.authoring.draft_refinement  (R1)
//   POST /v1/authoring/analyze-refinement-> req.authoring.analyze_refinement(R1)
//   POST /v1/authoring/revise-refinement -> req.authoring.revise_refinement (R1)
// As rotas de autoria exigem Bearer token (requireAuthoringAuth) E OPENAI_API_KEY
// (getLlm != null) — ambos fail-closed (503). O dispatchTool do ai-core aplica o
// contrato (authorize -> execute -> validar saida) e os erros sao tipados.
import express from 'express';
import { createToolRegistry, dispatchTool } from '@flavioneto11/ai-core';
import { buildAuthoringTools, buildForgeTools } from './tools.js';
import { requireAuthoringAuth, ssoIdentity } from './auth.js';
import { aiEnabled, getLlm } from './llm.js';
import { runAuthoringChatTurn } from './ai/graph.js';

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

export function buildRouter({ registry, llm, memory } = {}) {
  const reg = registry || createToolRegistry([...buildAuthoringTools(), ...buildForgeTools()]);
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'reqhub-api', ai: aiEnabled(), tools: reg.list().map((t) => t.name) });
  });

  // Quem sou eu (identidade da borda SSO — oauth2-proxy). Publico, mas so e alcancavel
  // quando autenticado (o gate console-auth-401 esta na frente). O frontend usa p/ mostrar
  // o usuario logado + decidir o que habilitar (admin usa a IA sem token). Sem sessao -> nulo.
  router.get('/v1/me', (req, res) => {
    const sso = ssoIdentity(req.headers);
    res.json(sso || { email: null, user: null, groups: [], isAdmin: false });
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
  router.post('/v1/authoring/revise', requireAuthoringAuth, run('req.authoring.revise'));
  router.post('/v1/authoring/assist', requireAuthoringAuth, run('req.authoring.assist'));

  // Camada de REFINAMENTO (REF-*): classificar nivel da mudanca + autorar refinamento de tela.
  router.post('/v1/authoring/classify', requireAuthoringAuth, run('req.authoring.classify_change'));
  router.post('/v1/authoring/draft-refinement', requireAuthoringAuth, run('req.authoring.draft_refinement'));
  router.post('/v1/authoring/analyze-refinement', requireAuthoringAuth, run('req.authoring.analyze_refinement'));
  router.post('/v1/authoring/revise-refinement', requireAuthoringAuth, run('req.authoring.revise_refinement'));

  // Chat de autoria pelo MOTOR DE GRAFO (router -> deep ReAct com tools R1 -> judge).
  // memory (F3) injetada via buildRouter({memory}); ausente -> grafo usa turn.history.
  // Gate de rollback: REQHUB_AI_CHAT=assist usa o single-shot (mesmo contrato) SEM redeploy do front.
  router.post('/v1/authoring/chat', requireAuthoringAuth, async (req, res, next) => {
    try {
      if ((process.env.REQHUB_AI_CHAT || 'graph').toLowerCase() === 'assist') {
        const theLlm = llm || (await getLlm());
        if (!theLlm) return res.status(503).json({ error: { code: 'AI_DISABLED', message: 'OPENAI_API_KEY nao configurado' } });
        const result = await dispatchTool(reg.get('req.authoring.assist'), req.body || {}, { llm: theLlm, authenticated: true, identity: req.identity });
        return res.json({ status: 'ok', ...result.output });
      }
      const b = req.body || {};
      const out = await runAuthoringChatTurn({
        product: b.product, message: b.message, history: b.history,
        target_req_id: b.target_req_id, grounding: b.grounding,
        identity: { sub: String(req.identity || 'operator') },
      }, memory);
      res.json({ status: 'ok', ...out });
    } catch (err) { next(err); }
  });

  // Forge (greenfield): propor requisitos/arquitetura — geram conteudo, nao escrevem git.
  router.post('/v1/forge/propose-requirements', requireAuthoringAuth, run('forge.propose_requirements'));
  router.post('/v1/forge/propose-architecture', requireAuthoringAuth, run('forge.propose_architecture'));

  return router;
}

export { statusForError };
