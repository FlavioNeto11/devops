// studio.js — o PRODUCT STUDIO (Forja) do Reqhub, extraído do monólito app.js na A1b da Forja 4.0.
// Contém o hub de produtos, o detalhe do produto, o wizard greenfield (fw*), o preview F3 e os
// controles de launch/delete. Contexto compartilhado (state/DATA/h/AI/...) vem de core.js; funções
// de navegação do app.js chegam pelo registry `nav` (late-binding, registrado em init()) — sem
// import circular. Lógica pura continua em forge-lib.js/lib.js (testáveis com node:test).
import {
  state, DATA, h, svg, badge, byId, AI, dd, dt, filePicker, sameOriginUrl, applyTransform, nav,
} from './core.js?v=3';
import { findSimilarReqs, forceLayout, toYaml, truncateLabel } from './lib.js?v=42';
import {
  productSummaries, findProduct, blueprintById, studioPhaseModel, buildDag, dagFromWaves, wavesFromProgress,
  weightedProgress, launchPhases, reqRow, forgeStatusCls, hubSummary, nextReqId, proposeHint,
  typeLabel, asList, planSummary, mergeLiveProducts, mergeImplItems, forgeStateSig,
  FORGE_MODES, FORGE_MODE_KEY, FORGE_MODE_LABELS, normalizeForgeMode, modeCopy,
  projectRequirementCard, forgeReqObject, buildLaunchBody,
  briefFromPortalContract, externalContractRef, suggestIntegrationBlock,
  isT1Product, embedConsoleUrl, publishedSiteUrl, parseEmbedMessage,
  emptyIdea, normalizeIdea, applyIdeaPatch, ideaReady, ideaMaturityHint, composeBriefFromIdea, IDEA_MATURITY_THRESHOLD,
  previewErrorMessage, businessSummaryFromIdea,
} from './forge-lib.js?v=62';
// (E1, Forja 4.1) deep-links canônicos da casca global (mesma cópia codegen-synced que o
// index.html carrega — manter o ?v= IGUAL ao do <script> para não duplicar o módulo).
import { surfaceLink } from './platform-shell.js?v=45';

// Navegação do app.js via registry (late-binding) — mesmos nomes do código extraído.
const switchView = (...a) => nav.switchView(...a);
const openReq = (...a) => nav.openReq(...a);
const overviewBriefing = (...a) => nav.overviewBriefing(...a);

// (E1, Forja 4.1) CONTEXTO DE PRODUTO na casca global: o Studio anuncia o produto aberto via
// atributos reativos da <platform-shell> (chip "em <produto>" + launcher "Neste produto").
// O contexto viaja por URL (#/forge?product=…, ver writeHash/applyHashRoute) — aqui só
// refletimos o estado atual no componente. CSP-safe (setAttribute, zero inline).
function syncShellProduct(name, label) {
  const sh = document.querySelector('platform-shell');
  if (!sh) return;
  if (name) { sh.setAttribute('product', name); sh.setAttribute('product-label', label || name); }
  else { sh.removeAttribute('product'); sh.removeAttribute('product-label'); }
}
/* ─── (E2, Forja 4.1) cliente do portal-recorder (mesma origem, CSP connect-src 'self') ───
   As rotas de LEITURA do portal-rec-api são abertas atrás do SSO de borda — fetch direto,
   SEM Authorization (o token do AI é do reqhub-api; o promote com token NÃO é escopo daqui).
   Fail-soft: qualquer erro (rede/5xx) vira { ok:false } — o chamador degrada com mensagem. */
const PORTAL_REC_BASE = '/portal-rec/api';
async function portalRecGet(path) {
  try {
    const r = await fetch(PORTAL_REC_BASE + path, { headers: { Accept: 'application/json' } });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, data: { error: { message: String((e && e.message) || e) } } }; }
}

const DONE_ST = ['deployed', 'done', 'merged'];
function dStateCls(status) {
  if (DONE_ST.includes(status)) return 'done';
  if (status === 'blocked') return 'blocked';
  if (status === 'in_progress' || status === 'pr_open') return 'active';
  return 'todo';
}
async function loadBuildPlan(name) {
  if (DATA.buildPlans[name] !== undefined) return DATA.buildPlans[name];
  try { const r = await fetch('data/products/' + encodeURIComponent(name) + '/build-plan.json'); DATA.buildPlans[name] = r.ok ? await r.json() : null; }
  catch { DATA.buildPlans[name] = null; }
  return DATA.buildPlans[name];
}
function openForgeProduct(name) {
  state.forge.product = name; state.forge.newMode = false;
  // Abre na fase mais RELEVANTE: Build se o produto já está em construção/no ar (algum requisito
  // além de not_started, ou já há build-plan carregado); senão Definir (produto novo/sem nada).
  const product = findProduct(DATA.products, name);
  const reqIds = (product && product.requirement_ids) || [];
  const items = (DATA.implStatus && DATA.implStatus.items) || {};
  const started = reqIds.some((id) => items[id] && items[id].status && items[id].status !== 'not_started');
  // Fase inicial do TRILHO: produto em construção/no ar abre no Pipeline; novo abre na primeira
  // fase pendente (null = resolvido pelo renderForgeDetail via studioPhaseModel).
  state.forge.step = (started || DATA.buildPlans[name]) ? 'pipeline' : null;
  syncShellProduct(name, product && product.display_name);
  switchView('forge'); document.getElementById('tab-forge').focus();
  if (name && DATA.buildPlans[name] === undefined) loadBuildPlan(name).then(() => { if (state.view === 'forge' && state.forge.product === name) renderForge(); });
}
function openForgeNew() { state.forge.product = null; state.forge.newMode = true; state.forge.newKind = null; switchView('forge'); }
// backToHub navega por switchView (e não renderForge direto) para o writeHash tirar o
// ?product= da URL — o contexto de produto viaja por URL e precisa sumir junto com o chip.
function backToHub() { state.forge.product = null; state.forge.newMode = false; state.forge.newKind = null; syncShellProduct(null); switchView('forge'); }
function forgeStep(step) { state.forge.step = step; renderForge(); }

/* ─── (C2) MODOS DE USUÁRIO: estado do FRONTEND (localStorage), projeções em forge-lib ───
   O modo NUNCA muda os artefatos gerados (requisitos/arquitetura/launch são idênticos) —
   só o disclosure/condução. Seletor discreto na entrada do Studio (hub e wizard). */
function forgeMode() {
  try { return normalizeForgeMode(localStorage.getItem(FORGE_MODE_KEY)); } catch { return 'guiado'; }
}
function setForgeMode(m) {
  try { localStorage.setItem(FORGE_MODE_KEY, normalizeForgeMode(m)); } catch { /* ignore */ }
  renderForge();
}
function forgeModeSelector() {
  const cur = forgeMode();
  const group = h('div', { class: 'fw-modes forge-mode-sel', role: 'radiogroup', 'aria-label': 'Modo de uso da Forja' });
  FORGE_MODES.forEach((m, i) => {
    const on = m === cur;
    const onkey = (ev) => {
      let j = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = (i + 1) % FORGE_MODES.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = (i - 1 + FORGE_MODES.length) % FORGE_MODES.length;
      else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = FORGE_MODES.length - 1;
      if (j != null) {
        ev.preventDefault();
        setForgeMode(FORGE_MODES[j]);
        const el = document.querySelector('#forge-body .forge-mode-sel [aria-checked="true"]');
        if (el) el.focus();
      }
    };
    group.append(h('button', {
      class: 'fw-mode' + (on ? ' is-on' : ''), type: 'button', role: 'radio',
      'aria-checked': on ? 'true' : 'false', tabindex: on ? '0' : '-1',
      onclick: () => setForgeMode(m), onkeydown: onkey,
    },
    h('strong', { text: FORGE_MODE_LABELS[m] }),
    h('span', { class: 'fw-mode-sub', text: modeCopy(m, 'selector.sub') })));
  });
  return group;
}

// barra de progresso em SVG (largura por ATRIBUTO, cor por classe no stylesheet — CSP-safe)
function progressBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const wrap = h('div', { class: 'forge-bar-wrap' });
  const s = svg('svg', { class: 'forge-bar', viewBox: '0 0 100 7', preserveAspectRatio: 'none', role: 'img', 'aria-label': p + '% concluído' });
  s.append(svg('rect', { class: 'forge-bar-track', x: '0', y: '0', width: '100', height: '7', rx: '3' }));
  s.append(svg('rect', { class: 'forge-bar-fill' + (p >= 100 ? ' is-complete' : ''), x: '0', y: '0', width: String(p), height: '7', rx: '3' }));
  wrap.append(s, h('span', { class: 'forge-pct', text: p + '%' }));
  return wrap;
}
function svgText(attrs, label) { const t = svg('text', attrs); t.append(document.createTextNode(label)); return t; }
function setForgeTitle(suffix) { try { document.title = 'Forja' + (suffix ? ' — ' + suffix : '') + ' · Reqhub'; } catch { /* ignore */ } }
// bloco de código com botão "Copiar" (clipboard API; feedback temporário)
function codeBlock(text, cls, label) {
  const wrap = h('div', { class: 'forge-codeblock' });
  const btn = h('button', { class: 'btn forge-copy', type: 'button', 'aria-label': 'Copiar ' + (label || 'código'), text: 'Copiar' });
  btn.addEventListener('click', () => {
    const done = () => { btn.textContent = 'Copiado ✓'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else done();
  });
  wrap.append(btn, h('pre', { class: cls }, text));
  return wrap;
}

// --- Estado VIVO da Forja (tempo real): polling do endpoint /v1/forge/state; re-renderiza quando
// o progresso de algum produto muda. Fail-soft: endpoint fora -> mantém os dados baked (data/*.json). ---
let _forgeStateSig = '';
let _forgeStateInflight = false;
let _forgePollTimer = null;
// (D1, Forja 4.1) merge VIVO×BAKED via funções puras de forge-lib: presença = vivo fresco (união
// ressuscitaria produto apagado — imagem :local não rebakeia sozinha); baked preenche CAMPOS que o
// vivo não transporta (origin/vision/phases…); implStatus = UNIÃO por id (o replace antigo zerava
// os ~350 REQs de escopos de plataforma que o payload vivo não carrega, apagando Explorador/cards).
function applyForgeState(payload) {
  if (!payload || payload.source === 'empty' || !Array.isArray(payload.products) || !payload.products.length) return null;
  const prevArch = {};
  for (const p of ((DATA.products && DATA.products.products) || [])) if (p && p.name) prevArch[p.name] = p.architecture_summary;
  const bakedProducts = (DATA.baked && DATA.baked.products && DATA.baked.products.products) || [];
  const bakedItems = (DATA.baked && DATA.baked.implStatus && DATA.baked.implStatus.items) || {};
  const merged = mergeLiveProducts(bakedProducts, payload.products, prevArch);
  DATA.products = { products: merged };
  DATA.implStatus = { items: mergeImplItems(bakedItems, payload.products) };
  // plano de build vivo (waves) -> alimenta o stepper "Arquitetura" (fim do "sem plano de build")
  for (const p of payload.products) if (p.buildPlan !== undefined) DATA.buildPlans[p.name] = p.buildPlan;
  return merged;
}
// O re-render VIVO (SSE/poll) não pode descartar o que o usuário está fazendo: com o wizard
// "Novo produto" aberto (state.forge.newMode — os dados vivos não alimentam o wizard) ou com foco
// em campo de texto DENTRO da Forja, o renderForge é ADIADO (pendingRender) e disparado quando o
// foco sai / o wizard fecha (todo fechamento passa por switchView/renderForge, que consomem o
// flag) — a tela não fica permanentemente desatualizada. Os dados vivos já foram mesclados em
// DATA (applyForgeState roda antes); só o REPAINT é adiado.
let _forgePendingRender = false;
function forgeLiveRenderBlocked() {
  if (state.forge && state.forge.newMode) return true;
  const ae = document.activeElement;
  return !!(ae && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName) && ae.closest('#view-forge'));
}
function forgeLiveRender() {
  if (String(location.hash || '').indexOf('forge') < 0) return; // mesmo guard de antes: fora da Forja não re-renderiza
  if (forgeLiveRenderBlocked()) { _forgePendingRender = true; return; }
  renderForge();
}
// Flush do render adiado quando o foco sai de um campo. setTimeout(0): focusout dispara ANTES do
// focusin do destino — espera o foco assentar para reavaliar o bloqueio (campo→campo não repinta).
document.addEventListener('focusout', () => {
  if (!_forgePendingRender) return;
  setTimeout(() => { if (_forgePendingRender && !forgeLiveRenderBlocked() && String(location.hash || '').indexOf('forge') >= 0) renderForge(); }, 0);
});
async function refreshForgeState(forceRender) {
  if (_forgeStateInflight) return;
  _forgeStateInflight = true;
  try {
    const r = await AI.get('/v1/forge/state');
    const merged = (r.ok && r.data) ? applyForgeState(r.data) : null;
    if (merged) {
      const sig = forgeStateSig(merged); // assinatura sobre o MESCLADO (mudança vinda do baked também re-renderiza)
      if (forceRender || sig !== _forgeStateSig) { _forgeStateSig = sig; forgeLiveRender(); }
    }
  } catch { /* fail-soft: mantém o baked */ } finally { _forgeStateInflight = false; }
}
// (A6) estado vivo por SSE (push quando a assinatura muda no servidor); o polling de 15s vira
// FALLBACK automático se o stream cair/não existir (ambiente local sem backend, proxy antigo etc.).
let _forgeEs = null;
function startForgeStatePollingFallback() {
  if (_forgePollTimer) return;
  _forgePollTimer = setInterval(() => { if (String(location.hash || '').indexOf('forge') >= 0) refreshForgeState(false); }, 15000);
}
function ensureForgePolling() {
  if (_forgeEs || _forgePollTimer) return;
  try {
    const es = AI.stream('/v1/forge/events');
    es.addEventListener('state', (ev) => {
      let data = null;
      try { data = JSON.parse(ev.data); } catch { return; }
      const merged = applyForgeState(data);
      if (merged) {
        const sig = forgeStateSig(merged);
        if (sig !== _forgeStateSig) { _forgeStateSig = sig; forgeLiveRender(); }
      }
    });
    es.onerror = () => { try { es.close(); } catch { /* noop */ } _forgeEs = null; startForgeStatePollingFallback(); };
    _forgeEs = es;
  } catch { startForgeStatePollingFallback(); }
}

function renderForge() {
  _forgePendingRender = false; // qualquer render integral consome o re-render adiado (DATA já está fresco)
  ensureForgePolling();
  void refreshForgeState(false);
  conteudoCleanup(); // (E4) listener/timer da fase Conteúdo não sobrevive a um re-render
  const body = document.getElementById('forge-body');
  body.replaceChildren();
  // (E1) reflete o contexto de produto na casca em TODOS os caminhos de entrada — inclusive o
  // deep-link #/forge?product= (applyHashRoute seta o state sem passar por openForgeProduct).
  const ctxProduct = (!state.forge.newMode && state.forge.product) ? state.forge.product : null;
  const ctxP = ctxProduct ? findProduct(DATA.products, ctxProduct) : null;
  syncShellProduct(ctxProduct, ctxP && ctxP.display_name);
  if (!DATA.products || !((DATA.products.products) || []).length) {
    body.append(forgeIntroHead());
    body.append(h('p', { class: 'empty', text: 'Nenhum produto registrado ainda — gere um com o Forge (brief → requisitos → PR) ou rode build-products.mjs.' }));
    return;
  }
  // (A4) PONTO ÚNICO de criação: fork na entrada — portal de conteúdo (CMS), sistema (greenfield)
  // ou (E2) sistema a partir de um PORTAL CAPTURADO (contrato do portal-recorder como insumo).
  if (state.forge.newMode && !state.forge.newKind) { setForgeTitle('Criar'); renderForgeKindFork(body); return; }
  if (state.forge.newMode && state.forge.newKind === 'portal') { setForgeTitle('Criar um portal'); renderForgePortalTrail(body); return; }
  if (state.forge.newMode && state.forge.newKind === 'captura') { setForgeTitle('Criar de um portal capturado'); renderForgeCaptureTrail(body); return; }
  if (state.forge.newMode) { setForgeTitle('Criar um sistema'); renderForgeWizard(body); }
  else if (state.forge.product) { const p = findProduct(DATA.products, state.forge.product); setForgeTitle(p ? p.display_name : state.forge.product); renderForgeDetail(body, state.forge.product); }
  else { setForgeTitle('Produtos'); renderForgeHub(body); }
}
function forgeIntroHead() {
  return h('div', { class: 'forge-head' }, h('div', {},
    h('h2', { class: 'forge-title', text: 'Forja — todos os produtos da plataforma' }),
    h('p', { class: 'muted', text: 'Cada produto nasce de requisitos e é acompanhado daqui: brief → requisitos → arquitetura → telas → documentação → pipeline → no ar. A mesma esteira constrói do onepage ao sistema completo.' })));
}

function renderForgeHub(body) {
  const summ = hubSummary(DATA.products, DATA.implStatus);
  const reqs = (DATA.baseline && DATA.baseline.requirements) || [];
  const asr = reqs.filter((r) => r && r.architectural_significance).length;
  const head = forgeIntroHead();
  head.querySelector('div').append(h('div', { class: 'forge-stats' },
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.products) }), ' produto(s)'),
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.totalReqs) }), ' requisitos'),
    h('span', { class: 'forge-stat' }, h('b', { text: String(asr) }), ' ASR'),
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.totalDone) }), ' no ar'),
    h('span', { class: 'forge-stat' }, h('b', { text: summ.pct + '%' }), ' concluído')));
  body.append(head);
  // (C2) seletor de modo de uso — projeção da MESMA engine (não muda o que é gerado)
  body.append(forgeModeSelector());

  const all = productSummaries(DATA.products, DATA.implStatus);
  // Briefing proativo (ex-Visão geral, A1a): anomalias acionáveis na porta de entrada do Studio.
  body.append(overviewBriefing(reqs, all));
  const cat = (p) => (p.progress.total > 0 && p.progress.pct === 100) ? 'live' : (p.progress.live > 0 || (p.progress.total - (p.progress.by.not_started || 0)) > 0) ? 'building' : 'new';
  // filtro por status (segmentado) — facilita "navegar tudo que está sendo criado"
  const filters = [['all', 'Todos'], ['building', 'Em construção'], ['live', 'No ar'], ['new', 'Não iniciados']];
  const bar = h('div', { class: 'forge-filter', role: 'group', 'aria-label': 'Filtrar produtos por status' });
  for (const [key, label] of filters) {
    const n = key === 'all' ? all.length : all.filter((p) => cat(p) === key).length;
    bar.append(h('button', { class: 'lg-chip', type: 'button', 'aria-pressed': state.forge.filter === key ? 'true' : 'false', onclick: () => { state.forge.filter = key; renderForge(); } },
      h('span', { class: 'lg-name', text: label }), h('span', { class: 'lg-n', text: String(n) })));
  }
  body.append(bar);

  const shown = all.filter((p) => state.forge.filter === 'all' || cat(p) === state.forge.filter);
  const cards = h('div', { class: 'forge-cards' });
  for (const p of shown) {
    const live = p.progress.pct === 100 && p.progress.total > 0;
    // (E4) produto t1 (portal de conteúdo): sem requisitos/esteira — contadores de REQ mentiriam.
    const t1 = p.app_type === 'cms_portal';
    const card = h('button', { class: 'forge-card', type: 'button', 'aria-label': t1 ? `${p.display_name}: portal de conteúdo (CMS)` : `${p.display_name}: ${p.progress.live} de ${p.reqCount} requisitos no ar (${p.progress.pct}%)`, onclick: () => openForgeProduct(p.name) },
      h('div', { class: 'forge-card-top' }, h('span', { class: 'forge-card-name', text: p.display_name }), h('span', { class: 'forge-card-path', text: p.base_path })),
      p.blueprint ? h('span', { class: 'forge-card-bp', text: p.blueprint }) : null,
      h('p', { class: 'forge-card-vision', text: p.vision || 'Sem descrição.' }),
      t1
        ? h('div', { class: 'forge-card-foot' }, h('span', { class: 'muted', text: 'conteúdo no CMS' }), badge('portal de conteúdo', 'b-nfr'))
        : h('div', { class: 'forge-card-foot' }, h('span', { class: 'muted', text: `${p.progress.live}/${p.reqCount} no ar` }), badge(live ? 'no ar' : (cat(p) === 'new' ? 'não iniciado' : 'em construção'), live ? 'b-ok' : (cat(p) === 'new' ? 'b-low' : 'b-high'))),
      t1 ? null : progressBar(p.progress.pct));
    cards.append(card);
  }
  if (!shown.length) cards.append(h('p', { class: 'empty', text: 'Nenhum produto neste filtro.' }));
  cards.append(h('button', { class: 'forge-card forge-new', type: 'button', 'aria-label': 'Criar novo produto a partir de um brief', onclick: () => openForgeNew() },
    h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' }), h('strong', { text: 'Novo produto' }), h('span', { class: 'muted', text: 'brief → requisitos (IA) → PR' })));
  body.append(cards);

  // (D3, Forja 4.1) Apps FORA da Forja: implantáveis do monorepo (apps-index.json, gerado pelo
  // build-products) sem product.json — visibilidade + CTA de adoção, SEM fabricar requisitos.
  // Plataforma/ferramentas ficam de fora (o Console é o painel canônico delas).
  const PLATFORM_APPS = new Set(['reqhub', 'ai-control-plane', 'portal-recorder']);
  const outside = (((DATA.appsIndex || {}).apps) || []).filter((a) => a && !a.has_product && !PLATFORM_APPS.has(a.name));
  if (outside.length) {
    body.append(h('h3', { class: 'forge-outside-title', text: `Apps fora da Forja (${outside.length})` }),
      h('p', { class: 'muted small', text: 'Apps vivos do monorepo ainda sem contrato de produto (requisitos + product.json). Adote pelo padrão sicat/gymops: extração de requisitos do que o app JÁ faz → PR de adoção → o app entra no trilho.' }));
    const oc = h('div', { class: 'forge-cards forge-outside' });
    for (const a of outside) {
      const url = sameOriginUrl(a.base_path ? a.base_path + '/' : '');
      oc.append(h('div', { class: 'forge-card forge-card-outside' },
        h('div', { class: 'forge-card-top' }, h('span', { class: 'forge-card-name', text: a.name }), h('span', { class: 'forge-card-path', text: a.base_path })),
        h('p', { class: 'forge-card-vision muted', text: a.app_type === 'cms_portal' ? 'Portal/SPA de conteúdo — vira produto t1 quando tiver conteúdo real.' : 'App de negócio sem requisitos na base — candidato a adoção.' }),
        h('div', { class: 'forge-card-foot' },
          url ? h('a', { class: 'btn-link', href: url, target: '_blank', rel: 'noopener', text: 'abrir ↗' }) : h('span', {}),
          badge('fora da Forja', 'b-high'))));
    }
    body.append(oc);
  }
}

/* ---------- (A4) fork de criação: portal de conteúdo (CMS) × sistema (greenfield) ----------
   Um único "Novo produto" para tudo. Portal/onepage NÃO passa pela esteira de código: o executor é
   o CMS (pm-api + site-renderer) — o Studio encaminha para o editor visual do Console SEM duplicar
   o wizard (decisão da revisão adversarial: deep-link, não reimplementação). O registro do portal
   como produto t1 em specs/products chega com o catálogo v2 (C1). */
function renderForgeKindFork(body) {
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: 'Criar' }]));
  body.append(h('div', { class: 'forge-head' }, h('div', {},
    h('h2', { class: 'forge-title', text: 'O que você quer criar?' }),
    h('p', { class: 'muted', text: 'Tudo nasce aqui — do onepage de conteúdo ao sistema completo com API, banco e esteira.' }))));
  const cards = h('div', { class: 'forge-cards' });
  const card = (title, desc, foot, onclick) => h('button', { class: 'forge-card', type: 'button', onclick },
    h('div', { class: 'forge-card-top' }, h('span', { class: 'forge-card-name', text: title })),
    h('p', { class: 'forge-card-vision', text: desc }),
    h('div', { class: 'forge-card-foot' }, h('span', { class: 'muted', text: foot })));
  cards.append(
    card('Portal / onepage de conteúdo', 'Site institucional, landing page ou portal de conteúdo — páginas e seções montadas no editor visual (CMS), com IA para gerar o conteúdo. No ar em minutos, sem código.', 'executor: CMS · sem esteira de código', () => { state.forge.newKind = 'portal'; renderForge(); }),
    card('Sistema / produto de software', 'Aplicação completa a partir de requisitos: a IA propõe requisitos e arquitetura, você refina o preview das telas e a esteira constrói (frontend + API + banco + k8s + CI).', 'executor: esteira greenfield · requisitos → código', () => { state.forge.newKind = 'sistema'; renderForge(); }));
  // (E2) 3º cartão: portal CAPTURADO como insumo — copy projetada pelo MODO (modeCopy), mesma
  // engine por baixo. Fail-soft: sonda o /health do portal-rec e DEGRADA o rodapé (badge) se
  // estiver fora — o cartão continua clicável (a trilha explica e oferece "tentar de novo").
  const mode = forgeMode();
  const capFoot = h('span', { class: 'muted', text: modeCopy(mode, 'fork.capture.foot') });
  const capCard = h('button', { class: 'forge-card', type: 'button', onclick: () => { state.forge.newKind = 'captura'; renderForge(); } },
    h('div', { class: 'forge-card-top' }, h('span', { class: 'forge-card-name', text: modeCopy(mode, 'fork.capture.title') })),
    h('p', { class: 'forge-card-vision', text: modeCopy(mode, 'fork.capture.desc') }),
    h('div', { class: 'forge-card-foot' }, capFoot));
  cards.append(capCard);
  portalRecGet('/health').then((r) => {
    if (!r.ok && capFoot.isConnected) {
      capFoot.textContent = '';
      capFoot.append(badge('portal-recorder fora do ar', 'b-crit'), ' — dá para entrar e tentar de novo');
    }
  });
  body.append(cards);
}

/* ---------- (E2, Forja 4.1) trilha "a partir de um portal capturado" ----------
   Lista os contratos normalizados do portal-recorder (GET /v1/contracts + /v1/portals p/ nomear)
   e, ao escolher um, busca o EXPORT canônico (sem samples), deriva o brief CLIENT-SIDE
   (briefFromPortalContract) e pré-carrega o wizard greenfield com o insumo (w.capture):
   o export vira anexo do propose-requirements e a referência vira architecture.external_contract
   no launch. Fail-soft de ponta a ponta — portal-rec fora nunca quebra o fork. */
function renderForgeCaptureTrail(body) {
  body.append(forgeCrumbs([
    { label: 'Produtos', onclick: backToHub },
    { label: 'Criar', onclick: () => { state.forge.newKind = null; renderForge(); } },
    { label: 'Portal capturado' }]));
  const mode = forgeMode();
  const sec = h('div', { class: 'forge-section' });
  sec.append(h('h3', { text: modeCopy(mode, 'fork.capture.title') }),
    h('p', { class: 'muted', text: modeCopy(mode, 'capture.lead') }));
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const listBox = h('div', {});
  sec.append(status, listBox);
  body.append(sec);
  captureLoadContracts(status, listBox);
}

async function captureLoadContracts(status, listBox) {
  status.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Consultando os contratos capturados…');
  listBox.replaceChildren();
  const [cr, pr] = await Promise.all([portalRecGet('/v1/contracts'), portalRecGet('/v1/portals')]);
  if (!cr.ok) {
    status.textContent = '';
    listBox.append(h('div', { class: 'card' },
      h('h4', {}, badge('portal-recorder indisponível', 'b-crit')),
      h('p', { class: 'muted', text: 'Não consegui listar os contratos capturados (o portal-recorder está fora do ar ou sem resposta). Os outros caminhos de criação continuam funcionando normalmente.' }),
      h('div', { class: 'fw-actions' },
        h('button', { class: 'btn', type: 'button', text: '↻ Tentar de novo', onclick: () => captureLoadContracts(status, listBox) }),
        h('a', { class: 'btn-link', href: '/portal-rec/', target: '_blank', rel: 'noopener', text: 'abrir o portal-recorder ↗' }))));
    return;
  }
  const contracts = (cr.data && Array.isArray(cr.data.data)) ? cr.data.data : [];
  // portais só para NOMEAR os grupos (fail-soft: sem eles, agrupa pelo portal_id).
  const portals = new Map();
  if (pr.ok && pr.data && Array.isArray(pr.data.data)) for (const p of pr.data.data) if (p && p.id) portals.set(p.id, p);
  if (!contracts.length) {
    status.textContent = '';
    listBox.append(h('p', { class: 'empty', text: 'Nenhum contrato capturado ainda.' }),
      h('p', { class: 'muted small', text: 'Capture um portal no portal-recorder (sessão de captura → normalizar) e ele aparece aqui como insumo de criação.' }),
      h('div', { class: 'fw-actions' }, h('a', { class: 'btn primary', href: '/portal-rec/', target: '_blank', rel: 'noopener', text: 'Capturar um portal ↗' })));
    return;
  }
  status.textContent = `${contracts.length} contrato(s) capturado(s).`;
  const byPortal = new Map();
  for (const c of contracts) { const k = c.portal_id || '?'; if (!byPortal.has(k)) byPortal.set(k, []); byPortal.get(k).push(c); }
  const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return String(v || ''); } };
  for (const [pid, list] of byPortal) {
    const portal = portals.get(pid) || { slug: pid, name: pid };
    listBox.append(h('h4', { class: 'fw-sec' }, (portal.name || portal.slug) + ' ', h('code', { class: 'fw-cap-id', text: portal.slug })));
    const ul = h('ul', { class: 'forge-reqlist' });
    for (const c of list) {
      const st = h('span', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
      const use = h('button', { class: 'btn primary', type: 'button', text: 'Usar como insumo' });
      use.addEventListener('click', () => captureSelectContract(c, portal, use, st));
      ul.append(h('li', { class: 'forge-reqitem forge-capture-item' },
        h('code', { text: c.id }),
        h('span', { class: 'rt', text: `v${c.version} · ${fmtDate(c.created_at)} · ${c.endpoint_count} endpoint(s)` }),
        use, st));
    }
    listBox.append(ul);
  }
  listBox.append(h('p', { class: 'muted small', text: 'O export usado é o canônico SEM payloads de exemplo (samples nunca saem do portal-recorder). Ele vira o brief + o contexto da IA, e o launch carimba a referência do contrato na arquitetura.' }));
}

async function captureSelectContract(contract, portal, btn, st) {
  btn.disabled = true;
  st.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Baixando o export…');
  const r = await portalRecGet('/v1/contracts/' + encodeURIComponent(contract.id) + '/export');
  const exportJson = r.ok && r.data ? r.data.data : null;
  if (!exportJson) {
    const msg = (r.data && r.data.error && r.data.error.message) || ('HTTP ' + r.status);
    st.replaceChildren(h('span', { class: 'fw-err', text: 'Export falhou: ' + msg }));
    btn.disabled = false;
    return;
  }
  const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
  const blk = suggestIntegrationBlock(catalog);
  const brief = briefFromPortalContract(exportJson, { integrationBlock: blk });
  if (!brief) {
    st.replaceChildren(h('span', { class: 'fw-err', text: 'O export veio sem endpoints utilizáveis — normalize a sessão de novo no portal-recorder.' }));
    btn.disabled = false;
    return;
  }
  // Pré-carrega um wizard NOVO com o insumo. O nome fica em branco de propósito: o produto é um
  // sistema NOVO derivado do portal (nome próprio), não o portal em si (evita slug protegido).
  state.forge.wizard = null;
  state.forge.newKind = 'sistema';
  const w = forgeWizardState();
  w.brief = brief;
  w.capture = {
    portal: portal.slug || String(contract.portal_id || ''),
    contract_id: contract.id,
    ref: externalContractRef(exportJson),           // -> architecture.external_contract no launch
    export: exportJson,                              // -> anexo multipart do propose-requirements
    suggestedBlock: blk || null,
  };
  renderForge();
}

// Arquivo do export p/ o multipart do propose-requirements (o file-ingest do backend extrai o
// texto de .json e o funde ao brief — o contrato vira contexto da IA sem endpoint novo). null =
// sem insumo de captura no wizard.
function fwCaptureFile(w) {
  if (!w || !w.capture || !w.capture.export) return null;
  try {
    return new File([JSON.stringify(w.capture.export)],
      'portal-contract-' + (w.capture.portal || 'portal') + '.json', { type: 'application/json' });
  } catch { return null; }
}
function renderForgePortalTrail(body) {
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: 'Criar', onclick: () => { state.forge.newKind = null; renderForge(); } }, { label: 'Portal de conteúdo' }]));
  const sec = h('div', { class: 'forge-section' });
  sec.append(h('h3', { text: 'Portal / onepage de conteúdo' }),
    h('p', { class: 'muted', text: 'Portais vivem no CMS da plataforma: páginas e seções persistidas, editor visual com IA e renderização em /sites/<chave>. A criação e a edição acontecem no Console (aba Conteúdo) — este trilho te leva direto para lá com o assistente aberto.' }),
    h('ol', { class: 'linklist' },
      h('li', {}, h('span', { class: 'lt', text: '1' }), 'Clique abaixo — o Console abre com o assistente "Novo portal" já aberto.'),
      h('li', {}, h('span', { class: 'lt', text: '2' }), 'Defina nome/chave e (opcional) deixe a IA gerar o conteúdo inicial a partir de um prompt.'),
      h('li', {}, h('span', { class: 'lt', text: '3' }), 'Edite visualmente (clique-para-editar, arrastar seções, mídia) e publique — o portal fica em /sites/<chave>.')),
    h('div', { class: 'fw-actions' },
      h('a', { class: 'btn primary', href: '/devops/#conteudo?novo=1', target: '_blank', rel: 'noopener', text: '✦ Criar portal no editor visual ↗' })),
    h('p', { class: 'muted small', text: 'Portal registrado como produto t1 (specs/products/<chave>, blueprint cms-portal) aparece neste hub com o trilho reduzido Brief → Conteúdo → Publicação — a fase Conteúdo embute este mesmo editor.' }));
  body.append(sec);
}

function forgeCrumbs(parts) {
  const nav = h('nav', { class: 'forge-crumbs', 'aria-label': 'Trilha' });
  parts.forEach((p, i) => {
    if (i) nav.append(h('span', { class: 'sep', text: '›' }));
    if (p.onclick) nav.append(h('button', { class: 'btn-link', type: 'button', onclick: p.onclick, text: p.label }));
    else nav.append(h('span', { class: 'cur', 'aria-current': 'page', text: p.label }));
  });
  return nav;
}

function renderForgeDetail(body, name) {
  const product = findProduct(DATA.products, name);
  if (!product) { body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: name }]), h('p', { class: 'empty', text: 'Produto não encontrado.' })); return; }
  const buildPlan = DATA.buildPlans[name] || null;
  // TRILHO de 7 fases (A1b): sinais assíncronos (preview/sonda) vêm do cache fail-soft — a primeira
  // renderização usa o que há; quando o fetch resolve, re-renderiza com o dado real.
  // (E4) produto t1 não tem preview de telas (o executor é o CMS) — pula a consulta.
  const pv = isT1Product(product) ? null : forgePreviewCached(name);
  const live = forgeLiveCached(product);
  const steps = studioPhaseModel(product, buildPlan, DATA.implStatus, {
    previewStatus: pv ? pv.status : null,
    previewScreens: pv && Array.isArray(pv.screens) ? pv.screens.length : 0,
    liveUrlOk: live,
  });
  // migração de chaves antigas (estado transitório de sessões/execuções anteriores)
  const LEGACY_STEP = { definir: 'requisitos', build: 'pipeline' };
  if (LEGACY_STEP[state.forge.step]) state.forge.step = LEGACY_STEP[state.forge.step];
  // sem fase escolhida -> abre na fase 'current' (a primeira pendente)
  if (!steps.some((s) => s.key === state.forge.step)) state.forge.step = (steps.find((s) => s.status === 'current') || steps[0]).key;
  const cur = steps.find((s) => s.key === state.forge.step) || steps[0];
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: product.display_name || name, onclick: null }, { label: cur.label }]));
  const liveUrl = sameOriginUrl(product.base_path ? product.base_path + '/' : '');
  body.append(h('div', { class: 'forge-detail-head' }, h('h2', { text: product.display_name || name }),
    product.blueprint ? badge(product.blueprint, 'b-nfr') : null,
    liveUrl && live === true ? h('a', { class: 'btn-link', href: liveUrl, target: '_blank', rel: 'noopener', text: product.base_path + ' ↗' }) : badge(product.base_path, 'b-low'),
    product.origin === 'adopted' ? badge('adotado', 'b-nfr') : null,
    // (E1) atalhos contextuais cross-superfície — deep-links canônicos da casca (contexto por URL)
    h('a', { class: 'btn-link', href: surfaceLink('console', 'logs', { product: name }), target: '_blank', rel: 'noopener', text: 'Logs ↗' }),
    h('a', { class: 'btn-link', href: surfaceLink('console', 'pubs', { product: name }), target: '_blank', rel: 'noopener', text: 'Publicações ↗' })));

  // stepper/trilho de fases (clicável, com estados reais)
  const stepper = h('div', { class: 'forge-stepper', role: 'tablist', 'aria-label': 'Fases do produto no Studio' });
  const keys = steps.map((s) => s.key);
  steps.forEach((s, i) => {
    if (i) stepper.append(h('span', { class: 'forge-step-conn', 'aria-hidden': 'true' }));
    const active = s.key === state.forge.step;
    const onkey = (ev) => {
      let j = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = (i + 1) % keys.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = (i - 1 + keys.length) % keys.length;
      else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = keys.length - 1;
      if (j != null) { ev.preventDefault(); forgeStep(keys[j]); const el = document.querySelector('#view-forge .forge-step.is-sel'); if (el) el.focus(); }
    };
    const btn = h('button', { class: 'forge-step is-' + s.status + (active ? ' is-sel' : ''), type: 'button', role: 'tab', 'aria-selected': active ? 'true' : 'false', tabindex: active ? '0' : '-1', onclick: () => forgeStep(s.key), onkeydown: onkey },
      h('span', { class: 'forge-step-box' },
        h('span', { class: 'forge-step-num', 'aria-hidden': 'true', text: s.status === 'done' ? '✓' : String(i + 1) }),
        h('span', { class: 'forge-step-tx' }, h('span', { class: 'forge-step-label', text: s.label }), h('span', { class: 'forge-step-detail', text: s.detail }))));
    stepper.append(btn);
  });
  body.append(stepper);

  const TWO_COL = ['arquitetura', 'pipeline'];
  const panel = h('div', { class: 'forge-panel' + (TWO_COL.includes(state.forge.step) ? ' two' : '') });
  if (state.forge.step === 'brief') forgeBrief(panel, product);
  else if (state.forge.step === 'requisitos') forgeDefinir(panel, product);
  else if (state.forge.step === 'arquitetura') forgeArquitetura(panel, product, buildPlan);
  else if (state.forge.step === 'telas') forgeTelas(panel, product);
  else if (state.forge.step === 'conteudo') forgeConteudo(panel, product); // (E4) só no trilho t1
  else if (state.forge.step === 'docs') forgeDocs(panel, product, buildPlan);
  else if (state.forge.step === 'publicado') forgePublicado(panel, product);
  else forgeBuild(panel, product, buildPlan);
  body.append(panel);

  // Zona de risco: apagar o projeto (só p/ produtos NÃO protegidos/adotados; o backend reforça a denylist).
  if (!FORGE_PROTECTED.includes(name) && product.origin !== 'adopted') body.append(forgeDangerZone(name));
}

/* ---------- sinais assíncronos do trilho (cache fail-soft por produto) ---------- */
// Preview F3: consulta 1x por produto por sessão (re-consulta explícita via botão na fase Telas).
const _previewCache = {};
function forgePreviewCached(name) {
  const c = _previewCache[name];
  if (c !== undefined) return c; // null = consulta em voo/erro; objeto = status real
  _previewCache[name] = null;
  AI.get('/v1/forge/preview/status?product=' + encodeURIComponent(name)).then((r) => {
    _previewCache[name] = r.ok ? (r.data || { status: 'absent' }) : { status: 'absent' };
    if (state.view === 'forge' && state.forge.product === name) renderForge();
  }).catch(() => { _previewCache[name] = { status: 'absent' }; });
  return null;
}
function forgeInvalidatePreview(name) { delete _previewCache[name]; }
// Sonda da URL final (fail-soft): true/false/null(desconhecido). GET same-origin sem cache.
const _liveCache = {};
function forgeLiveCached(product) {
  const name = product.name;
  const url = sameOriginUrl(product.base_path ? product.base_path + '/' : '');
  if (!url) return null;
  const c = _liveCache[name];
  if (c !== undefined) return c;
  _liveCache[name] = null;
  fetch(url, { cache: 'no-store', redirect: 'follow' }).then((r) => {
    _liveCache[name] = !!r.ok;
    if (state.view === 'forge' && state.forge.product === name) renderForge();
  }).catch(() => { _liveCache[name] = false; });
  return null;
}

/* ---------- fase BRIEF: a intenção do produto (visão, blueprint, origem) ---------- */
function forgeBrief(panel, product) {
  const sec = h('div', { class: 'forge-section' });
  sec.append(h('h3', { text: 'Visão do produto' }), h('p', { class: 'forge-vision', text: product.vision || 'Sem visão registrada — o brief nasce no wizard (Novo produto) ou em specs/products/' + product.name + '/product.json.' }));
  if (product.brief && product.brief !== product.vision) sec.append(h('h3', { text: 'Brief original' }), h('p', { class: 'muted', text: product.brief }));
  const dl = h('dl', { class: 'forge-bp-stack' });
  dl.append(dt('Slug'), dd(h('code', { text: product.name })));
  if (product.blueprint) dl.append(dt('Blueprint'), dd(h('code', { text: product.blueprint })));
  dl.append(dt('Rota'), dd(h('code', { text: product.base_path || '/' + product.name })));
  if (product.origin) dl.append(dt('Origem'), dd(product.origin === 'adopted' ? 'adotado (app existente que virou produto da Forja)' : product.origin));
  const ph = product.phases || {};
  const phLabel = { requirements: 'Requisitos', architecture: 'Arquitetura', scaffold: 'Scaffold', build: 'Build' };
  for (const [k, v] of Object.entries(ph)) if (v && v.status) dl.append(dt(phLabel[k] || k), dd(badge(v.status, v.status === 'approved' || v.status === 'done' ? 'b-ok' : 'b-med')));
  sec.append(h('h3', { text: 'Identidade' }), dl);
  panel.append(sec);
}

/* ---------- fase TELAS: preview F3 PERSISTENTE — gerar e refinar FORA do wizard (A2) ----------
   Mesmo contrato do wizard: POST /generate (SSE start/propose/inventory/dispatch/building/ready/done)
   e POST /refine (JSON; devolve o inventory com a tela trocada). O inventário PERSISTIDO no PVC
   (GET /v1/forge/preview/inventory) permite refinar um preview gerado em outra sessão. */
const _telasBusy = {}; // name -> true enquanto um generate SSE está em voo (evita duplo disparo)
function telasRequirements(product) {
  return productReqs(product).slice(0, 12).map((r) => ({
    id: r.id, title: r.title || '', type: r.type || '', statement: r.statement || '',
    acceptance_criteria: Array.isArray(r.acceptance_criteria) ? r.acceptance_criteria : [],
  }));
}
async function telasGenerate(product, statusEl, { inventory } = {}) {
  const name = product.name;
  if (_telasBusy[name]) return;
  _telasBusy[name] = true;
  const say = (...kids) => { if (statusEl.isConnected) statusEl.replaceChildren(...kids); };
  say(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Iniciando a geração…');
  const body = inventory
    ? { product: name, inventory }
    : { product: name, displayName: product.display_name || name, blueprint: product.blueprint || '', brief: product.vision || '', requirements: telasRequirements(product) };
  // GUARD: sem requisitos (produto ainda sem reqs na baseline) a IA não tem o que desenhar — orienta em
  // vez de disparar e falhar com TOOL_INVALID_INPUT genérico no servidor.
  if (!body.inventory && (!Array.isArray(body.requirements) || body.requirements.length === 0)) {
    say(h('span', { class: 'fw-err', text: previewErrorMessage('NO_REQUIREMENTS') }));
    _telasBusy[name] = false;
    return;
  }
  const LBL = { start: 'começando', propose: 'IA propondo as telas', inventory: 'inventário pronto', dispatch: 'build disparado no runner', building: 'construindo a SPA', ready: 'pronto' };
  try {
    await AI.stream2('/v1/forge/preview/generate', body, {
      onEvent: (event) => { if (LBL[event]) say(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' ' + LBL[event] + '…'); },
    });
    say(document.createTextNode('Preview pronto ✓'));
  } catch (e) {
    say(h('span', { class: 'fw-err', text: 'Falhou: ' + String((e && e.message) || e) }));
  } finally {
    _telasBusy[name] = false;
    forgeInvalidatePreview(name);
    if (state.view === 'forge' && state.forge.product === name) renderForge();
  }
}
async function telasRefine(product, screen, feedback, statusEl) {
  const name = product.name;
  const say = (...kids) => { if (statusEl.isConnected) statusEl.replaceChildren(...kids); };
  say(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Refinando a tela com a IA…');
  // inventário persistido (PVC) — sem ele o refine ainda funciona mandando só a tela, mas perde contexto
  let inventory = null;
  try { const r = await AI.get('/v1/forge/preview/inventory?product=' + encodeURIComponent(name)); if (r.ok && r.data) inventory = r.data.inventory; } catch { /* fail-soft */ }
  const r = await AI.post('/v1/forge/preview/refine', {
    product: name, screenSlug: screen.slug, feedback,
    ...(inventory ? { inventory } : { screen }),
    requirements: telasRequirements(product),
  });
  if (!r.ok) { say(h('span', { class: 'fw-err', text: 'Refino falhou (' + ((r.data && r.data.error && r.data.error.code) || r.status) + ').' })); return; }
  const inv = r.data && r.data.inventory;
  if (!inv) { say(h('span', { class: 'fw-err', text: 'O refino não devolveu um inventário — regenere o preview.' })); return; }
  say(document.createTextNode('Tela revisada — reconstruindo o preview…'));
  await telasGenerate(product, statusEl, { inventory: inv });
}
function forgeTelas(panel, product) {
  const sec = h('div', { class: 'forge-section' });
  const pv = _previewCache[product.name];
  const statusEl = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  sec.append(h('h3', { text: 'Preview das telas (dados fake, componentes reais)' }));
  if (pv === null || pv === undefined) {
    sec.append(h('p', { class: 'muted' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Consultando o preview…'));
  } else if (pv.status === 'ready') {
    const url = sameOriginUrl(pv.url || ('/reqs/api/v1/forge/preview/' + product.name + '/'));
    if (url) {
      sec.append(h('div', { class: 'fw-actions' },
        h('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener', text: 'Abrir preview em nova aba ↗' }),
        h('button', { class: 'btn', type: 'button', text: '↻ Regenerar (IA re-propõe)', onclick: () => telasGenerate(product, statusEl) }),
        h('button', { class: 'btn', type: 'button', text: 'Reconsultar', onclick: () => { forgeInvalidatePreview(product.name); renderForge(); } })));
      sec.append(statusEl);
      sec.append(h('iframe', { class: 'forge-preview-frame', src: url, title: 'Preview das telas de ' + (product.display_name || product.name), loading: 'lazy' }));
    }
    const screens = Array.isArray(pv.screens) ? pv.screens : [];
    if (screens.length) {
      sec.append(h('h3', { text: `Telas (${screens.length}) — refine qualquer uma com a IA` }));
      const ul = h('ul', { class: 'forge-reqlist' });
      for (const s of screens) {
        const li = h('li', { class: 'forge-reqitem forge-telas-item' },
          h('code', { text: s.route || s.slug }), h('span', { class: 'rt', text: s.title || s.slug }), badge(s.kind || 'tela', 'b-low'));
        const ta = h('textarea', { class: 'forge-refine-ta', rows: '2', placeholder: 'O que mudar nesta tela? (ex.: adicionar filtro por status, trocar cards por tabela…)', 'aria-label': 'Feedback de refino para ' + (s.title || s.slug), hidden: 'hidden' });
        const send = h('button', { class: 'btn primary', type: 'button', text: 'Refinar', hidden: 'hidden' });
        const toggle = h('button', { class: 'btn-link', type: 'button', text: '✎ refinar', 'aria-expanded': 'false' });
        toggle.addEventListener('click', () => {
          const open = !ta.hidden;
          ta.hidden = open; send.hidden = open;
          toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (!open) ta.focus();
        });
        send.addEventListener('click', () => { const fb = ta.value.trim(); if (!fb) { ta.focus(); return; } send.disabled = true; telasRefine(product, s, fb, statusEl).finally(() => { send.disabled = false; }); });
        li.append(toggle, ta, send);
        ul.append(li);
      }
      sec.append(ul);
    }
  } else if (pv.status === 'building') {
    sec.append(h('p', { class: 'muted' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' O preview está sendo construído no runner… ',
      h('button', { class: 'btn-link', type: 'button', text: 'atualizar', onclick: () => { forgeInvalidatePreview(product.name); renderForge(); } })));
  } else {
    sec.append(h('p', { class: 'empty', text: pv.status === 'error' ? 'O último build do preview falhou.' : 'Este produto ainda não tem preview de telas.' }));
    sec.append(statusEl);
    sec.append(h('div', { class: 'fw-actions' },
      h('button', { class: 'btn primary', type: 'button', text: '✦ Gerar preview (IA propõe as telas)', onclick: () => telasGenerate(product, statusEl) }),
      h('button', { class: 'btn', type: 'button', text: 'Reconsultar', onclick: () => { forgeInvalidatePreview(product.name); renderForge(); } })));
    sec.append(h('p', { class: 'muted small', text: 'A IA propõe o inventário a partir dos requisitos do produto e o runner constrói uma SPA navegável com componentes ui-vue reais e dados fake.' }));
  }
  panel.append(sec);
}

/* ---------- (E4, Forja 4.1) fase CONTEÚDO do trilho t1: o editor do CMS EMBUTIDO ----------
   Dois iframes alternáveis (tabs): "Editar" = Console em modo embed (/devops/?embed=1#conteudo
   ?projeto=<key>, mesma origem — o nginx do Console responde `frame-ancestors 'self'` SÓ no
   documento do embed, anulando o X-Frame-Options: DENY do Traefik, padrão provado no E0) e
   "Ver no ar" = o site publicado (/sites/<chave>, rota que por design não tem frameDeny).
   O embed anuncia embed:ready/embed:navigate por postMessage (payload validado por
   parseEmbedMessage + ORIGEM checada aqui) — vira estado de loading/erro FAIL-SOFT: sem
   resposta em 15s, degrada com o deep-link do Console (o caminho A4 continua existindo). */
let _conteudoMsg = null;   // listener de message ativo (um por render; removido em conteudoCleanup)
let _conteudoTimer = null; // timeout do fail-soft de carregamento do embed
function conteudoCleanup() {
  if (_conteudoMsg) { window.removeEventListener('message', _conteudoMsg); _conteudoMsg = null; }
  if (_conteudoTimer) { clearTimeout(_conteudoTimer); _conteudoTimer = null; }
}
function forgeConteudo(panel, product) {
  conteudoCleanup();
  const key = product.name;
  const editUrl = sameOriginUrl(embedConsoleUrl(key));
  const liveUrl = sameOriginUrl(publishedSiteUrl(product));
  const consoleDeepLink = '/devops/#conteudo?projeto=' + encodeURIComponent(key);
  const sec = h('div', { class: 'forge-section' });
  sec.append(h('h3', { text: 'Conteúdo do portal' }),
    h('p', { class: 'muted', text: 'Páginas e seções são editadas no CMS da plataforma — aqui mesmo, sem sair do Studio. A aba "Ver no ar" mostra o site publicado como o público vê.' }));

  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const editFrame = h('iframe', { class: 'forge-embed-frame', title: 'Editor de conteúdo (CMS) de ' + (product.display_name || key) });
  const liveFrame = h('iframe', { class: 'forge-embed-frame', title: 'Site publicado de ' + (product.display_name || key), loading: 'lazy', hidden: 'hidden' });

  // fail-soft do embed: pronto = mensagem embed:ready do Console; sem ela em 15s, degrada
  let ready = false;
  const showLoading = () => status.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Carregando o editor embutido…');
  const showFallback = () => status.replaceChildren(
    badge('editor embutido sem resposta', 'b-crit'),
    ' O Console pode estar fora do ar ou pedindo login. ',
    h('a', { class: 'btn-link', href: consoleDeepLink, target: '_blank', rel: 'noopener', text: 'abrir no Console ↗' }), ' · ',
    h('button', { class: 'btn-link', type: 'button', text: '↻ tentar de novo', onclick: () => { ready = false; showLoading(); armTimeout(); editFrame.setAttribute('src', editUrl); } }));
  const armTimeout = () => {
    if (_conteudoTimer) clearTimeout(_conteudoTimer);
    _conteudoTimer = setTimeout(() => { if (!ready && status.isConnected) showFallback(); }, 15000);
  };
  _conteudoMsg = (ev) => {
    if (ev.origin !== location.origin) return; // só a MESMA origem (embed same-origin)
    const m = parseEmbedMessage(ev.data);
    if (!m || !status.isConnected) return;
    if (m.type === 'embed:ready') {
      ready = true;
      if (_conteudoTimer) { clearTimeout(_conteudoTimer); _conteudoTimer = null; }
      status.replaceChildren('Editor pronto ✓ — as mudanças publicadas aparecem na aba "Ver no ar".');
    } else if (m.type === 'embed:navigate' && m.projeto) {
      status.replaceChildren('Editando: ', h('code', { text: m.projeto }),
        m.projeto === key ? '' : ' — atenção: este é OUTRO portal (o deste produto é ' + key + ').');
    }
  };
  window.addEventListener('message', _conteudoMsg);

  // tabs "Editar" × "Ver no ar" (mesmo padrão de radiogroup/roving-tabindex do seletor de modos)
  const TABS = [
    { id: 'editar', label: 'Editar', frame: editFrame, url: editUrl },
    { id: 'no-ar', label: 'Ver no ar', frame: liveFrame, url: liveUrl },
  ];
  let active = 'editar';
  const tabs = h('div', { class: 'forge-embed-tabs', role: 'tablist', 'aria-label': 'Conteúdo do portal' });
  const paint = () => {
    for (const t of TABS) {
      const on = t.id === active;
      t.btn.classList.toggle('is-on', on);
      t.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      t.btn.tabIndex = on ? 0 : -1;
      if (on && t.url && !t.frame.getAttribute('src')) t.frame.setAttribute('src', t.url); // lazy: só carrega ao abrir
      t.frame.hidden = !on;
    }
  };
  TABS.forEach((t, i) => {
    t.btn = h('button', {
      class: 'forge-embed-tab', type: 'button', role: 'tab', 'aria-selected': 'false',
      onclick: () => { active = t.id; paint(); },
      onkeydown: (ev) => {
        let j = null;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = (i + 1) % TABS.length;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = (i - 1 + TABS.length) % TABS.length;
        if (j != null) { ev.preventDefault(); active = TABS[j].id; paint(); TABS[j].btn.focus(); }
      },
    }, t.label);
    tabs.append(t.btn);
  });
  const actions = h('div', { class: 'fw-actions forge-embed-actions' }, tabs,
    liveUrl ? h('a', { class: 'btn-link', href: liveUrl, target: '_blank', rel: 'noopener', text: 'abrir o site em nova aba ↗' }) : null,
    h('a', { class: 'btn-link', href: consoleDeepLink, target: '_blank', rel: 'noopener', text: 'abrir no Console ↗' }));

  sec.append(actions, status);
  if (editUrl) { showLoading(); armTimeout(); } else showFallback();
  sec.append(editFrame, liveFrame);
  paint();
  panel.append(sec);
}

/* ---------- fase DOCUMENTAÇÃO: a documentação viva do produto, composta do que JÁ existe ---------- */
function forgeDocs(panel, product, buildPlan) {
  const sec = h('div', { class: 'forge-section forge-docs' });
  sec.append(h('h3', { text: 'Documentação do produto' }),
    h('p', { class: 'muted small', text: 'Composta ao vivo de specs/products + build-plan + baseline — sempre atual, sem artefato paralelo.' }));
  // 1. Visão
  sec.append(h('h4', { text: '1. Visão' }), h('p', { text: product.vision || '—' }));
  // 2. Fases / status
  const ph = product.phases || {};
  if (Object.keys(ph).length) {
    sec.append(h('h4', { text: '2. Fases' }));
    const ul = h('ul', { class: 'linklist' });
    for (const [k, v] of Object.entries(ph)) ul.append(h('li', {}, h('span', { class: 'lt', text: k }), (v && v.status) || '—'));
    sec.append(ul);
  }
  // 3. Requisitos (com enunciado)
  const reqs = productReqs(product);
  sec.append(h('h4', { text: `3. Requisitos (${reqs.length})` }));
  if (!reqs.length) sec.append(h('p', { class: 'empty', text: '—' }));
  else {
    const ul = h('ul', { class: 'forge-doc-reqs' });
    for (const r of reqs) ul.append(h('li', {},
      h('button', { class: 'btn-link rid', type: 'button', onclick: () => openReq(r.id), text: r.id }),
      h('strong', { text: ' ' + (r.title || '') }),
      r.statement ? h('p', { class: 'muted small', text: r.statement }) : null));
    sec.append(ul);
  }
  // 4. Arquitetura (ADRs + stack do blueprint)
  const bp = blueprintById(DATA.blueprints, product.blueprint);
  const adrs = (buildPlan && buildPlan.adrs) || (bp && bp.default_adrs) || [];
  sec.append(h('h4', { text: '4. Arquitetura' }));
  if (bp) sec.append(h('p', { class: 'muted small', text: 'Blueprint ' + bp.name + (bp.summary ? ' — ' + bp.summary : '') }));
  if (adrs.length) {
    const ul = h('ul', { class: 'linklist' });
    for (const a of adrs) ul.append(h('li', {}, h('span', { class: 'lt', text: 'ADR' }), typeof a === 'string' ? a : (a.title || a.decision || JSON.stringify(a))));
    sec.append(ul);
  } else sec.append(h('p', { class: 'empty', text: 'Sem ADRs registradas.' }));
  // 5. Telas (do preview, quando houver)
  const pv = _previewCache[product.name];
  const screens = pv && Array.isArray(pv.screens) ? pv.screens : [];
  if (screens.length) {
    sec.append(h('h4', { text: `5. Guia de telas (${screens.length})` }));
    const ul = h('ul', { class: 'linklist' });
    for (const s of screens) ul.append(h('li', {}, h('span', { class: 'lt', text: s.kind || 'tela' }), (s.title || s.slug) + (s.route ? ' · ' + s.route : '')));
    sec.append(ul);
  }
  panel.append(sec);
}

/* ---------- fase PUBLICAÇÃO: a URL viva + onde acompanhar ---------- */
function forgePublicado(panel, product) {
  const sec = h('div', { class: 'forge-section' });
  const live = _liveCache[product.name];
  const url = sameOriginUrl(product.base_path ? product.base_path + '/' : '');
  sec.append(h('h3', { text: 'Publicação' }));
  if (url) {
    const stLine = h('p', {},
      live === true ? badge('no ar ✓', 'b-ok') : live === false ? badge('sem resposta', 'b-crit') : h('span', { class: 'forge-spin', 'aria-hidden': 'true' }),
      ' ', h('a', { class: 'btn-link', href: url, target: '_blank', rel: 'noopener', text: url }));
    sec.append(stLine);
    if (live === false) sec.append(h('p', { class: 'muted small', text: 'A sonda é feita deste navegador (same-origin). Fora do host da plataforma (ex.: preview local), "sem resposta" é esperado — confira no Console.' }));
  } else sec.append(h('p', { class: 'empty', text: 'Produto sem base_path — nada para publicar.' }));
  sec.append(h('h3', { text: 'Acompanhar' }));
  sec.append(h('ul', { class: 'linklist' },
    h('li', {}, h('span', { class: 'lt', text: 'Console' }), h('a', { class: 'btn-link', href: '/devops/', target: '_blank', rel: 'noopener', text: 'apps · publicações · health · logs ↗' })),
    h('li', {}, h('span', { class: 'lt', text: 'CI' }), h('a', { class: 'btn-link', href: 'https://github.com/FlavioNeto11/devops/actions', target: '_blank', rel: 'noopener', text: 'GitHub Actions ↗' }))));
  panel.append(sec);
}

// Produtos protegidos (não apagáveis pela UI) — espelha a denylist do backend (forge-launch.js).
// (D2, Forja 4.1) imobia/besc/zapbridge: apps VIVOS com dados que não estavam em nenhuma denylist.
const FORGE_PROTECTED = ['sicat', 'gymops', 'rmambiental', 'anarabottini', 'imobia', 'besc', 'zapbridge', 'reqhub', 'console', 'portal', 'portal-recorder', 'keycloak', 'langfuse', 'ai-control-plane'];

// (UX-REQHUB-002 / UX-REQHUB-004) Diálogo de CONFIRMAÇÃO com BLAST-RADIUS explícito para as ações
// destrutivas/irreversíveis da Forja. Substitui o window.confirm genérico (que subestima o alcance:
// "Liberar tudo" AUTO-MESCLA um PR sem revisão; apagar remove código + requisitos + baseline + Argo +
// cluster) por um modal acessível que (1) LISTA o que será criado/mesclado/apagado e (2) exige
// confirmação explícita — digitar o nome exato (delete, padrão GitHub) ou 2 passos deliberados
// (launch). Espelha o padrão do cmdk (app.js): role=dialog + aria-modal, focus-trap, #app inert,
// Esc cancela, foco devolvido ao gatilho. CSP-safe (só h()/addEventListener). Retorna Promise<boolean>.
function blastConfirm(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const trigger = document.activeElement;
    const app = document.getElementById('app');
    const uid = 'blast-' + Math.random().toString(36).slice(2, 8);
    let settled = false;
    const overlay = h('div', { class: 'blast-overlay' });
    const panel = h('div', { class: 'blast', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid });
    panel.append(h('div', { class: 'blast-head' },
      h('span', { class: 'blast-ic', 'aria-hidden': 'true', text: o.icon || '⚠' }),
      h('h3', { class: 'blast-title', id: uid, text: o.title || 'Confirmar ação' })));
    if (o.intro) panel.append(h('p', { class: 'blast-intro', text: o.intro }));
    if (Array.isArray(o.items) && o.items.length) {
      panel.append(h('p', { class: 'blast-legend muted small', text: o.itemsLabel || 'Esta ação vai:' }));
      const ul = h('ul', { class: 'blast-list' });
      for (const it of o.items) ul.append(h('li', {}, it));
      panel.append(ul);
    }
    if (o.warn) panel.append(h('p', { class: 'blast-warn', text: o.warn }));

    let input = null, check = null;
    const confirmBtn = h('button', { class: 'btn ' + (o.tone === 'danger' ? 'danger' : 'primary'), type: 'button', text: o.confirmLabel || 'Confirmar' });
    const syncEnabled = () => {
      let ok = true;
      if (input) ok = ok && input.value === o.requireText;
      if (check) ok = ok && check.checked;
      confirmBtn.disabled = !ok;
    };
    if (o.requireText) {
      const fieldId = uid + '-in';
      panel.append(h('label', { class: 'blast-req', for: fieldId },
        'Para confirmar, digite ', h('code', { class: 'blast-req-code', text: o.requireText }), ' abaixo:'));
      input = h('input', { class: 'blast-input', id: fieldId, type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Digite ' + o.requireText + ' para confirmar' });
      input.addEventListener('input', syncEnabled);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value === o.requireText) { e.preventDefault(); done(true); } });
      panel.append(input);
    }
    if (o.requireCheck) {
      const cbId = uid + '-cb';
      check = h('input', { type: 'checkbox', id: cbId, class: 'blast-check' });
      check.addEventListener('change', syncEnabled);
      panel.append(h('label', { class: 'blast-ack', for: cbId }, check, ' ', o.requireCheck));
    }

    const cancelBtn = h('button', { class: 'btn', type: 'button', text: o.cancelLabel || 'Cancelar' });
    cancelBtn.addEventListener('click', () => done(false));
    confirmBtn.addEventListener('click', () => { if (!confirmBtn.disabled) done(true); });
    panel.append(h('div', { class: 'blast-actions' }, cancelBtn, confirmBtn));
    syncEnabled();

    overlay.append(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); return; }
      if (e.key !== 'Tab') return;
      const f = [...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    function done(result) {
      if (settled) return; settled = true;
      overlay.remove();
      document.body.classList.remove('blast-on');
      if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
      if (trigger && document.contains(trigger) && trigger.offsetParent !== null && typeof trigger.focus === 'function') trigger.focus();
      resolve(result);
    }

    document.body.appendChild(overlay);
    document.body.classList.add('blast-on');
    if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
    setTimeout(() => { (input || cancelBtn).focus(); }, 30);
  });
}

function forgeDangerZone(name) {
  const st = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn danger', type: 'button', text: '🗑 Apagar este projeto' });
  btn.addEventListener('click', async () => {
    const ok = await blastConfirm({
      title: 'Apagar o projeto "' + name + '"?',
      tone: 'danger', icon: '🗑',
      intro: 'Ação IRREVERSÍVEL pela UI. A exclusão dispara a esteira e remove tudo que depende deste projeto:',
      itemsLabel: 'Serão apagados:',
      items: [
        h('span', {}, 'o código em ', h('code', { text: 'apps/' + name })),
        'os requisitos e a baseline do produto',
        h('span', {}, 'a Application do Argo (', h('code', { text: name }), ')'),
        'os recursos no cluster (Deployment / Service / IngressRoute)',
      ],
      requireText: name,
      confirmLabel: '🗑 Apagar definitivamente',
    });
    if (!ok) return;
    forgeDelete(name, btn, st);
  });
  return h('div', { class: 'forge-danger' },
    h('h4', { text: '⚠ Zona de risco' }),
    h('p', { class: 'fw-hint', text: 'Apagar remove tudo que depende deste projeto (código, requisitos, baseline, Argo e cluster). Ação irreversível pela UI.' }),
    h('div', { class: 'fw-actions' }, btn, st));
}

async function forgeDelete(name, btn, st) {
  btn.disabled = true;
  st.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Apagando ' + name + '…');
  try {
    const r = await AI.post('/v1/forge/delete', { product: name });
    if (r.ok) {
      const d = r.data || {};
      st.replaceChildren(document.createTextNode('Exclusão disparada — quando concluir, o projeto some daqui. '),
        h('a', { href: d.actions_url || '#', target: '_blank', rel: 'noopener', text: 'acompanhar ↗' }));
    } else {
      const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status;
      const msg = r.data && r.data.error ? r.data.error.message : '';
      st.replaceChildren(h('span', { class: 'fw-err', text: (code === 'DISPATCH_DISABLED' ? 'Exclusão automática desligada (falta token no servidor).' : 'Falha (' + code + ')' + (msg ? ': ' + msg : '')) }));
      btn.disabled = false;
    }
  } catch (e) { st.replaceChildren(h('span', { class: 'fw-err', text: 'Erro de rede: ' + (e && e.message ? e.message : e) })); btn.disabled = false; }
}

function productReqs(product) {
  const ids = new Set(product.requirement_ids || []);
  const reqs = (DATA.baseline.requirements || []).filter((r) => ids.has(r.id) || (r.scope && r.scope.product_scope === product.name));
  return reqs.sort((a, b) => a.id.localeCompare(b.id));
}

function forgeDefinir(panel, product) {
  const left = h('div', { class: 'forge-section' });
  // (A1b) a visão vive na fase Brief; aqui é a espinha dorsal: os REQUISITOS do produto.
  const reqs = productReqs(product);
  left.append(h('h3', { text: `Requisitos (${reqs.length})` }));
  if (!reqs.length) left.append(h('p', { class: 'empty', text: 'Nenhum requisito ainda — use "Propor requisitos (IA)" para começar.' }));
  else {
    const ul = h('ul', { class: 'forge-reqlist' });
    for (const r of reqs) {
      const st = DATA.implStatus && DATA.implStatus.items && DATA.implStatus.items[r.id] ? DATA.implStatus.items[r.id].status : 'not_started';
      ul.append(h('li', { class: 'forge-reqitem' },
        h('button', { class: 'btn-link rid', type: 'button', onclick: () => openReq(r.id), text: r.id }),
        h('span', { class: 'rt', text: truncateLabel(r.title || '', 72) }),
        badge(st, forgeStatusCls(st))));
    }
    left.append(ul);
  }
  panel.append(left);
  panel.append(h('div', { class: 'forge-note' },
    h('strong', { text: 'Como adicionar requisitos: ' }),
    'a autoria é por git/PR (fonte da verdade em ', h('code', { text: 'specs/requirements/' + product.name + '/' }), '). ',
    'Use ', h('button', { class: 'btn-link', type: 'button', onclick: () => openForgeNew(), text: 'Novo produto / propor requisitos (IA)' }),
    ' para gerar rascunhos — a UI não escreve no git.'));
}

function forgeArquitetura(panel, product, buildPlan) {
  // coluna esquerda: blueprint + ADRs
  const left = h('div', { class: 'forge-section' });
  const bp = blueprintById(DATA.blueprints, product.blueprint);
  left.append(h('h3', { text: 'Blueprint' }));
  if (!bp) left.append(h('p', { class: 'empty', text: 'Blueprint "' + (product.blueprint || '?') + '" não encontrado.' }));
  else {
    left.append(h('div', { class: 'card' },
      h('strong', { text: bp.name }), h('p', { class: 'muted', text: bp.summary || '' }),
      h('dl', { class: 'forge-bp-stack' }, ...Object.entries(bp.stack || {}).flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('h4', { text: 'Serviços' }), h('div', { class: 'forge-chips' }, ...(bp.services || []).map((s) => h('span', { class: 'chip', text: s })), bp.db ? h('span', { class: 'chip', text: 'db: ' + bp.db }) : null),
      (bp.reuses || []).length ? h('h4', { text: 'Reusa' }) : null,
      (bp.reuses || []).length ? h('div', { class: 'forge-chips' }, ...(bp.reuses || []).map((s) => h('span', { class: 'chip', text: s }))) : null));
  }
  const adrs = (buildPlan && buildPlan.adrs) || (bp && bp.default_adrs) || [];
  if (adrs.length) {
    left.append(h('h3', { text: 'Decisões de arquitetura (ADRs)' }));
    const ul = h('ul', { class: 'linklist' });
    for (const a of adrs) ul.append(h('li', {}, h('span', { class: 'lt', text: 'ADR' }), typeof a === 'string' ? a : (a.title || a.decision || JSON.stringify(a))));
    left.append(ul);
  }
  panel.append(left);

  // coluna direita: DAG das waves
  const right = h('div', { class: 'forge-section' });
  right.append(h('h3', { text: 'Plano de build (waves)' }));
  if (!buildPlan) right.append(h('p', { class: 'empty', text: 'Sem build-plan.json para este produto.' }));
  else { right.append(forgeDagLegend(), buildPlanGraph(buildPlan, true).el, h('p', { class: 'muted small', text: 'Cada nó é um requisito; arraste/role para navegar. Clique realça as dependências e mostra o detalhe; duplo-clique (ou “o”) abre o requisito.' })); }
  panel.append(right);
}

// Rótulos pt-BR por estágio (breakdown) e estado de wave.
const FORGE_STAGE_LABELS = { not_started: 'não iniciado', in_progress: 'em progresso', pr_open: 'em PR', merged: 'mesclado', deployed: 'no ar', done: 'verificado', blocked: 'bloqueado' };
const FORGE_WAVE_STATE = { done: 'concluída', active: 'em andamento', todo: 'aguardando' };

function forgeBuild(panel, product, buildPlan) {
  const reqIds = product.requirement_ids || [];
  const left = h('div', { class: 'forge-section' });
  const progBox = h('div', { class: 'forge-prog' });   // cabeçalho + barra + breakdown (re-render p/ liveness)
  const wavesBox = h('div');                            // waves (preenchem com o progresso)
  const buildStatusEl = h('div', { class: 'forge-build-status', role: 'status', 'aria-live': 'polite' });

  // Renderiza o progresso PONDERADO (honesto): merged != 100%; só no ar (deployed/done OU app vivo) = 100%.
  // SEMPRE mostra o breakdown por estágio → há o que acompanhar mesmo sem build ativo.
  const renderProg = () => {
    const prog = weightedProgress(reqIds, DATA.implStatus);
    progBox.replaceChildren();
    progBox.append(h('div', { class: 'forge-prog-head' },
      h('h3', { text: 'Progresso' }),
      prog.pct === 100 ? badge('no ar ✓', 'b-ok')
        : (prog.delivered === prog.total && prog.total ? badge('deploy/verificação pendente', 'b-high') : null)));
    progBox.append(progressBar(prog.pct));
    const chips = h('div', { class: 'forge-breakdown', 'aria-label': 'Distribuição dos requisitos por estágio' });
    let any = false;
    for (const st of ['done', 'deployed', 'merged', 'pr_open', 'in_progress', 'blocked', 'not_started']) {
      const n = prog.by[st] || 0; if (!n) continue; any = true;
      chips.append(h('span', { class: 'forge-bd ' + forgeStatusCls(st), text: `${n} ${FORGE_STAGE_LABELS[st] || st}` }));
    }
    if (any) progBox.append(chips);
    progBox.append(h('p', { class: 'muted small', text: `${prog.delivered}/${prog.total} requisito(s) com código no main` + (prog.live ? ` · ${prog.live} no ar` : (prog.delivered ? ' · deploy/verificação pendente' : '')) }));
    // Waves COERENTES com o progresso (work_orders são tarefas finas, não reqs rastreados → preenche por %).
    wavesBox.replaceChildren();
    if (buildPlan) {
      const waves = wavesFromProgress(buildPlan, prog.pct);
      const list = h('div', { class: 'forge-waves', role: 'list', 'aria-label': `Ondas de construção (${waves.length})` });
      for (const w of waves) {
        list.append(h('div', { class: 'forge-wave s-' + w.state, role: 'listitem', 'aria-label': `Wave ${w.id}: ${FORGE_WAVE_STATE[w.state] || w.state}` },
          h('span', { class: 'forge-wave-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'forge-wave-id', text: w.id }),
          h('span', { class: 'forge-wave-reqs' }, ...w.tasks.map((tk) => h('span', { class: 'forge-wave-task', text: truncateLabel(tk, 46) }))),
          h('span', { class: 'forge-wave-n', text: FORGE_WAVE_STATE[w.state] || w.state })));
      }
      wavesBox.append(h('h3', { text: 'Waves' }), list);
    }
  };
  renderProg();
  // Pipeline da esteira AO VIVO (persistente): a MESMA visão da tela "Construindo", agora sempre
  // acessível ao reabrir o produto — fases ordenadas (requisitos→arquitetura→construção→publicado).
  const pipeBox = h('div', { class: 'fw-pipeline' });
  // a lista completa de fases NÃO é live region (o replaceChildren de cada poll re-anunciava tudo);
  // o anúncio pontual fica no "Agora: …" (pipeNow, role=status), trocado só quando o texto muda.
  const pipeSteps = h('ol', { class: 'fw-launch-steps' });
  const pipeNow = h('div', { class: 'fw-pipe-now', role: 'status' });
  const pipeUpdated = h('span', { class: 'fw-updated muted small', text: 'conectando…' });
  pipeBox.append(h('div', { class: 'forge-prog-head' }, h('h3', { text: 'Esteira (ao vivo)' }), pipeUpdated), pipeSteps, pipeNow);
  left.append(pipeBox, progBox, buildStatusEl, wavesBox);
  if (buildPlan) left.append(h('h3', { text: 'Mapa do build' }), forgeDagLegend(), buildPlanGraph(buildPlan, false).el);
  forgePollBuildStatus(product.name, buildStatusEl); // indicador VIVO: req-implement rodando + PRs/CI
  forgePollPipeline(product.name, { steps: pipeSteps, now: pipeNow, updated: pipeUpdated }); // fases ordenadas ao vivo
  panel.append(left);

  // direita: tabela requisito → status → PR → deploy
  const right = h('div', { class: 'forge-section' });
  right.append(h('h3', { text: 'Requisitos → código' }));
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'Título' }), h('th', { text: 'Status' }), h('th', { text: 'PR' }))));
  const tb = h('tbody');
  for (const id of reqIds) {
    const row = reqRow(id, DATA.baseline, DATA.implStatus);
    // (UX-REQHUB-001) linha semântica pura + <button> real na célula do ID (espelha ridOpenCell do
    // app.js): preserva rows/cells p/ leitores de tela; a linha segue como atalho de mouse (row-open).
    tb.append(h('tr', { class: 'row-open', onclick: () => openReq(id) },
      h('td', {}, h('button', { class: 'rid-open', type: 'button', 'aria-label': `Abrir ${id}`, onclick: (ev) => { ev.stopPropagation(); openReq(id); } }, h('span', { class: 'rid', text: id }))),
      h('td', { text: truncateLabel(row.title, 60) }),
      h('td', {}, badge(row.status, forgeStatusCls(row.status))),
      h('td', {}, row.pr ? h('a', { class: 'btn-link', href: row.pr, target: '_blank', rel: 'noopener', text: 'PR' }) : h('span', { class: 'empty', text: '—' }))));
  }
  const gw = h('div', { class: 'grid-wrap' }); t.append(tb); gw.append(t); right.append(gw);
  panel.append(right);
}

// Indicador VIVO do build (tela Build): faz polling de /v1/forge/build-status e mostra se há
// req-implement rodando + PRs de implementação abertos (e se estão bloqueados por CI). Para sozinho
// ao sair da aba Build. fail-soft (sem token/IA fora -> "status indisponível", não quebra a tela).
let _forgeBuildTimer = null;
let _forgeBuildGen = 0; // invalida ticks async em voo de renders antigos (clearTimeout não alcança um tick suspenso no await)
function fwStopBuildPoll() { _forgeBuildGen++; if (_forgeBuildTimer) { clearTimeout(_forgeBuildTimer); _forgeBuildTimer = null; } }
function renderBuildStatus(el, data) {
  el.replaceChildren();
  if (!data || data.ok === false) { el.append(h('p', { class: 'muted', text: 'Status do build indisponível agora.' })); return; }
  const running = data.running || 0; const prs = data.prs || [];
  if (!running && !prs.length) {
    el.append(h('div', { class: 'fbuild-idle' }, h('span', { class: 'fbuild-dot' }), ' Sem processamento ativo no momento (nenhum req-implement rodando nem PR aberto).'));
    return;
  }
  el.append(h('div', { class: 'fbuild-head' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }),
    ' Processando — ', h('strong', { text: String(running) }), ' implementação(ões) rodando · ', h('strong', { text: String(prs.length) }), ' PR(s) aberto(s)'));
  if (prs.length) {
    const ul = h('ul', { class: 'fbuild-prs' });
    for (const p of prs) {
      const label = p.state === 'blocked' ? ('bloqueado — CI vermelho' + (p.failed ? ` (${p.failed} check${p.failed > 1 ? 's' : ''} falho${p.failed > 1 ? 's' : ''})` : ''))
        : p.state === 'checking' ? 'verificando CI…' : 'pronto p/ mesclar';
      ul.append(h('li', { class: 'fbuild-pr s-' + p.state },
        h('span', { class: 'fbuild-pr-ic', 'aria-hidden': 'true', text: p.state === 'blocked' ? '✕' : p.state === 'checking' ? '●' : '✓' }),
        h('span', { class: 'fbuild-pr-req', text: p.req || ('PR #' + p.number) }),
        h('a', { class: 'btn-link', href: p.url, target: '_blank', rel: 'noopener', text: '#' + p.number }),
        h('span', { class: 'fbuild-pr-st', text: ' — ' + label })));
    }
    el.append(ul);
  }
}
function forgePollBuildStatus(name, el) {
  fwStopBuildPoll();
  const myGen = _forgeBuildGen;
  const alive = () => myGen === _forgeBuildGen && state.view === 'forge' && state.forge.product === name && state.forge.step === 'pipeline';
  const tick = async () => {
    if (!alive()) return;
    let data = null;
    try { const r = await AI.get('/v1/forge/build-status?product=' + encodeURIComponent(name)); data = r.ok ? r.data : { ok: false }; } catch { data = { ok: false }; }
    if (!alive()) return; // saiu da aba OU re-render iniciou novo poller (gen mudou) → aborta sem reagendar
    renderBuildStatus(el, data);
    _forgeBuildTimer = setTimeout(tick, 8000);
  };
  tick();
}

// ---- Pipeline da esteira AO VIVO (compartilhado pela tela "Construindo" e pela aba Build) ----
const FW_PHASE_ICON = { done: '✓', active: '●', error: '✕', pending: '○' };
function forgePhaseNodes(phases) {
  return phases.map((s) => h('li', { class: 'fw-ls fw-ls-' + s.status },
    h('span', { class: 'fw-ls-ic' + (s.status === 'active' ? ' fw-spin' : ''), 'aria-hidden': 'true', text: FW_PHASE_ICON[s.status] || '○' }),
    h('span', { class: 'fw-ls-tx' },
      h('strong', { text: s.label }),
      s.detail ? h('span', { class: 'fw-ls-d', text: ' — ' + s.detail }) : null,
      s.url ? h('a', { class: 'fw-ls-link', href: s.url, target: '_blank', rel: 'noopener', 'aria-label': 'abrir no GitHub', text: ' ↗' }) : null)));
}
function forgeNowNode(phases) {
  const active = phases.find((p) => p.status === 'active') || phases.find((p) => p.status !== 'done');
  return h('p', { class: 'fw-now' },
    h('span', { class: 'fw-now-dot fw-spin', 'aria-hidden': 'true' }),
    h('span', {}, 'Agora: ', h('strong', { text: active ? active.label : 'tudo concluído' }), active && active.detail ? ' — ' + active.detail : ''));
}

// Poller do pipeline na aba Build (persistente). launch-status (PRs) + DATA viva (impl-status,
// atualizada pelo poll global de /v1/forge/state) → launchPhases ordenado. Mirror de forgePollBuildStatus.
let _forgePipeTimer = null;
let _forgePipeGen = 0; // invalida ticks async em voo de renders antigos (a race do re-render de 15s)
function fwStopPipePoll() { _forgePipeGen++; if (_forgePipeTimer) { clearTimeout(_forgePipeTimer); _forgePipeTimer = null; } }
function forgePollPipeline(name, els) {
  fwStopPipePoll();
  const myGen = _forgePipeGen;
  const alive = () => myGen === _forgePipeGen && state.view === 'forge' && state.forge.product === name && state.forge.step === 'pipeline';
  const tick = async () => {
    if (!alive()) return;
    let stages = [];
    try { const r = await AI.get('/v1/forge/launch-status?product=' + encodeURIComponent(name)); if (r.ok && r.data && Array.isArray(r.data.stages)) stages = r.data.stages; } catch { /* fail-soft */ }
    if (!alive()) return; // saiu da aba OU re-render iniciou novo poller (gen mudou) → aborta sem reagendar nem escrever em nó destacado
    const product = findProduct(DATA.products, name) || { requirement_ids: [], phases: {} };
    const phases = launchPhases(stages, product, DATA.implStatus, DATA.buildPlans[name] || null);
    els.steps.replaceChildren(...forgePhaseNodes(phases));
    const nowNode = forgeNowNode(phases);
    if (els.now.textContent !== nowNode.textContent) els.now.replaceChildren(nowNode); // role=status: só anuncia mudança REAL de fase
    els.updated.textContent = 'atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    _forgePipeTimer = setTimeout(tick, 8000);
  };
  tick();
}

// Zoom (wheel) + pan (drag) local, sem acoplamento ao Mapa de impacto. onBg = clique no fundo.
function wireZoomPanLocal(s, root, layout, onBg) {
  const vp = { x: 0, y: 0, k: 1 }; s._vp = vp; applyTransform(root, vp);
  const pt = (ev) => { const r = s.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (layout.width / (r.width || layout.width)), y: (ev.clientY - r.top) * (layout.height / (r.height || layout.height)) }; };
  s.addEventListener('wheel', (ev) => {
    ev.preventDefault(); const p = pt(ev); const nk = Math.min(4, Math.max(0.4, vp.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    vp.x = p.x - (p.x - vp.x) * (nk / vp.k); vp.y = p.y - (p.y - vp.y) * (nk / vp.k); vp.k = nk; applyTransform(root, vp);
  }, { passive: false });
  let drag = null;
  s.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.ig-node')) return; drag = { sx: ev.clientX, sy: ev.clientY, x0: vp.x, y0: vp.y, moved: false }; s.classList.add('panning'); s.setPointerCapture(ev.pointerId); });
  s.addEventListener('pointermove', (ev) => { if (!drag) return; if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true; const r = s.getBoundingClientRect(); vp.x = drag.x0 + (ev.clientX - drag.sx) * (layout.width / (r.width || layout.width)); vp.y = drag.y0 + (ev.clientY - drag.sy) * (layout.height / (r.height || layout.height)); applyTransform(root, vp); });
  s.addEventListener('pointerup', (ev) => { if (drag && !drag.moved && onBg && ev.target && !ev.target.closest('.ig-node')) onBg(); drag = null; s.classList.remove('panning'); });
  s.addEventListener('pointercancel', () => { drag = null; s.classList.remove('panning'); });
}

/**
 * Grafo INTERATIVO reutilizável (Novo produto / Arquitetura / Build). forceLayout + SVG;
 * hover/clique → realça vizinhança + painel de detalhe; zoom/pan; posição por transform
 * (anima a "formação" do mapa); cor por classe no nó (CSP-safe). Retorna { el, setData, focus }.
 */
function interactiveGraph(opts = {}) {
  const W = 1000, H = 600;
  const nodeClass = opts.nodeClass || (() => '');
  const onOpen = opts.onOpen || null;
  const detailOf = opts.detailOf || null;
  let nodes = [], edges = [], hoverId = null, sel = null;
  const els = new Map(); // id -> { g, tx, ttl }
  const wrap = h('div', { class: 'ig-wrap' });
  const canvas = h('div', { class: 'ig-canvas' + (opts.tall ? ' tall' : '') });
  const detail = h('div', { class: 'ig-detail is-hidden', role: 'region', 'aria-label': 'Detalhe do nó' });
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': opts.label || 'Grafo de requisitos' });
  const root = svg('g', {}); const gEdges = svg('g', {}); const gNodes = svg('g', {});
  root.append(gEdges, gNodes); s.append(root); canvas.append(detail, s); wrap.append(canvas);

  const focusId = () => sel || hoverId;
  function neighbors(id) { const set = new Set([id]); for (const e of edges) { if (e.from === id) set.add(e.to); if (e.to === id) set.add(e.from); } return set; }
  function paint() {
    const fc = focusId(); const nb = fc ? neighbors(fc) : null;
    for (const [id, el] of els) {
      el.g.classList.toggle('is-focus', fc === id);
      el.g.classList.toggle('is-neighbor', !!nb && nb.has(id) && id !== fc);
      el.g.classList.toggle('is-dim', !!fc && !nb.has(id));
    }
    for (const e of gEdges.children) { const on = fc && (e._from === fc || e._to === fc); e.classList.toggle('is-active', !!on); e.classList.toggle('is-dim', !!fc && !on); }
    if (fc && detailOf) showDetail(fc); else hideDetail();
  }
  function showDetail(id) {
    const d = detailOf(nodes.find((n) => n.id === id), id); if (!d) { hideDetail(); return; }
    const actions = Array.isArray(d.actions) ? d.actions : [];
    detail.replaceChildren(h('div', { class: 'ig-detail-card' },
      h('div', { class: 'ig-detail-head' }, h('span', { class: 'ig-detail-id', text: id }),
        sel === id ? h('button', { class: 'insp-x', type: 'button', 'aria-label': 'Fechar', onclick: () => { sel = null; paint(); } }, '×') : null),
      d.title ? h('div', { class: 'ig-detail-title', text: d.title }) : null,
      d.badges && d.badges.length ? h('div', { class: 'insp-badges' }, ...d.badges) : null,
      d.sub ? h('p', { class: 'muted small', text: d.sub }) : null,
      actions.length ? h('div', { class: 'ig-detail-actions' }, ...actions.map((a) => h('button', { class: a.cls || 'btn-link', type: 'button', onclick: a.onClick }, a.label))) : null,
      onOpen && d.openable ? h('button', { class: 'btn-link', type: 'button', onclick: () => onOpen(id), text: 'Abrir requisito →' }) : null));
    detail.classList.remove('is-hidden');
  }
  function hideDetail() { detail.classList.add('is-hidden'); detail.replaceChildren(); }
  function select(id) { sel = (sel === id) ? null : id; paint(); if (sel) { const x = detail.querySelector('.insp-x'); if (x) x.focus(); } } // foco no fechar ao selecionar (a11y)

  function setData(newNodes, newEdges) {
    nodes = (newNodes || []).slice(); edges = (newEdges || []).slice();
    if (!nodes.length) { gEdges.replaceChildren(); for (const [, el] of els) el.g.remove(); els.clear(); return; }
    const ln = nodes.map((n) => ({ ...n, product: n.group || ('w' + (n.wave || 0)) }));
    const laid = forceLayout(ln, edges, { width: W, height: H, iterations: nodes.length > 24 ? 260 : 340, minDistX: 150, minDistY: 74 });
    const by = {}; for (const n of laid.nodes) by[n.id] = n;
    gEdges.replaceChildren();
    for (const e of edges) { const a = by[e.from], b = by[e.to]; if (!a || !b) continue; const l = svg('line', { class: 'forge-dedge ig-edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y }); l._from = e.from; l._to = e.to; gEdges.append(l); }
    const keep = new Set();
    for (const n of laid.nodes) {
      keep.add(n.id);
      let el = els.get(n.id);
      if (!el) {
        const g = svg('g', { class: 'forge-dnode ig-node', tabindex: '-1', role: 'button' });
        const ttl = svg('title'); g.append(ttl);
        g.append(svg('rect', { class: 'chip', x: '-66', y: '-15', width: '132', height: '30', rx: '9' }));
        const tx = svgText({ class: 'dlbl', x: '0', y: '4', 'text-anchor': 'middle', 'aria-hidden': 'true' }, '');
        g.append(tx);
        g.addEventListener('click', (ev) => { ev.stopPropagation(); select(n.id); });
        g.addEventListener('dblclick', () => { if (onOpen) onOpen(n.id); });
        g.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id); }
          else if ((ev.key === 'o' || ev.key === 'O') && onOpen) onOpen(n.id);
          else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); moveRoving(n.id, 1); }
          else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); moveRoving(n.id, -1); }
        });
        g.addEventListener('mouseenter', () => { hoverId = n.id; if (!sel) paint(); });
        g.addEventListener('mouseleave', () => { if (hoverId === n.id) hoverId = null; if (!sel) paint(); });
        g.addEventListener('focus', () => { hoverId = n.id; setRoving(n.id); if (!sel) paint(); });
        el = { g, ttl, tx }; els.set(n.id, el); gNodes.append(g);
      }
      el.g.setAttribute('class', 'forge-dnode ig-node' + (nodeClass(n) ? ' ' + nodeClass(n) : ''));
      el.g.setAttribute('transform', `translate(${n.x},${n.y})`);
      el.tx.textContent = String(n.label || n.id).replace(/^REQ-/, '');
      el.ttl.textContent = n.title ? `${n.id} — ${n.title}` : n.id;
      let aria = n.title ? `${n.id}: ${n.title}` : n.id;
      if (detailOf) { const dd = detailOf(n, n.id); if (dd && dd.sub) aria += `, ${dd.sub}`; } // anuncia wave/status ao leitor de tela
      el.g.setAttribute('aria-label', aria);
    }
    for (const [id, el] of els) if (!keep.has(id)) { el.g.remove(); els.delete(id); }
    ensureRoving();
    paint();
  }

  // roving tabindex: exatamente UM nó é tabbable; setas movem o foco entre nós (WCAG 2.1.1).
  function setRoving(id) { for (const [k, el] of els) el.g.setAttribute('tabindex', k === id ? '0' : '-1'); }
  function ensureRoving() { let has = false; for (const [, el] of els) if (el.g.getAttribute('tabindex') === '0') { has = true; break; } if (!has) { const first = els.keys().next().value; if (first) els.get(first).g.setAttribute('tabindex', '0'); } }
  function moveRoving(fromId, dir) { const ids = [...els.keys()]; if (ids.length < 2) return; let i = ids.indexOf(fromId); i = (i + dir + ids.length) % ids.length; const el = els.get(ids[i]); if (el) { setRoving(ids[i]); el.g.focus(); } }

  // Esc fecha o painel de detalhe e devolve o foco ao no selecionado (a11y de teclado).
  canvas.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && sel) { ev.stopPropagation(); const back = els.get(sel); sel = null; paint(); if (back) back.g.focus(); } });
  wireZoomPanLocal(s, root, { width: W, height: H }, () => { sel = null; paint(); });
  return { el: wrap, setData, focus: (id) => { sel = id; paint(); } };
}

// Constrói o grafo interativo de um build-plan (waves + status real) — Arquitetura/Build.
function buildPlanGraph(buildPlan, tall) {
  const stLbl = { done: 'concluído', active: 'em andamento', blocked: 'bloqueado', todo: 'não iniciado' };
  const g = interactiveGraph({
    tall, label: 'Grafo de dependências do build por waves', onOpen: (id) => openReq(id),
    nodeClass: (n) => 's-' + dStateCls(n.status),
    detailOf: (n, id) => { const r = byId(id); return { title: r ? r.title : '', openable: !!r, sub: `wave ${(n ? n.wave : 0) + 1} · ${stLbl[dStateCls(n ? n.status : 'todo')]}`, badges: r ? [badge(r.type === 'non-functional' ? 'NFR' : 'funcional', r.type === 'non-functional' ? 'b-nfr' : 'b-fn'), badge((n && n.status) || 'not_started', forgeStatusCls((n && n.status) || 'not_started'))] : [] }; },
  });
  const dag = buildDag(buildPlan, DATA.implStatus);
  g.setData(dag.nodes, dag.edges);
  return g;
}
function forgeDagLegend() {
  const items = [['s-done', 'Pronto'], ['s-active', 'Em andamento'], ['s-blocked', 'Bloqueado'], ['s-todo', 'Não iniciado']];
  const leg = h('div', { class: 'forge-dag-legend', 'aria-hidden': 'true' });
  for (const [cls, label] of items) leg.append(h('span', {}, h('span', { class: 'legend-dot ' + cls }), label));
  return leg;
}

/* ---- Novo produto: brief → requisitos (IA, fail-closed) → YAML + caminho de PR ---- */
// ─── WIZARD de criação — UM wizard, TRÊS PROJEÇÕES (C2) ─────────────────────
// O modo global ('simples' | 'guiado' | 'profissional', localStorage) muda SÓ a apresentação:
// simples = cartões em linguagem natural (✔ aceitar / ✎ ajustar, sem YAML/ids); guiado (default) =
// cartões + "ver detalhe técnico" por cartão; profissional = tudo aberto + export YAML. Os
// ARTEFATOS (requisitos/arquitetura/launch) são IDÊNTICOS nos 3 — projeções em forge-lib.js.
// 5 etapas: Ideia → O que será criado → Plano → Preview → Revisar. Nada é escrito sem revisão.
function forgeWizardState() {
  const blueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
  // preview: estado da etapa "Preview" (telas ui-vue reais + dados fake), persistido no wizard.
  // status: 'idle'|'building'|'ready'|'error'; approved=true libera o launch (gate "Aprovar e construir").
  if (!state.forge.wizard) state.forge.wizard = { stage: 1, mode: forgeMode(), name: '', brief: '', slug: '', blueprint: (blueprints[0] && blueprints[0].id) || '', proposed: [], arch: null, reqMeta: null, error: '', preview: null, idea: fwLoadIdea() };
  if (!state.forge.wizard.idea) state.forge.wizard.idea = fwLoadIdea(); // wizard de sessão antiga (pré-copiloto)
  return state.forge.wizard;
}
// Estado inicial do preview (recriado a cada nova proposta de requisitos — ver fwApplyProposed).
// inventory = inventário de telas/entidades/brand devolvido pelo backend (usado p/ regerar e refinar).
function fwInitPreview() { return { status: 'idle', url: '', screens: [], inventory: null, approved: false, error: '', steps: [] }; }
const FW_STEPS = [
  { n: 1, label: 'Ideia', sub: 'descreva o que quer' },
  { n: 2, label: 'O que será criado', sub: 'capacidades e telas' },
  { n: 3, label: 'Plano de construção', sub: 'ordem das etapas' },
  { n: 4, label: 'Preview', sub: 'veja e refine as telas' },
  { n: 5, label: 'Revisar e criar', sub: 'documentação + pedido' },
];
function fwRerender() { renderForge(); }
function fwMaxStage(w) { return (w.proposed && w.proposed.length) ? FW_STEPS.length : 1; }
function fwGoto(n) { const w = forgeWizardState(); if (n >= 1 && n <= fwMaxStage(w)) { w.stage = n; fwRerender(); } }
// Gate: o launch (criar/construir) só é liberado depois que o preview foi APROVADO pelo dono.
function fwPreviewApproved(w) { return !!(w.preview && w.preview.approved); }
function fwNav(back, next, nextLabel) {
  const row = h('div', { class: 'fw-nav' });
  if (back) row.append(h('button', { class: 'btn', type: 'button', text: '← Voltar', onclick: () => fwGoto(back) }));
  if (next && nextLabel) row.append(h('button', { class: 'btn primary', type: 'button', onclick: () => fwGoto(next) }, nextLabel + ' →'));
  return row;
}

// Dispara o launch a partir do estado do wizard e TRAVA a navegação no sucesso (onLaunched).
function fwLaunch(w, mode, statusEl, btns) {
  // Gate de segurança: nunca constrói sem o preview aprovado (a UI já desabilita o botão; isto é
  // defesa em profundidade caso algum caminho chame fwLaunch diretamente).
  if (!fwPreviewApproved(w)) {
    if (statusEl) statusEl.replaceChildren(h('span', { class: 'fw-err', text: 'Aprove o preview das telas antes de construir.' }));
    return Promise.resolve();
  }
  const ctx = {
    pname: w.slug, blueprint: w.blueprint, proposed: w.proposed || [],
    launchCtx: {
      brief: w.brief || '', displayName: w.name || w.slug,
      getArch: () => w.arch,
      externalContract: (w.capture && w.capture.ref) || null, // (E2) -> architecture.external_contract
      onLaunched: (d, m) => { fwClearIdea(); w.launched = true; w.launchInfo = d; w.launchMode = m; fwRerender(); }, // idea consumida no launch -> limpa o autosave
    },
    status: statusEl, btns,
  };
  return forgeLaunch(mode, ctx);
}

// Tela TRAVADA após o launch — impede voltar e re-gerar/re-disparar; mostra o PROGRESSO AO VIVO
// (polling do status do GitHub + sonda da URL do app) e revela o link de acesso quando publica.
function renderForgeWizardLaunched(body, w) {
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: () => { fwStopPolling(w); state.forge.wizard = null; backToHub(); } }, { label: 'Criar um sistema' }]));
  const d = w.launchInfo || {};
  const rel = w.launchMode === 'release';
  const card = h('div', { class: 'fw-card fw-launched' });
  const head = h('h2', { class: 'fw-launch-h', text: (rel ? '🚀 Construindo o ' : '📦 Requisitos criados — ') + (w.name || w.slug) });
  const lead = h('p', { class: 'fw-lead', text: rel
    ? 'Acompanhe ao vivo cada fase da esteira — quando o sistema ficar no ar, o link de acesso aparece abaixo.'
    : 'Os requisitos foram criados no git. Mescle o PR para a esteira construir e publicar.' });
  const updated = h('span', { class: 'fw-updated muted small', text: 'conectando…' });
  // lista de fases sem aria-live (poll de 6s re-anunciava a lista inteira); o pontual é o liveBox.
  const steps = h('ol', { class: 'fw-launch-steps' });
  const progBox = h('div', { class: 'fw-progress' });
  const reqsBox = h('div', { class: 'fw-reqs' });
  const liveBox = h('div', { class: 'fw-live', 'aria-live': 'polite' });
  const foot = h('div', { class: 'fw-actions' });
  if (d.actions_url) foot.append(h('a', { class: 'btn', href: d.actions_url, target: '_blank', rel: 'noopener', text: 'Ver no GitHub ↗' }));
  if (!rel && d.pulls_url) foot.append(h('a', { class: 'btn', href: d.pulls_url, target: '_blank', rel: 'noopener', text: 'Ver o PR ↗' }));
  foot.append(h('button', { class: 'btn', type: 'button', text: '+ Criar outro sistema', onclick: () => { fwStopPolling(w); fwClearIdea(); state.forge.wizard = null; backToHub(); } }));
  card.append(head, lead, h('div', { class: 'fw-meta' }, updated), steps, liveBox, progBox, reqsBox, foot);
  body.append(card);
  fwStartLaunchPolling(w, { steps, progBox, reqsBox, liveBox, lead, updated });
}

function fwStopPolling(w) { if (w && w._statusTimer) { clearTimeout(w._statusTimer); w._statusTimer = null; } }

// Polling AO VIVO da esteira: fases ORDENADAS derivadas do estado REAL — requisitos/plano do
// launch-status (PRs) + construção/publicado do impl-status (progresso por requisito). "Publicado"
// NÃO vem mais de uma sonda HEAD (que dava falso-positivo via catch-all do portal): vem do
// launchPhases (com clamp monotônico). Idempotente; para sozinho ao publicar ou ao sair do wizard.
function fwStartLaunchPolling(w, els) {
  fwStopPolling(w);
  const slug = w.slug;
  const appUrl = location.origin + '/' + slug + '/';
  const renderPhases = (phases) => { els.steps.replaceChildren(...forgePhaseNodes(phases)); };

  const renderProgress = (reqIds, implLocal, buildPlan) => {
    els.progBox.replaceChildren();
    if (!reqIds.length) return;
    const prog = weightedProgress(reqIds, implLocal);
    els.progBox.append(h('div', { class: 'forge-prog-head' }, h('h3', { text: 'Progresso da construção' }),
      prog.pct === 100 ? badge('no ar ✓', 'b-ok') : (prog.delivered ? badge('deploy/verificação pendente', 'b-high') : null)));
    els.progBox.append(progressBar(prog.pct));
    const chips = h('div', { class: 'forge-breakdown', 'aria-label': 'Requisitos por estágio' });
    let any = false;
    for (const st of ['done', 'deployed', 'merged', 'pr_open', 'in_progress', 'blocked', 'not_started']) {
      const n = prog.by[st] || 0; if (!n) continue; any = true;
      chips.append(h('span', { class: 'forge-bd ' + forgeStatusCls(st), text: `${n} ${FORGE_STAGE_LABELS[st] || st}` }));
    }
    if (any) els.progBox.append(chips);
    els.progBox.append(h('p', { class: 'muted small', text: `${prog.live}/${prog.total} no ar · ${prog.delivered}/${prog.total} com código no main` }));
    if (buildPlan && buildPlan.waves && buildPlan.waves.length) {
      const list = h('div', { class: 'forge-waves', role: 'list' });
      for (const wv of wavesFromProgress(buildPlan, prog.pct)) {
        list.append(h('div', { class: 'forge-wave s-' + wv.state, role: 'listitem' },
          h('span', { class: 'forge-wave-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'forge-wave-id', text: wv.id }),
          h('span', { class: 'forge-wave-n', text: FORGE_WAVE_STATE[wv.state] || wv.state })));
      }
      els.progBox.append(h('h4', { class: 'fw-sub', text: 'Waves' }), list);
    }
  };

  const renderReqs = (reqIds, implLocal) => {
    els.reqsBox.replaceChildren();
    if (!reqIds.length) return;
    els.reqsBox.append(h('h3', { class: 'fw-sub', text: `Requisitos → código (${reqIds.length})` }));
    const t = h('table');
    t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'Título' }), h('th', { text: 'Status' }), h('th', { text: 'PR' }))));
    const tb = h('tbody');
    for (const id of reqIds) {
      const row = reqRow(id, DATA.baseline, implLocal);
      tb.append(h('tr', {},
        h('td', {}, h('span', { class: 'rid', text: id })),
        h('td', { text: truncateLabel(row.title || id, 56) }),
        h('td', {}, badge(row.status, forgeStatusCls(row.status))),
        h('td', {}, row.pr ? h('a', { class: 'btn-link', href: row.pr, target: '_blank', rel: 'noopener', text: 'PR' }) : h('span', { class: 'empty', text: '—' }))));
    }
    const gw = h('div', { class: 'grid-wrap' }); t.append(tb); gw.append(t); els.reqsBox.append(gw);
  };

  const tick = async () => {
    if (state.forge.wizard !== w) { fwStopPolling(w); return; } // navegou para fora
    // 1) fases da esteira (PRs no git): requisitos + plano + build
    let stages = [];
    try { const r = await AI.get('/v1/forge/launch-status?product=' + encodeURIComponent(slug)); if (r.ok && r.data && Array.isArray(r.data.stages)) stages = r.data.stages; } catch { /* fail-soft */ }
    // 2) estado VIVO (progresso REAL por requisito) — autoritativo p/ construção/publicado
    let product = null; let implLocal = { items: {} }; let buildPlan;
    try {
      const s = await AI.get('/v1/forge/state');
      const p = s.ok && s.data && (s.data.products || []).find((x) => x.name === slug);
      if (p) {
        product = { requirement_ids: p.requirement_ids || [], phases: p.phases || {} };
        implLocal = { items: Object.fromEntries((p.reqs || []).map((r) => [r.id, { status: r.status }])) };
        buildPlan = p.buildPlan;
      }
    } catch { /* fail-soft: usa só as stages */ }

    const phases = launchPhases(stages, product, implLocal, buildPlan);
    renderPhases(phases);
    const reqIds = (product && product.requirement_ids) || [];
    renderProgress(reqIds, implLocal, buildPlan);
    renderReqs(reqIds, implLocal);
    els.updated.textContent = 'atualizado às ' + new Date().toLocaleTimeString('pt-BR');

    const pub = phases.find((p) => p.key === 'publicado');
    if (pub && pub.status === 'done') {
      els.lead.textContent = 'Pronto! O ' + (w.name || slug) + ' foi construído e publicado.';
      els.liveBox.replaceChildren(
        h('p', { class: 'fw-live-t', text: '🎉 Seu sistema está no ar!' }),
        h('a', { class: 'btn primary fw-cta', href: appUrl, target: '_blank', rel: 'noopener', text: 'Acessar ' + (w.name || slug) + ' ↗' }));
      fwStopPolling(w);
      return;
    }
    // ainda construindo: destaca a fase ATUAL como "agora" (liveBox é aria-live: troca só quando o texto muda)
    const nowNode = forgeNowNode(phases);
    if (els.liveBox.textContent !== nowNode.textContent) els.liveBox.replaceChildren(nowNode);
    w._statusTimer = setTimeout(tick, 6000);
  };
  tick();
}

function renderForgeWizard(body) {
  const w = forgeWizardState();
  if (w.launched) { renderForgeWizardLaunched(body, w); return; } // travado após "Criar/Liberar" — não re-disparar
  // (C2) o MODO é global (localStorage) e projeta a MESMA engine — sincroniza o estado do wizard
  // (migra os valores antigos guided/advanced de sessões pré-C2 via normalizeForgeMode).
  w.mode = forgeMode();
  const blueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
  const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: () => { state.forge.wizard = null; backToHub(); } }, { label: 'Criar um sistema' }]));

  body.append(h('div', { class: 'fw-head' },
    h('div', { class: 'fw-head-t' }, h('h2', { text: 'Criar um sistema novo' }), h('p', { class: 'muted', text: 'Descreva sua ideia — a IA mostra, passo a passo, tudo que será criado. Você revisa e confirma; nada é escrito sem você.' })),
    forgeModeSelector()));

  const stepper = h('ol', { class: 'fw-steps' });
  for (const s of FW_STEPS) {
    const cls = w.stage === s.n ? 'is-current' : (s.n < w.stage ? 'is-done' : 'is-todo');
    const clickable = s.n <= fwMaxStage(w);
    stepper.append(h('li', { class: 'fw-step ' + cls + (clickable ? ' is-click' : ''), 'aria-current': w.stage === s.n ? 'step' : null, role: clickable ? 'button' : null, tabindex: clickable ? '0' : null, onclick: clickable ? () => fwGoto(s.n) : null, onkeydown: clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fwGoto(s.n); } } : null },
      h('span', { class: 'fw-step-n', 'aria-hidden': 'true', text: s.n < w.stage ? '✓' : String(s.n) }),
      h('span', { class: 'fw-step-tx' }, h('span', { class: 'fw-step-l', text: s.label }), h('span', { class: 'fw-step-s', text: s.sub }))));
  }
  body.append(stepper);

  // sem aria-live no contêiner largo: cada re-render anunciava a etapa INTEIRA ao leitor de tela;
  // os anúncios ficam nos role=status/log pontuais internos de cada etapa.
  const stage = h('div', { class: 'fw-stage', role: 'region', 'aria-label': 'Conteúdo da etapa' });
  body.append(stage);
  if (w.stage === 1) fwStageIdea(stage, w, { blueprints });
  else if (w.stage === 2) fwStageWhat(stage, w, { catalog });
  else if (w.stage === 3) fwStagePlan(stage, w);
  else if (w.stage === 4) fwStagePreview(stage, w);
  else fwStageReview(stage, w, { catalog });
}

// ─── ETAPA 1 "IDEIA" — COPILOTO DE PRODUTO (conversacional, 3 visões) ────────────────────────────
// A aba Ideia é 100% PRODUTO/NEGÓCIO (nada de tecnologia — isso é a etapa 2). A pessoa conversa com um
// copiloto que faz perguntas para amadurecer a ideia; o entendimento (ideaDraft) aparece ao vivo. O
// MODO selecionado é a VISÃO da aba (simples/guiado/profissional) — muda a profundidade/apresentação,
// nunca o nível técnico. As 3 visões compartilham o MESMO estado (w.idea) e o mesmo copiloto; trocar
// de modo NÃO perde dados (w.idea vive em state.forge.wizard). Streaming SSE (deltas) + patch do estado
// + autosave. Fail-closed: se a IA estiver fora, cai no formulário manual (fwStageIdeaManual).
function fwStageIdea(host, w, { blueprints }) {
  if (!w.idea) w.idea = fwLoadIdea();
  const mount = h('div', { class: 'fw-idea-mount' });
  host.append(mount);
  fwRenderIdeaCopilot(mount, w, { blueprints });
  // health: sem IA (sem credencial) o chat não funciona -> degrada para o formulário manual.
  AI.health().then((r) => {
    const up = !!(r && r.ok && r.data && r.data.ai);
    if (!up && state.forge.wizard === w && w.stage === 1) {
      mount.replaceChildren();
      fwStageIdeaManual(mount, w, { blueprints }, 'A IA está indisponível agora — descreva sua ideia manualmente (você ainda pode gerar o sistema).');
    }
  }).catch(() => { /* health inacessível: mantém o copiloto (o envio mostrará erro claro) */ });
}

/* ---------- Autosave do ideaDraft (localStorage; efeito colateral fica AQUI, não em forge-lib) ---------- */
const FW_IDEA_KEY = 'reqhub_forge_idea';
function fwLoadIdea() {
  try { const raw = localStorage.getItem(FW_IDEA_KEY); if (raw) return normalizeIdea(JSON.parse(raw)); } catch { /* ignore */ }
  return emptyIdea();
}
function fwSaveIdea(idea) { try { localStorage.setItem(FW_IDEA_KEY, JSON.stringify(idea)); } catch { /* ignore */ } }
function fwClearIdea() { try { localStorage.removeItem(FW_IDEA_KEY); } catch { /* ignore */ } }
function fwIdeaPersist(w) { if (w && w.idea) fwSaveIdea(w.idea); }
function fwSlug(name) { return String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); }
// Corpo enviado à IA: o produto do ideaDraft SEM o histórico (vai em `history`) nem flags de UI.
function fwIdeaForApi(idea) { const d = normalizeIdea(idea); delete d.chatHistory; delete d.confirmed; return d; }

// Monta a etapa: coluna CHAT (compartilhada) + painel da VISÃO por modo (nome + view + gate).
function fwRenderIdeaCopilot(host, w, { blueprints }) {
  const idea = w.idea;
  const card = h('div', { class: 'fw-card fw-idea-card' });
  card.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'idea.q') }));
  card.append(h('p', { class: 'muted fw-idea-lead', text: 'Converse com o copiloto de produto — ele pergunta para amadurecer a IDEIA (nada de tecnologia; isso vem no próximo passo). Nada é escrito sem você.' }));
  if (w.capture) card.append(fwIdeaCaptureNote(w));

  const grid = h('div', { class: 'fw-idea fw-idea-m-' + normalizeForgeMode(w.mode) });
  const chatCol = h('div', { class: 'fw-idea-chat' });
  const sideCol = h('div', { class: 'fw-idea-side' });
  grid.append(chatCol, sideCol);
  card.append(grid);
  host.append(card);

  // ----- chat -----
  const log = h('div', { class: 'fw-idea-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o copiloto de produto' });
  const typing = h('div', { class: 'chat-typing fw-idea-typing', hidden: 'hidden', 'aria-hidden': 'true' }, h('span', { class: 'dot' }), h('span', { class: 'dot' }), h('span', { class: 'dot' }));
  const chips = h('div', { class: 'fw-idea-chips', 'aria-label': 'Respostas rápidas' });
  const errBox = h('p', { class: 'fw-status fw-idea-err', role: 'alert', hidden: 'hidden' });
  const input = h('textarea', { class: 'fw-textarea fw-idea-input', rows: '2', 'aria-label': 'Escreva para o copiloto', placeholder: 'Escreva sobre a sua ideia…' });
  const sendBtn = h('button', { class: 'btn primary fw-idea-sendbtn', type: 'button', text: 'Enviar' });
  // Anexos (opcional, multimodal): a IA lê documento/planilha/imagem sobre a ideia. Persistido no
  // wizard (w._ideaPicker) p/ sobreviver às re-renderizações (ex.: troca de modo).
  if (!w._ideaPicker) w._ideaPicker = filePicker({ label: 'Anexar arquivos sobre a ideia', buttonLabel: '📎 Anexar (opcional)' });
  chatCol.append(log, typing, chips, errBox, h('div', { class: 'fw-idea-composer' }, input, sendBtn), h('div', { class: 'fw-idea-attach' }, w._ideaPicker.el));

  const bubble = (role, text) => { const b = h('div', { class: 'fw-idea-msg is-' + role }); const body = h('div', { class: 'fw-idea-bubble' }); body.textContent = text || ''; b.append(body); return b; };

  // ----- painel: nome + view + gate -----
  const nameInput = h('input', { class: 'fw-input fw-idea-name-in', type: 'text', 'aria-label': 'Nome do sistema', placeholder: 'ex.: Central de Chamados' });
  nameInput.value = idea.name || '';
  nameInput.addEventListener('change', () => { idea.name = nameInput.value.trim(); fwIdeaPersist(w); });
  const nameField = h('label', { class: 'fw-idea-name' }, h('span', { class: 'fw-fld-l', text: 'Nome do sistema' }), nameInput);
  const viewHost = h('div', { class: 'fw-idea-viewhost' });
  const gateHost = h('div', { class: 'fw-idea-gatehost' });
  sideCol.append(nameField, viewHost, gateHost);

  const ui = {
    sending: false, input, log,
    appendBubble: (role, text) => { const b = bubble(role, text); log.append(b); log.scrollTop = log.scrollHeight; return b; },
    setBubbleText: (b, t) => { const el = b.querySelector('.fw-idea-bubble'); if (el) el.textContent = t; log.scrollTop = log.scrollHeight; },
    setTyping: (on) => { typing.hidden = !on; log.setAttribute('aria-busy', on ? 'true' : 'false'); },
    setError: (msg) => { if (msg) { errBox.textContent = msg; errBox.hidden = false; } else { errBox.textContent = ''; errBox.hidden = true; } },
    setChips: (list) => fwIdeaRenderChips(chips, w, ui, list),
    refreshName: () => { if (nameInput !== document.activeElement) nameInput.value = w.idea.name || ''; },
    repaintView: () => { viewHost.replaceChildren(fwIdeaView(w, ui)); ui.refreshName(); },
    repaintGate: () => { gateHost.replaceChildren(fwIdeaGate(w, ui)); },
  };

  ui.repaintView();
  ui.repaintGate();

  // histórico OU boas-vindas + exemplos de partida
  if (idea.chatHistory && idea.chatHistory.length) {
    for (const t of idea.chatHistory) ui.appendBubble(t.role === 'user' ? 'user' : 'ai', t.content);
  } else {
    ui.appendBubble('ai', 'Oi! Vou te ajudar a amadurecer a ideia do seu sistema. Me conta em poucas palavras: que problema ele resolve — e para quem?');
    fwIdeaRenderStarters(chips, w, ui);
  }

  const doSend = () => fwIdeaSend(w, input.value, ui);
  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  input.focus();
}

// Envia uma mensagem ao copiloto e transmite a resposta em DELTAS (otimista: bolha do usuário +
// "digitando" na hora). No `patch` aplica ao ideaDraft e repinta a visão/gate ao vivo.
async function fwIdeaSend(w, text, ui) {
  const msg = String(text || '').trim();
  const files = (w._ideaPicker && w._ideaPicker.hasFiles()) ? w._ideaPicker.files() : [];
  if ((!msg && !files.length) || ui.sending) return;
  ui.sending = true; ui.setError('');
  const history = (w.idea.chatHistory || []).slice(-16).map((t) => ({ role: t.role, content: t.content }));
  const shown = msg || ('📎 ' + files.length + ' arquivo(s) anexado(s)');
  w.idea.chatHistory.push({ role: 'user', content: shown });
  ui.appendBubble('user', shown);
  ui.input.value = '';
  ui.setChips([]);
  const live = ui.appendBubble('ai', '');
  ui.setTyping(true);
  let acc = '';
  const product = w.slug || fwSlug(w.idea.name);
  // Com arquivos -> multipart (SSE-over-multipart); o backend (withIngest) funde o texto extraído em
  // `message` e reidrata history/draft. Sem arquivos -> JSON de sempre (retrocompat).
  let body;
  if (files.length) {
    body = new FormData();
    body.append('message', msg);
    body.append('product', product || '');
    body.append('mode', w.mode);
    body.append('history', JSON.stringify(history));
    body.append('draft', JSON.stringify(fwIdeaForApi(w.idea)));
    for (const f of files) if (f) body.append('files', f, f.name);
  } else {
    body = { product, message: msg, history, draft: fwIdeaForApi(w.idea), mode: w.mode };
  }
  try {
    await AI.stream2('/v1/forge/idea/chat', body, {
      onEvent: (event, data) => {
        if (event === 'delta') { acc += (data && data.text) || ''; ui.setBubbleText(live, acc); }
        else if (event === 'patch') {
          w.idea = applyIdeaPatch(w.idea, data);
          ui.repaintView(); ui.repaintGate();
          ui.setChips((data && data.quick_replies) || []);
        }
      },
    });
    const finalText = acc.trim();
    if (!finalText) ui.setBubbleText(live, '(sem resposta)');
    w.idea.chatHistory.push({ role: 'assistant', content: finalText || '(sem resposta)' });
    if (files.length && w._ideaPicker && w._ideaPicker.clear) w._ideaPicker.clear(); // consumidos -> limpa
    fwIdeaPersist(w);
  } catch (e) {
    live.remove();
    ui.setError('Não consegui responder agora (' + String((e && (e.message || e.code)) || e) + '). Tente de novo, ou use “✨ Ver como vai ficar”.');
  } finally {
    ui.setTyping(false); ui.sending = false; ui.input.focus();
  }
}

// Chips de resposta rápida (do turno) — clicar envia a resposta.
function fwIdeaRenderChips(chips, w, ui, list) {
  chips.replaceChildren();
  const arr = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4) : [];
  for (const q of arr) {
    const c = h('button', { class: 'fw-chip fw-idea-chip', type: 'button', text: q });
    c.addEventListener('click', () => { chips.replaceChildren(); fwIdeaSend(w, q, ui); });
    chips.append(c);
  }
}
// Exemplos de partida (mantidos): clicar inicia a conversa com aquele brief.
function fwIdeaRenderStarters(chips, w, ui) {
  chips.replaceChildren();
  const ex = [
    ['Central de chamados', 'Quero um sistema para abrir e acompanhar chamados de suporte, atribuir a técnicos e avisar quando algo atrasa.'],
    ['Controle de estoque', 'Quero controlar produtos e estoque, com alertas de baixa quantidade e relatórios.'],
    ['Agenda de clientes', 'Quero cadastrar clientes e agendar serviços, com lembretes automáticos por mensagem.'],
  ];
  for (const [t, b] of ex) {
    const c = h('button', { class: 'fw-chip fw-idea-chip', type: 'button', text: '💡 ' + t });
    c.addEventListener('click', () => { chips.replaceChildren(); fwIdeaSend(w, b, ui); });
    chips.append(c);
  }
}
function fwIdeaCaptureNote(w) {
  const rm = h('button', { class: 'btn-link', type: 'button', text: 'remover insumo' });
  rm.addEventListener('click', () => { w.capture = null; fwRerender(); });
  return h('div', { class: 'fw-fld fw-capture-note' },
    h('span', { class: 'fw-fld-l', text: 'Insumo de captura' }),
    h('p', { class: 'fw-hint' }, '📡 Contrato do portal ', h('code', { text: w.capture.portal }),
      w.capture.ref && w.capture.ref.contract_version ? ' (versão ' + w.capture.ref.contract_version + ')' : '',
      ' — será considerado ao montar a arquitetura no próximo passo.', ' ', rm));
}

/* ---------- Visão por MODO (mesmo w.idea) ---------- */
function fwIdeaView(w, ui) {
  const m = normalizeForgeMode(w.mode);
  const onChange = () => { fwIdeaPersist(w); ui.repaintGate(); };
  if (m === 'simples') return fwIdeaViewSimples(w, onChange);
  if (m === 'profissional') return fwIdeaViewProfissional(w, onChange);
  return fwIdeaViewGuiado(w, onChange);
}

// SIMPLES: resumo amigável — propósito + "o que vai fazer" (lista) + público. Editável/removível.
function fwIdeaViewSimples(w, onChange) {
  const idea = w.idea;
  const box = h('div', { class: 'fw-idea-view is-simples' });
  box.append(h('h4', { class: 'fw-idea-view-t', text: 'A sua ideia' }));
  box.append(h('p', { class: 'fw-idea-purpose', text: idea.summary || 'Vá conversando — vou montar aqui um resumo simples da sua ideia.' }));
  if (idea.audience || idea.actors.length) box.append(h('p', { class: 'fw-idea-who muted', text: 'Para: ' + [idea.audience, ...idea.actors].filter(Boolean).join(', ') }));
  box.append(h('h5', { class: 'fw-idea-sub', text: 'O que o sistema vai fazer' }));
  box.append(fwIdeaEditList(idea.capabilities, { label: 'O que o sistema faz', placeholder: 'Adicionar função…', onChange }));
  return box;
}

// GUIADO: 5 cartões editáveis (problema / quem usa / o que faz / regras / perguntas) + "detalhe opcional".
function fwIdeaViewGuiado(w, onChange) {
  const idea = w.idea;
  const box = h('div', { class: 'fw-idea-view is-guiado' });
  const card = (title, primary, detailTitle, detailEl) => {
    const sec = h('section', { class: 'fw-idea-card2' }, h('h4', { class: 'fw-idea-card-t', text: title }), primary);
    if (detailEl) sec.append(h('details', { class: 'fw-idea-detail' }, h('summary', { text: detailTitle || 'Detalhe opcional' }), detailEl));
    return sec;
  };
  box.append(card('Que problema resolve', fwIdeaScalar(idea, 'problem', { label: 'Problema', ph: 'A dor que o sistema resolve…', rows: 2, onChange }),
    'Propósito em uma frase', fwIdeaScalar(idea, 'summary', { label: 'Propósito', ph: 'Em uma frase…', rows: 2, onChange })));
  box.append(card('Quem usa', fwIdeaScalar(idea, 'audience', { label: 'Público', ph: 'Para quem é…', onChange }),
    'Perfis/atores', fwIdeaEditList(idea.actors, { label: 'Atores', placeholder: 'Adicionar perfil…', onChange })));
  box.append(card('O que faz', fwIdeaEditList(idea.capabilities, { label: 'Capacidades', placeholder: 'Adicionar função…', onChange }),
    'Objetivos', fwIdeaEditList(idea.goals, { label: 'Objetivos', placeholder: 'Adicionar objetivo…', onChange })));
  box.append(card('Regras de negócio', fwIdeaEditList(idea.businessRules, { label: 'Regras de negócio', placeholder: 'Adicionar regra…', onChange }),
    'Restrições', fwIdeaEditList(idea.constraints, { label: 'Restrições', placeholder: 'Adicionar restrição…', onChange })));
  box.append(card('Perguntas em aberto', fwIdeaOpenQuestions(idea, onChange)));
  return box;
}

// PROFISSIONAL: tudo aberto e editável (todos os campos de PRODUTO) + reordenar capacidades.
function fwIdeaViewProfissional(w, onChange) {
  const idea = w.idea;
  const box = h('div', { class: 'fw-idea-view is-profissional' });
  const field = (title, el) => h('section', { class: 'fw-idea-fieldset' }, h('h4', { class: 'fw-idea-card-t', text: title }), el);
  box.append(field('Problema', fwIdeaScalar(idea, 'problem', { label: 'Problema', rows: 2, onChange })));
  box.append(field('Propósito (1 frase)', fwIdeaScalar(idea, 'summary', { label: 'Propósito', rows: 2, onChange })));
  box.append(field('Público', fwIdeaScalar(idea, 'audience', { label: 'Público', onChange })));
  box.append(field('Atores', fwIdeaEditList(idea.actors, { label: 'Atores', placeholder: 'Adicionar perfil…', onChange })));
  box.append(field('Capacidades (use ↑/↓ para ordenar)', fwIdeaEditList(idea.capabilities, { label: 'Capacidades', placeholder: 'Adicionar função…', onChange, reorder: true })));
  box.append(field('Regras de negócio', fwIdeaEditList(idea.businessRules, { label: 'Regras de negócio', placeholder: 'Adicionar regra…', onChange })));
  box.append(field('Objetivos', fwIdeaEditList(idea.goals, { label: 'Objetivos', placeholder: 'Adicionar objetivo…', onChange })));
  box.append(field('Valor esperado', fwIdeaScalar(idea, 'value', { label: 'Valor esperado', rows: 2, onChange })));
  box.append(field('Restrições de negócio', fwIdeaEditList(idea.constraints, { label: 'Restrições', placeholder: 'Adicionar restrição…', onChange })));
  box.append(field('Perguntas em aberto', fwIdeaOpenQuestions(idea, onChange)));
  return box;
}

// Campo escalar editável (input/textarea) ligado a idea[key]; grava no `change`.
function fwIdeaScalar(idea, key, { label, ph, rows, onChange } = {}) {
  const el = rows
    ? h('textarea', { class: 'fw-textarea fw-idea-fin', rows: String(rows), 'aria-label': label, placeholder: ph || '' })
    : h('input', { class: 'fw-input fw-idea-fin', type: 'text', 'aria-label': label, placeholder: ph || '' });
  el.value = idea[key] || '';
  el.addEventListener('change', () => { idea[key] = el.value.trim(); onChange(); });
  return el;
}

// Lista editável de strings (adicionar/editar/remover; opcionalmente reordenar). Muta o array in place.
function fwIdeaEditList(items, { label, placeholder, onChange, reorder } = {}) {
  const wrap = h('div', { class: 'fw-idea-list' });
  const ul = h('ul', { class: 'fw-idea-items', 'aria-label': label || 'Itens' });
  const rebuild = () => {
    ul.replaceChildren();
    if (!items.length) { ul.append(h('li', { class: 'fw-idea-empty muted', text: '— nada ainda —' })); return; }
    items.forEach((it, i) => {
      const inp = h('input', { class: 'fw-idea-item-in', type: 'text', value: it, 'aria-label': (label || 'item') + ' ' + (i + 1) });
      inp.addEventListener('change', () => { const v = inp.value.trim(); if (v) { items[i] = v; onChange(); } else { items.splice(i, 1); onChange(); rebuild(); } });
      const ctl = h('span', { class: 'fw-idea-item-ctl' });
      if (reorder) {
        const up = h('button', { class: 'btn-link fw-idea-mv', type: 'button', 'aria-label': 'Mover para cima', text: '↑', disabled: i === 0 ? 'disabled' : null });
        up.addEventListener('click', () => { const t = items[i - 1]; items[i - 1] = items[i]; items[i] = t; onChange(); rebuild(); });
        const dn = h('button', { class: 'btn-link fw-idea-mv', type: 'button', 'aria-label': 'Mover para baixo', text: '↓', disabled: i === items.length - 1 ? 'disabled' : null });
        dn.addEventListener('click', () => { const t = items[i + 1]; items[i + 1] = items[i]; items[i] = t; onChange(); rebuild(); });
        ctl.append(up, dn);
      }
      const rm = h('button', { class: 'btn-link fw-idea-rm', type: 'button', 'aria-label': 'Remover', text: '✕' });
      rm.addEventListener('click', () => { items.splice(i, 1); onChange(); rebuild(); });
      ctl.append(rm);
      ul.append(h('li', { class: 'fw-idea-item' }, inp, ctl));
    });
  };
  rebuild();
  const add = h('input', { class: 'fw-input fw-idea-add', type: 'text', placeholder: placeholder || 'Adicionar e Enter…', 'aria-label': 'Adicionar em ' + (label || '') });
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = add.value.trim(); if (v) { items.push(v); add.value = ''; onChange(); rebuild(); } } });
  wrap.append(ul, add);
  return wrap;
}

// Perguntas em aberto do copiloto (essenciais destacadas). A pessoa pode dispensar.
function fwIdeaOpenQuestions(idea, onChange) {
  const ul = h('ul', { class: 'fw-idea-oq', 'aria-label': 'Perguntas em aberto' });
  const rebuild = () => {
    ul.replaceChildren();
    const oq = idea.openQuestions || [];
    if (!oq.length) { ul.append(h('li', { class: 'fw-idea-empty muted', text: 'Nenhuma pergunta em aberto 🎉' })); return; }
    oq.forEach((q, i) => {
      const rm = h('button', { class: 'btn-link fw-idea-rm', type: 'button', 'aria-label': 'Dispensar pergunta', text: '✕' });
      rm.addEventListener('click', () => { oq.splice(i, 1); onChange(); rebuild(); });
      ul.append(h('li', { class: 'fw-idea-oq-item' + (q.essential ? ' is-essential' : '') },
        q.essential ? badge('essencial', 'b-high') : h('span', { class: 'fw-idea-oq-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'fw-idea-oq-t', text: q.text }), rm));
    });
  };
  rebuild();
  return ul;
}

// Anel de maturidade (SVG) — reduced-motion safe; is-ready quando cruza o limiar do gate.
function fwIdeaRing(pct) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const C = 2 * Math.PI * 26;
  const s = svg('svg', { class: 'fw-ring', viewBox: '0 0 64 64', role: 'img', 'aria-label': 'Maturidade da ideia: ' + p + '%' });
  s.append(svg('circle', { class: 'fw-ring-track', cx: '32', cy: '32', r: '26', fill: 'none' }));
  s.append(svg('circle', { class: 'fw-ring-arc' + (p >= IDEA_MATURITY_THRESHOLD ? ' is-ready' : ''), cx: '32', cy: '32', r: '26', fill: 'none', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': (C * (1 - p / 100)).toFixed(2), transform: 'rotate(-90 32 32)' }));
  s.append(svgText({ class: 'fw-ring-v', x: '32', y: '37', 'text-anchor': 'middle' }, p + '%'));
  return s;
}

// Gate + indicador de maturidade + botão de avanço (só habilita quando ideaReady) + atalho avançado.
function fwIdeaGate(w, ui) {
  const idea = w.idea;
  const box = h('div', { class: 'fw-idea-gate' });
  const ready = ideaReady(idea);
  const meter = h('div', { class: 'fw-idea-meter' });
  if (normalizeForgeMode(w.mode) === 'simples') meter.append(h('div', { class: 'fw-idea-bar' }, progressBar(idea.maturity)));
  else meter.append(fwIdeaRing(idea.maturity));
  meter.append(h('p', { class: 'fw-idea-hint muted small', text: ideaMaturityHint(idea) }));
  box.append(meter);

  const status = h('p', { class: 'fw-status muted fw-idea-gate-st', role: 'status', 'aria-live': 'polite' });
  const advance = h('button', { class: 'btn primary fw-cta fw-idea-advance', type: 'button', text: 'Seguir para “O que será criado” →' });
  advance.disabled = !ready;
  advance.setAttribute('aria-disabled', ready ? 'false' : 'true');
  if (!ready) advance.title = 'Continue a conversa para fechar a ideia (maturidade + perguntas essenciais).';
  // Consistência botão = ABA = chat: usa o disabled REAL como gate (não re-avalia ideaReady no clique —
  // isso evitava o botão "não fazer nada" por um descompasso render↔clique). Se os requisitos JÁ existem,
  // apenas NAVEGA (fwGoto, idêntico à aba do passo 2); se ainda não, gera (transição instantânea).
  advance.addEventListener('click', () => { if (advance.disabled) return; w.idea.confirmed = true; fwIdeaPersist(w); fwAdvanceToWhat(w, status, advance); });
  box.append(advance);
  if (ready) box.append(h('p', { class: 'fw-idea-ready muted small', text: '✓ Ideia madura — você pode seguir ou continuar refinando.' }));

  const skip = h('button', { class: 'btn fw-idea-skip', type: 'button', text: '✨ Ver como vai ficar' });
  skip.addEventListener('click', () => fwHandoffToWhat(w, status, skip));
  box.append(h('details', { class: 'fw-idea-adv' }, h('summary', { text: 'Atalho avançado' }),
    h('p', { class: 'fw-hint', text: 'Pular a conversa e gerar direto a partir do que já está aqui.' }), skip), status);
  return box;
}

// Avança para a etapa 2 de forma IDÊNTICA à aba do passo 2 e ao chat: se os requisitos já existem,
// apenas navega (fwGoto — a MESMA função que a aba chama); se ainda não, gera (fwHandoffToWhat).
function fwAdvanceToWhat(w, statusEl, btn) {
  if (w.proposed && w.proposed.length) fwGoto(2);
  else fwHandoffToWhat(w, statusEl, btn);
}

// Handoff para a etapa 2: compõe o brief a partir do ideaDraft (sem mudar o contrato da etapa 2)
// e dispara fwGenerate (propose-requirements). O aceite explícito é o clique do botão.
function fwHandoffToWhat(w, statusEl, btn) {
  w.name = (w.idea.name || w.name || '').trim();
  if (!w.name) w.name = (w.idea.summary || w.idea.problem || 'meu-sistema').slice(0, 40);
  w.brief = composeBriefFromIdea(w.idea);
  fwGenerate(w, statusEl, btn);
}

// FALLBACK MANUAL (IA fora): o antigo formulário estático (nome + descrição + anexos + gerar).
function fwStageIdeaManual(host, w, { blueprints }, note) {
  const card = h('div', { class: 'fw-card' });
  card.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'idea.q') }));
  if (note) card.append(h('p', { class: 'fw-status muted', text: note }));
  const name = h('input', { class: 'fw-input', type: 'text', value: w.name || w.idea.name || '', placeholder: modeCopy(w.mode, 'idea.namePh'), 'aria-label': 'Nome do sistema' });
  name.addEventListener('input', () => { w.name = name.value; });
  card.append(h('label', { class: 'fw-fld' }, h('span', { class: 'fw-fld-l', text: modeCopy(w.mode, 'idea.name') }), name));
  const brief = h('textarea', { class: 'fw-textarea', rows: '6', 'aria-label': 'Descrição', placeholder: 'Descreva como falaria com uma pessoa: o que o sistema faz, para quem, e o que é importante.' });
  brief.value = w.brief || composeBriefFromIdea(w.idea);
  brief.addEventListener('input', () => { w.brief = brief.value; });
  card.append(h('label', { class: 'fw-fld' }, h('span', { class: 'fw-fld-l', text: modeCopy(w.mode, 'idea.brief') }), brief));
  if (!w._filePicker) w._filePicker = filePicker({ label: 'Anexar arquivos sobre a ideia', buttonLabel: 'Anexar arquivos (opcional)' });
  card.append(h('div', { class: 'fw-fld' },
    h('span', { class: 'fw-fld-l', text: 'Anexos (opcional)' }),
    h('p', { class: 'fw-hint', text: 'Tem um documento, planilha ou imagem que descreve a ideia? Anexe — a IA vai considerar o conteúdo.' }),
    w._filePicker.el));
  if (w.mode === 'profissional') {
    const bpsel = h('select', { class: 'fw-input', 'aria-label': 'Blueprint' });
    for (const b of blueprints) bpsel.append(h('option', { value: b.id, text: b.name, selected: b.id === w.blueprint }));
    bpsel.addEventListener('change', () => { w.blueprint = bpsel.value; });
    const tok = h('input', { class: 'fw-input', type: 'password', value: AI.getToken(), placeholder: 'Bearer token (operador)' });
    tok.addEventListener('change', () => AI.setToken(tok.value.trim()));
    card.append(h('label', { class: 'fw-fld' }, h('span', { class: 'fw-fld-l', text: 'Blueprint (stack base)' }), bpsel), h('details', { class: 'fw-adv' }, h('summary', { text: 'Token do operador' }), tok));
  }
  const gen = h('button', { class: 'btn primary fw-cta', type: 'button', text: modeCopy(w.mode, 'idea.generate') });
  const status = h('p', { class: 'fw-status muted' });
  if (w.error) status.replaceChildren(h('span', { class: 'fw-err', text: w.error }));
  gen.addEventListener('click', () => fwGenerate(w, status, gen));
  card.append(h('div', { class: 'fw-actions' }, gen), status);
  host.append(card);
  card.querySelector('.fw-q').focus();
}

async function fwGenerate(w, status, btn) {
  const slug = (w.name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  // Validação ANTES de transicionar (fica na etapa atual): sem nome/brief não avança.
  if (!slug) { w.error = 'Dê um nome ao sistema.'; if (status) status.replaceChildren(h('span', { class: 'fw-err', text: w.error })); return; }
  if ((w.brief || '').trim().length < 10) { w.error = 'Descreva um pouco mais a sua ideia (uma ou duas frases).'; if (status) status.replaceChildren(h('span', { class: 'fw-err', text: w.error })); return; }
  w.slug = slug; w.error = '';
  // TRANSIÇÃO INSTANTÂNEA para a etapa 2: propose-requirements leva ~20s; NÃO travamos a etapa Ideia
  // com um spinner (parecia "não avança"). Vamos JÁ para a etapa 2 mostrando o estado "gerando", e a
  // resposta da IA preenche/erra ali. (BUG: o clique no botão/aba parecia não fazer nada por 20s.)
  w.generating = true; w.stage = 2; fwRerender();
  const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
  const blueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
  // Se o usuário anexou arquivos, envia multipart (a IA lê o conteúdo); senão, mantém o JSON de sempre.
  // (E2) origem = captura: o export do contrato (sem samples) entra como anexo — contexto da IA.
  const files = (w._filePicker && w._filePicker.hasFiles()) ? w._filePicker.files() : [];
  const capFile = fwCaptureFile(w);
  if (capFile) files.push(capFile);
  // (C2) tone: no modo simples a IA escreve title/statement em linguagem de negócio clara —
  // MESMO schema de saída/validação; nos demais modos, o prompt técnico de sempre (retrocompat).
  const reqFields = { product: slug, blueprint: w.blueprint, brief: w.brief.trim(), capabilities: catalog, blueprints, tone: w.mode === 'simples' ? 'simples' : 'tecnico' };
  try {
    const r = files.length
      ? await AI.postMultipart('/v1/forge/propose-requirements', { fields: reqFields, files })
      : await AI.post('/v1/forge/propose-requirements', reqFields);
    if (!r.ok) throw new Error((r.data && r.data.error && r.data.error.message) || ('IA ' + r.status));
    const reqs = (r.data && r.data.requirements) || [];
    if (!reqs.length) throw new Error('A IA não retornou requisitos. Tente descrever de outra forma.');
    fwApplyProposed(w, r.data);
    w.generating = false; w.error = '';
    if (state.forge.wizard === w) fwRerender(); // mostra a tela 2 já com os requisitos
    fwKickArch(w);                              // arquitetura (waves) em SEGUNDO PLANO
  } catch (e) {
    w.generating = false; w.error = String(e.message || e);
    if (state.forge.wizard === w) fwRerender(); // a etapa 2 renderiza o erro + "Tentar de novo"
  }
}

// Aplica a resposta da IA (requisitos propostos) ao estado do wizard (IDs estáveis vs baseline).
function fwApplyProposed(w, data) {
  const reqs = (data && data.requirements) || [];
  const existing = ((DATA.baseline && DATA.baseline.requirements) || []).map((x) => x.id);
  w.proposed = [];
  for (const req of reqs) { const id = req.id || nextReqId(w.slug, existing.concat(w.proposed.map((p) => p.id))); w.proposed.push({ id, req }); }
  w.reqMeta = data;
  // Mudaram os requisitos → o preview anterior está obsoleto: zera (exige re-gerar e re-aprovar
  // antes de construir). Mantém o gate honesto: não dá p/ aprovar telas que não existem mais.
  w.preview = fwInitPreview();
}

// Dispara a proposta de arquitetura (ordem das waves) em segundo plano.
function fwKickArch(w) {
  const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
  const blueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
  w.arch = null; w.archLoading = true;
  AI.post('/v1/forge/propose-architecture', { product: w.slug, blueprint: w.blueprint, requirements: w.proposed.map((p) => ({ id: p.id, title: p.req.title, type: p.req.type, statement: p.req.statement, capability_blocks: p.req.capability_blocks || [] })), capabilities: catalog, blueprints })
    .then((a) => { w.arch = (a && a.ok) ? a.data : null; })
    .catch(() => { w.arch = null; })
    .finally(() => { w.archLoading = false; if (state.forge.wizard === w && w.stage >= 3) fwRerender(); });
}

// Ajuste por IA (stages 2 e 3): re-propõe capacidades/requisitos a partir do brief + a instrução do
// usuário + os requisitos ATUAIS (refinamento iterativo), depois recalcula o plano. Atualiza a tela.
async function fwAdjust(w, instruction, statusEl) {
  const instr = (instruction || '').trim();
  if (!instr) { statusEl.replaceChildren(h('span', { class: 'fw-err', text: 'Escreva o que quer ajustar.' })); return; }
  statusEl.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Ajustando com a IA…');
  const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
  const blueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
  const current = (w.proposed || []).map((p) => '- ' + (p.req.title || '') + ': ' + (p.req.statement || '')).join('\n');
  const augmented = (w.brief || '') + '\n\n--- AJUSTE PEDIDO PELO USUÁRIO ---\n' + instr
    + '\n\nRequisitos atuais (revise conforme o ajuste — mantenha os que ainda fazem sentido; edite/adicione/remova o que o ajuste pedir):\n' + current;
  try {
    const adjFields = { product: w.slug, blueprint: w.blueprint, brief: augmented, capabilities: catalog, blueprints, tone: w.mode === 'simples' ? 'simples' : 'tecnico' };
    // (E2) mantém o contrato capturado como contexto TAMBÉM no ajuste (senão o refinamento
    // re-propõe sem conhecer o portal original). Sem captura: caminho JSON de sempre.
    const adjCapFile = fwCaptureFile(w);
    const r = adjCapFile
      ? await AI.postMultipart('/v1/forge/propose-requirements', { fields: adjFields, files: [adjCapFile] })
      : await AI.post('/v1/forge/propose-requirements', adjFields);
    if (!r.ok) throw new Error((r.data && r.data.error && r.data.error.message) || ('IA ' + r.status));
    const reqs = (r.data && r.data.requirements) || [];
    if (!reqs.length) throw new Error('A IA não retornou requisitos.');
    fwApplyProposed(w, r.data);
    fwKickArch(w);
    fwRerender();
  } catch (e) { statusEl.replaceChildren(h('span', { class: 'fw-err', text: 'Não consegui ajustar: ' + String(e.message || e) })); }
}

// Caixa "Ajustar com a IA" reutilizada nos stages 2 e 3.
function fwAdjustBox(w) {
  const adjStatus = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
  const adjInput = h('input', { class: 'fw-input', type: 'text', placeholder: 'Ex.: adicione exportação para Excel; remova o cadastro de fornecedores', 'aria-label': 'Ajustar com a IA' });
  const adjBtn = h('button', { class: 'btn', type: 'button', text: '✨ Ajustar com a IA' });
  const doAdj = () => fwAdjust(w, adjInput.value, adjStatus);
  adjBtn.addEventListener('click', doAdj);
  adjInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdj(); } });
  return h('div', { class: 'fw-adjust' },
    h('h4', { class: 'fw-sec', text: 'Ajustar com a IA' }),
    h('p', { class: 'fw-hint', text: 'Quer mudar algo? Descreva em linguagem natural — a IA refaz as capacidades, os requisitos e o plano.' }),
    h('div', { class: 'fw-adjust-row' }, adjInput, adjBtn), adjStatus);
}

/* ─── (C2) cartões de requisito por MODO — projeções PURAS (projectRequirementCard) ───
   Os DADOS por baixo são os mesmos nos 3 modos; muda só o disclosure:
   - simples: linguagem natural, sem YAML/ids; ✔ aceitar / ✎ ajustar (o ajuste edita o
     statement por baixo — o texto do usuário VAI ao artefato).
   - guiado: title + statement + aceite resumido + "ver detalhe técnico" (revela tipo/blocos/YAML).
   - profissional: tudo aberto (id, todos os critérios, tipo, blocos). */
function fwReqCard(w, p, i) {
  const card = projectRequirementCard(p, w.mode);
  const tx = h('div', { class: 'fw-screen-tx' }, h('strong', { text: card.title || ('Função ' + (i + 1)) }));
  for (const line of card.lines) tx.append(h('p', { class: 'fw-screen-d', text: line }));
  const el = h('div', { class: 'fw-screen' + (w.mode === 'simples' && p.accepted ? ' is-accepted' : '') },
    w.mode === 'simples'
      ? h('span', { class: 'fw-screen-n', 'aria-hidden': 'true', text: p.accepted ? '✔' : String(i + 1) })
      : h('span', { class: 'fw-screen-n', 'aria-hidden': 'true', text: String(i + 1) }),
    tx);
  if (w.mode === 'simples') {
    // ✔ aceitar (marca de revisão) + ✎ ajustar (texto simples → statement por baixo)
    const ok = h('button', { class: 'btn fw-accept', type: 'button', 'aria-pressed': p.accepted ? 'true' : 'false', 'aria-label': (p.accepted ? 'Aceito: ' : 'Aceitar: ') + card.title, text: p.accepted ? '✔ Aceito' : '✔ Aceitar' });
    ok.addEventListener('click', () => { p.accepted = !p.accepted; fwRerender(); });
    const adj = h('button', { class: 'btn-link', type: 'button', text: '✎ Ajustar', 'aria-expanded': 'false' });
    const ta = h('textarea', { class: 'fw-textarea', rows: '3', hidden: 'hidden', 'aria-label': 'Ajustar com suas palavras: ' + card.title });
    const save = h('button', { class: 'btn primary', type: 'button', text: 'Salvar ajuste', hidden: 'hidden' });
    adj.addEventListener('click', () => {
      const open = ta.hidden;
      if (open) ta.value = card.lines[0] || '';
      ta.hidden = !open; save.hidden = !open;
      adj.setAttribute('aria-expanded', String(open));
      if (open) ta.focus();
    });
    save.addEventListener('click', () => {
      const t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      // a edição em linguagem simples vira o STATEMENT do requisito (o dado por baixo);
      // requisito mudou → preview obsoleto (re-gerar e re-aprovar antes de construir).
      p.req.statement = t;
      p.accepted = false;
      w.preview = fwInitPreview();
      fwRerender();
    });
    tx.append(h('div', { class: 'fw-actions fw-card-actions' }, ok, adj), ta, save);
    return el;
  }
  const tech = card.tech || {};
  const techPanel = () => {
    const dl = h('dl', { class: 'forge-bp-stack fw-reveal-dl' });
    dl.append(dt('Enunciado'), dd(card.source.statement || '—'));
    dl.append(dt('Tipo'), dd(badge(tech.typeLabel || 'Funcional', 'b-fn')));
    dl.append(dt('Prioridade'), dd(tech.priority || 'medium'));
    dl.append(dt('Blocos'), dd(tech.blocks && tech.blocks.length
      ? h('span', {}, ...tech.blocks.map((b) => h('code', { class: 'fw-cap-id', text: b })))
      : h('span', { class: 'muted', text: '—' })));
    if (tech.acceptance && tech.acceptance.length) {
      const ul = h('ul', { class: 'fw-reveal-ac' });
      for (const c of tech.acceptance) ul.append(h('li', { text: c }));
      dl.append(dt('Aceite'), dd(ul));
    }
    const panel = h('div', { class: 'fw-reveal' }, dl);
    panel.append(codeBlock(toYaml(forgeReqObject(p.id, w.slug, w.blueprint, p.req)), 'yaml', 'YAML de ' + p.id));
    return panel;
  };
  if (w.mode === 'profissional') {
    // tudo aberto: id + tipo + blocos inline (a experiência completa)
    tx.prepend(h('span', { class: 'rid fw-screen-rid', text: p.id }));
    tx.append(h('div', { class: 'fw-screen-meta' }, badge(tech.typeLabel || 'Funcional', 'b-fn'),
      ...(tech.blocks || []).map((b) => h('code', { class: 'fw-cap-id', text: b }))));
    return el;
  }
  // guiado: disclosure progressivo por cartão (revela enunciado/tipo/blocos/YAML)
  const panel = techPanel();
  panel.hidden = true;
  const btn = h('button', { class: 'btn-link fw-reveal-btn', type: 'button', text: 'ver detalhe técnico', 'aria-expanded': 'false' });
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'ocultar detalhe técnico' : 'ver detalhe técnico';
  });
  tx.append(h('div', { class: 'fw-actions fw-card-actions' }, btn), panel);
  return el;
}

function fwStageWhat(host, w, { catalog }) {
  const hasProposed = w.proposed && w.proposed.length;
  // Estado GERANDO (a IA leva ~20s p/ propor os requisitos) — mostra loading aqui, na etapa 2, em vez
  // de travar a etapa Ideia. Deixa voltar p/ a Ideia enquanto gera.
  if (!hasProposed && w.generating) {
    host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'what.q') }));
    host.append(h('div', { class: 'fw-generating' },
      h('span', { class: 'forge-spin', 'aria-hidden': 'true' }),
      h('p', { class: 'fw-lead', text: 'A IA está desenhando o ' + (w.name || w.slug) + ' — capacidades, telas e requisitos. Isso leva alguns segundos…' })));
    host.append(fwNav(1, null, null));
    host.querySelector('.fw-q').focus();
    return;
  }
  // Erro na geração — mensagem amigável + "Tentar de novo" (não fica preso).
  if (!hasProposed && w.error) {
    host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'what.q') }));
    host.append(h('p', { class: 'fw-status' }, h('span', { class: 'fw-err', text: 'Não consegui gerar: ' + w.error })));
    const retry = h('button', { class: 'btn primary fw-cta', type: 'button', text: '↻ Tentar de novo' });
    retry.addEventListener('click', () => fwGenerate(w));
    host.append(h('div', { class: 'fw-actions' }, retry), fwNav(1, null, null));
    host.querySelector('.fw-q').focus();
    return;
  }
  if (!hasProposed) { // sem proposta e sem gerar (ex.: voltou aqui direto) — volta p/ a Ideia
    host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'what.q') }),
      h('p', { class: 'fw-lead', text: 'Ainda não há nada gerado. Volte para a Ideia e siga a partir de lá.' }), fwNav(1, null, null));
    host.querySelector('.fw-q').focus();
    return;
  }
  const sum = planSummary(w.proposed.map((p) => p.req), w.arch, catalog);
  const dn = w.name || w.slug;
  host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'what.q') }),
    w.mode === 'simples'
      ? h('p', { class: 'fw-lead' }, 'Entendi! O ', h('strong', { text: dn }), ' vai ficar assim — revise cada cartão: aceite o que estiver certo ou ajuste com suas palavras.')
      : h('p', { class: 'fw-lead' }, 'Entendi! Vou criar o ', h('strong', { text: dn }), ' — um sistema com ', h('strong', { text: String(sum.counts.capabilities) }), ' capacidades e ', h('strong', { text: String(sum.counts.screens) }), ' telas/funções.'));
  const caps = h('div', { class: 'fw-caps' });
  for (const c of sum.capabilities) caps.append(h('div', { class: 'fw-cap' }, h('span', { class: 'fw-cap-ic', 'aria-hidden': 'true', text: c.icon }), h('div', { class: 'fw-cap-tx' }, h('strong', { class: 'fw-cap-t', text: c.title }), h('p', { class: 'fw-cap-d', text: c.desc }), w.mode === 'profissional' ? h('code', { class: 'fw-cap-id', text: c.id }) : null)));
  host.append(h('h4', { class: 'fw-sec', text: 'O que o sistema saberá fazer' }), caps);
  const screens = h('div', { class: 'fw-screens' });
  w.proposed.forEach((p, i) => screens.append(fwReqCard(w, p, i)));
  host.append(h('h4', { class: 'fw-sec', text: modeCopy(w.mode, 'what.screens') }), screens);
  const hint = modeCopy(w.mode, 'what.hint');
  if (hint) host.append(h('p', { class: 'fw-hint', text: hint }));
  host.append(fwAdjustBox(w)); // IA: ajustar capacidades/requisitos por instrução
  host.append(fwNav(1, 3, 'Ver o plano de construção'));
  host.querySelector('.fw-q').focus();
}

function fwStagePlan(host, w) {
  host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'plan.q') }));
  if (!w.arch && w.archLoading) { host.append(h('p', { class: 'fw-lead' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Calculando a ordem de construção…')); host.append(fwNav(2, null, null)); host.querySelector('.fw-q').focus(); return; }
  const waves = (w.arch && Array.isArray(w.arch.waves) && w.arch.waves.length) ? w.arch.waves : null;
  const titleOf = (woId) => { const p = w.proposed.find((x) => x.id === woId || x.req.title === woId); return p ? (p.req.title || p.id) : woId; };
  if (w.mode !== 'profissional') {
    host.append(h('p', { class: 'fw-lead', text: waves ? `Será construído em ${waves.length} etapas, na ordem certa (uma parte depende da outra):` : 'Será construído na ordem abaixo:' }));
    const tl = h('ol', { class: 'fw-timeline' });
    if (waves) {
      waves.forEach((wv, i) => tl.append(h('li', { class: 'fw-tl-item' }, h('span', { class: 'fw-tl-n', text: 'Etapa ' + (i + 1) }), h('div', { class: 'fw-tl-tx' }, ...(wv.work_orders || []).map((wo) => h('p', { class: 'fw-tl-t', text: '• ' + titleOf(wo) }))))));
    } else {
      // Sem waves (arquitetura ainda não veio ou sem dependências): mostra os requisitos como as partes,
      // para o Guiado NUNCA ficar vazio.
      (w.proposed || []).forEach((p, i) => tl.append(h('li', { class: 'fw-tl-item' }, h('span', { class: 'fw-tl-n', text: 'Parte ' + (i + 1) }), h('div', { class: 'fw-tl-tx' }, h('p', { class: 'fw-tl-t', text: '• ' + (p.req.title || p.id) })))));
    }
    host.append(tl);
  } else {
    if (w.arch && w.arch.stack) host.append(h('p', { class: 'fw-lead' }, 'Stack escolhida: ', badge(w.arch.stack, 'b-fn'), w.arch.blueprint ? h('code', { class: 'fw-cap-id', text: w.arch.blueprint }) : null));
    // Nós EXTERNOS da plataforma, derivados da CATEGORIA dos blocos (declarativa, sem heurística):
    // um requisito que usa um bloco categoria 'ai'/'auth'/'observability'/'integration' liga ao
    // componente compartilhado correspondente (Plataforma de IA, Keycloak, Observabilidade…).
    const catalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
    const catOf = {}; for (const c of catalog) catOf[c.id] = c.category;
    const PLAT = {
      ai: { id: 'ext:ai', title: 'Plataforma de IA (compartilhada)', label: 'IA' },
      auth: { id: 'ext:auth', title: 'Keycloak — SSO/OIDC', label: 'SSO' },
      observability: { id: 'ext:obs', title: 'Observabilidade (Prometheus/Grafana)', label: 'Métricas' },
      integration: { id: 'ext:integ', title: 'Integrações externas', label: 'Integrações' },
    };
    const platOf = (id) => Object.values(PLAT).find((p) => p.id === id) || { title: id };
    const extNodes = []; const extEdges = []; const seen = new Set();
    for (const p of (w.proposed || [])) {
      const linked = new Set();
      for (const b of (p.req.capability_blocks || [])) { const plat = PLAT[catOf[b]]; if (plat) linked.add(plat.id); }
      for (const pid of linked) {
        if (!seen.has(pid)) { seen.add(pid); const pl = platOf(pid); extNodes.push({ id: pid, title: pl.title, label: pl.label, external: true }); }
        extEdges.push({ from: p.id, to: pid });
      }
    }
    const nodes = w.proposed.map((p) => ({ id: p.id, title: p.req.title || '' }));
    const g = interactiveGraph({ tall: true, label: 'Mapa de dependências e integrações', nodeClass: (n) => n.external ? 'ext' : 'wv-' + ((n.wave || 0) % 6), detailOf: (n, id) => { if (String(id).startsWith('ext:')) return { title: platOf(id).title, sub: 'Componente externo da plataforma (compartilhado entre apps)' }; const p = w.proposed.find((x) => x.id === id); return p ? { title: p.req.title || id, sub: p.req.statement ? truncateLabel(p.req.statement, 140) : '' } : { title: id }; } });
    host.append(g.el); const dag = dagFromWaves(nodes, waves || []); g.setData(dag.nodes.concat(extNodes), dag.edges.concat(extEdges));
    if (extNodes.length) host.append(h('p', { class: 'fw-hint', text: 'Nós tracejados = componentes externos da plataforma (IA, login, observabilidade) que o sistema vai reusar — não são código novo.' }));
    const adrs = (w.arch && Array.isArray(w.arch.adrs)) ? w.arch.adrs : [];
    if (adrs.length) { const ul = h('ul', { class: 'linklist' }); for (const a of adrs) ul.append(h('li', {}, h('span', { class: 'lt', text: 'ADR' }), typeof a === 'string' ? a : (a.title || a.decision || ''))); host.append(h('h4', { class: 'fw-sec', text: 'Decisões de arquitetura' }), ul); }
  }
  if (!w.archLoading) host.append(fwAdjustBox(w)); // IA: ajustar requisitos/plano por instrução
  host.append(fwNav(2, 4, 'Ver o preview das telas'));
  host.querySelector('.fw-q').focus();
}

/* ─── Etapa PREVIEW: telas ui-vue REAIS + dados fake, iteração por IA, gate de aprovação ───────
 * Mostra um <iframe> com o preview do produto (SPA Vue autocontida construída pela esteira), a
 * lista das telas propostas e, por tela, um botão "Refinar com IA" (campo de feedback → endpoint
 * de refino, que re-propõe a tela e regenera o preview). Um gate "Aprovar e construir" persiste
 * w.preview.approved=true — só então o launch (etapa Revisar) é liberado. Tudo via h() (CSP). */
function fwStagePreview(host, w) {
  if (!w.preview) w.preview = fwInitPreview();
  const pv = w.preview;
  // Se um render anterior ficou em 'building' (ex.: navegou para fora e voltou), o stream que o
  // alimentava já se foi — destrava para o usuário poder gerar de novo (sem ficar preso no spinner).
  if (pv.status === 'building') { pv.status = pv.url ? 'ready' : 'idle'; }
  host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: 'Preview das telas' }));
  host.append(h('p', { class: 'fw-lead' }, 'Antes de construir, veja as telas do ', h('strong', { text: w.name || w.slug }),
    ' com componentes reais e dados de exemplo. Refine o que quiser — quando estiver bom, aprove para a esteira construir.'));

  const status = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
  const stepsBox = h('ol', { class: 'fw-prev-steps' }); // sem aria-live: renderSteps refaz a lista toda a cada evento SSE (o pontual é o status acima)
  const stage = h('div', { class: 'fw-prev-stage' }); // iframe + lista de telas (preenche ao ficar pronto)

  const renderSteps = () => {
    stepsBox.replaceChildren();
    for (const s of (pv.steps || [])) {
      stepsBox.append(h('li', { class: 'fw-prev-step is-' + (s.state || 'todo') },
        h('span', { class: 'fw-prev-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'fw-prev-tx', text: s.label })));
    }
  };

  // Botão principal: gera/regenera o preview (SSE de progresso). Desabilita enquanto constrói.
  const genLabel = () => pv.url ? '↻ Regenerar preview' : '✨ Gerar preview das telas';
  const genBtn = h('button', { class: 'btn primary fw-cta', type: 'button', text: genLabel() });
  genBtn.addEventListener('click', () => fwPreviewGenerate(w, { status, stepsBox, stage, genBtn, renderSteps }));

  if (pv.error) status.replaceChildren(h('span', { class: 'fw-err', text: pv.error }));
  renderSteps();

  host.append(h('div', { class: 'fw-actions' }, genBtn), status, stepsBox, stage);

  // Já existe um preview pronto? Renderiza iframe + telas + gate (sobrevive às re-renderizações).
  if (pv.status === 'ready' && pv.url) fwPreviewRenderReady(w, stage);

  host.querySelector('.fw-q').focus();
}

// Rótulos pt-BR das etapas do build do preview (eventos SSE do reqhub-api).
const FW_PREV_STEP_LABELS = {
  start: 'Preparando a geração…', propose: 'A IA está desenhando as telas…',
  inventory: 'Telas e dados definidos', dispatch: 'Construção disparada no runner',
  building: 'Construindo a SPA (vite build)…', ready: 'Preview pronto',
};

// Dispara a geração/regeneração do preview via SSE e renderiza o resultado quando pronto.
// Contrato do reqhub-api (POST /v1/forge/preview/generate): SSE com eventos start/propose/inventory/
// dispatch/building/ready/done|error. `ready` traz { url, screens, jobId }; `done` é só {ok:true}.
// Para REGERAR após um refino, enviamos { inventory } (a IA não re-propõe; só reconstrói a SPA).
async function fwPreviewGenerate(w, els) {
  const pv = w.preview;
  pv.status = 'building'; pv.error = ''; pv.steps = []; pv.approved = false; // regenerar invalida a aprovação
  els.genBtn.disabled = true;
  els.stage.replaceChildren();
  els.status.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Construindo o preview das telas…');
  const upStep = (key, label, state) => {
    const cur = pv.steps.find((s) => s.key === key);
    if (cur) { cur.state = state; if (label) cur.label = label; }
    else pv.steps.push({ key, label: label || FW_PREV_STEP_LABELS[key] || key, state });
    els.renderSteps();
  };
  // payload: na 1ª geração, manda requisitos + arquitetura (a IA propõe as telas); ao regerar com um
  // inventory já refinado, manda { inventory } (reconstrói sem re-propor).
  const body = pv.inventory && typeof pv.inventory === 'object'
    ? { product: w.slug, inventory: pv.inventory }
    : {
        product: w.slug, displayName: w.name || w.slug, blueprint: w.blueprint, brief: w.brief || '',
        requirements: (w.proposed || []).map((p) => ({ id: p.id, title: p.req.title, type: p.req.type, statement: p.req.statement, capability_blocks: p.req.capability_blocks || [], acceptance_criteria: p.req.acceptance_criteria || [] })),
        architecture: w.arch ? { stack: w.arch.stack, selected_blocks: w.arch.selected_blocks || [], waves: w.arch.waves || [] } : null,
      };
  // GUARD (raiz): propor telas exige requisitos. Sem eles (e sem inventory pronto), NÃO dispara — evita o
  // erro no servidor e orienta o usuário de volta ao passo 2 (defesa-em-profundidade além do fwMaxStage).
  if (!body.inventory && (!Array.isArray(body.requirements) || body.requirements.length === 0)) {
    pv.status = 'error'; pv.error = previewErrorMessage('NO_REQUIREMENTS');
    els.genBtn.disabled = false; els.genBtn.textContent = '✨ Gerar preview das telas';
    els.status.replaceChildren(h('span', { class: 'fw-err', text: pv.error }));
    return;
  }
  // marca as etapas anteriores como concluídas conforme o build avança (visual de progresso).
  const ORDER = ['start', 'propose', 'inventory', 'dispatch', 'building', 'ready'];
  const advance = (key) => { const i = ORDER.indexOf(key); for (let j = 0; j < i; j++) upStep(ORDER[j], null, 'done'); upStep(key, null, 'active'); };
  try {
    await AI.stream2('/v1/forge/preview/generate', body, {
      onEvent: (event, data) => {
        if (event === 'start') advance('start');
        else if (event === 'propose') advance('propose');
        else if (event === 'inventory') { advance('inventory'); pv.inventory = data; if (Array.isArray(data.screens)) pv.screens = data.screens; }
        else if (event === 'dispatch') advance('dispatch');
        else if (event === 'building') advance('building');
        else if (event === 'ready') {
          advance('ready'); upStep('ready', null, 'done');
          pv.url = sameOriginUrl((data && data.url) || '') || pv.url || '';
          if (Array.isArray(data && data.screens)) pv.screens = data.screens;
        }
      },
    });
    if (!pv.url) throw new Error('O preview não retornou um endereço para exibir.');
    pv.status = 'ready';
    for (const s of pv.steps) s.state = 'done'; els.renderSteps();
    els.status.replaceChildren(document.createTextNode('Preview pronto — revise cada tela abaixo.'));
    els.genBtn.disabled = false; els.genBtn.textContent = '↻ Regenerar preview';
    fwPreviewRenderReady(w, els.stage);
  } catch (e) {
    // Mensagem AMIGÁVEL por código (nunca o texto cru do backend/GitHub). Erros com código vêm do
    // servidor (já sanitizados) -> mapeia; sem código = throw interno nosso (ex.: "sem endereço") -> seguro.
    pv.status = 'error';
    pv.error = (e && e.code) ? previewErrorMessage(e.code) : ((e && e.message) || previewErrorMessage());
    const act = pv.steps.find((s) => s.state === 'active'); if (act) act.state = 'error'; els.renderSteps(); // não deixa a etapa presa em amarelo
    els.status.replaceChildren(h('span', { class: 'fw-err', text: pv.error }));
    els.genBtn.disabled = false; els.genBtn.textContent = '↻ Tentar de novo';
  }
}

// Renderiza o iframe + lista de telas (com refino por tela) + gate "Aprovar e construir".
function fwPreviewRenderReady(w, stage) {
  const pv = w.preview;
  stage.replaceChildren();
  if (!pv.url) return;
  // 1) iframe do preview (mesma origem /reqs — CSP default-src 'self' cobre frame-src; o backend
  // serve a SPA em /reqs/api/v1/forge/preview/<product>/, então a URL é same-origin).
  const frameWrap = h('div', { class: 'fw-prev-frame' });
  // sandbox COM allow-same-origin: a SPA gerada (Vite/Vue) PRECISA de same-origin para dar boot
  // (history API, storage, origem própria) e para carregar os assets `crossorigin` (JS/CSS) — sem isso
  // o iframe roda em origem OPACA e a SPA nem inicializa (preview em branco / sem estilo). O conteúdo é
  // FIRST-PARTY confiável (gerado pelo nosso template, servido pelo nosso backend no MESMO domínio
  // /reqs), então é seguro compartilhar a origem; mantemos o sandbox (defesa em profundidade) só sem o
  // allow-same-origin era o bug. allow-forms/allow-popups deixam a navegação ilustrativa funcionar.
  frameWrap.append(h('iframe', { src: pv.url, title: 'Preview de ' + (w.name || w.slug), loading: 'lazy', class: 'fw-prev-iframe', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' }));
  // C4 — toggle de viewport (desktop/tablet/mobile): troca a classe do frameWrap SEM recarregar o iframe.
  // A escolha persiste em pv.viewport (sobrevive às re-renderizações). Puro CSS (larguras 100%/768/375).
  const viewport = (pv.viewport === 'tablet' || pv.viewport === 'mobile') ? pv.viewport : 'desktop';
  frameWrap.className = 'fw-prev-frame is-' + viewport;
  const vpBtns = {};
  const setVp = (v) => { pv.viewport = v; frameWrap.className = 'fw-prev-frame is-' + v; for (const k in vpBtns) { vpBtns[k].classList.toggle('is-on', k === v); vpBtns[k].setAttribute('aria-pressed', k === v ? 'true' : 'false'); } };
  const mkVp = (v, label, title) => { const b = h('button', { class: 'fw-vp' + (v === viewport ? ' is-on' : ''), type: 'button', title, 'aria-pressed': v === viewport ? 'true' : 'false', text: label, onclick: () => setVp(v) }); vpBtns[v] = b; return b; };
  const vpBar = h('div', { class: 'fw-prev-vp', role: 'group', 'aria-label': 'Tamanho da tela do preview' },
    mkVp('desktop', '🖥️ Desktop', 'Ver em tela cheia (desktop)'),
    mkVp('tablet', '▭ Tablet', 'Ver em largura de tablet (768px)'),
    mkVp('mobile', '📱 Mobile', 'Ver em largura de celular (375px)'));
  stage.append(h('div', { class: 'fw-prev-toolbar' },
    h('span', { class: 'muted small', text: 'Preview com dados de exemplo — nada é salvo.' }),
    vpBar,
    h('a', { class: 'btn-link', href: pv.url, target: '_blank', rel: 'noopener', text: 'Abrir em nova aba ↗' })), frameWrap);

  // 2) lista das telas + refino por tela (se o backend reportou as telas).
  const screens = Array.isArray(pv.screens) ? pv.screens : [];
  if (screens.length) {
    stage.append(h('h4', { class: 'fw-sec', text: 'Telas do preview — refine o que quiser' }));
    const list = h('div', { class: 'fw-prev-screens' });
    for (const sc of screens) list.append(fwPreviewScreenCard(w, sc));
    stage.append(list);
  } else {
    stage.append(h('p', { class: 'fw-hint', text: 'O preview está no iframe acima. Para refinar uma tela específica, regenere após ajustar os requisitos na etapa anterior.' }));
  }

  // 3) gate "Aprovar e construir".
  stage.append(fwPreviewGate(w));
}

// Card de uma tela do preview: título + botão "Refinar com IA" que abre um campo de feedback.
function fwPreviewScreenCard(w, sc) {
  const slug = sc.slug || sc.route || sc.title || '';
  const card = h('div', { class: 'fw-prev-screen' });
  const head = h('div', { class: 'fw-prev-screen-head' },
    h('div', { class: 'fw-prev-screen-tx' },
      h('strong', { text: sc.title || slug || 'Tela' }),
      sc.kind ? h('span', { class: 'fw-cap-id', text: sc.kind }) : null,
      sc.route ? h('code', { class: 'fw-prev-route', text: sc.route }) : null));
  const refineBtn = h('button', { class: 'btn', type: 'button', text: '✨ Refinar com IA', 'aria-expanded': 'false' });
  head.append(refineBtn);
  const panel = h('div', { class: 'fw-prev-refine', hidden: 'hidden' });
  const fb = h('textarea', { class: 'fw-textarea', rows: '3', 'aria-label': 'Como melhorar esta tela', placeholder: 'Ex.: mostre um gráfico de evolução no topo; adicione filtro por período; destaque os itens vencidos.' });
  const st = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
  const send = h('button', { class: 'btn primary', type: 'button', text: 'Aplicar refino' });
  send.addEventListener('click', () => fwPreviewRefine(w, slug, fb.value, { st, send }));
  fb.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send.click(); } });
  panel.append(h('label', { class: 'fw-fld' }, h('span', { class: 'fw-fld-l', text: 'O que melhorar nesta tela?' }), fb), h('div', { class: 'fw-actions' }, send), st);
  refineBtn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open; refineBtn.setAttribute('aria-expanded', String(open));
    if (open) fb.focus();
  });
  card.append(head, panel);
  return card;
}

// Refina UMA tela: chama POST /v1/forge/preview/refine — a IA re-propõe a tela a partir do feedback
// e devolve { screen, inventory } (o inventário com a tela trocada). Guardamos o inventory atualizado
// e regeramos o preview com ele (sem re-propor tudo). Em sucesso, exige re-aprovação.
async function fwPreviewRefine(w, screenSlug, feedback, els) {
  const fb = (feedback || '').trim();
  if (!fb) { els.st.replaceChildren(h('span', { class: 'fw-err', text: 'Escreva o que melhorar nesta tela.' })); return; }
  els.send.disabled = true;
  els.st.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), ' Refinando a tela com a IA…');
  try {
    const r = await AI.post('/v1/forge/preview/refine', {
      product: w.slug, screenSlug, feedback: fb,
      inventory: w.preview.inventory || undefined, // p/ o backend mesclar a tela revisada e devolver o inventário
      requirements: (w.proposed || []).map((p) => ({ id: p.id, title: p.req.title, statement: p.req.statement })), // grounding
    });
    if (!r.ok) { const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status; const msg = r.data && r.data.error ? r.data.error.message : ''; throw Object.assign(new Error(msg || code), { code }); }
    // refinou → o preview mudou: re-aprovação obrigatória; regenera para refletir a tela nova.
    w.preview.approved = false;
    // o backend devolve o inventário com a tela trocada — guarda p/ regerar a SPA a partir dele.
    if (r.data && r.data.inventory && typeof r.data.inventory === 'object') {
      w.preview.inventory = r.data.inventory;
      if (Array.isArray(r.data.inventory.screens)) w.preview.screens = r.data.inventory.screens;
    }
    els.st.replaceChildren(document.createTextNode('Tela refinada — regenerando o preview…'));
    // Reusa o caminho de geração (SSE) p/ reconstruir a SPA com a tela atualizada.
    fwTriggerPreviewRebuild(w);
  } catch (e) {
    els.send.disabled = false;
    els.st.replaceChildren(h('span', { class: 'fw-err', text: 'Não consegui refinar: ' + String((e && e.message) || e) }));
  }
}

// Reconstrói o preview após um refino: re-renderiza a etapa e dispara a geração apontando para os
// elementos recém-criados (o card de refino que chamou isto deixou de existir no re-render).
function fwTriggerPreviewRebuild(w) {
  fwRerender();
  const host = document.getElementById('forge-body');
  const stage = host && host.querySelector('.fw-prev-stage');
  const genBtn = host && host.querySelector('.fw-prev-stage') ? host.querySelector('.fw-actions .fw-cta') : null;
  const status = host && host.querySelector('.fw-status');
  const stepsBox = host && host.querySelector('.fw-prev-steps');
  if (!stage || !genBtn || !status || !stepsBox) return;
  const renderSteps = () => {
    stepsBox.replaceChildren();
    for (const s of (w.preview.steps || [])) stepsBox.append(h('li', { class: 'fw-prev-step is-' + (s.state || 'todo') }, h('span', { class: 'fw-prev-dot', 'aria-hidden': 'true' }), h('span', { class: 'fw-prev-tx', text: s.label })));
  };
  fwPreviewGenerate(w, { status, stepsBox, stage, genBtn, renderSteps });
}

// Gate "Aprovar e construir": persiste w.preview.approved; quando aprovado, mostra o CTA p/ a etapa
// de criar. Re-aprovar exige tocar o botão de novo (qualquer mudança no preview zera a flag).
function fwPreviewGate(w) {
  const pv = w.preview;
  const wrap = h('div', { class: 'fw-prev-gate' });
  if (pv.approved) {
    wrap.append(
      h('p', { class: 'fw-prev-ok' }, h('span', { 'aria-hidden': 'true', text: '✅ ' }), 'Preview aprovado — pode construir.'),
      h('div', { class: 'fw-actions' },
        h('button', { class: 'btn', type: 'button', text: 'Revisar a aprovação', onclick: () => { pv.approved = false; fwRerender(); } }),
        h('button', { class: 'btn primary fw-cta', type: 'button', text: 'Ir para criar →', onclick: () => fwGoto(5) })));
    return wrap;
  }
  const st = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn primary fw-cta', type: 'button', text: '✅ Aprovar e construir' });
  // aprovou → já avança p/ o passo Revisar (elimina o vaivém: não precisa clicar "Ir para criar")
  btn.addEventListener('click', () => { pv.approved = true; fwGoto(5); });
  wrap.append(
    h('h4', { class: 'fw-sec', text: 'Aprovar e construir' }),
    h('p', { class: 'fw-hint', text: 'Quando as telas estiverem como você quer, aprove. Só depois disso a esteira começa a construir o sistema de verdade.' }),
    h('div', { class: 'fw-actions' }, btn), st);
  return wrap;
}

function fwStageReview(host, w, { catalog }) {
  const sum = planSummary(w.proposed.map((p) => p.req), w.arch, catalog);
  host.append(h('h3', { class: 'fw-q', tabindex: '-1', text: modeCopy(w.mode, 'review.q') }));

  // C3 — Resumo executivo de NEGÓCIO (determinístico, sem IA): o que é / p/ quem / faz / valor. Degrada
  // com elegância se o copiloto foi pulado (usa o brief livre + as contagens do plano).
  const exec = businessSummaryFromIdea(w.idea, { brief: w.brief, name: w.name, capsCount: sum.counts.capabilities, screensCount: sum.counts.screens, wavesCount: sum.counts.waves });
  const execBox = h('div', { class: 'fw-exec' });
  execBox.append(h('h4', { class: 'fw-exec-t' }, h('span', { 'aria-hidden': 'true', text: '📋 ' }), 'Resumo do que você vai criar'));
  execBox.append(h('p', { class: 'fw-exec-lead', text: exec.lead }));
  if (exec.problem === '' && exec.description) execBox.append(h('p', { class: 'fw-exec-desc muted', text: exec.description }));
  if (exec.forWhom.length) execBox.append(h('p', { class: 'fw-exec-who' }, h('span', { class: 'fw-exec-k', text: 'Para: ' }), exec.forWhom.join(', ')));
  if (exec.capabilities.length) {
    const chips = h('div', { class: 'fw-exec-caps' });
    exec.capabilities.forEach((c) => chips.append(h('span', { class: 'fw-chip', text: c })));
    execBox.append(h('p', { class: 'fw-exec-k', text: 'O que faz:' }), chips);
  }
  if (exec.goal) execBox.append(h('p', { class: 'fw-exec-goal' }, h('span', { class: 'fw-exec-k', text: 'Objetivo: ' }), exec.goal));
  execBox.append(h('p', { class: 'fw-exec-nums muted', text: exec.counts.capabilities + ' capacidades · ' + exec.counts.screens + ' telas · ' + (exec.counts.waves || 1) + ' etapa(s) de construção' }));
  host.append(execBox);

  // C5 — Pendências: decisões em aberto do copiloto (persistem no wizard) que valem revisar antes de criar.
  const oq = (w.idea && Array.isArray(w.idea.openQuestions)) ? w.idea.openQuestions : [];
  if (oq.length) {
    const ess = oq.filter((q) => q && q.essential).length;
    const notice = h('div', { class: 'fw-pending', role: 'note' });
    notice.append(h('p', { class: 'fw-pending-t' }, h('span', { 'aria-hidden': 'true', text: '⚠️ ' }),
      oq.length + ' decisão(ões) em aberto' + (ess ? ' (' + ess + ' essencial' + (ess > 1 ? 'is' : '') + ')' : '') + ' — vale revisar antes de construir.'));
    const list = h('ul', { class: 'fw-pending-l' });
    oq.slice(0, 4).forEach((q) => list.append(h('li', { class: q && q.essential ? 'is-ess' : null, text: (q && q.text) || '' })));
    notice.append(list);
    notice.append(h('div', { class: 'fw-actions' }, h('button', { class: 'btn', type: 'button', text: '← Revisar na Ideia', onclick: () => fwGoto(1) })));
    host.append(notice);
  }

  const approved = fwPreviewApproved(w);
  // Gate: enquanto o preview não estiver aprovado, o launch fica bloqueado com um aviso claro
  // que leva de volta à etapa Preview. (Aditivo: só afeta o caminho do wizard.)
  if (!approved) {
    // Se o preview JÁ foi construído (status ready), dá p/ aprovar AQUI mesmo — sem voltar ao passo 4
    // (elimina o vaivém). Se ainda não construiu, o único caminho é "Ver o preview" (gerar/refinar lá).
    const previewReady = !!(w.preview && w.preview.status === 'ready');
    const actions = h('div', { class: 'fw-actions' },
      h('button', { class: previewReady ? 'btn' : 'btn primary', type: 'button', text: '← Ver o preview', onclick: () => fwGoto(4) }));
    if (previewReady) {
      actions.append(h('button', { class: 'btn primary', type: 'button', text: '✅ Aprovar preview', onclick: () => { w.preview.approved = true; fwRerender(); } }));
    }
    host.append(h('div', { class: 'fw-gatebar', role: 'status' },
      h('p', { class: 'fw-gatebar-t' }, h('span', { 'aria-hidden': 'true', text: '🔒 ' }), 'Aprove o preview das telas antes de construir.'),
      h('p', { class: 'fw-hint', text: previewReady ? 'Revise o preview e aprove aqui mesmo — ou volte para refinar mais.' : 'Gere o preview, refine o que quiser e aprove. Só então a criação é liberada.' }),
      actions));
  }
  if (w.mode !== 'profissional') {
    // simples/guiado vão DIRETO à construção (como o "Liberar tudo"): o botão lança e trava a
    // tela. A confirmação humana é o clique (gate de preview aprovado continua obrigatório).
    const status = h('p', { class: 'fw-status muted', role: 'status', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary fw-cta', type: 'button', text: modeCopy(w.mode, 'review.launch'), disabled: approved ? null : 'disabled', title: approved ? null : 'Aprove o preview das telas primeiro' });
    btn.addEventListener('click', () => { if (!fwPreviewApproved(w)) return; fwLaunch(w, 'release', status, [btn]); });
    host.append(h('div', { class: 'fw-card' },
      h('p', { class: 'fw-lead' }, 'Tudo pronto para criar o ', h('strong', { text: w.name || w.slug }), '.'),
      h('ul', { class: 'fw-review' },
        h('li', {}, '✅ ', h('strong', { text: String(sum.counts.capabilities) }), ' capacidades'),
        h('li', {}, '✅ ', h('strong', { text: String(sum.counts.screens) }), ' telas/funções'),
        h('li', {}, '✅ ', h('strong', { text: String(sum.counts.waves || 1) }), ' etapas de construção'),
        h('li', {}, (approved ? '✅ ' : '⏳ '), h('strong', { text: 'Preview' }), approved ? ' aprovado' : ' pendente de aprovação')),
      h('div', { class: 'fw-next' }, h('h4', { text: 'O que acontece quando você confirmar' }),
        h('ol', {}, h('li', { text: 'Os requisitos do sistema são criados no git (automático).' }),
          h('li', { text: 'A esteira constrói cada parte, na ordem do plano.' }),
          h('li', { text: 'O sistema é publicado e fica disponível em /' + w.slug + '.' }))),
      h('div', { class: 'fw-actions' }, btn, status)));
  } else {
    const out = h('div', { class: 'forge-section' });
    host.append(out);
    // launchGate=false bloqueia os botões "Criar PR"/"Liberar tudo" até o preview ser aprovado.
    renderProposedList(out, w.slug, w.blueprint, w.proposed, w.reqMeta || {}, null, { brief: w.brief || '', displayName: w.name || w.slug, getArch: () => w.arch, externalContract: (w.capture && w.capture.ref) || null, launchGate: approved, onLaunched: (d, m) => { fwClearIdea(); w.launched = true; w.launchInfo = d; w.launchMode = m; fwRerender(); } });
    if (w.arch) renderArchAdrs(out, w.arch);
  }
  host.append(fwNav(4, null, null));
  host.querySelector('.fw-q').focus();
}

function renderForgeNew(body) {
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: 'Novo produto' }]));
  body.append(h('div', { class: 'forge-detail-head' }, h('h2', { text: 'Novo produto' })));
  body.append(h('p', { class: 'muted', text: 'Descreva o produto; a IA propõe os requisitos e o mapa de dependências se forma ao vivo. Você revisa, ajusta e abre o PR — a UI não escreve no git.' }));

  const grid = h('div', { class: 'forge-panel two' });
  // esquerda — formulário
  const left = h('div', { class: 'forge-section' });
  const name = h('input', { type: 'text', placeholder: 'ex.: helpdesk', 'aria-label': 'Nome do produto (slug)' });
  const bpsel = h('select', { 'aria-label': 'Blueprint' });
  for (const b of (DATA.blueprints && DATA.blueprints.blueprints) || []) bpsel.append(h('option', { value: b.id, text: b.name }));
  if (!bpsel.children.length) bpsel.append(h('option', { value: '', text: '(sem blueprints)' }));
  const brief = h('textarea', { class: 'ai-sketch', rows: '7', 'aria-label': 'Brief', placeholder: 'Ex.: um helpdesk simples — abrir chamados, atribuir a agentes, acompanhar status num quadro, e um painel com SLAs. Sem complexidade.' });
  const fp = filePicker({ label: 'Anexar arquivos do brief', buttonLabel: 'Anexar arquivos (opcional)' });
  const tok = h('input', { type: 'password', value: AI.getToken(), placeholder: 'Bearer token (operador)' });
  const aiStatus = h('p', { class: 'muted ai-status' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), 'Verificando IA…');
  const btn = h('button', { class: 'btn primary', type: 'button', text: '✨ Propor requisitos (IA)' });
  left.append(
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Produto (slug)' }), name),
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Blueprint' }), bpsel),
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Brief' }), brief),
    h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Anexos (opcional)' }), h('p', { class: 'fw-hint', text: 'Documentos, planilhas ou imagens que descrevem o produto — a IA lê o conteúdo.' }), fp.el),
    aiStatus, h('div', { class: 'ws-actions' }, btn),
    h('details', { class: 'asst-token' }, h('summary', { text: 'Token do operador' }), tok));
  grid.append(left);

  // direita — MAPA AO VIVO
  const right = h('div', { class: 'forge-section', role: 'region', 'aria-live': 'polite', 'aria-label': 'Mapa de requisitos' });
  const mapStatus = h('p', { class: 'muted small forge-mapstatus', text: 'O mapa de requisitos se forma aqui ao propor.' });
  const mapLegend = h('div', { class: 'ig-wv-legend', hidden: 'hidden' });
  // legenda dinâmica das waves — deixa explícito que a COR agrupa por etapa de construção
  // e as SETAS indicam a ordem de dependência (não a cor).
  const showWaveLegend = (nWaves) => {
    mapLegend.replaceChildren();
    if (!nWaves || nWaves < 2) { mapLegend.hidden = true; return; }
    mapLegend.append(h('span', { class: 'ig-wv-cap', text: 'Cor = wave (etapa de construção); as setas indicam a ordem de dependência.' }));
    for (let i = 0; i < nWaves; i++) mapLegend.append(h('span', { class: 'ig-wv-item' }, h('span', { class: 'ig-wv-dot wv-' + (i % 6), 'aria-hidden': 'true' }), 'Wave ' + (i + 1)));
    mapLegend.hidden = false;
  };
  const graphHost = h('div', {});
  let proposed = []; let graph = null; let curProduct = ''; let lastArch = null;
  const byProp = (id) => proposed.find((p) => p.id === id);
  function ensureGraph() {
    if (graph) return graph;
    graph = interactiveGraph({
      tall: true, label: 'Mapa de requisitos propostos',
      nodeClass: (n) => 'wv-' + ((n.wave || 0) % 6),
      detailOf: (n, id) => {
        const p = byProp(id); if (!p) return { title: id };
        const sameProduct = ((DATA.baseline && DATA.baseline.requirements) || []).filter((r) => r.scope && r.scope.product_scope === curProduct);
        const sims = findSimilarReqs({ id, title: p.req.title || '', statement: p.req.statement || '' }, sameProduct, 1);
        const dup = sims[0] && sims[0].score >= 0.45 ? sims[0] : null;
        return { title: p.req.title || '(sem título)', sub: p.req.statement ? truncateLabel(p.req.statement, 140) : '', badges: [badge(typeLabel(p.req.type), 'b-fn'), dup ? badge('possível duplicata: ' + dup.id, 'b-crit') : null].filter(Boolean) };
      },
    });
    graphHost.replaceChildren(graph.el);
    return graph;
  }
  right.append(h('h3', { text: 'Mapa de requisitos' }), mapStatus, mapLegend, graphHost);
  grid.append(right);
  body.append(grid);

  // abaixo (largura total) — lista + export
  const out = h('div', { class: 'forge-section', role: 'region', 'aria-live': 'polite', 'aria-label': 'Requisitos propostos' });
  body.append(out);

  tok.addEventListener('change', () => AI.setToken(tok.value.trim()));
  const setAi = (t) => aiStatus.replaceChildren(document.createTextNode(t));
  AI.health().then((r) => setAi(r.ok ? 'IA pronta (gpt-5).' : 'IA indisponível (' + (r.data && r.data.error ? r.data.error.code : r.status) + ') — você ainda pode criar requisitos manualmente via PR.'))
    .catch(() => setAi('IA indisponível (sem servidor) — crie requisitos manualmente via PR.'));

  const spinTxt = (t) => mapStatus.replaceChildren(h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), t);
  const errCard = (title, msg) => { mapStatus.textContent = ''; out.replaceChildren(h('div', { class: 'card' }, h('h4', {}, badge('erro', 'b-crit'), ' ' + title), msg ? h('p', { class: 'muted', text: msg }) : null)); };

  btn.addEventListener('click', async () => {
    AI.setToken(tok.value.trim());
    const pname = (name.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    curProduct = pname; // escopo da detecção de duplicata (grafo) ao produto atual
    if (!pname) { errCard('Informe o slug do produto.'); name.focus(); return; }
    if ((brief.value || '').trim().length < 10) { errCard('Descreva o produto no brief (mínimo ~10 caracteres).'); brief.focus(); return; }
    btn.disabled = true; out.replaceChildren(); spinTxt('Propondo requisitos…');
    try {
      const forgeCatalog = (DATA.capabilities && DATA.capabilities.capabilities) || [];
      const forgeBlueprints = (DATA.blueprints && DATA.blueprints.blueprints) || [];
      const proposeFields = { product: pname, blueprint: bpsel.value, brief: (brief.value || '').trim(), capabilities: forgeCatalog, blueprints: forgeBlueprints };
      const proposeFiles = fp.hasFiles() ? fp.files() : []; // arquivos opcionais → multipart; senão JSON (retrocompat)
      const r = proposeFiles.length
        ? await AI.postMultipart('/v1/forge/propose-requirements', { fields: proposeFields, files: proposeFiles })
        : await AI.post('/v1/forge/propose-requirements', proposeFields);
      if (!r.ok) { const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status; errCard('IA: ' + code, r.data && r.data.error ? r.data.error.message : ''); return; }
      const reqs = (r.data && r.data.requirements) || [];
      if (!reqs.length) { mapStatus.textContent = 'A IA não retornou requisitos.'; return; }
      const existingIds = ((DATA.baseline && DATA.baseline.requirements) || []).map((x) => x.id);
      proposed = []; for (const req of reqs) { const id = req.id || nextReqId(pname, existingIds.concat(proposed.map((p) => p.id))); proposed.push({ id, req }); }
      const nodes = proposed.map((p) => ({ id: p.id, title: p.req.title || '' }));
      showWaveLegend(0);                                                        // ainda sem waves
      ensureGraph().setData(dagFromWaves(nodes, []).nodes, []);                 // fase 1: nós surgem
      renderProposedList(out, pname, bpsel.value, proposed, r.data, graph, { brief: (brief.value || '').trim(), displayName: pname, getArch: () => lastArch });
      spinTxt('Analisando dependências…');
      try {                                                                     // fase 2: dependências formam o mapa
        const a = await AI.post('/v1/forge/propose-architecture', { product: pname, blueprint: bpsel.value, requirements: proposed.map((p) => ({ id: p.id, title: p.req.title, type: p.req.type, statement: p.req.statement, capability_blocks: p.req.capability_blocks || [] })), capabilities: forgeCatalog, blueprints: forgeBlueprints });
        if (a.ok && a.data) lastArch = a.data; // arquitetura p/ o launch (botões "Criar PR"/"Liberar tudo")
        if (a.ok && a.data && Array.isArray(a.data.waves) && a.data.waves.length) {
          const dag = dagFromWaves(nodes, a.data.waves);
          graph.setData(dag.nodes, dag.edges);
          showWaveLegend(a.data.waves.length);
          mapStatus.textContent = `Mapa formado · ${dag.nodes.length} requisitos em ${a.data.waves.length} wave(s) — clique num nó para o detalhe.`;
          renderArchAdrs(out, a.data);
        } else { mapStatus.textContent = `${proposed.length} requisitos propostos (sem dependências sugeridas).`; }
      } catch { mapStatus.textContent = `${proposed.length} requisitos propostos (dependências indisponíveis).`; }
    } catch (e) { errCard('Erro de rede ao chamar a IA', e && e.message ? e.message : String(e)); }
    finally { btn.disabled = false; }
  });
}

// Lista dos requisitos propostos (clique realça o nó no mapa) + AÇÕES (a UI cria no git) + export fallback.
// launchCtx = { brief, displayName, getArch } habilita os botões "Criar PR" / "Liberar tudo".
function renderProposedList(out, pname, blueprint, proposed, data, graph, launchCtx) {
  out.replaceChildren();
  const head = h('h3', { tabindex: '-1', text: `Requisitos propostos — ${proposed.length} (${data.prompt_version || 'ia'})` });
  out.append(head);
  const ul = h('ul', { class: 'forge-reqlist' });
  for (const { id, req } of proposed) {
    // Duplicata só faz sentido DENTRO do mesmo produto — fundação/auth/observabilidade são quase
    // idênticas entre sistemas, então comparar cross-product gerava falso "possível duplicata".
    const sameProduct = ((DATA.baseline && DATA.baseline.requirements) || []).filter((r) => r.scope && r.scope.product_scope === pname);
    const sims = findSimilarReqs({ id, title: req.title || '', statement: req.statement || '' }, sameProduct, 1);
    const dup = sims[0] && sims[0].score >= 0.45 ? sims[0] : null;
    ul.append(h('li', { class: 'forge-reqitem forge-proposed', tabindex: '0', role: 'button', 'aria-label': 'Realçar ' + id + ' no mapa', onclick: () => graph && graph.focus(id), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); graph && graph.focus(id); } } },
      h('span', { class: 'rid', text: id }),
      h('span', { class: 'rt', text: truncateLabel(req.title || '(sem título)', 64) }),
      dup
        ? h('span', { class: 'forge-dup' }, badge('possível duplicata', 'b-crit'), h('button', { class: 'btn-link', type: 'button', onclick: (e) => { e.stopPropagation(); openReq(dup.id); }, text: `${dup.id} · ${Math.round(dup.score * 100)}%` }))
        : badge(typeLabel(req.type), 'b-fn')));
  }
  out.append(ul);
  if (data.notes) out.append(h('p', { class: 'muted small', text: data.notes }));
  // A UI CRIA no git (dispara a esteira). O export YAML/comando vira fallback manual recolhido.
  if (launchCtx) out.append(forgeLaunchControls(pname, blueprint, proposed, launchCtx));
  const yamlText = proposed.map(({ id, req }) => toYaml(forgeReqObject(id, pname, blueprint, req))).join('\n---\n');
  out.append(h('details', { class: 'forge-export' }, h('summary', { text: 'Exportar manualmente (YAML + comando de PR)' }),
    h('p', { class: 'muted small' }, 'alternativa manual — salve cada requisito em ', h('code', { text: 'specs/requirements/' + pname + '/<ID>.yaml' }), ' e abra o PR.'),
    codeBlock(yamlText, 'yaml', 'YAML'), codeBlock(proposeHint(pname, proposed.length), 'forge-cmd', 'comando')));
  head.focus();
}

// Botões "Criar PR" / "Liberar tudo" — a UI cria os requisitos no git via POST /v1/forge/launch
// (o reqhub-api dispara a esteira; o runner escreve YAMLs + baseline + PR). CSP-safe.
// Gate: launchCtx.launchGate === false bloqueia os botões até o preview ser aprovado (caminho do
// wizard). Quando launchGate é undefined (caminho legado renderForgeNew), NÃO há gate (retrocompat).
function forgeLaunchControls(pname, blueprint, proposed, launchCtx) {
  const gated = launchCtx && launchCtx.launchGate === false; // explicitamente bloqueado e não-aprovado
  const wrap = h('div', { class: 'forge-launch' });
  wrap.append(h('p', { class: 'muted small', text: 'Criar no git pela plataforma — a UI dispara a esteira; nada é mesclado sem a sua revisão do PR (no "Liberar tudo", o PR de requisitos é auto-mesclado e a construção é iniciada; os PRs de implementação ainda passam pela sua validação).' }));
  const status = h('span', { class: 'muted small forge-launch-st', role: 'status', 'aria-live': 'polite' });
  const bPr = h('button', { class: 'btn primary', type: 'button', text: '🚀 Criar PR de requisitos', disabled: gated ? 'disabled' : null, title: gated ? 'Aprove o preview das telas primeiro' : null });
  const bRel = h('button', { class: 'btn', type: 'button', text: '⚡ Liberar tudo', disabled: gated ? 'disabled' : null, title: gated ? 'Aprove o preview das telas primeiro' : null });
  const btns = [bPr, bRel];
  const ctx = { pname, blueprint, proposed, launchCtx, status, btns };
  // (A2) skipPreviewGate exposto na UI para o caminho SEM wizard (relançamentos/fluxos legados):
  // sem isto, o backend responde 409 PREVIEW_REQUIRED e o operador fica travado sem saber por quê.
  if (launchCtx && launchCtx.launchGate === undefined) {
    const cb = h('input', { type: 'checkbox', id: 'fw-skip-gate' });
    cb.addEventListener('change', () => { ctx.skipPreviewGate = cb.checked; });
    wrap.append(h('label', { class: 'muted small fw-skip-gate', for: 'fw-skip-gate' }, cb,
      ' Pular o gate de preview (relançamento sem mudança de telas — o backend exige preview aprovado por padrão)'));
  }
  bPr.addEventListener('click', () => { if (gated) return; forgeLaunch('pr', ctx); });
  bRel.addEventListener('click', async () => {
    if (gated) return;
    const ok = await blastConfirm({
      title: 'Liberar tudo em "' + pname + '"?',
      tone: 'primary', icon: '⚡',
      intro: '"Liberar tudo" vai além de abrir um PR — parte do fluxo é AUTO-MESCLADA sem revisão manual:',
      itemsLabel: 'Esta ação vai:',
      items: [
        h('span', {}, 'criar ' + proposed.length + ' requisito(s) no git (', h('code', { text: 'specs/requirements/' + pname }), ')'),
        h('span', {}, 'AUTO-MESCLAR o PR de requisitos ', h('strong', { text: 'sem revisão manual' })),
        'disparar a esteira de construção (build dos serviços)',
      ],
      warn: 'Os PRs de implementação (código) ainda passam pela sua validação — só o PR de requisitos é auto-mesclado.',
      requireCheck: 'Entendo que o PR de requisitos será mesclado automaticamente.',
      confirmLabel: '⚡ Liberar tudo',
    });
    if (ok) forgeLaunch('release', ctx);
  });
  if (gated) wrap.append(h('p', { class: 'fw-hint', text: '🔒 Aprove o preview das telas (etapa Preview) para liberar a criação.' }));
  wrap.append(h('div', { class: 'ws-actions' }, bPr, bRel, status));
  return wrap;
}

async function forgeLaunch(mode, ctx) {
  const { pname, blueprint, proposed, launchCtx, status, btns } = ctx;
  const arch = (launchCtx.getArch && launchCtx.getArch()) || {};
  const requirements = proposed.map(({ id, req }) => {
    const o = forgeReqObject(id, pname, blueprint, req);
    o.capability_blocks = Array.isArray(req.capability_blocks) ? req.capability_blocks : []; // preserva os blocos p/ o YAML
    return o;
  });
  // (C2) buildLaunchBody é PURO (forge-lib): o payload é IDÊNTICO nos 3 modos, exceto o
  // campo informativo creation_mode (rastreabilidade de UX no client_payload/PR).
  // (E2) origem = captura: externalContract (referência, nunca o export) vira
  // architecture.external_contract — o forge-launch faz passthrough do objeto architecture.
  const body = buildLaunchBody({
    product: pname, displayName: launchCtx.displayName || pname, blueprint, brief: launchCtx.brief || '',
    mode, requirements, architecture: arch,
    creationMode: forgeMode(), skipPreviewGate: !!ctx.skipPreviewGate,
    externalContract: launchCtx.externalContract || null,
  });
  btns.forEach((b) => { b.disabled = true; });
  status.textContent = mode === 'release' ? 'Lançando (auto-merge + build)…' : 'Criando os requisitos no git…';
  try {
    const r = await AI.post('/v1/forge/launch', body);
    if (r.ok) {
      const d = r.data || {};
      status.replaceChildren(
        document.createTextNode((mode === 'release' ? 'Lançado (release). ' : 'PR de requisitos disparado. ') + 'Acompanhe: '),
        h('a', { href: d.actions_url || '#', target: '_blank', rel: 'noopener', text: 'esteira ↗' }),
        document.createTextNode(' · '),
        h('a', { href: d.pulls_url || '#', target: '_blank', rel: 'noopener', text: 'PR ↗' }));
      if (launchCtx.onLaunched) launchCtx.onLaunched(d, mode); // trava a navegação do wizard (evita re-disparo)
    } else {
      const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status;
      const msg = r.data && r.data.error ? r.data.error.message : '';
      status.textContent = (code === 'DISPATCH_DISABLED' ? 'Criação automática desligada — falta GITHUB_DISPATCH_TOKEN no servidor.' : 'Falha (' + code + ')' + (msg ? ': ' + msg : ''));
      btns.forEach((b) => { b.disabled = false; });
    }
  } catch (e) { status.textContent = 'Erro de rede: ' + (e && e.message ? e.message : e); btns.forEach((b) => { b.disabled = false; }); }
}

// ADRs sugeridas pela arquitetura (inseridas antes do export).
function renderArchAdrs(out, archData) {
  const adrs = Array.isArray(archData.adrs) ? archData.adrs : [];
  if (!adrs.length) return;
  const card = h('div', { class: 'card' }, h('h4', { text: 'Decisões de arquitetura sugeridas (ADRs)' }));
  const ul = h('ul', { class: 'linklist' });
  for (const a of adrs) ul.append(h('li', {}, h('span', { class: 'lt', text: 'ADR' }), typeof a === 'string' ? a : (a.title || a.decision || JSON.stringify(a))));
  card.append(ul);
  const exp = out.querySelector('details.forge-export');
  if (exp) out.insertBefore(card, exp); else out.append(card);
}

// forgeReqObject mudou para forge-lib.js (C2) — puro/testável, compartilhado com buildLaunchBody.

/* ===================== Ícones (SVG inline, stroke, CSP-safe) ===================== */

export { renderForge, openForgeProduct, openForgeNew, interactiveGraph };


