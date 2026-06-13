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

import { curatedPaths } from './catalog.js';

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
 * (assim a rota de API `/sicat/api` não vira um card separado da `/sicat`, e um
 * app novo com frontend+api gera UM card só). Exclui as raízes já curadas.
 */
export function discoverExtras(apps, curated = curatedPaths()) {
  const known = new Set(curated.map(appRoot));
  const byRoot = new Map();
  for (const a of apps || []) {
    const root = appRoot(a.basePath);
    if (!root || known.has(root)) continue;
    const entry = byRoot.get(root) || { root, name: null, requiresLogin: false };
    if (a.basePath === root) entry.name = prettifyName(a.name); // rota raiz define o nome
    entry.requiresLogin = entry.requiresLogin || a.requiresLogin;
    byRoot.set(root, entry);
  }
  return [...byRoot.values()]
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

async function loadClusterApps({ silent = false } = {}) {
  const section = document.getElementById('cluster-section');
  const grid = document.getElementById('cluster-apps');
  const stateBox = document.getElementById('cluster-state');
  if (!grid || !stateBox) return;
  if (clusterLoading) return; // evita refreshes concorrentes
  clusterLoading = true;

  try {
    const data = await fetchWithTimeout(API_URL);
    const apps = appsInNamespace(parseIngressRoutes(data), 'apps');
    enrichCuratedCards(livePathSet(apps));

    const extras = discoverExtras(apps);
    grid.innerHTML = extras.map(extraCardHTML).join('');
    if (section) section.hidden = false; // revela só com resposta válida (operador logado)
    stateBox.removeAttribute('aria-busy');

    if (extras.length === 0) {
      stateBox.hidden = false;
      stateBox.innerHTML = stateMarkup('empty');
    } else {
      stateBox.hidden = true;
      stateBox.innerHTML = '';
    }
    applySearch();
    track('cluster_apps_loaded', { extras: extras.length, live: apps.length });
  } catch (err) {
    track('cluster_apps_error', { message: String((err && err.message) || err) });
    // Recurso de operador: API restrita (401/403) ⇒ visitante anônimo ⇒ esconde a
    // seção inteira (o site público mostra só os cards curados).
    if (isAuthError(err && err.status)) {
      if (section) section.hidden = true;
      return;
    }
    // Erro transitório (rede/timeout/5xx): mostra erro + retry só na carga inicial,
    // não no refresh silencioso (que não pode estragar uma UI boa anterior).
    if (!silent) {
      const message =
        err && err.name === 'AbortError'
          ? 'o cluster demorou a responder (timeout).'
          : 'a API do Console não respondeu.';
      if (section) section.hidden = false;
      stateBox.hidden = false;
      stateBox.removeAttribute('aria-busy');
      stateBox.innerHTML = stateMarkup('error', { message });
      const retry = stateBox.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => loadClusterApps(), { once: true });
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
  cards.forEach((card) => {
    const hit = matchesQuery(card.getAttribute('data-search'), q);
    card.hidden = !hit;
    if (hit) visible += 1;
  });
  if (counter) {
    counter.textContent = q.trim()
      ? `${visible} resultado${visible === 1 ? '' : 's'}`
      : `${cards.length} aplicações`;
  }
}

function setupSearch() {
  const input = document.getElementById('app-search');
  if (!input) return;
  input.addEventListener('input', applySearch);
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
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
  setupHeaderShadow();
  setupMobileMenu();
  setupBackToTop();
  setupReveal();
  setupNavSpy();
  setupSearch();
  loadClusterApps();
  if (REFRESH_MS > 0) {
    setInterval(() => loadClusterApps({ silent: true }), REFRESH_MS);
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
