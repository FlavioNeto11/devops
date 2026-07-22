/* =============================================================================
 * NovaIT — Portal (progressive enhancement)
 * -----------------------------------------------------------------------------
 * O HTML estático já é completo e útil sem JS (SEO + no-JS friendly). Este módulo
 * ENRIQUECE a página, sem nunca ser pré-requisito para o conteúdo:
 *   1. Descobre apps publicadas no cluster (API read-only do Console) e renderiza
 *      cards extras — com estados de loading / vazio / erro tratados.
 *   2. Marca os cards curados com status ao vivo ("no ar", "exige login").
 *   3. Busca/filtro client-side sobre todos os cards.
 *   4. Menu mobile (hamburger), botão "voltar ao topo", reveal on scroll,
 *      destaque da seção ativa na navegação, ano do rodapé.
 *
 * Estrutura: funções PURAS (sem DOM) exportadas e testadas em node:test; a
 * `init()` (guardada por presença de `document`) faz o trabalho no browser.
 * Sem dependências externas. CSP-safe (script-src 'self', sem inline).
 * ========================================================================== */

// ?v= no import ESM: o cache immutable (30d) do nginx é por URL — sem a query, um
// portal.js novo importaria um catalog.js VELHO do cache (cards duplicados p/ operador).
// Bumpar JUNTO com o ?v= do portal.js no index.html sempre que o catálogo mudar.
import { curatedPaths, PRODUCTS } from './catalog.js?v=14';

/* ------------------------------ helpers puros ----------------------------- */

/** Escapa texto para interpolação segura em HTML. */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "portal-recorder" -> "Portal Recorder". Seguro p/ nomes de recursos k8s. */
export function prettifyName(key) {
  return String(key || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Base path de uma app = o menor path não-raiz (ex.: /sicat e /sicat/api -> /sicat).
 *  Normaliza trailing slash (`/sicat/` -> `/sicat`) p/ casar com o catálogo curado. */
export function basePathOf(paths) {
  const clean = (paths || [])
    .map((p) => (typeof p === 'string' && p.length > 1 ? p.replace(/\/+$/, '') : p))
    .filter((p) => p && p !== '/');
  if (clean.length === 0) return null;
  return clean.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

/** Infere "exige login" pelos nomes de middleware da rota (auth/oidc/sso/keycloak). */
export function inferRequiresLogin(middlewares) {
  return (middlewares || []).some((m) => /(?:^|[-_])(auth|oidc|sso|keycloak|forward)/i.test(m));
}

/**
 * Normaliza a resposta de /devops/api/ingressroutes em apps:
 *   { name, namespace, basePath, hosts, requiresLogin }
 * Ignora rotas sem base path utilizável (ex.: o próprio portal em "/").
 */
export function parseIngressRoutes(data) {
  const items = Array.isArray(data) ? data : [];
  const out = [];
  for (const ir of items) {
    const basePath = basePathOf(ir.paths);
    if (!basePath) continue;
    const middlewares = (ir.routes || []).flatMap((r) => r.middlewares || []);
    out.push({
      name: ir.name || '',
      namespace: ir.namespace || '',
      basePath,
      hosts: ir.hosts || [],
      requiresLogin: inferRequiresLogin(middlewares),
    });
  }
  return out;
}

/** Mantém só apps de um namespace (default: 'apps' — as apps de negócio). */
export function appsInNamespace(apps, ns = 'apps') {
  return (apps || []).filter((a) => a.namespace === ns);
}

/** Conjunto dos base paths vivos (para marcar cards curados como "no ar"). */
export function livePathSet(apps) {
  return new Set((apps || []).map((a) => a.basePath));
}

/** Raiz da app = primeiro segmento do path (`/sicat/api` -> `/sicat`). */
export function appRoot(basePath) {
  const seg = String(basePath || '')
    .split('/')
    .filter(Boolean)[0];
  return seg ? `/${seg}` : null;
}

/**
 * Apps descobertas que NÃO estão no catálogo curado, agrupadas pela RAIZ da app
 * (a rota de API `/sicat/api` não vira card separado da `/sicat`; frontend+api = 1 card).
 *
 * Só entram apps **navegáveis**: que têm uma rota servindo a própria RAIZ `/<app>`
 * (frontend, stripPrefix=false). Serviços só-de-API / control-plane / worker (ex.:
 * `ai-control-plane` com apenas `/ai-control/api`) NÃO têm página na raiz — linkar
 * para `/<app>` daria 404 — então são ignorados. Exclui também as raízes curadas.
 */
export function discoverExtras(apps, curated = curatedPaths()) {
  const known = new Set(curated.map(appRoot));
  const byRoot = new Map();
  for (const a of apps || []) {
    const root = appRoot(a.basePath);
    if (!root || known.has(root)) continue;
    const entry = byRoot.get(root) || {
      root,
      name: null,
      hasFrontend: false,
      requiresLogin: false,
    };
    if (a.basePath === root) {
      entry.hasFrontend = true; // existe rota servindo a raiz = página navegável
      entry.name = prettifyName(a.name);
    }
    entry.requiresLogin = entry.requiresLogin || a.requiresLogin;
    byRoot.set(root, entry);
  }
  return [...byRoot.values()]
    .filter((e) => e.hasFrontend) // descarta só-de-API / control-plane / worker
    .map((e) => ({
      name: e.name || prettifyName(e.root.slice(1)),
      basePath: e.root,
      requiresLogin: e.requiresLogin,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Texto de busca de um card (tudo lowercased) — base para o filtro. */
export function searchText(parts) {
  return (parts || []).filter(Boolean).join(' ').toLowerCase();
}

/** Casa um termo de busca contra um texto já normalizado. Termo vazio = casa tudo. */
export function matchesQuery(haystack, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((token) => String(haystack || '').includes(token));
}

/* --------------------------- render (strings) ----------------------------- */

/** HTML de um card de app descoberta dinamicamente. */
export function extraCardHTML(app) {
  const name = escapeHtml(app.name);
  const path = escapeHtml(app.basePath);
  const text = searchText([app.name, app.basePath, 'aplicação', 'cluster']);
  const loginBadge = app.requiresLogin
    ? '<span class="badge is-login" title="Requer autenticação">exige login</span>'
    : '';
  return (
    `<article class="card prod" data-search="${escapeHtml(text)}">` +
    '<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>' +
    '<div class="role-row"><p class="role">Aplicação no cluster</p>' +
    `<span class="badge is-online" title="Roteada pelo Traefik"><span class="dot"></span>no ar</span></div>` +
    `<h3>${name}</h3>` +
    `<p>Aplicação publicada na plataforma, descoberta automaticamente pela rota <code>${path}</code>.</p>` +
    `<div class="tags">${loginBadge}<span class="tag">${path}</span></div>` +
    `<div class="actions"><a class="btn sm" href="${path}">Acessar ${name}</a></div>` +
    '</article>'
  );
}

/** HTML de um estado (loading / empty / error) para a região ao vivo. */
export function stateMarkup(kind, ctx = {}) {
  if (kind === 'loading') {
    return (
      '<div class="skeleton-grid" aria-hidden="true">' +
      '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' +
      '</div>'
    );
  }
  if (kind === 'empty') {
    return (
      '<div class="state">' +
      '<div class="state-ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/></svg></div>' +
      '<strong>Nenhuma aplicação extra publicada</strong>' +
      '<span>Todas as aplicações no ar já aparecem acima. Apps novas surgem aqui automaticamente ao ganharem uma rota no namespace <code>apps</code>.</span>' +
      '</div>'
    );
  }
  if (kind === 'expired') {
    // Sessão do operador expirou (401 após um 200 prévio): aviso leve + CTA de relogin,
    // em vez de a descoberta sumir em silêncio. O href é montado no chamador (browser).
    const href = escapeHtml(ctx.loginHref || '/oauth2/start');
    return (
      '<div class="state">' +
      '<div class="state-ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg></div>' +
      '<strong>Sua sessão expirou</strong>' +
      '<span>Entre novamente para ver a descoberta do cluster e as ferramentas de operação.</span>' +
      `<a class="btn ghost sm" href="${href}">Entrar novamente</a>` +
      '</div>'
    );
  }
  // error
  const msg = escapeHtml(ctx.message || 'não foi possível consultar o cluster agora.');
  return (
    '<div class="state is-error" role="alert">' +
    '<div class="state-ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg></div>' +
    '<strong>Descoberta dinâmica indisponível</strong>' +
    `<span>Os cards acima continuam acessíveis; ${msg}</span>` +
    '<button class="btn ghost sm retry" type="button" data-retry>Tentar novamente</button>' +
    '</div>'
  );
}

/* ------------------------------ browser init ------------------------------ */

const API_URL = '/devops/api/ingressroutes';
const PUBLICATIONS_URL = '/devops/api/publications';
const REFRESH_MS = 60000;
const TIMEOUT_MS = 8000;

/** A descoberta é recurso de operador — 401/403 = visitante anônimo (esconder a seção). */
export function isAuthError(status) {
  return status === 401 || status === 403;
}

/** fetch JSON com timeout (AbortController). Anexa o status HTTP ao erro. */
async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Evita requisições concorrentes do refresh automático (dedupe simples).
let clusterLoading = false;
// Timer do refresh periódico — parado após 401 (anônimo) para não sondar para sempre.
let refreshTimer = 0;
// Rearme único por 401: evita acumular listeners de focus a cada 401 repetido.
let focusRetryArmed = false;
// Houve ao menos um 200 (operador autenticado) NESTA sessão de página? Distingue o
// visitante anônimo (nunca autorizou) do operador cuja sessão expirou depois — muda o
// que fazer no 401 (esconder tudo x avisar) e no erro transitório (ocultar x mostrar).
let wasOperator = false;

/** Observabilidade leve: encaminha eventos a um coletor opcional (config por env). */
function track(name, data) {
  try {
    const cfg = (typeof window !== 'undefined' && window.PORTAL_CONFIG) || {};
    if (typeof cfg.onEvent === 'function') cfg.onEvent(name, data);
  } catch {
    /* observabilidade nunca pode quebrar a página */
  }
}

function enrichCuratedCards(live) {
  document.querySelectorAll('[data-path]').forEach((card) => {
    const path = card.getAttribute('data-path');
    const slot = card.querySelector('[data-status]');
    if (slot && live.has(path)) {
      slot.innerHTML =
        '<span class="badge is-online" title="Roteada pelo Traefik"><span class="dot"></span>no ar</span>';
    }
  });
}

/** Força visibilidade dos `.reveal` dentro de `root` (seção revelada sob demanda,
 *  sem depender do IntersectionObserver re-disparar após sair do display:none). */
function markRevealed(root) {
  document.querySelectorAll(`${root} .reveal`).forEach((el) => el.classList.add('in'));
}

/** Mostra/esconde a UI de OPERADOR (seção Plataforma + link da nav + coluna do
 *  rodapé). Revelada só quando a API do Console autoriza (operador logado). */
function setOperatorUI(visible) {
  for (const id of ['plataforma', 'nav-plataforma', 'foot-plataforma']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
  if (visible) markRevealed('#plataforma');
}

/* Pulso da plataforma: últimos deploys (de /devops/api/publications) na home, só p/ operador.
   Fail-soft: qualquer erro esconde o bloco. DOM via createElement (sem innerHTML). */
function shortTag(t) {
  t = String(t || '');
  const m = t.split(':').pop() || t;
  return m.length > 14 ? m.slice(0, 12) + '…' : m;
}
function relTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(0, 16);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'agora';
  if (sec < 3600) return Math.floor(sec / 60) + 'min';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h';
  return Math.floor(sec / 86400) + 'd';
}
async function loadPulse() {
  const box = document.getElementById('platform-pulse');
  if (!box) return;
  try {
    const data = await fetchWithTimeout(PUBLICATIONS_URL);
    const list = Array.isArray(data) ? data : (data && data.publications) || [];
    if (!list.length) {
      box.hidden = true;
      return;
    }
    box.replaceChildren();
    const h = document.createElement('div');
    h.className = 'pulse-h';
    h.textContent = '// pulso da plataforma — deploys recentes';
    box.appendChild(h);
    const ul = document.createElement('div');
    ul.className = 'pulse-list';
    for (const p of list.slice(0, 6)) {
      const a = document.createElement('a');
      a.className = 'pulse-i';
      a.href = '/devops';
      const app = document.createElement('span');
      app.className = 'pulse-app';
      app.textContent = p.app || p.name || '—';
      const tag = document.createElement('span');
      tag.className = 'pulse-tag mono';
      tag.textContent = shortTag(p.imageTag || p.tag || '');
      const when = document.createElement('span');
      when.className = 'pulse-when';
      when.textContent = relTime(p.deployedAt || p.deployed_at || '');
      a.append(app, tag, when);
      ul.appendChild(a);
    }
    box.appendChild(ul);
    box.hidden = false;
    markRevealed('#platform-pulse');
  } catch {
    box.hidden = true;
  }
}

async function loadClusterApps({ silent = false } = {}) {
  const section = document.getElementById('cluster-section');
  const grid = document.getElementById('cluster-apps');
  const stateBox = document.getElementById('cluster-state');
  if (!grid || !stateBox) return;
  if (clusterLoading) return; // evita refreshes concorrentes
  clusterLoading = true;

  // Skeleton ADIADO (350ms): se a resposta chega antes — caso típico do 401
  // rápido do anônimo — o skeleton nunca aparece (sem flicker). Só surge quando a
  // consulta demora (operador logado com cluster lento). No refresh silencioso, nada.
  let loadingTimer = 0;
  if (!silent) {
    loadingTimer = setTimeout(() => {
      if (section) {
        section.hidden = false;
        markRevealed('#cluster-section');
      }
      stateBox.hidden = false;
      stateBox.setAttribute('aria-busy', 'true');
      stateBox.innerHTML = stateMarkup('loading');
    }, 350);
  }

  try {
    const data = await fetchWithTimeout(API_URL);
    clearTimeout(loadingTimer);
    wasOperator = true; // 200 = a API do Console autorizou → operador nesta sessão de página
    const apps = appsInNamespace(parseIngressRoutes(data), 'apps');
    enrichCuratedCards(livePathSet(apps));

    const extras = discoverExtras(apps);
    grid.innerHTML = extras.map(extraCardHTML).join('');
    if (section) {
      section.hidden = false;
      markRevealed('#cluster-section');
    }
    setOperatorUI(true); // operador autenticado: revela as ferramentas de operação
    loadPulse(); // pulso da plataforma (deploys recentes) — fail-soft, fire-and-forget
    stateBox.removeAttribute('aria-busy');

    if (extras.length === 0) {
      stateBox.hidden = false;
      stateBox.innerHTML = stateMarkup('empty');
    } else {
      stateBox.hidden = true;
      stateBox.innerHTML = '';
    }
    applySearch();
    // Operador confirmado: garante o refresh periódico (retomado após um 401 anterior).
    if (!refreshTimer && REFRESH_MS > 0) {
      refreshTimer = setInterval(() => loadClusterApps({ silent: true }), REFRESH_MS);
    }
    track('cluster_apps_loaded', { extras: extras.length, live: apps.length });
  } catch (err) {
    clearTimeout(loadingTimer);
    track('cluster_apps_error', { message: String((err && err.message) || err) });
    // Recurso de operador: API restrita (401/403). As ferramentas de operador sempre
    // saem e o refresh periódico para (sem sondar o cluster para sempre). O que a seção
    // de descoberta mostra depende de já ter havido um 200 nesta sessão de página:
    //   • anônimo (nunca autorizou) ⇒ esconde a descoberta (site público = só o curado);
    //   • operador cuja sessão EXPIROU ⇒ aviso leve + CTA de relogin (não some em silêncio).
    // Retomada única quando a aba recupera o foco — captura o operador que logou em outra aba.
    if (isAuthError(err && err.status)) {
      setOperatorUI(false);
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = 0;
      }
      if (wasOperator) {
        grid.innerHTML = ''; // remove cards de operador da sessão anterior
        if (section) {
          section.hidden = false;
          markRevealed('#cluster-section');
        }
        const rd =
          typeof location !== 'undefined'
            ? encodeURIComponent(location.pathname + location.search)
            : '/';
        stateBox.hidden = false;
        stateBox.removeAttribute('aria-busy');
        stateBox.innerHTML = stateMarkup('expired', { loginHref: '/oauth2/start?rd=' + rd });
      } else if (section) {
        section.hidden = true;
      }
      applySearch(); // recalcula a contagem sem tools/cluster
      // rearma a retomada a CADA 401 (o operador pode logar em outra aba a qualquer momento),
      // sem acumular listeners (flag zerada quando o focus dispara).
      if (!focusRetryArmed) {
        focusRetryArmed = true;
        window.addEventListener(
          'focus',
          () => {
            focusRetryArmed = false;
            loadClusterApps({ silent: true });
          },
          { once: true },
        );
      }
      return;
    }
    // Erro transitório (rede/timeout/5xx): mostra erro + retry só na carga inicial (não no
    // refresh silencioso) E só para quem JÁ é operador. A home pública NÃO deve revelar a
    // seção de operador nem o vocabulário de erro interno a um visitante anônimo quando o
    // Console está fora — para ele a seção permanece oculta (o curado cobre a jornada).
    if (!silent && wasOperator) {
      const message =
        err && err.name === 'AbortError'
          ? 'o cluster demorou a responder (timeout).'
          : 'a API do Console não respondeu.';
      if (section) {
        section.hidden = false;
        markRevealed('#cluster-section');
      }
      stateBox.hidden = false;
      stateBox.removeAttribute('aria-busy');
      stateBox.innerHTML = stateMarkup('error', { message });
      const retry = stateBox.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => loadClusterApps(), { once: true });
    } else if (!silent) {
      if (section) section.hidden = true;
      stateBox.hidden = true;
      stateBox.removeAttribute('aria-busy');
    }
  } finally {
    clusterLoading = false;
  }
}

/** Aplica o filtro de busca a todos os cards com data-search. */
function applySearch() {
  const input = document.getElementById('app-search');
  const counter = document.getElementById('search-count');
  if (!input) return;
  const q = input.value;
  const cards = document.querySelectorAll('[data-search]');
  let visible = 0;
  let available = 0;
  cards.forEach((card) => {
    // Cards dentro de seção de operador oculta (anônimo) ficam fora da busca.
    const gated = card.closest('#plataforma, #cluster-section');
    if (gated && gated.hidden) {
      card.hidden = true;
      return;
    }
    available += 1;
    const hit = matchesQuery(card.getAttribute('data-search'), q);
    card.hidden = !hit;
    if (hit) visible += 1;
  });
  if (counter) {
    counter.textContent = q.trim()
      ? `${visible} resultado${visible === 1 ? '' : 's'}`
      : `${available} aplicações`;
  }
  // Cabeçalhos de seção não ficam órfãos sobre grades vazias durante a busca:
  // esconde cada .sec-head cuja grade seguinte não tem nenhum card visível.
  document.querySelectorAll('.sec-head').forEach((head) => {
    let grid = head.nextElementSibling;
    while (grid && !grid.matches('.grid, .tools')) grid = grid.nextElementSibling;
    if (!grid || !grid.querySelector('[data-search]')) return;
    const anyVisible = [...grid.querySelectorAll('[data-search]')].some((c) => !c.hidden);
    head.hidden = q.trim() !== '' && !anyVisible;
  });
  // Estado vazio: query digitada que não casa nada — evita "grade vazia silenciosa".
  const empty = document.getElementById('search-empty');
  if (empty) {
    const show = q.trim() !== '' && visible === 0 && available > 0;
    empty.hidden = !show;
    if (show) {
      const qEl = document.getElementById('search-empty-q');
      if (qEl) qEl.textContent = `“${q.trim()}”`;
    }
  }
}

function setupSearch() {
  const input = document.getElementById('app-search');
  if (!input) return;
  input.addEventListener('input', applySearch);
  const clear = document.getElementById('search-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      input.value = '';
      applySearch();
      input.focus();
    });
  }
  applySearch();
}

function setupMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;
  const close = () => {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    // Esc fecha o menu e devolve o foco ao botão (orientação p/ teclado).
    if (e.key === 'Escape' && links.classList.contains('open')) {
      close();
      toggle.focus();
    }
  });
}

function setupBackToTop() {
  const btn = document.getElementById('to-top');
  if (!btn) return;
  const onScroll = () => btn.classList.toggle('show', window.scrollY > 600);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
}

function setupHeaderShadow() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  const onScroll = () => hdr.classList.toggle('scrolled', window.scrollY > 10);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function setupReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  els.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 5) * 50}ms`;
    io.observe(el);
  });
}

function setupNavSpy() {
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (sections.length === 0) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) =>
          a.classList.toggle('is-here', a.getAttribute('href') === `#${e.target.id}`),
        );
      });
    },
    { rootMargin: '-30% 0px -55% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

export function init() {
  // Módulo vivo: cancela o failsafe de reveal do <head> (senão, após 2,5s, ele
  // forçaria `.no-anim` revelando tudo de uma vez). Ver index.html <head>.
  if (typeof window !== 'undefined' && window.__pf) clearTimeout(window.__pf);
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
  // Stats do hero derivados do catálogo (não voltam a desatualizar).
  const nProducts = document.getElementById('stat-products');
  const nPortals = document.getElementById('stat-portals');
  if (nProducts)
    nProducts.textContent = String(PRODUCTS.filter((p) => p.type === 'product_software').length);
  if (nPortals)
    nPortals.textContent = String(PRODUCTS.filter((p) => p.type === 'cms_portal').length);
  setupHeaderShadow();
  setupMobileMenu();
  setupBackToTop();
  setupReveal();
  setupNavSpy();
  setupSearch();
  loadClusterApps();
  if (REFRESH_MS > 0) {
    refreshTimer = setInterval(() => loadClusterApps({ silent: true }), REFRESH_MS);
  }
}

/* Auto-init no browser (não roda sob node:test, que apenas importa as funções). */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
