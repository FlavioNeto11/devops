// Reqhub — camada de DOM/init. Lê a baseline gerada e renderiza as 6 telas.
// Funções puras vêm de lib.js; aqui só DOM (createElement + textContent, sem innerHTML).
import { filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, matchesQuery } from './lib.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const state = { view: 'explorer', filters: {}, q: '', selectedId: null, impactFilter: { type: '', product: '', focus: false } };
const DATA = { baseline: null, impact: null, retrieval: null };

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
function prioCls(p) { return p === 'critical' ? 'b-crit' : p === 'high' ? 'b-high' : p === 'low' ? 'b-low' : 'b-med'; }
function bandCls(b) { return b === 'high' ? 'b-high' : b === 'medium' ? 'b-med' : 'b-low'; }
function setStatus(msg, err) { const s = document.getElementById('status'); s.textContent = msg || ''; s.hidden = !msg; s.className = 'status' + (err ? ' error' : ''); }

/* ---------- Explorer ---------- */
function renderExplorer() {
  const reqs = filterReqs(DATA.baseline.requirements, { ...state.filters, q: state.q });
  const grid = document.getElementById('explorer-grid');
  grid.replaceChildren();
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
  wrap.append(h('label', {}, 'ASR', asr), h('span', { class: 'count', id: 'explorer-count' }));
}

/* ---------- Workspace ---------- */
function renderWorkspace() {
  const body = document.getElementById('workspace-body');
  body.replaceChildren();
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
  body.append(h('p', { class: 'muted', text: 'Estado de versão de cada requisito (ledger). O diff completo entre baselines é gerado pelo CI (specs-diff) e pela skill /baseline-diff sobre o histórico do git.' }));
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

/* ---------- Mapa de impacto (SVG) ---------- */
function renderImpact() {
  const wrap = document.getElementById('impact-filters');
  wrap.replaceChildren();
  const types = uniqueValues(DATA.impact.edges, (e) => e.type);
  const prods = uniqueValues(DATA.impact.nodes, (n) => n.product);
  const tSel = h('select', { 'aria-label': 'Tipo de link', onchange: (e) => { state.impactFilter.type = e.target.value; drawImpact(); } }, h('option', { value: '', text: 'Tipo de link (todos)' }));
  types.forEach((t) => tSel.append(h('option', { value: t, text: t })));
  const pSel = h('select', { 'aria-label': 'Produto', onchange: (e) => { state.impactFilter.product = e.target.value; drawImpact(); } }, h('option', { value: '', text: 'Produto (todos)' }));
  prods.forEach((p) => pSel.append(h('option', { value: p, text: p })));
  const focus = h('label', {}, 'Focar no selecionado',
    h('input', { type: 'checkbox', onchange: (e) => { state.impactFilter.focus = e.target.checked; drawImpact(); } }));
  wrap.append(h('label', {}, 'Link', tSel), h('label', {}, 'Produto', pSel), focus,
    h('span', { class: 'count', id: 'impact-count' }));
  drawImpact();
}
function drawImpact() {
  const canvas = document.getElementById('impact-canvas');
  canvas.replaceChildren();
  let nodes = DATA.impact.nodes;
  let edges = DATA.impact.edges;
  const f = state.impactFilter;
  if (f.product) { nodes = nodes.filter((n) => n.product === f.product); const keep = new Set(nodes.map((n) => n.id)); edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to)); }
  if (f.type) edges = edges.filter((e) => e.type === f.type);
  const layout = graphLayout(nodes, edges, f.focus && state.selectedId ? state.selectedId : null);
  document.getElementById('impact-count').textContent = `${layout.nodes.length} nós · ${layout.edges.length} arestas`;
  const s = svg('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height, role: 'img', 'aria-label': 'Grafo de impacto entre requisitos' });
  // colunas (rótulos)
  for (const c of layout.columns) s.append(Object.assign(svg('text', { x: layout.colX[c] + 4, y: 24, class: 'colhead' }), { textContent: c }));
  const pos = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  for (const e of layout.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const path = svg('path', { class: 'edge' + (e.proposed ? ' proposed' : ''), d: `M ${a.x + 150} ${a.y + 12} C ${a.x + 220} ${a.y + 12}, ${b.x - 30} ${b.y + 12}, ${b.x} ${b.y + 12}` });
    s.append(path);
  }
  for (const n of layout.nodes) {
    const g = svg('g', { class: 'node' + (n.asr ? ' asr' : ''), tabindex: '0', role: 'button', 'aria-label': n.id });
    g.append(svg('rect', { x: n.x, y: n.y, width: 150, height: 24, rx: 5 }));
    const tx = svg('text', { x: n.x + 8, y: n.y + 16 }); tx.textContent = n.id; g.append(tx);
    g.addEventListener('click', () => openReq(n.id));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openReq(n.id); });
    s.append(g);
  }
  canvas.append(s);
}

/* ---------- Cobertura ---------- */
function renderCoverage() {
  const body = document.getElementById('coverage-body');
  body.replaceChildren();
  body.append(h('p', { class: 'muted', text: 'Matriz requisito × evidência/alocação. Verde = preenchido; vermelho = lacuna. Links a artefatos externos (ADR/serviço/infra/SLO) e evidências são autorados na iteração (Fase 2+).' }));
  const cols = [['acceptance', 'Aceite'], ['method', 'Método'], ['evidence', 'Evidência'], ['adr', 'ADR'], ['service', 'Serviço'], ['infra', 'Infra'], ['slo', 'SLO']];
  const reqs = filterReqs(DATA.baseline.requirements, { ...state.filters, q: state.q }).slice().sort((a, b) => coverageScore(a) - coverageScore(b));
  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table', { class: 'matrix' });
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

/* ---------- navegação / abas ---------- */
const RENDER = { explorer: renderExplorer, workspace: renderWorkspace, versions: renderVersions, impact: renderImpact, coverage: renderCoverage, reprocess: renderReprocess };
function switchView(view) {
  state.view = view;
  for (const tab of document.querySelectorAll('.tab')) {
    const sel = tab.dataset.view === view;
    tab.setAttribute('aria-selected', sel ? 'true' : 'false');
    tab.tabIndex = sel ? 0 : -1;
  }
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + view;
  RENDER[view]();
}
function openReq(id) { state.selectedId = id; switchView('workspace'); document.getElementById('tab-workspace').focus(); }

function wireTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
    tab.addEventListener('keydown', (ev) => {
      let j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (j != null) { ev.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view); }
    });
  });
}
function wireTheme() {
  const btn = document.getElementById('theme');
  const saved = localStorage.getItem('reqhub-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    localStorage.setItem('reqhub-theme', next);
  });
}
function wireSearch() {
  document.getElementById('q').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    if (['explorer', 'versions', 'coverage'].includes(state.view)) RENDER[state.view]();
  });
}

async function init() {
  document.documentElement.classList.remove('no-js');
  wireTabs(); wireTheme(); wireSearch();
  try {
    const [b, im, rt] = await Promise.all([
      fetch('data/current-baseline.json').then((r) => { if (!r.ok) throw new Error('baseline ' + r.status); return r.json(); }),
      fetch('data/impact-map.json').then((r) => r.json()),
      fetch('data/retrieval-manifest.json').then((r) => r.json()),
    ]);
    DATA.baseline = b; DATA.impact = im; DATA.retrieval = rt;
  } catch (err) {
    setStatus('Falha ao carregar a baseline: ' + err.message, true);
    return;
  }
  setStatus('');
  const c = DATA.baseline.counts;
  document.getElementById('foot-meta').textContent = `${c.total} requisitos · ${Object.entries(c.by_product).map(([k, v]) => k + ' ' + v).join(' · ')} · metamodelo ${DATA.baseline.metamodel_version || '?'} · hash ${String(DATA.baseline.baseline_hash).slice(0, 12)}`;
  buildExplorerFilters();
  switchView('explorer');
}
init();
