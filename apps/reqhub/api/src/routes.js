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
import { attachIngest } from '@flavioneto11/ai-ingest-middleware';
import { buildAuthoringTools, buildForgeTools } from './tools.js';
import { requireAuthoringAuth, ssoIdentity } from './auth.js';
import { validateLaunchInput, buildClientPayload, dispatchForgeLaunch, validateDeleteInput, dispatchForgeDelete } from './forge-launch.js';
import { buildLaunchStatus, buildProductStatus } from './forge-status.js';
import { aiEnabled, getLlm } from './llm.js';
import { runAuthoringChatTurn } from './ai/graph.js';
import { buildUsageRouter } from './usage/index.js';
import { forgeState } from './forge-state.js';

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

// MULTIMODAL (ingestao de arquivos): liga o caminho multipart/form-data SEM tocar no caminho
// JSON existente. withIngest(mergeField) retorna [attachIngest, merge] — dois middlewares que rodam
// DEPOIS do requireAuthoringAuth e ANTES do handler (run()/chat), que continuam lendo req.body.
//   - attachIngest({field:'files'}): em JSON e NO-OP (req.ingested=null, contrato intacto); em
//     multipart usa multer.array -> popula req.body com os campos de TEXTO (product/message/sketch/
//     brief) E anexa req.ingested (IngestResult + .text bundle), fail-soft (erro NAO vira 500).
//   - merge: funde o texto extraido dos arquivos no campo de entrada do usuario (mergeField) e
//     anexa req.body._ingest = { manifest } — NUNCA os bytes/blobs (licao de OOM: so o manifesto).
function withIngest(mergeField) {
  const ingestMw = attachIngest({ field: 'files', maxFiles: 20 });
  const mergeMw = (req, _res, next) => {
    const ing = req.ingested;
    if (ing) {
      // multipart: multer entrega TODO campo de texto como STRING. Reidrata os que o contrato dos
      // tools espera como JSON (array/objeto) — em JSON puro (ing=null) nada disso roda e o corpo é intacto.
      req.body = req.body || {};
      for (const k of ['grounding', 'history', 'capabilities', 'blueprints', 'scope', 'context']) {
        if (typeof req.body[k] === 'string' && req.body[k].trim()) {
          try { req.body[k] = JSON.parse(req.body[k]); } catch { /* não-JSON: mantém string */ }
        }
      }
      if (typeof ing.text === 'string' && ing.text.trim()) {
        req.body[mergeField] = [req.body[mergeField], ing.text].filter(Boolean).join('\n\n');
        req.body._ingest = { manifest: Array.isArray(ing.manifest) ? ing.manifest : [] };
      }
    }
    next();
  };
  return [ingestMw, mergeMw];
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

  // Estado VIVO da Forja (tempo real): produtos + progresso recalculado da baseline montada
  // (ConfigMap reqhub-forge-state). Read-only, sem auth (atrás do gate SSO de borda). O frontend
  // faz polling deste endpoint e cai no baked (data/*.json) se ele estiver fora.
  router.get('/v1/forge/state', (_req, res) => {
    try { res.json(forgeState()); }
    catch (err) { res.status(200).json({ source: 'error', products: [], error: String(err && err.message) }); }
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

  // draft: entrada do usuario = 'sketch' (esboco em linguagem natural -> campos do requisito).
  router.post('/v1/authoring/draft', requireAuthoringAuth, ...withIngest('sketch'), run('req.authoring.draft'));
  router.post('/v1/authoring/analyze', requireAuthoringAuth, run('req.authoring.analyze'));
  router.post('/v1/authoring/suggest-links', requireAuthoringAuth, run('req.authoring.suggest_links'));
  router.post('/v1/authoring/revise', requireAuthoringAuth, run('req.authoring.revise'));
  // assist: entrada do usuario = 'message' (conversa grounded sobre o produto).
  router.post('/v1/authoring/assist', requireAuthoringAuth, ...withIngest('message'), run('req.authoring.assist'));

  // Camada de REFINAMENTO (REF-*): classificar nivel da mudanca + autorar refinamento de tela.
  router.post('/v1/authoring/classify', requireAuthoringAuth, run('req.authoring.classify_change'));
  router.post('/v1/authoring/draft-refinement', requireAuthoringAuth, run('req.authoring.draft_refinement'));
  router.post('/v1/authoring/analyze-refinement', requireAuthoringAuth, run('req.authoring.analyze_refinement'));
  router.post('/v1/authoring/revise-refinement', requireAuthoringAuth, run('req.authoring.revise_refinement'));

  // Chat de autoria pelo MOTOR DE GRAFO (router -> deep ReAct com tools R1 -> judge).
  // memory (F3) injetada via buildRouter({memory}); ausente -> grafo usa turn.history.
  // Gate de rollback: REQHUB_AI_CHAT=assist usa o single-shot (mesmo contrato) SEM redeploy do front.
  router.post('/v1/authoring/chat', requireAuthoringAuth, ...withIngest('message'), async (req, res, next) => {
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
  // propose-requirements: entrada do usuario = 'brief' (descricao do produto novo).
  router.post('/v1/forge/propose-requirements', requireAuthoringAuth, ...withIngest('brief'), run('forge.propose_requirements'));
  router.post('/v1/forge/propose-architecture', requireAuthoringAuth, run('forge.propose_architecture'));

  // Forge LAUNCH: a UI "cria no git" disparando a esteira (repository_dispatch -> greenfield-launch.yml).
  // O reqhub-api NÃO escreve git; só dispara. Fail-closed sem GITHUB_DISPATCH_TOKEN. Admin-only (auth).
  router.post('/v1/forge/launch', requireAuthoringAuth, async (req, res) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'criação automática desligada — defina GITHUB_DISPATCH_TOKEN no Secret reqhub-api-config (PAT fine-grained, Contents: Read and write).' } });
    const v = validateLaunchInput(req.body);
    if (!v.ok) return res.status(400).json({ error: { code: v.code, message: v.message } });
    const built = buildClientPayload(v.value, req.identity);
    if (!built.ok) return res.status(413).json({ error: { code: built.code, message: built.message } });
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    try {
      const d = await dispatchForgeLaunch({ token, repo, payload: built.payload });
      if (!d.ok) return res.status(502).json({ error: { code: 'DISPATCH_FAILED', message: `GitHub ${d.status}: ${d.detail || 'falha ao disparar o workflow'}` } });
      const branch = `forge/${v.value.product}/requisitos`;
      return res.status(202).json({
        status: 'dispatched', mode: v.value.mode, product: v.value.product, expected_branch: branch,
        actions_url: `https://github.com/${repo}/actions/workflows/greenfield-launch.yml`,
        pulls_url: `https://github.com/${repo}/pulls?q=is%3Apr+head%3A${encodeURIComponent(branch)}`,
      });
    } catch (e) {
      return res.status(502).json({ error: { code: 'DISPATCH_ERROR', message: String((e && e.message) || e) } });
    }
  });

  // Forge LAUNCH STATUS: estado VIVO da cadeia (requisitos→plano→construção) lido do GitHub com o PAT.
  // A UI faz polling p/ mostrar o progresso na própria tela. Admin-only; fail-closed sem token.
  router.get('/v1/forge/launch-status', requireAuthoringAuth, async (req, res) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'status indisponível — sem GITHUB_DISPATCH_TOKEN' } });
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    const product = String(req.query.product || '').trim();
    const out = await buildLaunchStatus({ token, repo, product });
    if (!out.ok) return res.status(400).json({ error: { code: out.code || 'STATUS_ERROR', message: out.message || 'falha' } });
    return res.json(out);
  });

  // Forge BUILD STATUS: estado VIVO do build (req-implement rodando + PRs de implementação abertos com
  // resumo de CI). Alimenta o indicador "processando/bloqueado" na tela Build. Admin-only; fail-closed.
  router.get('/v1/forge/build-status', requireAuthoringAuth, async (req, res) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'status indisponível — sem GITHUB_DISPATCH_TOKEN' } });
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    const out = await buildProductStatus({ token, repo, product: String(req.query.product || '').trim() });
    if (!out.ok) return res.status(400).json({ error: { code: out.code || 'STATUS_ERROR', message: out.message || 'falha' } });
    return res.json(out);
  });

  // Forge DELETE: apaga um produto da Forja e tudo que depende dele (apps, Argo, specs, baseline +
  // recursos do cluster). O reqhub-api só DISPARA (repository_dispatch -> forge-delete.yml); admin-only,
  // fail-closed sem token, e PROTEGE produtos reais/plataforma (validateDeleteInput).
  router.post('/v1/forge/delete', requireAuthoringAuth, async (req, res) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'exclusão automática desligada — sem GITHUB_DISPATCH_TOKEN' } });
    const v = validateDeleteInput(req.body);
    if (!v.ok) return res.status(v.code === 'PROTECTED' ? 403 : 400).json({ error: { code: v.code, message: v.message } });
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    try {
      const d = await dispatchForgeDelete({ token, repo, product: v.value.product, identity: req.identity });
      if (!d.ok) return res.status(502).json({ error: { code: 'DISPATCH_FAILED', message: `GitHub ${d.status}: ${d.detail || 'falha ao disparar a exclusão'}` } });
      return res.status(202).json({
        status: 'deleting', product: v.value.product,
        actions_url: `https://github.com/${repo}/actions/workflows/forge-delete.yml`,
      });
    } catch (e) {
      return res.status(502).json({ error: { code: 'DISPATCH_ERROR', message: String((e && e.message) || e) } });
    }
  });

  // Painel "Uso da IA" (/v1/ai-usage/*): leitura admin-only de custo/uso/limites (Claude+OpenAI),
  // agregando telemetria interna (Prometheus/Langfuse) + contas. Fail-soft; mantém o reqhub no ar.
  const { router: usageRouter, ctx: usageCtx } = buildUsageRouter();
  router.use('/v1/ai-usage', usageRouter);
  router._usageCtx = usageCtx; // exposto p/ a fase de live (SSE) reusar o mesmo contexto

  return router;
}

export { statusForError };
