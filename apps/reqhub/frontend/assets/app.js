// Reqhub — camada de DOM/init. Lê a baseline gerada e renderiza as 6 telas.
// Funções puras vêm de lib.js; aqui só DOM (createElement + textContent, sem innerHTML).
import { filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, matchesQuery, topSimilar, toYaml, validateDraft, coverageSummary, recentList, degreeMap, productPalette, nodeColor, highlightSet, visibleGraph, forceLayout, truncateLabel, findSimilarReqs } from './lib.js?v=15';
import { productSummaries, findProduct, blueprintById, phaseModel, buildDag, waveProgress, reqRow, forgeStatusCls, hubSummary, nextReqId, proposeHint, typeLabel, asList } from './forge-lib.js?v=15';

const SVGNS = 'http://www.w3.org/2000/svg';
const REPO = 'FlavioNeto11/devops'; // p/ abrir edição/criação via PR no GitHub (auth do usuário)
const state = { view: 'explorer', filters: {}, q: '', selectedId: null, impactFilter: { type: '', product: '', focus: false }, editId: null, devFilter: { status: '', product: '' }, forge: { product: null, step: 'definir', filter: 'all' } };
const DATA = { baseline: null, impact: null, retrieval: null, history: null, registry: null, embeddings: null, implStatus: null, coverage: null, products: null, blueprints: null, buildPlans: {} };

/* ---------- DOM helpers (seguros) ---------- */
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') throw new Error('innerHTML proibido');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) { if (kid == null) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  return e;
}
const byId = (id) => DATA.baseline.requirements.find((r) => r.id === id);
function badge(text, cls) { return h('span', { class: 'b ' + (cls || ''), text }); }

/* ---------- cliente da IA de autoria (reqhub-api, mesmo origin /reqs/api) ----------
   Opcional e fail-closed: sem servidor/sem key/sem token, a UI degrada com mensagem
   clara. O token do operador fica no localStorage (ferramenta de operador). A UI
   NUNCA escreve no git — a IA so preenche/analisa; "salvar" continua sendo abrir o PR. */
const AI = {
  BASE: '/reqs/api',
  tokenKey: 'reqhub_ai_token',
  getToken() { try { return localStorage.getItem(this.tokenKey) || ''; } catch { return ''; } },
  setToken(t) { try { localStorage.setItem(this.tokenKey, t); } catch { /* ignore */ } },
  async health() {
    const r = await fetch(this.BASE + '/health');
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  async post(path, body) {
    const tok = this.getToken();
    const r = await fetch(this.BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
};
/* ---------- recentes (últimos REQs abertos, persistidos no localStorage) ---------- */
const RECENTS = {
  key: 'reqhub-recent',
  get() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  push(id) { try { localStorage.setItem(this.key, JSON.stringify(recentList(this.get(), id, 8))); } catch { /* ignore */ } },
};

function prioCls(p) { return p === 'critical' ? 'b-crit' : p === 'high' ? 'b-high' : p === 'low' ? 'b-low' : 'b-med'; }
function bandCls(b) { return b === 'high' ? 'b-high' : b === 'medium' ? 'b-med' : 'b-low'; }
function setStatus(msg, err) { const s = document.getElementById('status'); s.textContent = msg || ''; s.hidden = !msg; s.className = 'status' + (err ? ' error' : ''); }

/* ---------- Explorer ---------- */
// Faixa de "recentes" (últimos REQs abertos), reusada no Explorador e no Workspace.
function recentsStrip() {
  const ids = RECENTS.get().filter((id) => byId(id));
  if (!ids.length) return null;
  const nav = h('nav', { class: 'recents', 'aria-label': 'Requisitos abertos recentemente' });
  nav.append(h('span', { class: 'recents-l', text: 'Recentes:' }));
  for (const id of ids) {
    nav.append(h('button', {
      class: 'chip chip-btn' + (id === state.selectedId ? ' is-current' : ''),
      type: 'button',
      'aria-current': id === state.selectedId ? 'true' : null,
      'aria-label': `Abrir ${id}`,
      onclick: () => openReq(id),
    }, id));
  }
  return nav;
}

function renderExplorer() {
  const reqs = filterReqs(DATA.baseline.requirements, { ...state.filters, q: state.q });
  const grid = document.getElementById('explorer-grid');
  grid.replaceChildren();
  const recents = recentsStrip();
  if (recents) grid.append(recents);
  const table = h('table');
  table.append(h('thead', {}, h('tr', {},
    h('th', { text: 'ID' }), h('th', { text: 'Título' }), h('th', { text: 'Tipo' }),
    h('th', { text: 'Status' }), h('th', { text: 'Prioridade' }), h('th', { text: 'ASR' }), h('th', { text: 'Impacto' }))));
  const tb = h('tbody');
  for (const { product, items } of groupByProduct(reqs)) {
    tb.append(h('tr', { class: 'group-row' }, h('td', { colspan: '7', text: `${product} · ${items.length}` })));
    for (const r of items) {
      const tr = h('tr', { tabindex: '0', role: 'button', 'aria-label': `Abrir ${r.id}`, onclick: () => openReq(r.id),
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(r.id); } } },
        h('td', {}, h('span', { class: 'rid', text: r.id })),
        h('td', { text: r.title }),
        h('td', {}, badge(r.type === 'non-functional' ? 'NFR' : 'FN', r.type === 'non-functional' ? 'b-nfr' : 'b-fn')),
        h('td', { text: r.status }),
        h('td', {}, badge(r.priority, prioCls(r.priority))),
        h('td', {}, r.architectural_significance ? badge('ASR', 'b-asr') : h('span', { class: 'empty', text: '—' })),
        h('td', {}, badge(`${r.impact_band} (${r.impact_score})`, bandCls(r.impact_band))));
      tb.append(tr);
    }
  }
  table.append(tb);
  if (!reqs.length) grid.append(h('p', { class: 'empty', text: 'Nenhum requisito para os filtros atuais.' }));
  else grid.append(table);
  document.getElementById('explorer-count').textContent = `${reqs.length} de ${DATA.baseline.requirements.length}`;
}

function buildExplorerFilters() {
  const reqs = DATA.baseline.requirements;
  const wrap = document.getElementById('explorer-filters');
  wrap.replaceChildren();
  const mk = (key, label, values) => {
    const sel = h('select', { 'aria-label': label, onchange: (e) => { state.filters[key] = e.target.value; renderExplorer(); } },
      h('option', { value: '', text: label }));
    for (const v of values) sel.append(h('option', { value: v, text: v }));
    return h('label', {}, label, sel);
  };
  wrap.append(
    mk('product', 'Produto', uniqueValues(reqs, (r) => r.scope && r.scope.product_scope)),
    mk('type', 'Tipo', uniqueValues(reqs, (r) => r.type)),
    mk('status', 'Status', uniqueValues(reqs, (r) => r.status)),
    mk('priority', 'Prioridade', uniqueValues(reqs, (r) => r.priority)),
    mk('band', 'Impacto', ['high', 'medium', 'low']),
  );
  const asr = h('select', { 'aria-label': 'ASR', onchange: (e) => { state.filters.asr = e.target.value; renderExplorer(); } },
    h('option', { value: '', text: 'ASR (todos)' }), h('option', { value: 'yes', text: 'Só ASR' }), h('option', { value: 'no', text: 'Não-ASR' }));
  wrap.append(h('label', {}, 'ASR', asr),
    h('button', { class: 'btn', type: 'button', onclick: () => openEditor(null), text: '+ Novo requisito' }),
    h('span', { class: 'count', id: 'explorer-count' }));
}

/* ---------- Workspace ---------- */
function renderWorkspace() {
  const body = document.getElementById('workspace-body');
  body.replaceChildren();
  const recents = recentsStrip();
  if (recents) body.append(recents);
  const r = state.selectedId ? byId(state.selectedId) : null;
  if (!r) { body.append(h('p', { class: 'empty', text: 'Selecione um requisito no Explorador para ver os detalhes, impacto e versão.' })); return; }

  const main = h('div');
  const head = h('div', { class: 'card' },
    h('h3', { text: 'Requisito' }),
    h('div', { class: 'kv' },
      dt('ID'), dd(h('span', { class: 'rid', text: r.id })),
      dt('Título'), dd(r.title),
      dt('Tipo'), dd(r.type), dt('Status'), dd(r.status),
      dt('Escopo'), dd(`${r.scope.applies_to || '—'} · ${r.scope.product_scope}${r.scope.capability ? ' · ' + r.scope.capability : ''}`),
      dt('Prioridade'), dd(h('span', {}, badge(r.priority, prioCls(r.priority)), ' ', r.architectural_significance ? badge('ASR', 'b-asr') : '')),
      dt('Enunciado'), dd(r.statement),
    ));
  main.append(head);
  main.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => openEditor(r.id), text: '✎ Editar (propor via PR)' })));

  if ((r.acceptance_criteria || []).length || (r.verification_method || []).length) {
    const v = h('div', { class: 'card' }, h('h3', { text: 'Verificação' }));
    if ((r.acceptance_criteria || []).length) { v.append(h('strong', { text: 'Critérios de aceite' })); const ul = h('ul'); r.acceptance_criteria.forEach((c) => ul.append(h('li', { text: c }))); v.append(ul); }
    if ((r.verification_method || []).length) v.append(h('p', {}, h('strong', { text: 'Métodos: ' }), r.verification_method.join(', ')));
    main.append(v);
  }
  if ((r.quality_scenarios || []).length) {
    const q = h('div', { class: 'card' }, h('h3', { text: 'Cenários de qualidade (NFR)' }));
    for (const s of r.quality_scenarios) {
      q.append(h('div', { class: 'qscenario' },
        h('div', {}, h('b', { text: 'Estímulo: ' }), `${s.source} → ${s.stimulus}`),
        h('div', {}, h('b', { text: 'Ambiente: ' }), s.environment),
        h('div', {}, h('b', { text: 'Resposta: ' }), s.response),
        h('div', {}, h('b', { text: 'Medida: ' }), s.response_measure)));
    }
    main.append(q);
  }

  // painel lateral: impacto + versão
  const side = h('div');
  const nb = neighborhood(DATA.impact.edges, r.id);
  const imp = h('div', { class: 'card' }, h('h3', { text: 'Impacto' }),
    h('p', {}, h('strong', { text: 'Score: ' }), badge(`${r.impact_band} (${r.impact_score})`, bandCls(r.impact_band))));
  imp.append(h('p', { class: 'muted', text: 'Sai (afeta / aloca / verifica):' }));
  imp.append(linkList(nb.outgoing, 'to'));
  imp.append(h('p', { class: 'muted', text: 'Entra (depende / refina / constrange):' }));
  imp.append(linkList(nb.incoming, 'from'));
  side.append(imp);

  const ver = h('div', { class: 'card' }, h('h3', { text: 'Versão' }),
    h('div', { class: 'kv' },
      dt('baseline'), dd(r.version.baseline_version),
      dt('revisão'), dd(String(r.version.item_revision)),
      dt('mudança'), dd(r.version.semantic_change || 'none'),
      dt('motivo'), dd(r.version.change_reason || '—'),
      dt('arquivo'), dd(h('code', { text: r.file }))));
  side.append(ver);

  // Desenvolvimento (status REQ → PR → deploy)
  const dv = DATA.implStatus && DATA.implStatus.items && DATA.implStatus.items[r.id];
  if (dv) {
    const dev = h('div', { class: 'card' }, h('h3', { text: 'Desenvolvimento' }),
      h('div', { class: 'kv' },
        dt('status'), dd(badge(dv.status, devStatusCls(dv.status))),
        ...(dv.pr ? [dt('PR'), dd(h('a', { class: 'btn-link', href: dv.pr, target: '_blank', rel: 'noopener', text: dv.pr }))] : []),
        ...(dv.commit ? [dt('commit'), dd(h('code', { text: dv.commit }))] : []),
        ...(dv.deployment ? [dt('deployment'), dd(dv.deployment)] : []),
        ...(dv.deployed_at ? [dt('deployed'), dd(dv.deployed_at)] : [])));
    side.append(dev);
  }

  // Alocação (arquitetura/infra DERIVADAS dos requisitos)
  const al = r.allocation || {};
  const allocRows = [['Serviços', al.service_refs], ['Infra', al.infra_refs], ['SLOs', al.slo_refs], ['ADRs', al.adr_refs], ['Arquitetura', al.architecture_refs]].filter(([, v]) => (v || []).length);
  const alloc = h('div', { class: 'card' }, h('h3', { text: 'Alocação (arquitetura/infra derivadas)' }));
  if (!allocRows.length) alloc.append(h('p', { class: 'empty', text: 'Sem alocação registrada — lacuna (autore via edição).' }));
  else for (const [label, vals] of allocRows) alloc.append(h('p', {}, h('strong', { text: label + ': ' }), ...vals.flatMap((v, i) => [i ? ', ' : '', h('code', { text: v })])));
  side.append(alloc);

  // Requisitos similares (semântica via embeddings locais)
  if (DATA.embeddings && DATA.embeddings.vectors) {
    const sims = topSimilar(DATA.embeddings.vectors, r.id, 5);
    const sc = h('div', { class: 'card' }, h('h3', { text: 'Requisitos similares (semântica)' }));
    if (!sims.length) sc.append(h('p', { class: 'empty', text: '—' }));
    else {
      const ul = h('ul', { class: 'linklist' });
      for (const s of sims) {
        const sr = byId(s.id);
        ul.append(h('li', {}, h('span', { class: 'lt', text: s.score.toFixed(2) }), ' ',
          h('button', { class: 'btn-link', onclick: () => openReq(s.id), text: s.id }),
          s.score >= 0.8 ? h('span', {}, ' ', badge('possível duplicata', 'b-crit')) : '',
          sr ? h('span', { class: 'muted', text: ' · ' + sr.title.slice(0, 38) }) : ''));
      }
      sc.append(ul);
    }
    side.append(sc);
  }

  body.append(main, side);
}
function dt(t) { return h('dt', { text: t }); }
function dd(c) { return h('dd', {}, c); }
function linkList(edges, dir) {
  if (!edges.length) return h('p', { class: 'empty', text: '— nenhum' });
  const ul = h('ul', { class: 'linklist' });
  for (const e of edges) {
    const other = dir === 'to' ? e.to : e.from;
    const isReq = /^REQ-/.test(other);
    ul.append(h('li', {},
      h('span', { class: 'lt' + (e.proposed ? ' prop' : ''), text: e.type + (e.proposed ? ' (proposto)' : '') }),
      isReq ? h('button', { class: 'btn-link', onclick: () => openReq(other), text: other }) : h('code', { text: other })));
  }
  return ul;
}

/* ---------- Versões & mudanças ---------- */
function renderVersions() {
  const body = document.getElementById('versions-body');
  body.replaceChildren();

  // Diff REAL da baseline (vs. versão anterior no git), quando disponível.
  const hist = DATA.history;
  if (hist && hist.has_previous && (hist.counts.added + hist.counts.changed + hist.counts.removed) > 0) {
    const card = h('div', { class: 'card' },
      h('h3', { text: 'Diff de baseline' }),
      h('p', { class: 'muted', text: `${hist.from.commit} → ${hist.to.commit} · +${hist.counts.added} adicionado(s) · ~${hist.counts.changed} alterado(s) · −${hist.counts.removed} removido(s)` }));
    const mkSec = (titulo, arr, kind) => {
      if (!arr.length) return;
      card.append(h('h4', { text: titulo }));
      const wrap = h('div', { class: 'grid-wrap' });
      const t = h('table');
      const headCells = kind === 'changed'
        ? ['ID', 'Produto', 'Mudança', 'Campos', 'ΔImpacto']
        : ['ID', 'Produto', 'Tipo', 'Título'];
      t.append(h('thead', {}, h('tr', {}, ...headCells.map((c) => h('th', { text: c })))));
      const tb = h('tbody');
      for (const it of arr) {
        const r = kind === 'changed'
          ? h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(it.id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(it.id); } },
              h('td', {}, h('span', { class: 'rid', text: it.id })), h('td', { text: it.product }),
              h('td', {}, badge(it.semantic_change || 'none', it.semantic_change === 'major' ? 'b-crit' : 'b-med')),
              h('td', { text: (it.fields || []).join(', ') || '—' }),
              h('td', { text: it.impact_delta ? (it.impact_delta > 0 ? '+' : '') + it.impact_delta : '0' }))
          : h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(it.id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(it.id); } },
              h('td', {}, h('span', { class: 'rid', text: it.id })), h('td', { text: it.product }), h('td', { text: it.type }), h('td', { text: it.title }));
        tb.append(r);
      }
      t.append(tb); wrap.append(t); card.append(wrap);
    };
    mkSec('Alterados', hist.changed, 'changed');
    mkSec('Adicionados', hist.added, 'added');
    mkSec('Removidos', hist.removed, 'removed');
    body.append(card);
  }

  body.append(h('p', { class: 'muted', text: 'Ledger: estado de versão de cada requisito. O diff acima compara a baseline atual com a anterior (git). O diff por PR também é publicado pelo CI (specs-diff / skill /baseline-diff).' }));
  const reqs = filterReqs(DATA.baseline.requirements, { q: state.q }).slice().sort((a, b) => a.id.localeCompare(b.id));
  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'baseline' }), h('th', { text: 'rev' }), h('th', { text: 'mudança' }), h('th', { text: 'motivo' }))));
  const tb = h('tbody');
  for (const r of reqs) tb.append(h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(r.id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(r.id); } },
    h('td', {}, h('span', { class: 'rid', text: r.id })), h('td', { text: r.version.baseline_version }), h('td', { text: String(r.version.item_revision) }),
    h('td', {}, badge(r.version.semantic_change || 'none', r.version.semantic_change === 'major' ? 'b-crit' : 'b-med')), h('td', { text: r.version.change_reason || '—' })));
  t.append(tb); wrap.append(t); body.append(wrap);
}

/* ---------- Mapa de impacto (force-directed orgânico) ----------
   Arquitetura: a CENA (SVG: arestas + nós posicionados pelo forceLayout puro) é
   construída UMA vez por população (recomputa só ao ligar/desligar isolados). As
   interações (seleção, hover, filtro de produto/tipo) só REPINTAM classes/atributos
   sobre a cena cacheada — o layout nunca "reembaralha". Cores dinâmicas vão em
   atributos SVG (fill) e estados em classes CSS (CSP estrita: sem style inline). */
const IMPACT = { W: 2400, H: 1560, st: null, layout: null, palette: null, deg: null, nodeEls: null, edgeEls: null, svg: null, root: null, inspector: null };
const EDGE_META = {
  depends_on: { cls: 'e-depends', label: 'depende de' },
  allocates_to: { cls: 'e-alloc', label: 'aloca em' },
  constrains: { cls: 'e-constrains', label: 'restringe' },
  relates_to: { cls: 'e-relates', label: 'relaciona-se' },
  refines: { cls: 'e-refines', label: 'refina' },
  verifies: { cls: 'e-verifies', label: 'verifica' },
};
const TARGET_LABEL = { infra: 'infraestrutura', service: 'serviço', slo: 'SLO' };

function renderImpact() {
  const filters = document.getElementById('impact-filters');
  if (!IMPACT.st) IMPACT.st = { products: null, edgeTypes: null, includeIsolated: false, selectedId: null, hoverId: null, query: '' };
  IMPACT.deg = degreeMap(DATA.impact.edges);
  IMPACT.palette = productPalette(uniqueValues(DATA.impact.nodes, (n) => n.product));
  buildImpactControls(filters);
  buildImpactScene(document.getElementById('impact-canvas'));
  paintImpact();
}

// contagem de nós por produto na população atual (respeita o toggle de isolados).
function impactPopulationCounts() {
  const c = {};
  for (const n of DATA.impact.nodes) {
    if (!n.product) continue;
    if (!IMPACT.st.includeIsolated && !IMPACT.deg[n.id]) continue;
    c[n.product] = (c[n.product] || 0) + 1;
  }
  return c;
}
// bolinha colorida (cor via atributo SVG fill — CSP-safe).
function svgDot(color) {
  const s = svg('svg', { class: 'lg-dot', width: '11', height: '11', viewBox: '0 0 11 11', 'aria-hidden': 'true' });
  s.append(svg('circle', { cx: '5.5', cy: '5.5', r: '5', fill: color }));
  return s;
}

function buildImpactControls(filters) {
  filters.replaceChildren();
  const st = IMPACT.st;
  const counts = impactPopulationCounts();
  const products = Object.keys(IMPACT.palette).filter((p) => counts[p]);
  const isolatedN = DATA.impact.nodes.filter((n) => n.product && !IMPACT.deg[n.id]).length;

  // LINHA PRIMÁRIA: filtro dinâmico (protagonista) + opções + contador (à direita).
  const locate = h('input', { type: 'search', class: 'map-locate', placeholder: 'Filtrar ou localizar no mapa — digite id, título…', 'aria-label': 'Filtrar e localizar requisitos no mapa', value: st.query || '',
    oninput: (e) => { st.query = e.target.value; paintImpact(); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); locateNode(e.target.value); } } });
  const isoInput = h('input', { type: 'checkbox', onchange: (e) => { st.includeIsolated = e.target.checked; st.selectedId = null; st.hoverId = null; renderImpact(); } });
  if (st.includeIsolated) isoInput.checked = true;
  const iso = h('label', { class: 'map-toggle' }, isoInput, `Incluir ${isolatedN} sem conexão`);
  const count = h('span', { class: 'count', id: 'impact-count', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const primary = h('div', { class: 'map-row primary' }, h('span', { class: 'map-search-ico', 'aria-hidden': 'true', text: '⌕' }), locate, iso, count);

  // GRUPO PRODUTOS: a legenda colorida É o filtro multi-seleção.
  const isAll = st.products === null;
  const legend = h('div', { class: 'map-legend', role: 'group', 'aria-label': 'Filtrar por produto (a cor de cada produto é a do mapa)' });
  legend.append(h('button', { class: 'lg-all', type: 'button', 'aria-pressed': String(isAll), title: 'Mostrar todos os produtos', onclick: () => { st.products = null; buildImpactControls(filters); paintImpact(); } }, 'Todos'));
  for (const p of products) {
    const pressed = isAll || st.products.has(p);
    legend.append(h('button', { class: 'lg-chip', type: 'button', 'data-prod': p, 'aria-pressed': String(pressed), onclick: () => toggleProduct(p) },
      svgDot(IMPACT.palette[p].fill), h('span', { class: 'lg-name', text: p }), h('span', { class: 'lg-n', text: String(counts[p]) })));
  }
  const prodGroup = h('div', { class: 'map-group' }, h('span', { class: 'map-group-l', text: 'Produtos' }), legend);

  // GRUPO RELAÇÕES: filtro por tipo de aresta (toggle).
  const types = uniqueValues(DATA.impact.edges, (e) => e.type);
  const eLegend = h('div', { class: 'map-legend edges', role: 'group', 'aria-label': 'Filtrar por tipo de relação' });
  for (const t of types) {
    const pressed = st.edgeTypes === null || st.edgeTypes.has(t);
    eLegend.append(h('button', { class: 'lg-chip etype ' + (EDGE_META[t] ? EDGE_META[t].cls : ''), type: 'button', 'data-etype': t, 'aria-pressed': String(pressed), onclick: () => toggleEdgeType(t) },
      h('span', { class: 'e-swatch', 'aria-hidden': 'true' }), h('span', { text: EDGE_META[t] ? EDGE_META[t].label : t })));
  }
  const relGroup = h('div', { class: 'map-group' }, h('span', { class: 'map-group-l', text: 'Relações' }), eLegend);

  filters.append(h('div', { class: 'map-toolbar' }, primary, h('div', { class: 'map-row' }, prodGroup), h('div', { class: 'map-row' }, relGroup)));
}

function toggleProduct(p) {
  const st = IMPACT.st;
  if (st.products === null) st.products = new Set([p]);       // de "todos" -> focar nesse produto
  else if (st.products.has(p)) { st.products.delete(p); if (!st.products.size) st.products = null; }
  else st.products.add(p);
  buildImpactControls(document.getElementById('impact-filters'));
  paintImpact();
}
function toggleEdgeType(t) {
  const st = IMPACT.st;
  const all = uniqueValues(DATA.impact.edges, (e) => e.type);
  if (st.edgeTypes === null) st.edgeTypes = new Set(all);
  if (st.edgeTypes.has(t)) st.edgeTypes.delete(t); else st.edgeTypes.add(t);
  if (st.edgeTypes.size === all.length) st.edgeTypes = null;
  buildImpactControls(document.getElementById('impact-filters'));
  paintImpact();
}
// localizar: casa por id/título, revela (mesmo fora do filtro), seleciona e centraliza.
function locateNode(q) {
  if (!q || !q.trim()) return;
  const hit = DATA.impact.nodes.find((n) => matchesQuery(byId(n.id) || { id: n.id }, q));
  if (!hit) { const cnt = document.getElementById('impact-count'); if (cnt) cnt.textContent = `nada encontrado para "${q}"`; return; }
  IMPACT.st.selectedId = hit.id;
  // se o nó está fora da população desenhada (isolado sem o toggle), liga isolados e reconstrói a cena.
  if (!IMPACT.nodeEls.has(hit.id)) {
    if (!IMPACT.deg[hit.id]) IMPACT.st.includeIsolated = true;
    renderImpact();
  } else {
    paintImpact();
  }
  centerOnNode(hit.id);
}

function nodeAria(n, req) {
  const d = IMPACT.deg[n.id] || 0;
  if (req) return `${n.id}: ${req.title || ''}. ${req.type === 'non-functional' ? 'NFR' : 'funcional'}, produto ${req.product || '—'}, impacto ${req.impact_band}, ${d} conexões${n.asr ? ', ASR' : ''}.`;
  return `${n.id}: alvo de alocação (${TARGET_LABEL[n.kind] || n.kind}), ${d} conexões.`;
}

function buildImpactScene(canvas) {
  canvas.replaceChildren();
  const st = IMPACT.st;
  const population = st.includeIsolated ? DATA.impact.nodes : DATA.impact.nodes.filter((n) => IMPACT.deg[n.id]);
  const layout = forceLayout(population, DATA.impact.edges, { width: IMPACT.W, height: IMPACT.H });
  IMPACT.layout = layout;
  const pos = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const s = svg('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, role: 'group', 'aria-label': 'Mapa de impacto entre requisitos. Use Tab para focar um nó, setas para navegar entre nós, Enter para destacar suas conexões, O para abrir o requisito, Esc para limpar. Arraste para mover; roda do mouse para aproximar.' });
  const root = svg('g', { class: 'impact-root' });
  const gEdges = svg('g', { class: 'edges-layer' });
  const gNodes = svg('g', { class: 'nodes-layer' });
  root.append(gEdges, gNodes); s.append(root);
  IMPACT.svg = s; IMPACT.root = root;
  // arestas (curva Bézier suave; estilo por tipo via classe CSS).
  IMPACT.edgeEls = [];
  for (const e of layout.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 22;
    const path = svg('path', { class: 'edge ' + (EDGE_META[e.type] ? EDGE_META[e.type].cls : '') + (e.proposed ? ' proposed' : ''), d: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}` });
    gEdges.append(path);
    IMPACT.edgeEls.push({ path, e });
  }
  // nós = chips coloridos pelo produto, com o id curto (texto em cor de contraste).
  IMPACT.nodeEls = new Map();
  for (const n of layout.nodes) {
    const col = nodeColor(n, IMPACT.palette);
    const req = byId(n.id);
    const short = n.id.startsWith('REQ-') ? n.id.slice(4) : n.id;
    const title = req ? truncateLabel(req.title, 22) : '';      // R3: miniatura útil (id + título)
    const twoLine = !!title;
    const isHub = (n.deg || 0) >= 3;
    const w = Math.max(56, Math.max(short.length * 7.6, title.length * 5.9) + 22);
    const hgt = twoLine ? (isHub ? 34 : 31) : 23;
    const x = n.x - w / 2, y = n.y - hgt / 2;
    const cls = 'node' + (n.asr ? ' asr' : '') + (col.target ? ' target' : '') + (isHub ? ' hub' : '') + (req && req.type === 'non-functional' ? ' nfr' : '');
    // roving tabindex: nasce fora do Tab (-1); updateRoving define o único Tab-stop.
    const g = svg('g', { class: cls, tabindex: '-1', role: 'button', 'aria-label': nodeAria(n, req) });
    g.append(Object.assign(svg('title'), { textContent: nodeAria(n, req) }));
    g.append(svg('rect', { class: 'chip', x, y, width: w, height: hgt, rx: col.target ? '5' : (twoLine ? '9' : String(hgt / 2)), fill: col.fill }));
    if (twoLine) {
      const t1 = svg('text', { class: 'chip-lbl id', x: n.x, y: y + 12, 'text-anchor': 'middle', fill: col.text }); t1.textContent = short;
      const t2 = svg('text', { class: 'chip-lbl ti', x: n.x, y: y + hgt - 8, 'text-anchor': 'middle', fill: col.text }); t2.textContent = title;
      g.append(t1, t2);
    } else {
      const tx = svg('text', { class: 'chip-lbl', x: n.x, y: n.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: col.text }); tx.textContent = short;
      g.append(tx);
    }
    g.addEventListener('click', (ev) => { ev.stopPropagation(); selectNode(n.id); });
    g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); if (req) openReq(n.id); });
    g.addEventListener('keydown', (ev) => onNodeKey(ev, n.id, req));
    g.addEventListener('mouseenter', () => setHover(n.id));
    g.addEventListener('mouseleave', () => clearHover(n.id));
    g.addEventListener('focus', () => setHover(n.id));
    g.addEventListener('blur', () => clearHover(n.id));
    gNodes.append(g);
    IMPACT.nodeEls.set(n.id, { g });
  }
  // inspetor (overlay) + controles (zoom/pan/centrar). Fundo: clique limpa a seleção.
  IMPACT.inspector = h('div', { class: 'impact-inspector is-hidden', role: 'region', 'aria-label': 'Detalhes do requisito em foco' });
  wireZoomPan(s, root, layout);
  canvas.append(controlsBar(s, root, layout), IMPACT.inspector, s);
}

function selectNode(id) {
  IMPACT.st.selectedId = IMPACT.st.selectedId === id ? null : id; // toggle: reclica para limpar
  paintImpact();
}
function clearSelection() { if (IMPACT.st.selectedId) { IMPACT.st.selectedId = null; paintImpact(); } }
function setHover(id) {
  IMPACT.st.hoverId = id;
  const el = IMPACT.nodeEls.get(id); if (el) el.g.classList.add('is-hover');
  if (!IMPACT.st.selectedId) showInspector(id, true);
}
function clearHover(id) {
  IMPACT.st.hoverId = null;
  const el = IMPACT.nodeEls.get(id); if (el) el.g.classList.remove('is-hover');
  if (!IMPACT.st.selectedId) hideInspector();
}
// --- navegação por teclado nos nós: roving tabindex (um Tab-stop) + setas entre nós visíveis ---
function visibleNodeGs() {
  const out = [];
  for (const { g } of IMPACT.nodeEls.values()) if (!g.classList.contains('is-hidden')) out.push(g);
  return out;
}
function onNodeKey(ev, id, req) {
  const k = ev.key;
  if (k === 'Enter' || k === ' ') { ev.preventDefault(); selectNode(id); return; }
  if (k === 'o' || k === 'O') { if (req) openReq(id); return; }
  if (k === 'Escape') { clearSelection(); return; }
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
    ev.preventDefault();
    const gs = visibleNodeGs();
    if (!gs.length) return;
    const cur = IMPACT.nodeEls.get(id);
    const i = cur ? gs.indexOf(cur.g) : -1;
    const dir = (k === 'ArrowRight' || k === 'ArrowDown') ? 1 : -1;
    const next = gs[(i + dir + gs.length) % gs.length];
    for (const { g } of IMPACT.nodeEls.values()) g.setAttribute('tabindex', g === next ? '0' : '-1');
    next.focus();
  }
}
// define o único Tab-stop do mapa: o selecionado (se visível) ou o 1º nó visível.
function updateRoving() {
  if (!IMPACT.nodeEls) return;
  const sel = IMPACT.st.selectedId && IMPACT.nodeEls.get(IMPACT.st.selectedId);
  let anchor = sel && !sel.g.classList.contains('is-hidden') ? sel.g : null;
  if (!anchor) anchor = visibleNodeGs()[0] || null;
  for (const { g } of IMPACT.nodeEls.values()) g.setAttribute('tabindex', g === anchor ? '0' : '-1');
}
function centerOnNode(id) {
  const n = IMPACT.layout && IMPACT.layout.nodes.find((x) => x.id === id);
  const s = IMPACT.svg; if (!n || !s || !s._vp) return;
  const vp = s._vp;
  vp.k = Math.max(vp.k, 1.5);
  vp.x = IMPACT.W / 2 - n.x * vp.k;
  vp.y = IMPACT.H / 2 - n.y * vp.k;
  applyTransform(IMPACT.root, vp);
}

function showInspector(id, transient) {
  const host = IMPACT.inspector; if (!host) return;
  const req = byId(id);
  const node = DATA.impact.nodes.find((n) => n.id === id);
  const card = h('div', { class: 'insp-card' });
  card.append(h('div', { class: 'insp-head' },
    h('span', { class: 'insp-id', text: id }),
    h('button', { class: 'insp-x', type: 'button', 'aria-label': 'Fechar detalhes', onclick: () => { IMPACT.st.selectedId = null; IMPACT.st.hoverId = null; paintImpact(); } }, '×')));
  if (req) {
    card.append(h('div', { class: 'insp-title', text: req.title || '' }));
    const badges = h('div', { class: 'insp-badges' });
    badges.append(badge(req.type === 'non-functional' ? 'NFR' : 'funcional', req.type === 'non-functional' ? 'b-nfr' : 'b-fn'));
    if (req.priority) badges.append(badge(req.priority, req.priority === 'critical' ? 'b-crit' : req.priority === 'high' ? 'b-high' : 'b-med'));
    if (req.impact_band) badges.append(badge(`${req.impact_band} (${req.impact_score})`, bandCls(req.impact_band)));
    if (req.architectural_significance || (node && node.asr)) badges.append(badge('ASR', 'b-asr'));
    if (req.status) badges.append(badge(req.status, 'b-ok'));
    card.append(badges);
  } else {
    card.append(h('div', { class: 'insp-title', text: 'Alvo de alocação — ' + (node ? (TARGET_LABEL[node.kind] || node.kind) : '') }));
  }
  const nb = neighborhood(DATA.impact.edges, id);
  const conns = [
    ...nb.outgoing.map((e) => ({ other: e.to, type: e.type })),
    ...nb.incoming.map((e) => ({ other: e.from, type: e.type })),
  ];
  card.append(h('div', { class: 'insp-sub', text: conns.length ? `${conns.length} conexões — clique para navegar` : 'Sem conexões' }));
  if (conns.length) {
    const ul = h('ul', { class: 'insp-conns' });
    for (const c of conns.slice(0, 40)) {
      const other = byId(c.other);
      ul.append(h('li', {}, h('button', { class: 'insp-conn', type: 'button', onclick: () => { IMPACT.st.selectedId = c.other; paintImpact(); centerOnNode(c.other); } },
        svgDot(nodeColor(DATA.impact.nodes.find((x) => x.id === c.other) || {}, IMPACT.palette).fill),
        h('span', { class: 'insp-conn-id', text: c.other }),
        h('span', { class: 'insp-conn-t', text: EDGE_META[c.type] ? EDGE_META[c.type].label : c.type }),
        other ? h('span', { class: 'insp-conn-ti', text: truncateLabel(other.title, 34) }) : null)));
    }
    card.append(ul);
  }
  if (req) card.append(h('button', { class: 'btn insp-open', type: 'button', onclick: () => openReq(id) }, 'Abrir no Workspace ↗'));
  host.replaceChildren(card);
  host.classList.remove('is-hidden');
  host.classList.toggle('is-transient', !!transient);
}
function hideInspector() { if (IMPACT.inspector) IMPACT.inspector.classList.add('is-hidden'); }

// Repintura PURA da cena: liga/desliga visibilidade e estados via classes — sem recriar SVG.
function paintImpact() {
  const st = IMPACT.st;
  if (!IMPACT.nodeEls) return;
  const vg = visibleGraph(DATA.impact.nodes, DATA.impact.edges, { products: st.products, edgeTypes: st.edgeTypes, includeIsolated: st.includeIsolated, selectedId: st.selectedId });
  const typedEdges = st.edgeTypes ? DATA.impact.edges.filter((e) => st.edgeTypes.has(e.type)) : DATA.impact.edges;
  const hl = st.selectedId ? highlightSet(typedEdges, st.selectedId) : null;
  const hot = new Set(hl ? [hl.focus, ...hl.neighbors] : []);
  const q = (st.query || '').trim();
  const matchOf = q ? (id) => matchesQuery(byId(id) || { id }, q) : null;   // filtro dinâmico
  let shown = 0, matches = 0;
  for (const [id, el] of IMPACT.nodeEls) {
    const visible = vg.nodeIds.has(id);
    el.g.classList.toggle('is-hidden', !visible);
    if (visible) shown++;
    const isMatch = !!matchOf && visible && matchOf(id);
    if (isMatch) matches++;
    el.g.classList.toggle('is-focus', id === st.selectedId);
    el.g.classList.toggle('is-neighbor', !!hl && hot.has(id) && id !== st.selectedId);
    const mutedBySel = !!st.selectedId && visible && !hot.has(id);
    const mutedByQuery = !!matchOf && visible && !isMatch && id !== st.selectedId;
    el.g.classList.toggle('is-dim', mutedBySel || mutedByQuery);
    el.g.classList.toggle('is-match', isMatch && id !== st.selectedId);
    el.g.classList.toggle('is-revealed', vg.revealed.has(id) && id !== st.selectedId);
  }
  for (const { path, e } of IMPACT.edgeEls) {
    const visible = vg.nodeIds.has(e.from) && vg.nodeIds.has(e.to) && (!st.edgeTypes || st.edgeTypes.has(e.type));
    path.classList.toggle('is-hidden', !visible);
    const active = !!st.selectedId && (e.from === st.selectedId || e.to === st.selectedId) && visible;
    path.classList.toggle('is-active', active);
    path.classList.toggle('is-dim', !!st.selectedId && visible && !active);
  }
  const cnt = document.getElementById('impact-count');
  if (cnt) cnt.textContent = st.selectedId
    ? `${st.selectedId} · ${Math.max(0, hot.size - 1)} conexões em destaque · ${shown} nós visíveis`
    : q
      ? `${matches} correspondência${matches === 1 ? '' : 's'} para "${q}" · ${shown} nós no mapa`
      : `${shown} nós no mapa · ${IMPACT.edgeEls.length} relações`;
  // a11y: roving tabindex + recupera o foco se o nó focado tiver sido ocultado.
  const active = document.activeElement;
  const lostFocus = active && active.classList && active.classList.contains('node') && active.classList.contains('is-hidden');
  updateRoving();
  if (lostFocus) {
    const sel = st.selectedId && IMPACT.nodeEls.get(st.selectedId);
    const target = (sel && !sel.g.classList.contains('is-hidden')) ? sel.g : visibleNodeGs()[0];
    if (target) target.focus();
  }
  if (st.selectedId) showInspector(st.selectedId, false);
  else if (st.hoverId) showInspector(st.hoverId, true);
  else hideInspector();
}

// Estado do viewport do grafo (zoom/pan), aplicado via transform no <g> raiz.
function applyTransform(root, vp) {
  root.setAttribute('transform', `translate(${vp.x} ${vp.y}) scale(${vp.k})`);
}
function controlsBar(s, root, layout) {
  const vp = s._vp;
  const bar = h('div', { class: 'impact-controls' });
  const set = (k, cx, cy) => {
    const nk = Math.min(4, Math.max(0.3, k));
    // mantém o ponto central estável ao mudar o zoom
    vp.x = cx - (cx - vp.x) * (nk / vp.k);
    vp.y = cy - (cy - vp.y) * (nk / vp.k);
    vp.k = nk;
    applyTransform(root, vp);
  };
  const center = () => ({ cx: layout.width / 2, cy: layout.height / 2 });
  bar.append(
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Aproximar (zoom in)', title: 'Aproximar', onclick: () => { const c = center(); set(vp.k * 1.25, c.cx, c.cy); } }, '+'),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Afastar (zoom out)', title: 'Afastar', onclick: () => { const c = center(); set(vp.k / 1.25, c.cx, c.cy); } }, '−'),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Centrar no nó selecionado', title: 'Centrar no selecionado', onclick: () => { if (IMPACT.st && IMPACT.st.selectedId) centerOnNode(IMPACT.st.selectedId); } }, '◎'),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Restaurar zoom e posição', title: 'Restaurar', onclick: () => { vp.x = 0; vp.y = 0; vp.k = 1; applyTransform(root, vp); } }, '⟲'),
  );
  return bar;
}
// Liga zoom (wheel) e pan (drag) ao SVG do grafo. Aditivo: clique/teclado nos nós seguem.
function wireZoomPan(s, root, layout) {
  const vp = { x: 0, y: 0, k: 1 };
  s._vp = vp;
  applyTransform(root, vp);
  const ptInSvg = (ev) => {
    const rect = s.getBoundingClientRect();
    const sx = (layout.width) / (rect.width || layout.width);
    const sy = (layout.height) / (rect.height || layout.height);
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  };
  s.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const p = ptInSvg(ev);
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nk = Math.min(4, Math.max(0.3, vp.k * factor));
    vp.x = p.x - (p.x - vp.x) * (nk / vp.k);
    vp.y = p.y - (p.y - vp.y) * (nk / vp.k);
    vp.k = nk;
    applyTransform(root, vp);
  }, { passive: false });
  let drag = null;
  s.addEventListener('pointerdown', (ev) => {
    // não inicia pan ao clicar num nó (preserva o clique de selecionar)
    if (ev.target.closest('.node')) return;
    drag = { sx: ev.clientX, sy: ev.clientY, x0: vp.x, y0: vp.y, moved: false };
    s.classList.add('panning');
    s.setPointerCapture(ev.pointerId);
  });
  s.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true;
    const rect = s.getBoundingClientRect();
    const sx = (layout.width) / (rect.width || layout.width);
    const sy = (layout.height) / (rect.height || layout.height);
    vp.x = drag.x0 + (ev.clientX - drag.sx) * sx;
    vp.y = drag.y0 + (ev.clientY - drag.sy) * sy;
    applyTransform(root, vp);
  });
  // clique simples no fundo (sem arrastar) limpa a seleção/foco do mapa.
  const endPan = (ev) => {
    if (drag && !drag.moved && ev && ev.target && !ev.target.closest('.node')) clearSelection();
    drag = null; s.classList.remove('panning');
  };
  s.addEventListener('pointerup', endPan);
  s.addEventListener('pointercancel', () => { drag = null; s.classList.remove('panning'); });
}

/* ---------- Cobertura ---------- */
function renderCoverage() {
  const body = document.getElementById('coverage-body');
  body.replaceChildren();
  body.append(h('p', { class: 'muted', text: 'Matriz requisito × evidência/alocação. Verde = preenchido; vermelho = lacuna. Links a artefatos externos (ADR/serviço/infra/SLO) e evidências são autorados na iteração (Fase 2+).' }));

  // Resumo "da cobertura" (coverage-report.json): % por dimensão no total + lacunas por escopo.
  const cov = DATA.coverage;
  if (cov && cov.totals) {
    const dimLbl = { source_paths: 'Origem', links: 'Links', allocation: 'Alocação', evidence: 'Evidência', verification_method: 'Método' };
    const card = h('div', { class: 'card' }, h('h3', { text: `Cobertura da base — ${cov.totals.total} requisitos · ${cov.totals.scopes} escopos` }));
    const chips = h('div', { class: 'ws-actions' });
    for (const d of cov.dimensions) {
      const pct = cov.totals.coverage_pct[d];
      chips.append(badge(`${dimLbl[d] || d}: ${pct}%`, pct >= 70 ? 'b-ok' : pct >= 30 ? '' : 'b-crit'));
    }
    card.append(chips);
    // escopos mais "rasos" por origem/links/alocação (lacunas reais a preencher)
    const scopes = Object.entries(cov.by_scope).sort((a, b) => (b[1].without_links + b[1].without_allocation) - (a[1].without_links + a[1].without_allocation)).slice(0, 6);
    const tbl = h('table', { class: 'matrix' });
    tbl.append(h('thead', {}, h('tr', {}, h('th', { text: 'Escopo' }), h('th', { text: 'Total' }), ...cov.dimensions.map((d) => h('th', { text: dimLbl[d] || d })))));
    const tb = h('tbody');
    for (const [scope, c] of scopes) {
      tb.append(h('tr', {}, h('td', { text: scope }), h('td', { text: String(c.total) }),
        ...cov.dimensions.map((d) => { const w = c[`without_${d}`]; return h('td', { class: w === 0 ? 'hit' : 'miss', text: w === 0 ? '✓' : `−${w}` }); })));
    }
    tbl.append(tb); card.append(h('p', { class: 'muted', text: 'Escopos com mais lacunas (sem link/alocação). −N = N requisitos sem aquela dimensão.' }), tbl);
    body.append(card);
  }
  const cols = [['acceptance', 'Aceite'], ['method', 'Método'], ['evidence', 'Evidência'], ['adr', 'ADR'], ['service', 'Serviço'], ['infra', 'Infra'], ['slo', 'SLO']];
  const reqs = filterReqs(DATA.baseline.requirements, { ...state.filters, q: state.q }).slice().sort((a, b) => coverageScore(a) - coverageScore(b));

  // Resumo por dimensão (coberto/faltando) sobre os requisitos exibidos — calculado em lib.js.
  const summary = coverageSummary(reqs);
  const sumCard = h('div', { class: 'card' }, h('h3', { text: `Resumo por dimensão — ${reqs.length} requisito(s)` }));
  const chips = h('div', { class: 'ws-actions cov-summary' });
  for (const d of summary) {
    chips.append(h('span', { class: 'cov-stat' },
      h('span', { class: 'cov-stat-l', text: d.label }),
      badge(`${d.hit}/${d.total}`, d.pct >= 70 ? 'b-ok' : d.pct >= 30 ? 'b-high' : 'b-crit'),
      h('span', { class: 'muted', text: d.miss ? ` ${d.miss} falt.` : ' completo' })));
  }
  sumCard.append(chips);
  body.append(sumCard);

  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table', { class: 'matrix matrix-sticky' });
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'Produto' }), ...cols.map((c) => h('th', { text: c[1] })), h('th', { text: 'Cobertura' }))));
  const tb = h('tbody');
  for (const r of reqs) {
    const row = coverageRow(r);
    const tr = h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(r.id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(r.id); } },
      h('td', {}, h('span', { class: 'rid', text: r.id })), h('td', { text: r.scope.product_scope }),
      ...cols.map((c) => h('td', { class: row[c[0]] ? 'hit' : 'miss', text: row[c[0]] ? '✓' : '—' })),
      h('td', { text: Math.round(coverageScore(r) * 100) + '%' }));
    tb.append(tr);
  }
  t.append(tb); wrap.append(t); body.append(wrap);
}

/* ---------- Fila de reprocessamento ---------- */
function renderReprocess() {
  const body = document.getElementById('reprocess-body');
  body.replaceChildren();
  const q = DATA.baseline.reprocess_queue || [];
  body.append(h('p', { class: 'muted', text: `${q.length} item(ns) exigem atenção do Claude — priorizados por impacto. Motivos: alto impacto, lacuna de verificação (sem método/evidência) ou mudança major.` }));
  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'ID' }), h('th', { text: 'Produto' }), h('th', { text: 'Título' }), h('th', { text: 'Score' }), h('th', { text: 'Motivos' }))));
  const tb = h('tbody');
  q.forEach((item, i) => {
    const r = byId(item.id);
    tb.append(h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(item.id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(item.id); } },
      h('td', { text: String(i + 1) }), h('td', {}, h('span', { class: 'rid', text: item.id })), h('td', { text: item.product }),
      h('td', { text: r ? r.title : '' }), h('td', {}, badge(String(item.impact_score), bandCls(r ? r.impact_band : 'low'))),
      h('td', {}, ...(item.reasons || []).map((x) => badge(x, 'b-med')))));
  });
  t.append(tb); wrap.append(t); body.append(wrap);
}

/* ---------- Desenvolvimento (status REQ → PR → deploy) ---------- */
function devStatusCls(s) {
  return s === 'done' || s === 'deployed' ? 'b-ok' : s === 'blocked' ? 'b-crit' : s === 'not_started' ? 'b-low' : 'b-high';
}
function renderDev() {
  const wrap = document.getElementById('dev-filters');
  wrap.replaceChildren();
  const body = document.getElementById('dev-body');
  body.replaceChildren();
  const st = DATA.implStatus;
  if (!st || !st.items) { body.append(h('p', { class: 'empty', text: 'Sem dados de desenvolvimento (implementation-status.json ausente).' })); return; }
  const statuses = [...new Set(Object.values(st.items).map((x) => x.status))].sort();
  const products = uniqueValues(DATA.baseline.requirements, (r) => r.scope && r.scope.product_scope);
  const mk = (key, label, vals) => {
    const sel = h('select', { 'aria-label': label, onchange: (e) => { state.devFilter[key] = e.target.value; renderDev(); } }, h('option', { value: '', text: label }));
    for (const v of vals) { const o = h('option', { value: v, text: v }); if (v === state.devFilter[key]) o.selected = true; sel.append(o); }
    return h('label', {}, label, sel);
  };
  wrap.append(mk('status', 'Status', statuses), mk('product', 'Produto', products), h('span', { class: 'count', id: 'dev-count' }));
  const counts = (st.counts && st.counts.by_status) || {};
  body.append(h('p', { class: 'muted' }, 'Estado do desenvolvimento por requisito (REQ → PR → deploy), atualizado pela esteira. ',
    ...Object.keys(counts).sort().flatMap((s) => [badge(`${s}: ${counts[s]}`, devStatusCls(s)), ' '])));
  const ids = Object.keys(st.items).filter((id) => {
    const it = st.items[id]; const r = byId(id);
    if (state.devFilter.status && it.status !== state.devFilter.status) return false;
    if (state.devFilter.product && (!r || (r.scope && r.scope.product_scope) !== state.devFilter.product)) return false;
    return true;
  }).sort();
  document.getElementById('dev-count').textContent = `${ids.length} de ${Object.keys(st.items).length}`;
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'Produto' }), h('th', { text: 'Título' }), h('th', { text: 'Status' }), h('th', { text: 'PR' }), h('th', { text: 'Deploy' }))));
  const tb = h('tbody');
  for (const id of ids) {
    const it = st.items[id]; const r = byId(id);
    tb.append(h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(id); } },
      h('td', {}, h('span', { class: 'rid', text: id })),
      h('td', { text: r ? r.scope.product_scope : '—' }),
      h('td', { text: r ? r.title : '' }),
      h('td', {}, badge(it.status, devStatusCls(it.status))),
      h('td', {}, it.pr ? h('a', { class: 'btn-link', href: it.pr, target: '_blank', rel: 'noopener', text: 'PR' }) : h('span', { class: 'empty', text: '—' })),
      h('td', { text: it.deployed_at ? it.deployed_at.slice(0, 10) : it.deployment || '—' })));
  }
  const gw = h('div', { class: 'grid-wrap' });
  t.append(tb); gw.append(t); body.append(gw);
}

/* ---------- Editor (autoria assistida → PR no GitHub; a UI NÃO escreve no git) ---------- */
function openEditor(id) { state.editId = id || null; switchView('editor'); }
function renderEditor() {
  const body = document.getElementById('editor-body');
  body.replaceChildren();
  const ed = state.editId ? byId(state.editId) : null;

  // ---- formulário (campos) — coluna direita ----
  const f = {};
  const form = h('div', { class: 'form' });
  const add = (label, key, el) => { form.append(h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: label }), el)); f[key] = el; };
  const inp = (v) => h('input', { type: 'text', value: v ?? '' });
  const area = (v, rows) => h('textarea', { rows: String(rows || 3) }, v ?? '');
  const select = (opts, v) => { const s = h('select'); for (const o of opts) { const op = h('option', { value: o, text: o }); if (o === v) op.selected = true; s.append(op); } return s; };

  add('id', 'id', inp(ed?.id));
  add('Produto (product_scope)', 'product', inp(ed?.scope?.product_scope));
  add('applies_to', 'applies_to', select(['product', 'shared-module', 'capability', 'portal-template', 'portal-instance', 'platform'], ed?.scope?.applies_to || 'product'));
  add('Tipo', 'type', select(['functional', 'non-functional', 'business-rule', 'constraint'], ed?.type || 'functional'));
  add('Status', 'status', select(['draft', 'proposed', 'approved', 'deprecated', 'retired'], ed?.status || 'proposed'));
  add('Owner', 'owner', inp(ed?.owner || 'plataforma-digital'));
  add('Prioridade', 'priority', select(['low', 'medium', 'high', 'critical'], ed?.priority || 'medium'));
  add('Criticidade', 'criticality', select(['low', 'medium', 'high', 'critical'], ed?.criticality || ed?.priority || 'medium'));
  add('ASR', 'asr', select(['false', 'true'], String(!!ed?.architectural_significance)));
  add('Título', 'title', inp(ed?.title));
  add('Enunciado', 'statement', area(ed?.statement, 4));
  add('Caminhos-fonte / origem (1/linha, OBRIGATÓRIO)', 'source_paths', area((ed?.source?.source_paths || []).join('\n'), 2));
  add('Critérios de aceite (1/linha)', 'acceptance', area((ed?.acceptance_criteria || []).join('\n'), 3));
  add('Métodos de verificação (vírgula)', 'methods', inp((ed?.verification_method || []).join(', ')));
  const qs = ed?.quality_scenarios?.[0] || {};
  for (const [k, lbl] of [['qs_source', 'NFR source'], ['qs_stimulus', 'NFR stimulus'], ['qs_environment', 'NFR environment'], ['qs_artifact', 'NFR artifact'], ['qs_response', 'NFR response'], ['qs_measure', 'NFR response_measure']]) {
    add(lbl, k, inp(qs[k.replace('qs_', '').replace('measure', 'response_measure')]));
  }
  add('baseline_version', 'bver', inp(ed?.version?.baseline_version || '1.0.0'));
  add('item_revision', 'irev', inp(String(ed ? (ed.version?.item_revision || 1) + 1 : 1)));
  add('semantic_change', 'sem', select(['none', 'patch', 'minor', 'major'], ed ? 'minor' : 'none'));
  add('change_reason', 'reason', inp(ed ? '' : 'novo requisito'));
  const out = h('div');

  // ---- VALIDAÇÃO AUTOMÁTICA (client-side, sem API): roda ao digitar ----
  const valOut = h('div', { class: 'val-out' });
  let valTimer = null;
  const currentDraftText = () => ({
    id: (f.id.value || '').trim() || (ed && ed.id) || '',
    title: (f.title.value || '').trim() || (sketch.value || '').trim(),
    statement: (f.statement.value || '').trim(),
  });
  function valItem(s, dup) {
    return h('li', { class: 'val-item' },
      h('button', { class: 'btn-link', type: 'button', onclick: () => openReq(s.id), text: s.id }),
      h('span', { class: 'val-pct' + (dup ? ' hi' : ''), text: Math.round(s.score * 100) + '%' }),
      s.product ? h('span', { class: 'val-prod', text: s.product }) : null,
      h('span', { class: 'val-ti', text: truncateLabel(s.title, 64) }));
  }
  function runValidation() {
    const d = currentDraftText();
    if (!d.title && !d.statement) {
      valOut.replaceChildren(h('p', { class: 'muted', text: 'Comece pelo esboço ou pelo título/enunciado — verifico duplicatas e sugiro vínculos automaticamente, mesmo sem acionar a IA.' }));
      return;
    }
    const sims = findSimilarReqs(d, DATA.baseline.requirements, 6);
    const strong = sims.filter((s) => s.score >= 0.45);
    const related = sims.filter((s) => s.score >= 0.12 && s.score < 0.45);
    valOut.replaceChildren();
    if (strong.length) {
      const warn = h('div', { class: 'val-card dup' }, h('div', { class: 'val-h' }, h('span', { class: 'val-ic', text: '⚠' }), h('strong', { text: 'Possível duplicata — revise antes de criar' })));
      const ul = h('ul', { class: 'val-list' }); strong.forEach((s) => ul.append(valItem(s, true))); warn.append(ul);
      valOut.append(warn);
    }
    if (related.length) {
      const card = h('div', { class: 'val-card rel' }, h('div', { class: 'val-h' }, h('span', { class: 'val-ic', text: '🔗' }), h('strong', { text: 'Requisitos relacionados — candidatos a vínculo' })));
      const ul = h('ul', { class: 'val-list' }); related.forEach((s) => ul.append(valItem(s, false)));
      card.append(ul, h('p', { class: 'muted small', text: 'Inclua os IDs relevantes ao abrir o PR; "Classificar vínculos (IA)" sugere o tipo (depends_on/relates_to/…).' }));
      valOut.append(card);
    }
    if (!strong.length && !related.length) valOut.append(h('p', { class: 'val-ok', text: '✓ Nada parecido encontrado — parece ser um requisito novo.' }));
  }
  const scheduleValidation = () => { if (valTimer) clearTimeout(valTimer); valTimer = setTimeout(runValidation, 350); };
  f.title.addEventListener('input', scheduleValidation);
  f.statement.addEventListener('input', scheduleValidation);

  // ---- ASSISTENTE DE IA (protagonista) ----
  const status = h('p', { class: 'muted ai-status', text: 'Verificando IA…' });
  const tok = h('input', { type: 'password', value: AI.getToken(), placeholder: 'Bearer token (operador)' });
  const sketch = h('textarea', { class: 'ai-sketch', rows: '4', placeholder: 'Descreva a feature/regra em linguagem natural — ex.: "o operador deve submeter o manifesto MTR de forma assíncrona, com retomada em falha"…' });
  sketch.addEventListener('input', scheduleValidation);
  const aiOut = h('div', { class: 'ai-out' });

  function showErr(r) {
    const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status;
    const msg = r.data && r.data.error ? r.data.error.message : '';
    aiOut.replaceChildren(h('div', { class: 'card' }, h('h3', { text: 'IA: ' + code }), h('p', { class: 'muted', text: msg })));
  }
  async function guard(fn) {
    aiOut.replaceChildren(h('p', { class: 'muted', text: 'Consultando a IA…' }));
    try { await fn(); } catch (e) { aiOut.replaceChildren(h('p', { class: 'empty', text: 'Erro de rede ao chamar a IA: ' + (e && e.message ? e.message : e) })); }
  }
  function doDraft() {
    guard(async () => {
      const r = await AI.post('/v1/authoring/draft', { sketch: (sketch.value || '').trim(), scope: (f.product.value || '').trim() });
      if (!r.ok) return showErr(r);
      applyDraftToForm(r.data.draft || {});
      runValidation();
      const warns = (r.data.draft && r.data.draft.warnings) || [];
      aiOut.replaceChildren(h('div', { class: 'card' },
        h('h3', { text: 'Rascunho aplicado (' + (r.data.prompt_version || '') + ')' }),
        h('p', { class: 'muted', text: warns.length ? 'Avisos: ' + warns.join('; ') : 'Campos preenchidos à direita — revise e clique em Gerar YAML.' })));
    });
  }
  function doAnalyze() {
    guard(async () => {
      const r = await AI.post('/v1/authoring/analyze', { requirement: collectDraft() });
      if (!r.ok) return showErr(r);
      const card = h('div', { class: 'card' }, h('h3', { text: 'Lacunas — prontidão ' + (r.data.score != null ? r.data.score : '?') }));
      const gaps = r.data.gaps || [];
      if (!gaps.length) card.append(h('p', { class: 'empty', text: 'Sem lacunas apontadas.' }));
      else { const ul = h('ul', { class: 'errlist' }); gaps.forEach((g) => ul.append(h('li', {}, badge(g.severity || 'info', g.severity === 'blocker' ? 'b-crit' : ''), ' ' + ((g.field ? g.field + ': ' : '') + (g.message || ''))))); card.append(ul); }
      aiOut.replaceChildren(card);
    });
  }
  function doLinks() {
    guard(async () => {
      const draft = collectDraft();
      // candidatos: embeddings (ao editar) OU similaridade textual (requisito novo)
      let cands;
      if (DATA.embeddings && DATA.embeddings.vectors && state.editId) {
        cands = topSimilar(DATA.embeddings.vectors, state.editId, 6).map((s) => ({ id: s.id, title: (byId(s.id) || {}).title || '', score: Number(s.score.toFixed(3)) }));
      } else {
        cands = findSimilarReqs(draft, DATA.baseline.requirements, 6).map((s) => ({ id: s.id, title: s.title, score: s.score }));
      }
      if (!cands.length) { aiOut.replaceChildren(h('p', { class: 'muted', text: 'Sem candidatos de vínculo — descreva mais o requisito.' })); return; }
      const r = await AI.post('/v1/authoring/suggest-links', { requirement: draft, candidates: cands });
      if (!r.ok) return showErr(r);
      const sg = r.data.suggestions || [];
      const card = h('div', { class: 'card' }, h('h3', { text: 'Vínculos sugeridos (proposed) — ' + (r.data.prompt_version || '') }));
      if (!sg.length) card.append(h('p', { class: 'empty', text: 'Nenhum vínculo relevante entre os candidatos.' }));
      else { const ul = h('ul', { class: 'linklist' }); sg.forEach((s) => ul.append(h('li', {}, badge(s.type, 'b'), ' ', h('button', { class: 'btn-link', type: 'button', onclick: () => openReq(s.target), text: s.target }), ' ', h('span', { class: 'muted', text: '(' + (s.confidence != null ? s.confidence : '?') + ') ' + (s.note || '') })))); card.append(ul); }
      aiOut.replaceChildren(card);
    });
  }
  AI.health().then((r) => {
    if (!r.ok) { status.textContent = 'reqhub-api indisponível — a IA é opcional (a validação de duplicatas funciona sem ela).'; return; }
    status.textContent = r.data && r.data.ai ? 'IA habilitada (gpt-5). Cole seu token de operador para rascunhar/analisar.' : 'IA desabilitada no servidor — a validação de duplicatas segue funcionando.';
  }).catch(() => { status.textContent = 'reqhub-api indisponível — a validação de duplicatas funciona sem ela.'; });

  const assistant = h('section', { class: 'editor-assistant' },
    h('div', { class: 'asst-head' }, h('span', { class: 'asst-spark', 'aria-hidden': 'true', text: '✨' }), h('h3', { text: 'Assistente de IA' })),
    status,
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Descreva o requisito (esboço)' }), sketch),
    h('div', { class: 'asst-actions' },
      h('button', { class: 'btn primary', type: 'button', text: '✨ Rascunhar com IA', onclick: doDraft }),
      h('button', { class: 'btn', type: 'button', text: 'Analisar lacunas', onclick: doAnalyze }),
      h('button', { class: 'btn', type: 'button', text: 'Classificar vínculos (IA)', onclick: doLinks })),
    aiOut,
    h('div', { class: 'asst-val' }, h('h4', { text: 'Validação automática' }), valOut),
    h('details', { class: 'asst-token' }, h('summary', { text: 'Token de operador (IA)' }),
      h('div', { class: 'ws-actions' }, tok, h('button', { class: 'btn-link', type: 'button', text: 'Salvar', onclick: () => { AI.setToken(tok.value.trim()); status.textContent = 'Token salvo neste navegador.'; } }))));

  const formCol = h('section', { class: 'editor-formcol' },
    h('h3', { text: 'Detalhes do requisito' }),
    form,
    h('div', { class: 'ws-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: gen, text: 'Gerar YAML' })),
    out);

  body.append(
    h('div', { class: 'editor-head' },
      h('div', {}, h('h2', { class: 'editor-title', text: ed ? `Editar ${ed.id}` : 'Novo requisito' }),
        h('p', { class: 'muted', text: 'O Assistente de IA redige; a validação verifica duplicatas e sugere vínculos automaticamente — mesmo sem acionar a IA. A UI não escreve no git: o commit é seu (PR). Após o merge, rode /sync-spec.' })),
      ed ? h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editId = null; renderEditor(); }, text: '+ novo (limpar)' }) : null),
    h('div', { class: 'editor-grid' }, assistant, formCol));

  runValidation();

  // Coleta o rascunho a partir do formulario (reusado por Gerar YAML e pela IA de analise).
  function collectDraft() {
    const lines = (f.acceptance.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const methods = (f.methods.value || '').split(',').map((x) => x.trim()).filter(Boolean);
    const srcPaths = (f.source_paths.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const d = {
      id: f.id.value.trim(), slug: f.id.value.trim().toLowerCase(), title: f.title.value.trim(),
      type: f.type.value, status: f.status.value, owner: f.owner.value.trim() || undefined,
      scope: { applies_to: f.applies_to.value, product_scope: (f.product.value || '').trim() },
      statement: f.statement.value.trim(), priority: f.priority.value, criticality: f.criticality.value,
      architectural_significance: f.asr.value === 'true',
      source: srcPaths.length ? { source_paths: srcPaths } : undefined,
      acceptance_criteria: lines.length ? lines : undefined,
      verification_method: methods.length ? methods : undefined,
      version: { baseline_version: f.bver.value.trim() || '1.0.0', item_revision: Number(f.irev.value) || 1, semantic_change: f.sem.value, change_reason: f.reason.value.trim() || undefined },
    };
    if (d.type === 'non-functional') {
      const q = { source: f.qs_source.value, stimulus: f.qs_stimulus.value, environment: f.qs_environment.value, artifact: f.qs_artifact.value, response: f.qs_response.value, response_measure: f.qs_measure.value };
      if (Object.values(q).some(Boolean)) d.quality_scenarios = [q];
    }
    return d;
  }

  // Aplica um rascunho gerado pela IA aos campos do formulario (mapeando o vocabulario).
  function applyDraftToForm(draft) {
    const d = draft || {};
    const setVal = (el, v) => { if (el && v != null && v !== '') el.value = String(v); };
    const setSel = (el, v) => { if (!el || v == null) return; const ok = Array.from(el.options).some((o) => o.value === v); if (ok) el.value = v; };
    setVal(f.title, d.title);
    setVal(f.statement, d.statement);
    const typeMap = { functional: 'functional', non_functional: 'non-functional', 'non-functional': 'non-functional', constraint: 'constraint', interface: 'functional' };
    setSel(f.type, typeMap[d.type] || 'functional');
    setSel(f.priority, d.priority);
    setSel(f.criticality, d.criticality);
    if (typeof d.architectural_significance === 'boolean') setSel(f.asr, String(d.architectural_significance));
    if (Array.isArray(d.acceptance_criteria)) f.acceptance.value = d.acceptance_criteria.join('\n');
    if (Array.isArray(d.verification_method)) f.methods.value = d.verification_method.join(', ');
    const q = (Array.isArray(d.quality_scenarios) && d.quality_scenarios[0]) || null;
    if (q) { setVal(f.qs_stimulus, q.stimulus); setVal(f.qs_response, q.response); setVal(f.qs_measure, q.measure || q.response_measure); }
  }

  function gen() {
    out.replaceChildren();
    const d = collectDraft();
    const errs = validateDraft(d);
    if (errs.length) { const ul = h('ul', { class: 'errlist' }); errs.forEach((e) => ul.append(h('li', { text: e }))); out.append(h('div', { class: 'card' }, h('h3', { text: 'Corrija antes de gerar' }), ul)); return; }
    const yaml = toYaml(d) + '\n';
    const filePath = `specs/requirements/${d.scope.product_scope}/${d.id}.yaml`;
    const newUrl = `https://github.com/${REPO}/new/main?filename=${encodeURIComponent(filePath)}&value=${encodeURIComponent(yaml)}`;
    const editUrl = `https://github.com/${REPO}/edit/main/${filePath}`;
    out.append(h('div', { class: 'card' },
      h('h3', { text: filePath }),
      h('pre', { class: 'yaml' }, yaml),
      h('div', { class: 'ws-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { if (navigator.clipboard) navigator.clipboard.writeText(yaml); }, text: 'Copiar YAML' }),
        h('a', { class: 'btn', href: ed ? editUrl : newUrl, target: '_blank', rel: 'noopener' }, ed ? 'Abrir no GitHub (editar → PR)' : 'Abrir no GitHub (novo → PR)')),
      h('p', { class: 'muted', text: 'O PR passa pelo gate specs-governance (schema/drift/versão). A baseline é regenerada por /sync-spec após o merge.' })));
  }

}

/* ---------- navegação / abas ---------- */
/* ===================== Forge — construir um produto a partir de requisitos =====================
   Hub de produtos → detalhe com breadcrumb + stepper (Definir → Arquitetura → Build).
   Lê dados estáticos (products/blueprints/build-plan/implementation-status); a IA (opcional,
   fail-closed) propõe requisitos. A UI NUNCA escreve no git — mostra o YAML e o caminho do PR. */
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
  state.forge.product = name; state.forge.newMode = false; state.forge.step = 'definir';
  switchView('forge'); document.getElementById('tab-forge').focus();
  if (name && DATA.buildPlans[name] === undefined) loadBuildPlan(name).then(() => { if (state.view === 'forge' && state.forge.product === name) renderForge(); });
}
function openForgeNew() { state.forge.product = null; state.forge.newMode = true; switchView('forge'); }
function backToHub() { state.forge.product = null; state.forge.newMode = false; renderForge(); }
function forgeStep(step) { state.forge.step = step; renderForge(); }

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
function setForgeTitle(suffix) { try { document.title = 'Forge' + (suffix ? ' — ' + suffix : '') + ' · Reqhub'; } catch { /* ignore */ } }
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

function renderForge() {
  const body = document.getElementById('forge-body');
  body.replaceChildren();
  if (!DATA.products || !((DATA.products.products) || []).length) {
    body.append(forgeIntroHead());
    body.append(h('p', { class: 'empty', text: 'Nenhum produto registrado ainda — gere um com o Forge (brief → requisitos → PR) ou rode build-products.mjs.' }));
    return;
  }
  if (state.forge.newMode) { setForgeTitle('Novo produto'); renderForgeNew(body); }
  else if (state.forge.product) { const p = findProduct(DATA.products, state.forge.product); setForgeTitle(p ? p.display_name : state.forge.product); renderForgeDetail(body, state.forge.product); }
  else { setForgeTitle('Produtos'); renderForgeHub(body); }
}
function forgeIntroHead() {
  return h('div', { class: 'forge-head' }, h('div', {},
    h('h2', { class: 'forge-title', text: 'Forge — construir um produto a partir de requisitos' }),
    h('p', { class: 'muted', text: 'Um conjunto de requisitos vira uma aplicação real no repositório (frontend + API + worker + banco + k8s), pela mesma esteira do SICAT e do GymOps. Cada requisito vira código rastreável.' })));
}

function renderForgeHub(body) {
  const summ = hubSummary(DATA.products, DATA.implStatus);
  const head = forgeIntroHead();
  head.querySelector('div').append(h('div', { class: 'forge-stats' },
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.products) }), ' produto(s)'),
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.totalReqs) }), ' requisitos'),
    h('span', { class: 'forge-stat' }, h('b', { text: String(summ.totalDone) }), ' no ar'),
    h('span', { class: 'forge-stat' }, h('b', { text: summ.pct + '%' }), ' concluído')));
  body.append(head);

  const all = productSummaries(DATA.products, DATA.implStatus);
  const cat = (p) => (p.progress.total > 0 && p.progress.pct === 100) ? 'live' : (p.progress.done > 0 || (p.progress.total - (p.progress.by.not_started || 0)) > 0) ? 'building' : 'new';
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
    const card = h('button', { class: 'forge-card', type: 'button', 'aria-label': `${p.display_name}: ${p.progress.done} de ${p.reqCount} requisitos no ar (${p.progress.pct}%)`, onclick: () => openForgeProduct(p.name) },
      h('div', { class: 'forge-card-top' }, h('span', { class: 'forge-card-name', text: p.display_name }), h('span', { class: 'forge-card-path', text: p.base_path })),
      p.blueprint ? h('span', { class: 'forge-card-bp', text: p.blueprint }) : null,
      h('p', { class: 'forge-card-vision', text: p.vision || 'Sem descrição.' }),
      h('div', { class: 'forge-card-foot' }, h('span', { class: 'muted', text: `${p.progress.done}/${p.reqCount} no ar` }), badge(live ? 'no ar' : (cat(p) === 'new' ? 'não iniciado' : 'em construção'), live ? 'b-ok' : (cat(p) === 'new' ? 'b-low' : 'b-high'))),
      progressBar(p.progress.pct));
    cards.append(card);
  }
  if (!shown.length) cards.append(h('p', { class: 'empty', text: 'Nenhum produto neste filtro.' }));
  cards.append(h('button', { class: 'forge-card forge-new', type: 'button', 'aria-label': 'Criar novo produto a partir de um brief', onclick: () => openForgeNew() },
    h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' }), h('strong', { text: 'Novo produto' }), h('span', { class: 'muted', text: 'brief → requisitos (IA) → PR' })));
  body.append(cards);
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
  const steps = phaseModel(product, buildPlan, DATA.implStatus);
  const cur = steps.find((s) => s.key === state.forge.step) || steps[0];
  const labels = { definir: 'Definir', arquitetura: 'Arquitetura', build: 'Build' };
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: product.display_name || name, onclick: null }, { label: labels[state.forge.step] }]));
  body.append(h('div', { class: 'forge-detail-head' }, h('h2', { text: product.display_name || name }),
    product.blueprint ? badge(product.blueprint, 'b-nfr') : null, badge(product.base_path, 'b-low')));

  // stepper de fases (clicável, com estados reais)
  const stepper = h('div', { class: 'forge-stepper', role: 'tablist', 'aria-label': 'Fases do Forge' });
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

  const panel = h('div', { class: 'forge-panel' + (state.forge.step !== 'definir' ? ' two' : '') });
  if (state.forge.step === 'definir') forgeDefinir(panel, product);
  else if (state.forge.step === 'arquitetura') forgeArquitetura(panel, product, buildPlan);
  else forgeBuild(panel, product, buildPlan);
  body.append(panel);
}

function productReqs(product) {
  const ids = new Set(product.requirement_ids || []);
  const reqs = (DATA.baseline.requirements || []).filter((r) => ids.has(r.id) || (r.scope && r.scope.product_scope === product.name));
  return reqs.sort((a, b) => a.id.localeCompare(b.id));
}

function forgeDefinir(panel, product) {
  const left = h('div', { class: 'forge-section' });
  left.append(h('h3', { text: 'Visão do produto' }), h('p', { class: 'forge-vision', text: product.vision || 'Sem descrição.' }));
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
  else { right.append(forgeDagLegend(), forgeDagSvg(buildPlan), h('p', { class: 'muted small', text: 'Cada nó é um requisito; as setas seguem a ordem de construção (waves). A cor reflete o status real.' })); }
  panel.append(right);
}

function forgeBuild(panel, product, buildPlan) {
  const reqIds = product.requirement_ids || [];
  const prog = (function () { let d = 0; for (const id of reqIds) { const it = DATA.implStatus && DATA.implStatus.items && DATA.implStatus.items[id]; if (it && DONE_ST.includes(it.status)) d++; } return { d, t: reqIds.length, pct: reqIds.length ? Math.round((d / reqIds.length) * 100) : 0 }; })();
  // esquerda: waves + tabela de requisitos
  const left = h('div', { class: 'forge-section' });
  left.append(h('h3', { text: `Progresso — ${prog.d}/${prog.t} no ar` }), progressBar(prog.pct));
  if (buildPlan) {
    const waves = waveProgress(buildPlan, DATA.implStatus);
    const stateLabel = { done: 'concluída', active: 'em andamento', ready: 'pronta', blocked: 'bloqueada' };
    const list = h('div', { class: 'forge-waves', role: 'list', 'aria-label': `Ondas de construção (${waves.length})` });
    for (const w of waves) {
      const row = h('div', { class: 'forge-wave s-' + w.state, role: 'listitem', 'aria-label': `Wave ${w.id}: ${stateLabel[w.state] || w.state} — ${w.done} de ${w.total} no ar` },
        h('span', { class: 'forge-wave-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'forge-wave-id', text: w.id }),
        h('span', { class: 'forge-wave-reqs' }, ...w.reqs.map((r) => badge(r.id.replace('REQ-' + product.name.toUpperCase() + '-', '#'), forgeStatusCls(r.status)))),
        h('span', { class: 'forge-wave-n', 'aria-hidden': 'true', text: `${w.done}/${w.total}` }));
      list.append(row);
    }
    left.append(h('h3', { text: 'Waves' }), list);
  }
  panel.append(left);

  // direita: tabela requisito → status → PR → deploy
  const right = h('div', { class: 'forge-section' });
  right.append(h('h3', { text: 'Requisitos → código' }));
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: 'Título' }), h('th', { text: 'Status' }), h('th', { text: 'PR' }))));
  const tb = h('tbody');
  for (const id of reqIds) {
    const row = reqRow(id, DATA.baseline, DATA.implStatus);
    tb.append(h('tr', { tabindex: '0', role: 'button', onclick: () => openReq(id), onkeydown: (ev) => { if (ev.key === 'Enter') openReq(id); } },
      h('td', {}, h('span', { class: 'rid', text: id })),
      h('td', { text: truncateLabel(row.title, 60) }),
      h('td', {}, badge(row.status, forgeStatusCls(row.status))),
      h('td', {}, row.pr ? h('a', { class: 'btn-link', href: row.pr, target: '_blank', rel: 'noopener', text: 'PR' }) : h('span', { class: 'empty', text: '—' }))));
  }
  const gw = h('div', { class: 'grid-wrap' }); t.append(tb); gw.append(t); right.append(gw);
  panel.append(right);
}

function forgeDagSvg(buildPlan) {
  const dag = buildDag(buildPlan, DATA.implStatus);
  if (!dag.nodes.length) return h('p', { class: 'empty', text: 'Sem waves para desenhar.' });
  const W = 1000, H = 560;
  const nodes = dag.nodes.map((n) => ({ ...n, product: 'w' + n.wave }));
  const laid = forceLayout(nodes, dag.edges, { width: W, height: H, iterations: 320, minDistX: 165, minDistY: 76 });
  const by = {}; for (const n of laid.nodes) by[n.id] = n;
  const wrap = h('div', { class: 'forge-dag' });
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Grafo de dependências do build por waves' });
  for (const e of dag.edges) {
    const a = by[e.from], b = by[e.to]; if (!a || !b) continue;
    const done = DONE_ST.includes(a.status) && DONE_ST.includes(b.status);
    s.append(svg('line', { class: 'forge-dedge' + (done ? ' done' : ''), x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
  }
  const stLbl = { done: 'concluído', active: 'em andamento', blocked: 'bloqueado', todo: 'não iniciado' };
  for (const n of laid.nodes) {
    const g = svg('g', { class: 'forge-dnode s-' + dStateCls(n.status), transform: `translate(${n.x},${n.y})`, role: 'listitem' });
    const ttl = svg('title'); ttl.append(document.createTextNode(`${n.id} — wave ${n.wave + 1} — ${stLbl[dStateCls(n.status)]}`)); g.append(ttl);
    g.append(svg('rect', { class: 'chip', x: '-66', y: '-15', width: '132', height: '30', rx: '8' }));
    g.append(svgText({ class: 'dlbl', x: '0', y: '4', 'text-anchor': 'middle', 'aria-hidden': 'true' }, n.id.replace(/^REQ-/, '')));
    s.append(g);
  }
  wrap.append(s);
  return wrap;
}
function forgeDagLegend() {
  const items = [['s-done', 'Pronto'], ['s-active', 'Em andamento'], ['s-blocked', 'Bloqueado'], ['s-todo', 'Não iniciado']];
  const leg = h('div', { class: 'forge-dag-legend', 'aria-hidden': 'true' });
  for (const [cls, label] of items) leg.append(h('span', {}, h('span', { class: 'legend-dot ' + cls }), label));
  return leg;
}

/* ---- Novo produto: brief → requisitos (IA, fail-closed) → YAML + caminho de PR ---- */
function renderForgeNew(body) {
  body.append(forgeCrumbs([{ label: 'Produtos', onclick: backToHub }, { label: 'Novo produto' }]));
  body.append(h('div', { class: 'forge-detail-head' }, h('h2', { text: 'Novo produto' })));
  body.append(h('p', { class: 'muted', text: 'Descreva o produto; a IA propõe um conjunto inicial de requisitos. Você revisa, ajusta e abre o PR — a UI não escreve no git.' }));

  const grid = h('div', { class: 'forge-panel two' });
  // esquerda — formulário
  const left = h('div', { class: 'forge-section' });
  const name = h('input', { type: 'text', placeholder: 'ex.: helpdesk', 'aria-label': 'Nome do produto (slug)' });
  const bpsel = h('select', { 'aria-label': 'Blueprint' });
  for (const b of (DATA.blueprints && DATA.blueprints.blueprints) || []) bpsel.append(h('option', { value: b.id, text: b.name }));
  if (!bpsel.children.length) bpsel.append(h('option', { value: '', text: '(sem blueprints)' }));
  const brief = h('textarea', { class: 'ai-sketch', rows: '6', 'aria-label': 'Brief', placeholder: 'Ex.: um helpdesk simples — abrir chamados, atribuir a agentes, acompanhar status num quadro, e um painel com SLAs. Sem complexidade.' });
  const tok = h('input', { type: 'password', value: AI.getToken(), placeholder: 'Bearer token (operador)' });
  const status = h('p', { class: 'muted ai-status' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), 'Verificando IA…');
  const btn = h('button', { class: 'btn primary', type: 'button', text: '✨ Propor requisitos (IA)' });
  left.append(
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Produto (slug)' }), name),
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Blueprint' }), bpsel),
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Brief' }), brief),
    status, h('div', { class: 'ws-actions' }, btn),
    h('details', { class: 'asst-token' }, h('summary', { text: 'Token do operador' }), tok));
  grid.append(left);

  // direita — saída (região viva: anuncia a proposta para leitores de tela)
  const out = h('div', { class: 'forge-section', role: 'region', 'aria-live': 'polite', 'aria-label': 'Proposta de requisitos' });
  out.append(h('h3', { text: 'Proposta' }), h('p', { class: 'muted', text: 'Os requisitos propostos aparecem aqui, com checagem de duplicata contra a base.' }));
  grid.append(out);
  body.append(grid);

  tok.addEventListener('change', () => AI.setToken(tok.value.trim()));
  const setStatusText = (t) => status.replaceChildren(document.createTextNode(t));
  AI.health().then((r) => setStatusText(r.ok ? 'IA pronta (gpt-5).' : 'IA indisponível (' + (r.data && r.data.error ? r.data.error.code : r.status) + ') — você ainda pode criar requisitos manualmente via PR.'))
    .catch(() => setStatusText('IA indisponível (sem servidor) — crie requisitos manualmente via PR.'));

  const errCard = (title, msg) => out.replaceChildren(h('h3', { text: 'Proposta' }), h('div', { class: 'card' }, h('h4', {}, badge('erro', 'b-crit'), ' ' + title), msg ? h('p', { class: 'muted', text: msg }) : null));
  btn.addEventListener('click', async () => {
    AI.setToken(tok.value.trim());
    const pname = (name.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!pname) { errCard('Informe o slug do produto.'); name.focus(); return; }
    if ((brief.value || '').trim().length < 10) { errCard('Descreva o produto no brief (mínimo ~10 caracteres).'); brief.focus(); return; }
    btn.disabled = true;
    out.replaceChildren(h('h3', { text: 'Proposta' }), h('p', { class: 'muted' }, h('span', { class: 'forge-spin', 'aria-hidden': 'true' }), 'Consultando a IA…'));
    try {
      const r = await AI.post('/v1/forge/propose-requirements', { product: pname, blueprint: bpsel.value, brief: (brief.value || '').trim() });
      if (!r.ok) { const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status; const msg = r.data && r.data.error ? r.data.error.message : ''; errCard('IA: ' + code, msg); return; }
      renderProposal(out, pname, bpsel.value, r.data);
    } catch (e) { errCard('Erro de rede ao chamar a IA', e && e.message ? e.message : String(e)); }
    finally { btn.disabled = false; }
  });
}

function renderProposal(out, pname, blueprint, data) {
  const reqs = (data && data.requirements) || [];
  const head = h('h3', { tabindex: '-1', text: `Proposta — ${reqs.length} requisito(s) (${data.prompt_version || 'ia'})` });
  out.replaceChildren(head);
  if (!reqs.length) { out.append(h('p', { class: 'empty', text: 'A IA não retornou requisitos.' })); head.focus(); return; }
  const existingIds = ((DATA.baseline && DATA.baseline.requirements) || []).map((r) => r.id);
  let n = 0;
  const yamls = [];
  const ul = h('ul', { class: 'forge-reqlist' });
  for (const req of reqs) {
    const id = req.id || nextReqId(pname, existingIds.concat(yamls.map((y) => y.id)));
    yamls.push({ id, req });
    const sims = findSimilarReqs({ id, title: req.title || '', statement: req.statement || '' }, (DATA.baseline && DATA.baseline.requirements) || [], 1);
    const dup = sims[0] && sims[0].score >= 0.45 ? sims[0] : null;
    ul.append(h('li', { class: 'forge-reqitem forge-proposed' },
      h('span', { class: 'rid', text: id }),
      h('span', { class: 'rt', text: truncateLabel(req.title || '(sem título)', 64) }),
      dup
        ? h('span', { class: 'forge-dup' }, badge('possível duplicata', 'b-crit'), h('button', { class: 'btn-link', type: 'button', onclick: () => openReq(dup.id), text: `${dup.id} · ${Math.round(dup.score * 100)}%` }))
        : badge(typeLabel(req.type), 'b-fn')));
    n++;
  }
  out.append(ul);
  if (data.notes) out.append(h('p', { class: 'muted small', text: data.notes }));
  // YAMLs + caminho do PR (com botão copiar). A UI nunca escreve no git.
  const yamlText = yamls.map(({ id, req }) => toYaml(forgeReqObject(id, pname, blueprint, req))).join('\n---\n');
  out.append(h('h4', { text: 'YAML dos requisitos' }), codeBlock(yamlText, 'yaml', 'YAML'));
  out.append(h('div', { class: 'forge-note' }, h('strong', { text: 'Próximo passo (operador): ' }), 'salve cada requisito em ', h('code', { text: 'specs/requirements/' + pname + '/<ID>.yaml' }), ' e abra o PR.'),
    codeBlock(proposeHint(pname, n), 'forge-cmd', 'comando'));
  head.focus();
}

function forgeReqObject(id, pname, blueprint, req) {
  return {
    id,
    title: req.title || '',
    type: req.type || 'functional',
    status: 'proposed',
    owner: 'plataforma-digital',
    priority: req.priority || 'medium',
    statement: req.statement || '',
    scope: { applies_to: 'product', product_scope: pname, blueprint: blueprint || null },
    source: { source_paths: ['specs/products/' + pname + '/product-brief.md'] },
    acceptance_criteria: asList(req.acceptance_criteria),
    verification_method: asList(req.verification_method).length ? asList(req.verification_method) : ['test'],
    version: { baseline_version: '1.0.0', item_revision: 1, semantic_change: 'none', change_reason: 'proposto pelo Forge' },
  };
}

/* ===================== Ícones (SVG inline, stroke, CSP-safe) ===================== */
const ICONS = {
  brand: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: '3.4' }]],
  overview: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
  explorer: [['line', { x1: 8, y1: 6, x2: 21, y2: 6 }], ['line', { x1: 8, y1: 12, x2: 21, y2: 12 }], ['line', { x1: 8, y1: 18, x2: 21, y2: 18 }], ['line', { x1: 3, y1: 6, x2: '3.01', y2: 6 }], ['line', { x1: 3, y1: 12, x2: '3.01', y2: 12 }], ['line', { x1: 3, y1: 18, x2: '3.01', y2: 18 }]],
  workspace: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['polyline', { points: '14 2 14 8 20 8' }]],
  editor: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' }]],
  impact: [['circle', { cx: 18, cy: 5, r: 3 }], ['circle', { cx: 6, cy: 12, r: 3 }], ['circle', { cx: 18, cy: 19, r: 3 }], ['line', { x1: '8.6', y1: '10.5', x2: '15.4', y2: '6.5' }], ['line', { x1: '8.6', y1: '13.5', x2: '15.4', y2: '17.5' }]],
  coverage: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }], ['path', { d: 'M9 12l2 2 4-4' }]],
  versions: [['line', { x1: 6, y1: 3, x2: 6, y2: 15 }], ['circle', { cx: 18, cy: 6, r: 3 }], ['circle', { cx: 6, cy: 18, r: 3 }], ['path', { d: 'M18 9a9 9 0 0 1-9 9' }]],
  dev: [['path', { d: 'M22 12h-4l-3 9L9 3l-3 9H2' }]],
  forge: [['path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' }], ['path', { d: 'M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8L16.5 17.5l1.8-.7z' }]],
  reprocess: [['path', { d: 'M21 2v6h-6' }], ['path', { d: 'M3 12a9 9 0 0 1 15-6.7L21 8' }], ['path', { d: 'M3 22v-6h6' }], ['path', { d: 'M21 12a9 9 0 0 1-15 6.7L3 16' }]],
  search: [['circle', { cx: 11, cy: 11, r: 8 }], ['line', { x1: 21, y1: 21, x2: '16.65', y2: '16.65' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['polyline', { points: '16 17 21 12 16 7' }], ['line', { x1: 21, y1: 12, x2: 9, y2: 12 }]],
  menu: [['line', { x1: 3, y1: 6, x2: 21, y2: 6 }], ['line', { x1: 3, y1: 12, x2: 21, y2: 12 }], ['line', { x1: 3, y1: 18, x2: 21, y2: 18 }]],
  theme: [['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z' }]],
  expand: [['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3' }], ['path', { d: 'M21 8V5a2 2 0 0 0-2-2h-3' }], ['path', { d: 'M3 16v3a2 2 0 0 0 2 2h3' }], ['path', { d: 'M16 21h3a2 2 0 0 0 2-2v-3' }]],
  minimize: [['path', { d: 'M8 3v3a2 2 0 0 1-2 2H3' }], ['path', { d: 'M21 8h-3a2 2 0 0 1-2-2V3' }], ['path', { d: 'M3 16h3a2 2 0 0 1 2 2v3' }], ['path', { d: 'M16 21v-3a2 2 0 0 1 2-2h3' }]],
  collapse: [['polyline', { points: '11 17 6 12 11 7' }], ['polyline', { points: '18 17 13 12 18 7' }]],
  products: [['path', { d: 'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }], ['polyline', { points: '3.3 7 12 12 20.7 7' }], ['line', { x1: 12, y1: 22, x2: 12, y2: 12 }]],
  layers: [['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }], ['polyline', { points: '2 17 12 22 22 17' }], ['polyline', { points: '2 12 12 17 22 12' }]],
  rocket: [['path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' }], ['path', { d: 'M12 15l-3-3a22 22 0 0 1 8-10c2 0 3 0 4 1s1 2 1 4a22 22 0 0 1-10 8z' }], ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' }], ['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }]],
};
function icon(name, size) {
  const s = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
  for (const [tag, attrs] of (ICONS[name] || [])) s.append(svg(tag, attrs));
  return s;
}
// barra de progresso fina (SVG — largura por atributo, cor por classe; CSP-safe)
function miniBar(pct, cls) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const s = svg('svg', { class: 'mini-bar', viewBox: '0 0 100 8', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  s.append(svg('rect', { class: 't', x: '0', y: '0', width: '100', height: '8', rx: '4' }));
  s.append(svg('rect', { class: 'f' + (cls ? ' ' + cls : ''), x: '0', y: '0', width: String(p), height: '8', rx: '4' }));
  return s;
}

const VIEW_META = {
  overview: { title: 'Visão geral', sub: 'Panorama da base de requisitos' },
  explorer: { title: 'Explorador', sub: 'Navegue e filtre todos os requisitos' },
  workspace: { title: 'Workspace', sub: 'Detalhe do requisito selecionado' },
  versions: { title: 'Versões & mudanças', sub: 'Histórico e classificação semântica' },
  impact: { title: 'Mapa de impacto', sub: 'Grafo de dependências entre requisitos' },
  coverage: { title: 'Cobertura', sub: 'Requisitos × evidência e alocação' },
  reprocess: { title: 'Fila de reprocessamento', sub: 'O que revisar após mudanças na baseline' },
  dev: { title: 'Desenvolvimento', sub: 'Status de entrega por requisito (REQ → PR → deploy)' },
  editor: { title: 'Editor', sub: 'Autoria assistida por IA → PR no git' },
  forge: { title: 'Forge', sub: 'Construir um produto completo a partir de requisitos' },
};

const RENDER = { overview: renderOverview, explorer: renderExplorer, workspace: renderWorkspace, versions: renderVersions, impact: renderImpact, coverage: renderCoverage, reprocess: renderReprocess, dev: renderDev, editor: renderEditor, forge: renderForge };
function switchView(view) {
  state.view = view;
  for (const it of document.querySelectorAll('.nav-item')) {
    const sel = it.dataset.view === view;
    it.classList.toggle('is-active', sel);
    if (sel) it.setAttribute('aria-current', 'page'); else it.removeAttribute('aria-current');
    it.tabIndex = sel ? 0 : -1;
  }
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + view;
  const meta = VIEW_META[view] || { title: 'Reqhub', sub: '' };
  const t = document.getElementById('page-title'); if (t) t.textContent = meta.title;
  const sub = document.getElementById('page-sub'); if (sub) sub.textContent = meta.sub;
  const app = document.getElementById('app'); if (app) app.classList.remove('is-open');
  const scrim = document.getElementById('sidebar-scrim'); if (scrim) scrim.hidden = true;
  RENDER[view]();
}
function openReq(id) { state.selectedId = id; RECENTS.push(id); switchView('workspace'); const t = document.getElementById('tab-workspace'); if (t) t.focus(); }

/* ===================== Visão geral (Overview — front-door do produto) ===================== */
function renderOverview() {
  const body = document.getElementById('overview-body');
  body.replaceChildren();
  const reqs = (DATA.baseline && DATA.baseline.requirements) || [];
  const c = (DATA.baseline && DATA.baseline.counts) || { total: reqs.length, by_product: {} };
  const prods = productSummaries(DATA.products || {}, DATA.implStatus);
  const implItems = (DATA.implStatus && DATA.implStatus.items) || {};
  const implVals = Object.values(implItems);
  const deployed = implVals.filter((x) => x && ['deployed', 'done', 'merged'].includes(x.status)).length;
  const implPct = implVals.length ? Math.round((deployed / implVals.length) * 100) : 0;
  const asr = reqs.filter((r) => r && r.architectural_significance).length;

  body.append(h('div', { class: 'ov-hero' },
    h('h2', { text: 'Base de requisitos' }),
    h('p', { text: 'A intenção da plataforma vive aqui como fonte da verdade — versionada em specs/. Explore os requisitos, analise impacto e cobertura, acompanhe a entrega e construa produtos novos a partir deles.' })));

  const metric = (ic, val, label) => h('div', { class: 'ov-metric' }, h('span', { class: 'm-ic' }, icon(ic)), h('div', { class: 'm-v', text: String(val) }), h('div', { class: 'm-l', text: label }));
  body.append(h('div', { class: 'ov-metrics' },
    metric('layers', c.total, 'requisitos'),
    metric('products', prods.length, 'produtos'),
    metric('rocket', implPct + '%', 'no ar (entrega)'),
    metric('impact', asr, 'ASR (arquiteturais)')));

  // coluna esquerda: entrega por produto
  const left = h('div', { class: 'ov-card' }, h('h3', {}, 'Entrega por produto', h('button', { class: 'btn-link', type: 'button', onclick: () => switchView('forge'), text: 'Abrir Forge →' })));
  if (!prods.length) left.append(h('p', { class: 'empty', text: 'Nenhum produto registrado ainda.' }));
  else {
    const pl = h('div', { class: 'ov-prodlist' });
    for (const p of prods) pl.append(h('button', { class: 'ov-prodrow', type: 'button', 'aria-label': `${p.display_name}: ${p.progress.done} de ${p.reqCount} no ar`, onclick: () => openForgeProduct(p.name) },
      h('span', { class: 'pn', text: p.display_name }), miniBar(p.progress.pct, p.progress.pct === 100 ? 'ok' : ''), h('span', { class: 'pp', text: `${p.progress.done}/${p.reqCount}` })));
    left.append(pl);
  }

  // coluna direita: distribuição por status + atalhos
  const right = h('div', { class: 'ov-col' });
  const st = DATA.implStatus;
  const byStatus = (st && st.counts && st.counts.by_status) || (() => { const m = {}; for (const v of implVals) { const k = (v && v.status) || 'not_started'; m[k] = (m[k] || 0) + 1; } return m; })();
  const totalImpl = Object.values(byStatus).reduce((a, b) => a + b, 0) || 1;
  const statusOrder = ['deployed', 'done', 'merged', 'pr_open', 'in_progress', 'blocked', 'not_started'];
  const statusLbl = { deployed: 'No ar', done: 'Concluído', merged: 'Mesclado', pr_open: 'PR aberto', in_progress: 'Em progresso', blocked: 'Bloqueado', not_started: 'Não iniciado' };
  const stCard = h('div', { class: 'ov-card' }, h('h3', {}, 'Distribuição por status', h('button', { class: 'btn-link', type: 'button', onclick: () => switchView('dev'), text: 'Desenvolvimento →' })));
  const bars = h('div', { class: 'ov-bars' });
  for (const s of statusOrder) {
    const n = byStatus[s] || 0; if (!n) continue;
    bars.append(h('div', { class: 'ov-statbar' }, h('span', { class: 'sl' }, badge(statusLbl[s] || s, devStatusCls(s))), miniBar((n / totalImpl) * 100, ['deployed', 'done', 'merged'].includes(s) ? 'ok' : s === 'blocked' ? 'danger' : ['pr_open', 'in_progress'].includes(s) ? 'warn' : ''), h('span', { class: 'sn', text: String(n) })));
  }
  if (!bars.children.length) bars.append(h('p', { class: 'empty', text: 'Sem dados de desenvolvimento.' }));
  stCard.append(bars);

  const quick = h('div', { class: 'ov-card' }, h('h3', {}, 'Atalhos'));
  const qgrid = h('div', { class: 'ov-quick' });
  const qb = (ic, label, view) => h('button', { class: 'ov-qbtn', type: 'button', onclick: () => switchView(view) }, icon(ic), label);
  qgrid.append(qb('explorer', 'Explorar requisitos', 'explorer'), qb('impact', 'Mapa de impacto', 'impact'), qb('forge', 'Construir produto', 'forge'), qb('editor', 'Novo requisito', 'editor'));
  quick.append(qgrid);
  right.append(stCard, h('div', { style: null }), quick);

  const grid = h('div', { class: 'ov-grid' }, left, right);
  // espaçamento entre os dois cards da direita
  right.style && (right.style.display = 'grid');
  body.append(grid);
}

function wireNav() {
  const items = [...document.querySelectorAll('.nav-item')];
  items.forEach((it, i) => {
    it.addEventListener('click', () => switchView(it.dataset.view));
    it.addEventListener('keydown', (ev) => {
      let j = null;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') j = (i + 1) % items.length;
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') j = (i - 1 + items.length) % items.length;
      else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = items.length - 1;
      if (j != null) { ev.preventDefault(); items[j].focus(); }
    });
  });
}
function wireIcons() {
  const bl = document.getElementById('brand-logo'); if (bl) bl.append(icon('brand'));
  for (const it of document.querySelectorAll('.nav-item[data-icon]')) it.prepend(icon(it.dataset.icon));
  const si = document.querySelector('.search-ic'); if (si) si.append(icon('search', 15));
  const st = document.getElementById('sidebar-toggle'); if (st) st.append(icon('menu'));
  const sc = document.getElementById('sidebar-collapse'); if (sc) sc.prepend(icon('collapse'));
}
function wireSidebar() {
  const app = document.getElementById('app');
  const scrim = document.getElementById('sidebar-scrim');
  if (localStorage.getItem('reqhub-sidebar') === 'collapsed') app.classList.add('is-collapsed');
  const collapse = document.getElementById('sidebar-collapse');
  if (collapse) collapse.addEventListener('click', () => {
    app.classList.toggle('is-collapsed');
    localStorage.setItem('reqhub-sidebar', app.classList.contains('is-collapsed') ? 'collapsed' : 'open');
  });
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = app.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (scrim) scrim.hidden = !open;
  });
  if (scrim) scrim.addEventListener('click', () => { app.classList.remove('is-open'); scrim.hidden = true; if (toggle) toggle.setAttribute('aria-expanded', 'false'); });
}
function wireTheme() {
  const btn = document.getElementById('theme');
  btn.replaceChildren(icon('theme'));
  const label = (t) => `Tema: ${t === 'dark' ? 'escuro' : t === 'light' ? 'claro' : 'automático'} (clique para alternar)`;
  const sync = () => { const t = document.documentElement.dataset.theme || ''; btn.setAttribute('aria-label', label(t)); btn.setAttribute('title', label(t)); };
  const saved = localStorage.getItem('reqhub-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  sync();
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    localStorage.setItem('reqhub-theme', next);
    sync();
  });
}
function wireSearch() {
  document.getElementById('q').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    if (['explorer', 'versions', 'coverage'].includes(state.view)) RENDER[state.view]();
  });
}
// Modo tela cheia (Fullscreen API) — vale para todas as telas do workbench.
function wireFullscreen() {
  const btn = document.getElementById('fullscreen');
  if (!btn) return;
  const sync = () => {
    const on = !!document.fullscreenElement;
    btn.replaceChildren(icon(on ? 'minimize' : 'expand'));
    const lbl = on ? 'Sair da tela cheia' : 'Entrar em tela cheia';
    btn.setAttribute('aria-label', lbl); btn.setAttribute('title', lbl);
  };
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); }
  });
  document.addEventListener('fullscreenchange', sync);
  sync();
}
// Menu do usuário (identidade SSO da borda — oauth2-proxy). Sem sessão (ex.: preview local) some.
async function wireUserMenu() {
  let me = null;
  try { const r = await fetch(AI.BASE + '/v1/me'); if (r.ok) me = await r.json(); } catch { /* sem SSO */ }
  const wrap = document.getElementById('usermenu');
  if (!wrap || !me || !me.email) return;
  state.me = me;
  const initial = (me.email.trim()[0] || '?').toUpperCase();
  const role = me.isAdmin ? 'platform-admin' : (me.groups && me.groups.length ? me.groups.join(', ') : 'sessão autenticada');
  const btn = h('button', { class: 'usermenu__btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu do usuário (' + me.email + ')' },
    h('span', { class: 'usermenu__avatar', text: initial }), h('span', { class: 'usermenu__email', text: me.email }));
  const pop = h('div', { class: 'usermenu__pop', role: 'menu', hidden: 'hidden' },
    h('div', { class: 'usermenu__head' }, h('span', { class: 'usermenu__avatar usermenu__avatar--lg', text: initial }),
      h('div', {}, h('div', { class: 'usermenu__email-full', text: me.email }), h('div', { class: 'usermenu__role', text: role }))),
    h('a', { class: 'usermenu__item', href: '/oauth2/sign_out', role: 'menuitem', 'aria-label': 'Sair — você será desconectado' }, icon('logout', 15), ' Sair'));
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); const open = pop.hidden; pop.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wrap.replaceChildren(btn, pop);
  wrap.hidden = false;
}

async function init() {
  document.documentElement.classList.remove('no-js');
  wireIcons(); wireNav(); wireSidebar(); wireTheme(); wireSearch(); wireFullscreen();
  wireUserMenu();
  try {
    const [b, im, rt] = await Promise.all([
      fetch('data/current-baseline.json').then((r) => { if (!r.ok) throw new Error('baseline ' + r.status); return r.json(); }),
      fetch('data/impact-map.json').then((r) => r.json()),
      fetch('data/retrieval-manifest.json').then((r) => r.json()),
    ]);
    DATA.baseline = b; DATA.impact = im; DATA.retrieval = rt;
    // opcionais (toleram ausência): diff de baseline, registry de artefatos, embeddings.
    const opt = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    [DATA.history, DATA.registry, DATA.embeddings, DATA.implStatus, DATA.coverage, DATA.products, DATA.blueprints] = await Promise.all([opt('data/history.json'), opt('data/registry.json'), opt('data/embeddings.json'), opt('data/implementation-status.json'), opt('data/coverage-report.json'), opt('data/products.json'), opt('data/blueprints.json')]);
  } catch (err) {
    setStatus('Falha ao carregar a base de requisitos: ' + err.message, true);
    return;
  }
  setStatus('');
  const c = DATA.baseline.counts;
  document.getElementById('foot-meta').textContent = `${c.total} requisitos · metamodelo ${DATA.baseline.metamodel_version || '?'} · hash ${String(DATA.baseline.baseline_hash).slice(0, 12)}`;
  buildExplorerFilters();
  switchView('overview');
}
init();
