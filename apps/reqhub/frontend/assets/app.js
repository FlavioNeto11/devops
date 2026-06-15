// Reqhub — camada de DOM/init. Lê a baseline gerada e renderiza as 6 telas.
// Funções puras vêm de lib.js; aqui só DOM (createElement + textContent, sem innerHTML).
import { filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, matchesQuery, topSimilar, toYaml, validateDraft, coverageSummary, recentList } from './lib.js?v=9';

const SVGNS = 'http://www.w3.org/2000/svg';
const REPO = 'FlavioNeto11/devops'; // p/ abrir edição/criação via PR no GitHub (auth do usuário)
const state = { view: 'explorer', filters: {}, q: '', selectedId: null, impactFilter: { type: '', product: '', focus: false }, editId: null, devFilter: { status: '', product: '' } };
const DATA = { baseline: null, impact: null, retrieval: null, history: null, registry: null, embeddings: null, implStatus: null, coverage: null };

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
  const s = svg('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height, role: 'img', 'aria-label': 'Grafo de impacto entre requisitos. Use a roda do mouse para zoom e arraste para mover.' });
  // <g> com transform: alvo do zoom (wheel) e pan (drag). Colunas/arestas/nós vivem aqui.
  const root = svg('g', { class: 'impact-root' });
  s.append(root);
  // colunas (rótulos)
  for (const c of layout.columns) root.append(Object.assign(svg('text', { x: layout.colX[c] + 4, y: 24, class: 'colhead' }), { textContent: c }));
  const pos = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  for (const e of layout.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const path = svg('path', { class: 'edge' + (e.proposed ? ' proposed' : ''), d: `M ${a.x + 150} ${a.y + 12} C ${a.x + 220} ${a.y + 12}, ${b.x - 30} ${b.y + 12}, ${b.x} ${b.y + 12}` });
    root.append(path);
  }
  for (const n of layout.nodes) {
    const links = neighborhood(layout.edges, n.id);
    const titleText = `${n.id}${n.asr ? ' · ASR' : ''} · ${n.product || 'externo'} · sai ${links.outgoing.length} / entra ${links.incoming.length}`;
    const g = svg('g', { class: 'node' + (n.asr ? ' asr' : ''), tabindex: '0', role: 'button', 'aria-label': titleText });
    // <title> nativo do SVG: tooltip + a11y (lido por leitores de tela ao focar).
    g.append(Object.assign(svg('title'), { textContent: titleText }));
    g.append(svg('rect', { x: n.x, y: n.y, width: 150, height: 24, rx: 5 }));
    const tx = svg('text', { x: n.x + 8, y: n.y + 16 }); tx.textContent = n.id; g.append(tx);
    g.addEventListener('click', () => openReq(n.id));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(n.id); } });
    root.append(g);
  }
  wireZoomPan(s, root, layout);
  canvas.append(controlsBar(s, root, layout), s);
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
  const center = () => ({ cx: (s.clientWidth || layout.width) / 2, cy: (s.clientHeight || layout.height) / 2 });
  bar.append(
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Aproximar (zoom in)', title: 'Aproximar', onclick: () => { const c = center(); set(vp.k * 1.25, c.cx, c.cy); } }, '+'),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Afastar (zoom out)', title: 'Afastar', onclick: () => { const c = center(); set(vp.k / 1.25, c.cx, c.cy); } }, '−'),
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
    // não inicia pan ao clicar num nó (preserva o clique de abrir o requisito)
    if (ev.target.closest('.node')) return;
    drag = { sx: ev.clientX, sy: ev.clientY, x0: vp.x, y0: vp.y };
    s.classList.add('panning');
    s.setPointerCapture(ev.pointerId);
  });
  s.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const rect = s.getBoundingClientRect();
    const sx = (layout.width) / (rect.width || layout.width);
    const sy = (layout.height) / (rect.height || layout.height);
    vp.x = drag.x0 + (ev.clientX - drag.sx) * sx;
    vp.y = drag.y0 + (ev.clientY - drag.sy) * sy;
    applyTransform(root, vp);
  });
  const endPan = () => { drag = null; s.classList.remove('panning'); };
  s.addEventListener('pointerup', endPan);
  s.addEventListener('pointercancel', endPan);
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
  body.append(h('div', { class: 'ws-actions' },
    h('strong', { text: ed ? `Editar ${ed.id}` : 'Novo requisito' }),
    ed ? h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editId = null; renderEditor(); }, text: '+ novo (limpar)' }) : ''));
  body.append(h('p', { class: 'muted', text: 'Preencha, gere o YAML e proponha via PR no GitHub. A UI NÃO escreve no git — o commit é seu (autenticação do GitHub). Depois do merge, rode /sync-spec p/ regenerar a baseline.' }));

  const products = uniqueValues(DATA.baseline.requirements, (r) => r.scope && r.scope.product_scope);
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
  body.append(form);
  body.append(aiPanel());

  const out = h('div');
  body.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn', type: 'button', onclick: gen, text: 'Gerar YAML' })), out);

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

  // Painel da IA de autoria (opcional). Chama o reqhub-api (/reqs/api) e degrada
  // com mensagem clara se a IA estiver indisponivel/desabilitada/sem token.
  function aiPanel() {
    const wrap = h('details', { class: 'card ai-panel' });
    wrap.append(h('summary', { text: '✨ Assistente de IA (autoria) — opcional' }));
    const status = h('p', { class: 'muted', text: 'Verificando IA…' });
    const tok = h('input', { type: 'password', value: AI.getToken(), placeholder: 'Bearer token (operador)' });
    const tokRow = h('div', { class: 'ws-actions' },
      h('span', { class: 'fld-l', text: 'Token' }), tok,
      h('button', { class: 'btn-link', type: 'button', text: 'Salvar', onclick: () => { AI.setToken(tok.value.trim()); status.textContent = 'Token salvo (localStorage deste navegador).'; } }));
    const sketch = h('textarea', { rows: '3', placeholder: 'Descreva o requisito em linguagem natural (esboço)…' });
    const aiOut = h('div');
    wrap.append(status, tokRow,
      h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Esboço' }), sketch),
      h('div', { class: 'ws-actions' },
        h('button', { class: 'btn', type: 'button', text: 'Rascunhar com IA', onclick: doDraft }),
        h('button', { class: 'btn', type: 'button', text: 'Analisar lacunas', onclick: doAnalyze }),
        h('button', { class: 'btn', type: 'button', text: 'Sugerir links', onclick: doLinks })),
      aiOut);

    AI.health().then((r) => {
      if (!r.ok) { status.textContent = 'reqhub-api indisponível — a IA é opcional (o workbench segue read-only).'; return; }
      status.textContent = r.data && r.data.ai ? 'IA habilitada (gpt-5). Cole seu token de operador para usar.' : 'IA desabilitada no servidor (configure o Secret reqhub-api-config).';
    }).catch(() => { status.textContent = 'reqhub-api indisponível — a IA é opcional.'; });

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
        const warns = (r.data.draft && r.data.draft.warnings) || [];
        aiOut.replaceChildren(h('div', { class: 'card' },
          h('h3', { text: 'Rascunho aplicado (' + (r.data.prompt_version || '') + ')' }),
          h('p', { class: 'muted', text: warns.length ? 'Avisos: ' + warns.join('; ') : 'Campos preenchidos — revise e clique em Gerar YAML.' })));
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
        if (!(DATA.embeddings && DATA.embeddings.vectors && state.editId)) {
          aiOut.replaceChildren(h('p', { class: 'muted', text: 'Sugerir links: disponível ao EDITAR um requisito existente (os candidatos vêm dos embeddings locais).' }));
          return;
        }
        const cands = topSimilar(DATA.embeddings.vectors, state.editId, 6).map((s) => ({ id: s.id, title: (byId(s.id) || {}).title || '', score: Number(s.score.toFixed(3)) }));
        const r = await AI.post('/v1/authoring/suggest-links', { requirement: collectDraft(), candidates: cands });
        if (!r.ok) return showErr(r);
        const sg = r.data.suggestions || [];
        const card = h('div', { class: 'card' }, h('h3', { text: 'Links sugeridos (proposed) — ' + (r.data.prompt_version || '') }));
        if (!sg.length) card.append(h('p', { class: 'empty', text: 'Nenhum link relevante entre os candidatos.' }));
        else { const ul = h('ul', { class: 'linklist' }); sg.forEach((s) => ul.append(h('li', {}, badge(s.type, 'b'), ' ', h('button', { class: 'btn-link', type: 'button', onclick: () => openReq(s.target), text: s.target }), ' ', h('span', { class: 'muted', text: '(' + (s.confidence != null ? s.confidence : '?') + ') ' + (s.note || '') })))); card.append(ul); }
        aiOut.replaceChildren(card);
      });
    }
    return wrap;
  }
}

/* ---------- navegação / abas ---------- */
const RENDER = { explorer: renderExplorer, workspace: renderWorkspace, versions: renderVersions, impact: renderImpact, coverage: renderCoverage, reprocess: renderReprocess, dev: renderDev, editor: renderEditor };
function switchView(view) {
  state.view = view;
  for (const tab of document.querySelectorAll('.tab')) {
    const sel = tab.dataset.view === view;
    tab.setAttribute('aria-selected', sel ? 'true' : 'false');
    if (sel) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    tab.tabIndex = sel ? 0 : -1;
  }
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + view;
  RENDER[view]();
}
function openReq(id) { state.selectedId = id; RECENTS.push(id); switchView('workspace'); document.getElementById('tab-workspace').focus(); }

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
    // opcionais (toleram ausência): diff de baseline, registry de artefatos, embeddings.
    const opt = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    [DATA.history, DATA.registry, DATA.embeddings, DATA.implStatus, DATA.coverage] = await Promise.all([opt('data/history.json'), opt('data/registry.json'), opt('data/embeddings.json'), opt('data/implementation-status.json'), opt('data/coverage-report.json')]);
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
