// routes.js — roteador da IA de autoria do Reqhub.
//
// =============================================================================
// CONTRATO DO PREVIEW DA FORJA (F3) — o frontend (assets/app.js) consome EXATAMENTE isto.
// Antes de construir, a Forja gera um PREVIEW de TODAS as telas propostas com componentes ui-vue
// REAIS + dados FAKE; o dono itera (refina tela a tela) e só após aprovar a esteira constrói.
// O build da SPA roda NO RUNNER (vite; o pod é non-root sem toolchain) via repository_dispatch
// (forge-preview.yml). O reqhub-api gera o inventário (IA), dispara o build e SERVE os bytes do volume.
//
// (1) POST /reqs/api/v1/forge/preview/generate   [SSE; auth admin/Bearer; SEM compress no Ingress]
//     Body JSON: {
//       product: string (slug ^[a-z][a-z0-9-]{1,30}$),
//       requirements: [{ id, title, statement, ... }]  (os requisitos propostos — fonte das âncoras),
//       architecture?: { stack, selected_blocks:[{id}], ... }  (arquitetura proposta, opcional),
//       inventory?: { brand, entities, screens }  (PULAR a IA e usar um inventário já pronto — ex.: regerar
//                    após refino; quando ausente, a IA propõe o inventário via forge.propose_screens)
//     }
//     Resposta: stream text/event-stream. Eventos (event: <name>\ndata: <json>\n\n):
//       event: start     data: { product, mode:'propose'|'inventory' }
//       event: propose   data: { phase:'propose-screens', model }                 (só quando IA propõe)
//       event: inventory data: { brand, entities, screens, navGroups, gaps, counts:{screens,entities} }
//       event: dispatch  data: { jobId, status:'dispatched', actions_url }         (build disparado no runner)
//       event: building  data: { jobId, status:'building', elapsedMs }            (heartbeat do polling)
//       event: ready     data: { product, url, screens:[{slug,title,route,kind}], jobId }
//       event: error     data: { code, message }                                  (encerra o stream)
//       event: done      data: { ok:true }                                        (último frame — confirma fim)
//     IMPORTANTE p/ o cliente: tratar fim do stream SEM 'done' como FALHA (não como sucesso).
//
// (2) POST /reqs/api/v1/forge/preview/refine     [JSON; auth admin/Bearer]
//     Body JSON: { product, screenSlug, feedback, screen?, requirements?, inventory? }
//       - screen: a tela atual (se ausente, é resolvida de inventory.screens por screenSlug).
//       - requirements: grounding p/ a âncora (recomendado).
//     Resposta 200: { status:'ok', screen:{...SCREEN revisada}, inventory:{brand,entities,screens}, notes }
//       A `inventory` retornada JÁ tem a tela trocada — o cliente reusa em /generate { inventory } p/ regerar
//       o preview (ou o cliente chama /generate logo após, com o inventory atualizado).
//
// (3) GET  /reqs/api/v1/forge/preview/status?product=<slug>   [auth admin/Bearer; fail-soft]
//     Resposta 200: { product, status:'absent'|'building'|'ready'|'error'|'invalid', url?, jobId?,
//                     generatedAt?, error?, screens:[{slug,title,route,kind}] }
//
// (4) GET  /reqs/api/v1/forge/preview/:product/*   [SERVE a SPA estática do volume; público atrás do gate SSO]
//     dist/ buildado pelo runner. SPA: rotas internas do Vue caem no index.html. 404 fail-soft.
// =============================================================================
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
import { classifyDispatchToken, validateDispatchToken, dispatchErrorPayload } from './github.js';
import { runAuthoringChatTurn } from './ai/graph.js';
import { buildUsageRouter } from './usage/index.js';
import { forgeState } from './forge-state.js';
import { createForgeEventsHub } from './forge-events.js';
import {
  validateProduct, validateInventory, mergeScreen, buildPreviewPayload, dispatchForgePreview,
  previewStatus, previewInventory, previewBaseUrl, resolveAsset,
} from './forge-preview.js';
import fs from 'node:fs';

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
      for (const k of ['grounding', 'history', 'capabilities', 'blueprints', 'scope', 'context', 'draft']) {
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
    // dispatch: estado do GITHUB_DISPATCH_TOKEN (offline; sem tocar na rede) — o operador vê se o token
    // do Forge está 'present' | 'placeholder' | 'missing' sem precisar disparar um build.
    res.json({ status: 'ok', service: 'reqhub-api', ai: aiEnabled(), dispatch: classifyDispatchToken(), tools: reg.list().map((t) => t.name) });
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

  // SSE do estado vivo (A6): empurra o forgeState quando a assinatura muda — o polling do frontend
  // vira fallback. Auth pelo SSO de borda (EventSource não envia Authorization), igual ai-usage/stream.
  // IngressRoute dedicada SEM `compress` em k8s/api.yaml (armadilha conhecida: compress bufferiza SSE).
  const forgeEvents = createForgeEventsHub();
  router.get('/v1/forge/events', (req, res) => {
    try { forgeEvents.addClient(req, res); }
    catch (err) { console.error('[reqhub-api] forge/events:', err); if (!res.headersSent) res.status(500).end(); }
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
        arch_summary: b.arch_summary, // resumo de arquitetura/stack do sistema (o chat passa a conhecer a stack)
        identity: { sub: String(req.identity || 'operator') },
      }, memory);
      res.json({ status: 'ok', ...out });
    } catch (err) { next(err); }
  });

  // Forge (greenfield): propor requisitos/arquitetura — geram conteudo, nao escrevem git.
  // propose-requirements: entrada do usuario = 'brief' (descricao do produto novo).
  router.post('/v1/forge/propose-requirements', requireAuthoringAuth, ...withIngest('brief'), run('forge.propose_requirements'));
  router.post('/v1/forge/propose-architecture', requireAuthoringAuth, run('forge.propose_architecture'));

  // Forge IDEIA (etapa 1): COPILOTO DE PRODUTO conversacional (SSE). Roda a tool forge.idea.copilot e
  // transmite a resposta em DELTAS (o motor ai-core nao streama tokens — chunkamos a reply p/ cadencia
  // de digitacao) + um PATCH final do ideaDraft. 100% produto; anexos entram via withIngest('message').
  // Eventos: status -> delta* -> patch -> done (ou error). IngressRoute dedicada SEM `compress` (k8s/api.yaml).
  router.post('/v1/forge/idea/chat', requireAuthoringAuth, ...withIngest('message'), async (req, res) => {
    const b = req.body || {};
    if (typeof b.message !== 'string' || b.message.trim().length < 1) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'message obrigatorio' } });
    }
    const theLlm = llm || (await getLlm());
    if (!theLlm) return res.status(503).json({ error: { code: 'AI_DISABLED', message: 'IA desabilitada (sem credencial) — a etapa Ideia cai no formulario manual' } });

    sseStart(res);
    let closed = false;
    req.on('close', () => { closed = true; });
    const ka = setInterval(() => { if (!closed) { try { res.write(': keep-alive\n\n'); } catch { /* noop */ } } }, 15000);
    if (typeof ka.unref === 'function') ka.unref();
    const finish = () => { clearInterval(ka); try { res.end(); } catch { /* noop */ } };

    // Transmite a reply em pedacos (palavras) com micro-cadencia -> streaming REAL na rede + sensacao
    // de digitacao. Preserva os espacos (split capturando \s+) p/ o cliente reconstruir o texto exato.
    const streamText = async (text) => {
      const parts = String(text || '').split(/(\s+)/);
      let buf = ''; let n = 0;
      for (const part of parts) {
        if (closed) return;
        buf += part; n++;
        if (n >= 4 && buf.trim()) {
          sseEmit(res, 'delta', { text: buf }); buf = ''; n = 0;
          await new Promise((r) => { const t = setTimeout(r, 28); if (typeof t.unref === 'function') t.unref(); });
        }
      }
      if (buf && !closed) sseEmit(res, 'delta', { text: buf });
    };

    try {
      sseEmit(res, 'status', { phase: 'thinking' }); // feedback imediato (antes do await do LLM)
      const result = await dispatchTool(reg.get('forge.idea.copilot'),
        { product: b.product, message: b.message, history: b.history, draft: b.draft, mode: b.mode },
        { llm: theLlm, authenticated: true, identity: req.identity });
      if (closed) return finish();
      const out = result.output || {};
      await streamText(out.reply);
      if (closed) return finish();
      sseEmit(res, 'patch', {
        patch: out.patch || {},
        maturity: out.maturity || 0,
        open_questions: out.open_questions || [],
        quick_replies: out.quick_replies || [],
        ready: out.ready === true,
        summary: out.summary || '',
      });
      sseEmit(res, 'done', { ok: true, usage: out.usage || null });
      finish();
    } catch (err) {
      const code = (err && err.code && String(err.name || '').startsWith('AiTool')) ? err.code : 'IDEA_CHAT_ERROR';
      sseEmit(res, 'error', { code, message: String((err && err.message) || err) });
      finish();
    }
  });

  // Forge LAUNCH: a UI "cria no git" disparando a esteira (repository_dispatch -> greenfield-launch.yml).
  // O reqhub-api NÃO escreve git; só dispara. Fail-closed sem GITHUB_DISPATCH_TOKEN. Admin-only (auth).
  router.post('/v1/forge/launch', requireAuthoringAuth, async (req, res) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'criação automática desligada — defina GITHUB_DISPATCH_TOKEN no Secret reqhub-api-config (PAT fine-grained, Contents: Read and write).' } });
    const v = validateLaunchInput(req.body);
    if (!v.ok) return res.status(v.code === 'PROTECTED' ? 403 : 400).json({ error: { code: v.code, message: v.message } });
    // GATE (F3, Achado3): o caminho greenfield novo exige um PREVIEW 'ready' aprovado antes de
    // despachar a esteira. Retrocompatível: { skipPreviewGate: true } no corpo permite fluxos que
    // não usam preview (ex.: re-lançamentos automáticos). Sem essa flag, sem preview -> 409.
    if (!v.value.skipPreviewGate) {
      let pstatus = 'absent';
      try { pstatus = previewStatus(v.value.product).status; } catch { pstatus = 'absent'; }
      if (pstatus !== 'ready') {
        return res.status(409).json({ error: { code: 'PREVIEW_REQUIRED', message: `gere e aprove o preview das telas de '${v.value.product}' antes de construir (status atual do preview: ${pstatus}).` } });
      }
    }
    const built = buildClientPayload(v.value, req.identity);
    if (!built.ok) return res.status(413).json({ error: { code: built.code, message: built.message } });
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    try {
      const d = await dispatchForgeLaunch({ token, repo, payload: built.payload });
      if (!d.ok) { console.error('[reqhub-api] forge/launch dispatch falhou:', d.status, d.detail || ''); return res.status(502).json({ error: dispatchErrorPayload(d.status, 'criar o sistema') }); }
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
      if (!d.ok) { console.error('[reqhub-api] forge/delete dispatch falhou:', d.status, d.detail || ''); return res.status(502).json({ error: dispatchErrorPayload(d.status, 'excluir o sistema') }); }
      return res.status(202).json({
        status: 'deleting', product: v.value.product,
        actions_url: `https://github.com/${repo}/actions/workflows/forge-delete.yml`,
      });
    } catch (e) {
      return res.status(502).json({ error: { code: 'DISPATCH_ERROR', message: String((e && e.message) || e) } });
    }
  });

  // =========================================================================
  // FORGE PREVIEW (F3): preview iterativo de telas (ui-vue real + dados fake) ANTES de construir.
  // Contrato completo documentado no topo deste arquivo.
  // =========================================================================

  // helper SSE (espelha o padrão do pm-api do Console): cabeçalhos sem-buffer + emit(event,data).
  const sseStart = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // traefik/nginx: não bufferizar o stream
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
  };
  const sseEmit = (res, event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`); } catch { /* cliente foi embora */ }
  };

  // (1) GERAR + BUILDAR o preview (SSE). A IA propõe o inventário (forge.propose_screens) — ou usa o
  // inventory já pronto (regerar após refino) — depois DISPARA o build no runner e acompanha por polling.
  router.post('/v1/forge/preview/generate', requireAuthoringAuth, ...withIngest('brief'), async (req, res) => {
    const b = req.body || {};
    const vp = validateProduct(b.product);
    if (!vp.ok) return res.status(400).json({ error: { code: vp.code, message: vp.message } });
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    // PRÉ-FLIGHT do token ANTES de abrir o SSE: depois de sseStart o HTTP já é 200 e não dá para mudar o
    // status. Token ausente/placeholder -> 503 (config); token inválido/expirado (GitHub 401) -> 502.
    // Assim o 401 do GitHub nunca estoura no meio do stream nem vaza a mensagem crua para a UI.
    if (classifyDispatchToken(token) !== 'present') {
      return res.status(503).json({ error: { code: 'DISPATCH_DISABLED', message: 'Geração de preview desligada: configure um GITHUB_DISPATCH_TOKEN válido no Secret reqhub-api-config (PAT fine-grained com Contents: Read and write).' } });
    }
    const tokCheck = await validateDispatchToken({ token });
    if (!tokCheck.ok) {
      console.error('[reqhub-api] forge/preview pré-flight do token falhou:', tokCheck.status);
      return res.status(502).json({ error: dispatchErrorPayload(tokCheck.status, 'gerar o preview') });
    }
    const repo = process.env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
    const product = vp.product;

    sseStart(res);
    let closed = false;
    req.on('close', () => { closed = true; });
    // keep-alive (atravessa timeouts de proxy durante o build longo)
    const ka = setInterval(() => { if (!closed) { try { res.write(': keep-alive\n\n'); } catch { /* noop */ } } }, 15000);
    if (typeof ka.unref === 'function') ka.unref();
    const finish = () => { clearInterval(ka); try { res.end(); } catch { /* noop */ } };

    try {
      // MODO: inventory pronto (regerar) OU propor via IA.
      let inventory;
      if (b.inventory && typeof b.inventory === 'object') {
        sseEmit(res, 'start', { product, mode: 'inventory' });
        const inv = validateInventory(b.inventory);
        if (!inv.ok) { sseEmit(res, 'error', { code: inv.code, message: inv.message }); return finish(); }
        inventory = inv.value;
        sseEmit(res, 'inventory', { ...inventory, navGroups: b.inventory.navGroups || [], gaps: b.inventory.gaps || [], counts: { screens: inventory.screens.length, entities: inventory.entities.length } });
      } else {
        sseEmit(res, 'start', { product, mode: 'propose' });
        const theLlm = llm || (await getLlm());
        if (!theLlm) { sseEmit(res, 'error', { code: 'AI_DISABLED', message: 'IA desabilitada (sem credencial) — não dá p/ propor as telas' }); return finish(); }
        sseEmit(res, 'propose', { phase: 'propose-screens' });
        const result = await dispatchTool(reg.get('forge.propose_screens'),
          { product, requirements: b.requirements || [], architecture: b.architecture || {} },
          { llm: theLlm, authenticated: true, identity: req.identity });
        const out = result.output || {};
        inventory = { brand: out.brand, entities: out.entities, screens: out.screens };
        sseEmit(res, 'inventory', { ...inventory, navGroups: out.navGroups || [], gaps: out.gaps || [], counts: { screens: (out.screens || []).length, entities: (out.entities || []).length } });
      }
      if (closed) return finish();

      // DISPATCH do build no runner (vite build da SPA autocontida -> dist/ + manifest.json no volume).
      const jobId = `${product}-${Date.now().toString(36)}`;
      const built = buildPreviewPayload({ product, inventory, identity: req.identity, jobId });
      if (!built.ok) { sseEmit(res, 'error', { code: built.code, message: built.message }); return finish(); }
      const d = await dispatchForgePreview({ token, repo, payload: built.payload });
      if (!d.ok) { console.error('[reqhub-api] forge/preview dispatch falhou:', d.status, d.detail || ''); sseEmit(res, 'error', dispatchErrorPayload(d.status, 'gerar o preview')); return finish(); }
      const actionsUrl = `https://github.com/${repo}/actions/workflows/forge-preview.yml`;
      sseEmit(res, 'dispatch', { jobId, status: 'dispatched', actions_url: actionsUrl });

      // ACOMPANHA o build por polling do manifest.json no volume (fail-soft). Teto defensivo p/ não
      // segurar a conexão indefinidamente — o cliente sempre pode re-consultar via GET .../status.
      const t0 = Date.now();
      const DEADLINE_MS = Number(process.env.FORGE_PREVIEW_DEADLINE_MS || 10 * 60 * 1000);
      const POLL_MS = Number(process.env.FORGE_PREVIEW_POLL_MS || 4000);
      const poll = async () => {
        if (closed) return finish();
        const st = previewStatus(product);
        // só considera 'ready'/'error' deste job (ignora um preview antigo do mesmo produto)
        const sameJob = !st.jobId || st.jobId === jobId;
        if (st.status === 'ready' && sameJob) {
          sseEmit(res, 'ready', { product, url: st.url, screens: st.screens, jobId });
          sseEmit(res, 'done', { ok: true });
          return finish();
        }
        if (st.status === 'error' && sameJob) {
          sseEmit(res, 'error', { code: 'BUILD_FAILED', message: st.error || 'falha no build do preview' });
          return finish();
        }
        if (Date.now() - t0 > DEADLINE_MS) {
          sseEmit(res, 'error', { code: 'BUILD_TIMEOUT', message: 'o build do preview demorou demais; consulte o status novamente em instantes', actions_url: actionsUrl });
          return finish();
        }
        sseEmit(res, 'building', { jobId, status: 'building', elapsedMs: Date.now() - t0 });
        const t = setTimeout(() => { poll().catch(() => finish()); }, POLL_MS);
        if (typeof t.unref === 'function') t.unref();
      };
      poll().catch(() => finish());
    } catch (err) {
      // erro tipado do contrato AiTool -> code; senão genérico. Nunca 500 no meio do stream.
      const code = (err && err.code && String(err.name || '').startsWith('AiTool')) ? err.code : 'PREVIEW_ERROR';
      sseEmit(res, 'error', { code, message: String((err && err.message) || err) });
      finish();
    }
  });

  // (2) REFINAR UMA tela: a IA re-propõe a tela a partir do feedback; devolve a tela + o inventário
  // atualizado (mesma tela trocada). O cliente reusa o inventory em /generate { inventory } p/ regerar.
  router.post('/v1/forge/preview/refine', requireAuthoringAuth, ...withIngest('feedback'), async (req, res, next) => {
    try {
      const b = req.body || {};
      const vp = validateProduct(b.product);
      if (!vp.ok) return res.status(400).json({ error: { code: vp.code, message: vp.message } });
      const slug = String(b.screenSlug || '').trim();
      if (!slug) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'screenSlug obrigatório' } });
      if (typeof b.feedback !== 'string' || b.feedback.trim().length < 2) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'feedback obrigatório (>=2 chars)' } });
      }
      // tela atual: explícita (b.screen) ou resolvida do inventário pelo slug.
      const invScreens = (b.inventory && Array.isArray(b.inventory.screens)) ? b.inventory.screens : [];
      const current = (b.screen && typeof b.screen === 'object') ? b.screen : invScreens.find((s) => s && s.slug === slug);
      if (!current) return res.status(400).json({ error: { code: 'SCREEN_NOT_FOUND', message: `tela '${slug}' não encontrada (passe screen ou inventory)` } });

      const theLlm = llm || (await getLlm());
      if (!theLlm) return res.status(503).json({ error: { code: 'AI_DISABLED', message: 'IA desabilitada (sem credencial)' } });
      const result = await dispatchTool(reg.get('forge.refine_screen'),
        { product: vp.product, screen: { ...current, slug }, feedback: b.feedback, grounding: b.requirements || [] },
        { llm: theLlm, authenticated: true, identity: req.identity });
      const screen = result.output && result.output.screen;
      // atualiza o inventário (se enviado) com a tela revisada — pronto p/ regerar o preview.
      let inventory = null;
      if (b.inventory && typeof b.inventory === 'object') {
        const merged = mergeScreen(b.inventory, screen);
        if (merged.ok) inventory = merged.value;
      }
      return res.json({ status: 'ok', screen, notes: (result.output && result.output.notes) || '', inventory });
    } catch (err) { next(err); }
  });

  // (3) STATUS do preview (fail-soft; lê o manifest do volume). Nunca 500.
  router.get('/v1/forge/preview/status', requireAuthoringAuth, (req, res) => {
    const vp = validateProduct(req.query.product);
    if (!vp.ok) return res.status(400).json({ error: { code: vp.code, message: vp.message } });
    try { return res.json(previewStatus(vp.product)); }
    catch { return res.json({ product: vp.product, status: 'absent', url: null, screens: [] }); }
  });

  // (3b) INVENTÁRIO persistido do preview (A2): o runner grava inventory.json junto do manifest;
  // o Studio lê daqui para REFINAR telas fora do wizard (o preview deixou de ser descartável).
  router.get('/v1/forge/preview/inventory', requireAuthoringAuth, (req, res) => {
    const vp = validateProduct(req.query.product);
    if (!vp.ok) return res.status(400).json({ error: { code: vp.code, message: vp.message } });
    try {
      const r = previewInventory(vp.product);
      if (!r.ok) return res.status(r.code === 'NOT_FOUND' ? 404 : 422).json({ error: { code: r.code, message: r.code === 'NOT_FOUND' ? 'este produto ainda não tem inventário persistido (gere o preview primeiro)' : 'inventário persistido inválido — regenere o preview' } });
      return res.json({ product: vp.product, inventory: r.inventory });
    } catch { return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'inventário indisponível' } }); }
  });

  // (4) SERVIR a SPA estática do preview do volume. PÚBLICO (atrás do gate SSO de borda) — o conteúdo é
  // fake/efêmero e o iframe carrega da MESMA origem do Reqhub. Anti-traversal + SPA fallback no módulo.
  router.get('/v1/forge/preview/:product/*', (req, res) => {
    const r = resolveAsset(req.params.product, req.params[0] || '');
    if (!r.ok) {
      const code = r.code === 'FORBIDDEN' ? 403 : (r.code === 'INVALID_PRODUCT' ? 400 : 404);
      return res.status(code).json({ error: { code: r.code, message: 'preview asset não encontrado' } });
    }
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Cache-Control', 'no-store'); // preview é efêmero/iterado — nunca cachear
    // (E0, Forja 4.1) o middleware secure-headers do Traefik põe X-Frame-Options: DENY em TODAS as
    // rotas do api — o que bloqueava o IFRAME same-origin do Studio (fase Telas). CSP3 frame-ancestors
    // OBSOLETA o XFO no browser: com este header presente, o DENY do Traefik é ignorado e o framing
    // continua restrito à MESMA origem (anti-clickjacking preservado).
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    return fs.createReadStream(r.file).on('error', () => { try { res.status(404).end(); } catch { /* noop */ } }).pipe(res);
  });
  // sem o sufixo: redireciona p/ a barra final (assets relativos da SPA resolvem corretamente).
  router.get('/v1/forge/preview/:product', (req, res) => {
    const vp = validateProduct(req.params.product);
    if (!vp.ok) return res.status(400).json({ error: { code: vp.code, message: vp.message } });
    return res.redirect(302, `${previewBaseUrl(vp.product)}`);
  });

  // Painel "Uso da IA" (/v1/ai-usage/*): leitura admin-only de custo/uso/limites (Claude+OpenAI),
  // agregando telemetria interna (Prometheus/Langfuse) + contas. Fail-soft; mantém o reqhub no ar.
  const { router: usageRouter, ctx: usageCtx } = buildUsageRouter();
  router.use('/v1/ai-usage', usageRouter);
  router._usageCtx = usageCtx; // exposto p/ a fase de live (SSE) reusar o mesmo contexto

  return router;
}

export { statusForError };
