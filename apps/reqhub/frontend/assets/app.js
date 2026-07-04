// Reqhub — camada de DOM/init. Lê a baseline gerada e renderiza as 6 telas.
// Funções puras vêm de lib.js; aqui só DOM (createElement + textContent, sem innerHTML).
import { filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, matchesQuery, topSimilar, toYaml, validateDraft, coverageSummary, recentList, degreeMap, productPalette, nodeColor, highlightSet, visibleGraph, forceLayout, truncateLabel, findSimilarReqs, productGrounding, filterCitations, refineDecision, validateRefinement, nextRefId, parseMarkdown, systemContext } from './lib.js?v=42';
import { productSummaries, findProduct, blueprintById, phaseModel, buildDag, waveProgress, weightedProgress, wavesFromProgress, launchPhases, reqRow, forgeStatusCls, hubSummary, nextReqId, proposeHint, typeLabel, asList, dagFromWaves, businessProductScopes, capabilityPlain, planSummary, CAPABILITY_PLAIN } from './forge-lib.js?v=60';
import { SVGNS, state, DATA, h, svg, byId, badge, AI, dd, dt, filePicker, sameOriginUrl, humanBytes, FILE_ACCEPT, applyTransform, nav } from './core.js?v=3';
import { renderForge, openForgeNew, interactiveGraph } from './studio.js?v=13';

const REPO = 'FlavioNeto11/devops'; // p/ abrir edição/criação via PR no GitHub (auth do usuário)

const refList = () => (DATA.refinements && Array.isArray(DATA.refinements.items)) ? DATA.refinements.items : ((DATA.baseline && Array.isArray(DATA.baseline.refinements)) ? DATA.baseline.refinements : []);
const refById = (id) => refList().find((r) => r.id === id);
const refsForReq = (reqId) => refList().filter((r) => Array.isArray(r.anchors) && r.anchors.some((a) => a.requirement_id === reqId));

/* ---------- recentes (últimos REQs abertos, persistidos no localStorage) ---------- */
const RECENTS = {
  key: 'reqhub-recent',
  get() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  push(id) { try { localStorage.setItem(this.key, JSON.stringify(recentList(this.get(), id, 8))); } catch { /* ignore */ } },
};

function prioCls(p) { return p === 'critical' ? 'b-crit' : p === 'high' ? 'b-high' : p === 'low' ? 'b-low' : 'b-med'; }
function bandCls(b) { return b === 'high' ? 'b-high' : b === 'medium' ? 'b-med' : 'b-low'; }
function setStatus(msg, err) { const s = document.getElementById('status'); s.textContent = msg || ''; s.hidden = !msg; s.className = 'status' + (err ? ' error' : ''); }


/* ---------- helpers de UI compartilhados (consistência entre telas) ---------- */
// ícone de seção (glifo): mesma marca visual em todos os h3 de card detalhado.
function secIc(g) { return h('span', { class: 'us-sec-ic', 'aria-hidden': 'true', text: g }); }
// limiar de "possível duplicata" sobre similaridade por EMBEDDINGS (cosseno). O caminho léxico
// (Jaccard/findSimilarReqs no Editor/Forge) usa seu próprio limiar, pois é outra métrica.
const SIMILAR_THRESHOLD = 0.8;
// rótulo de produto numa linha de grupo: display_name + slug mono só quando diferem.
function prodLabelNodes(p) { const dn = productMeta(p).display_name || p; return dn === p ? [p] : [dn, h('span', { class: 'gr-slug', text: ' ' + p })]; }
// estado-vazio ACIONÁVEL padrão: título + explicação curta + CTA do próximo passo.
function emptyState(opts) {
  const o = opts || {};
  const card = h('div', { class: 'card empty-state' }, h('h3', { text: o.title || 'Nada por aqui' }));
  if (o.text) card.append(h('p', { class: 'muted', text: o.text }));
  const acts = h('div', { class: 'ws-actions' });
  if (o.ctaLabel) acts.append(h('button', { class: 'btn primary', type: 'button', onclick: o.ctaOnClick || (() => {}), text: o.ctaLabel }));
  if (o.altLabel) acts.append(h('button', { class: 'btn', type: 'button', onclick: o.altOnClick || (() => {}), text: o.altLabel }));
  if (acts.children.length) card.append(acts);
  return card;
}
// há algum filtro/busca ativo? (decide se o vazio é "limpar filtros" ou "começar")
function hasActiveFilters() { return !!(state.q || Object.values(state.filters || {}).some(Boolean) || (state.devFilter && (state.devFilter.status || state.devFilter.product))); }
// zera filtros/busca e re-renderiza a tela atual (próximo passo dos estados-vazios filtrados).
function clearFilters() {
  state.filters = {};
  state.q = '';
  state.devFilter = { status: '', product: '' };
  const qi = document.getElementById('q'); if (qi) qi.value = '';
  if (RENDER[state.view]) RENDER[state.view]();
}

/* ---------- Explorer ---------- */
// Faixa de "recentes" (últimos REQs abertos) — fonte/ação ÚNICAS (RECENTS→openReq), 2 variantes:
// 'chips' (Explorador/Workspace) e 'list' (card "Continuar de onde parou" da Overview).
function recentsStrip(opts) {
  const variant = (opts && opts.variant) || 'chips';
  const ids = RECENTS.get().filter((id) => byId(id));
  if (!ids.length) return null;
  if (variant === 'list') {
    const rl = h('div', { class: 'ov-recent' });
    for (const id of ids.slice(0, 6)) {
      const rr = byId(id);
      rl.append(h('button', { class: 'ov-recent-i', type: 'button', 'aria-label': `Abrir ${id}`, onclick: () => openReq(id) },
        h('span', { class: 'rid', text: id }), h('span', { class: 'ov-recent-t', text: truncateLabel((rr && rr.title) || '', 48) })));
    }
    return rl;
  }
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
  // reflete o estado nos <select> da toolbar (deep-link ?product= via casca/Console seta state.filters
  // depois de a toolbar já ter sido montada — sem isto o controle ficaria no placeholder).
  for (const sel of document.querySelectorAll('#explorer-filters select')) {
    const lbl = (sel.getAttribute('aria-label') || '').toLowerCase();
    const key = lbl === 'produto' ? 'product' : lbl === 'tipo' ? 'type' : lbl === 'status' ? 'status' : lbl === 'prioridade' ? 'priority' : lbl === 'impacto' ? 'band' : lbl === 'asr' ? 'asr' : null;
    if (key) sel.value = state.filters[key] || '';
  }
  const grid = document.getElementById('explorer-grid');
  grid.replaceChildren();
  const recents = recentsStrip();
  if (recents) grid.append(recents);
  const table = h('table');
  table.append(h('caption', { class: 'visually-hidden', text: `${reqs.length} requisito(s) encontrado(s) — Enter abre o detalhe` }));
  table.append(h('thead', {}, h('tr', {},
    h('th', { scope: 'col', text: 'ID' }), h('th', { scope: 'col', text: 'Título' }), h('th', { scope: 'col', text: 'Tipo' }),
    h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Prioridade' }), h('th', { scope: 'col', text: 'ASR' }), h('th', { scope: 'col', text: 'Impacto' }))));
  const tb = h('tbody');
  for (const { product, items } of groupByProduct(reqs)) {
    tb.append(h('tr', { class: 'group-row' }, h('td', { colspan: '7' }, ...prodLabelNodes(product), ' · ' + items.length)));
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
  if (!reqs.length) grid.append(hasActiveFilters()
    ? emptyState({ title: 'Nenhum requisito para os filtros atuais', text: 'Ajuste ou limpe os filtros para ver a base completa.', ctaLabel: 'Limpar filtros', ctaOnClick: clearFilters })
    : emptyState({ title: 'A base está vazia', text: 'Nenhum requisito registrado ainda — comece autorando o primeiro.', ctaLabel: '+ Novo requisito', ctaOnClick: () => openEditor(null) }));
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
  if (!r) { body.append(emptyState({ title: 'Nenhum requisito selecionado', text: 'Escolha um requisito no Explorador para ver aqui o detalhe, impacto, versão e refinamentos.', ctaLabel: 'Abrir o Explorador →', ctaOnClick: () => switchView('explorer') })); return; }

  // Cabeçalho de detalhe (mesma régua da Usabilidade): badge tipo + título focável + status + ASR + id.
  const isNfr = r.type === 'non-functional';
  const heading = h('h2', { class: 'usability-title', tabindex: '-1', text: r.title || r.id });
  body.append(h('div', { class: 'usa-detail-head' }, badge(isNfr ? 'NFR' : 'FN', isNfr ? 'b-nfr' : 'b-fn'), heading,
    r.status ? badge(r.status, 'b') : null, r.architectural_significance ? badge('ASR', 'b-asr') : null,
    h('span', { class: 'muted small usa-detail-id', text: r.id })));

  const main = h('div');
  const head = h('div', { class: 'card' },
    h('h3', {}, secIc('◷'), 'Requisito'),
    h('div', { class: 'kv' },
      dt('Escopo'), dd(`${r.scope.applies_to || '—'} · ${productMeta(r.scope.product_scope).display_name || r.scope.product_scope}${r.scope.capability ? ' · ' + r.scope.capability : ''}`),
      dt('Prioridade'), dd(h('span', {}, badge(r.priority, prioCls(r.priority)))),
      dt('Enunciado'), dd(r.statement),
    ));
  main.append(head);
  main.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => openEditor(r.id), text: '✎ Editar (propor via PR)' })));

  if ((r.acceptance_criteria || []).length || (r.verification_method || []).length) {
    const v = h('div', { class: 'card' }, h('h3', {}, secIc('✓'), 'Verificação'));
    if ((r.acceptance_criteria || []).length) { v.append(h('strong', { text: 'Critérios de aceite' })); const ul = h('ul'); r.acceptance_criteria.forEach((c) => ul.append(h('li', { text: c }))); v.append(ul); }
    if ((r.verification_method || []).length) v.append(h('p', {}, h('strong', { text: 'Métodos: ' }), r.verification_method.join(', ')));
    main.append(v);
  }
  if ((r.quality_scenarios || []).length) {
    const q = h('div', { class: 'card' }, h('h3', {}, secIc('◑'), 'Cenários de qualidade (NFR)'));
    for (const s of r.quality_scenarios) {
      q.append(h('div', { class: 'qscenario' },
        h('div', {}, h('b', { text: 'Estímulo: ' }), `${s.source} → ${s.stimulus}`),
        h('div', {}, h('b', { text: 'Ambiente: ' }), s.environment),
        h('div', {}, h('b', { text: 'Resposta: ' }), s.response),
        h('div', {}, h('b', { text: 'Medida: ' }), s.response_measure)));
    }
    main.append(q);
  }

  // refinamentos (REF-*) que detalham ESTE requisito (telas/comportamento ancorados a ele)
  const refs = refsForReq(r.id);
  if (refs.length) {
    const rc = h('div', { class: 'card' }, h('h3', {}, secIc('▤'), 'Refinamentos (telas)'),
      h('p', { class: 'muted small', text: 'Telas/comportamentos que detalham este requisito — clique para ver a usabilidade.' }));
    const ul = h('ul', { class: 'ws-reflist' });
    for (const rf of refs) {
      const rel = (rf.anchors.find((a) => a.requirement_id === r.id) || {}).relation || 'refines';
      ul.append(h('li', {}, h('button', { class: 'btn-link', type: 'button', onclick: () => openUsability(rf.id), title: rf.title || rf.id },
        badge(rf.kind || 'screen', 'b'), ' ', h('span', { text: truncateLabel(rf.title || rf.id, 52) }),
        (rf.surface && rf.surface.route) ? h('span', { class: 'muted small', text: ' · ' + rf.surface.route }) : null),
        ' ', badge(rel, 'b-low')));
    }
    rc.append(ul);
    main.append(rc);
  }

  // painel lateral: impacto + versão
  const side = h('div');
  const nb = neighborhood(DATA.impact.edges, r.id);
  const imp = h('div', { class: 'card' }, h('h3', {}, secIc('⇄'), 'Impacto'),
    h('p', {}, h('strong', { text: 'Score: ' }), badge(`${r.impact_band} (${r.impact_score})`, bandCls(r.impact_band))));
  imp.append(h('p', { class: 'muted', text: 'Sai (afeta / aloca / verifica):' }));
  imp.append(linkList(nb.outgoing, 'to'));
  imp.append(h('p', { class: 'muted', text: 'Entra (depende / refina / constrange):' }));
  imp.append(linkList(nb.incoming, 'from'));
  imp.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn-link', type: 'button', onclick: () => openImpactAt(r.id), text: 'Ver no mapa ↗' })));
  side.append(imp);

  const ver = h('div', { class: 'card' }, h('h3', {}, secIc('⌗'), 'Versão'),
    h('div', { class: 'kv' },
      dt('Baseline'), dd(r.version.baseline_version),
      dt('Revisão'), dd(String(r.version.item_revision)),
      dt('Mudança'), dd(badge(semChangeLabel(r.version.semantic_change), semChangeCls(r.version.semantic_change))),
      dt('Motivo'), dd(r.version.change_reason || '—'),
      dt('Arquivo'), dd(h('code', { text: r.file }))));
  ver.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn-link', type: 'button', onclick: () => { state.q = r.id; const qi = document.getElementById('q'); if (qi) qi.value = r.id; switchView('versions'); }, text: 'Ver no ledger →' })));
  side.append(ver);

  // Desenvolvimento (status REQ → PR → deploy)
  const dv = DATA.implStatus && DATA.implStatus.items && DATA.implStatus.items[r.id];
  if (dv) {
    const dev = h('div', { class: 'card' }, h('h3', {}, secIc('⚙'), 'Desenvolvimento'),
      h('div', { class: 'kv' },
        dt('status'), dd(badge(devStatusLabel(dv.status), devStatusCls(dv.status))),
        ...(dv.pr ? [dt('PR'), dd(h('a', { class: 'btn-link', href: dv.pr, target: '_blank', rel: 'noopener', text: dv.pr }))] : []),
        ...(dv.commit ? [dt('commit'), dd(h('code', { text: dv.commit }))] : []),
        ...(dv.deployment ? [dt('deployment'), dd(dv.deployment)] : []),
        ...(dv.deployed_at ? [dt('deployed'), dd(dv.deployed_at)] : [])));
    // sinergia cross-app: do requisito → o app vivo no Console (cluster/health/deploys)
    dev.append(h('div', { class: 'ws-actions' }, h('a', { class: 'btn-link', href: '/devops', target: '_blank', rel: 'noopener', text: 'Ver no Console (cluster) ↗' })));
    side.append(dev);
  }

  // Alocação (arquitetura/infra DERIVADAS dos requisitos)
  const al = r.allocation || {};
  const allocRows = [['Serviços', al.service_refs], ['Infra', al.infra_refs], ['SLOs', al.slo_refs], ['ADRs', al.adr_refs], ['Arquitetura', al.architecture_refs]].filter(([, v]) => (v || []).length);
  const alloc = h('div', { class: 'card' }, h('h3', {}, secIc('◳'), 'Alocação'),
    h('p', { class: 'muted small', text: 'Arquitetura/infra derivadas dos requisitos.' }));
  if (!allocRows.length) alloc.append(h('p', { class: 'empty', text: 'Sem alocação registrada — lacuna (autore via edição).' }));
  else for (const [label, vals] of allocRows) alloc.append(h('p', {}, h('strong', { text: label + ': ' }), ...vals.flatMap((v, i) => [i ? ', ' : '', h('code', { text: v })])));
  side.append(alloc);

  // Requisitos similares (semântica via embeddings locais)
  if (DATA.embeddings && DATA.embeddings.vectors) {
    const sims = topSimilar(DATA.embeddings.vectors, r.id, 5);
    const sc = h('div', { class: 'card' }, h('h3', {}, secIc('≈'), 'Requisitos similares (semântica)'));
    if (!sims.length) sc.append(h('p', { class: 'empty', text: '—' }));
    else {
      const ul = h('ul', { class: 'linklist' });
      let dupe = null;
      for (const s of sims) {
        const sr = byId(s.id);
        if (s.score >= SIMILAR_THRESHOLD && !dupe) dupe = s.id;
        ul.append(h('li', {}, h('span', { class: 'lt', text: s.score.toFixed(2) }), ' ',
          h('button', { class: 'btn-link', onclick: () => openReq(s.id), text: s.id }),
          s.score >= SIMILAR_THRESHOLD ? h('span', {}, ' ', badge('possível duplicata', 'b-crit')) : '',
          sr ? h('span', { class: 'muted', text: ' · ' + sr.title.slice(0, 38) }) : ''));
      }
      sc.append(ul);
      // Ação de IA: pedir ao copiloto que compare/decida duplicata (grounded no produto). Fail-closed.
      if (dupe) sc.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn-link', type: 'button', onclick: () => openCmdk(`${r.id} e ${dupe} são duplicatas ou se complementam? Compare e recomende.`), text: '✨ Comparar com a IA →' })));
    }
    side.append(sc);
  }

  body.append(main, side);
  try { heading.focus({ preventScroll: true }); } catch { /* noop */ }
}
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
const SEM_CHANGE_LBL = { major: 'maior', minor: 'menor', patch: 'correção', none: 'sem mudança' };
const semChangeLabel = (s) => SEM_CHANGE_LBL[s] || s || 'sem mudança';
const semChangeCls = (s) => s === 'major' ? 'b-crit' : s === 'minor' ? 'b-high' : s === 'patch' ? 'b-med' : 'b-low';
// "Mudanças" (A1a) = versões/diffs + fila de reprocessamento numa aba só; sub-abas trocam a view
// interna (o item da sidebar continua aceso via NAV_ALIAS). A fila é consequência das mudanças.
function changesTabs(active) {
  const bar = h('div', { class: 'usa-filter changes-tabs', role: 'group', 'aria-label': 'Seções de Mudanças' });
  const tab = (label, view, badgeN) => {
    const on = active === view;
    const b = h('button', { class: 'usa-fchip' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: () => { if (!on) switchView(view); } }, label);
    if (badgeN) b.append(h('span', { class: 'lg-n', text: ' ' + badgeN }));
    return b;
  };
  const qcrit = ((DATA.baseline && DATA.baseline.reprocess_queue) || []).filter((it) => it.impact_score >= 70).length;
  bar.append(tab('Versões & diffs', 'versions'), tab('Fila de reprocessamento' + (qcrit ? ` · ${qcrit} críticos` : ''), 'reprocess'));
  return bar;
}
function renderVersions() {
  const body = document.getElementById('versions-body');
  body.replaceChildren();
  body.append(changesTabs('versions'));

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
              h('td', {}, h('span', { class: 'rid', text: it.id })), h('td', { text: productMeta(it.product).display_name || it.product }),
              h('td', {}, badge(semChangeLabel(it.semantic_change), semChangeCls(it.semantic_change))),
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
    // Narrar as mudanças com IA (grounded no produto do 1º item alterado; copiloto degrada fail-closed).
    const firstChanged = (hist.changed[0] || hist.added[0] || {});
    card.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn-link', type: 'button', onclick: () => openCmdk('Resuma em linguagem clara as mudanças recentes da baseline (' + (hist.counts.added + hist.counts.changed + hist.counts.removed) + ' itens) e o que devo revisar.'), text: '✨ Narrar mudanças com a IA →' })));
    void firstChanged;
    body.append(card);
  }

  body.append(h('p', { class: 'muted', text: 'Ledger: estado de versão de cada requisito, agrupado por produto. O diff acima compara a baseline atual com a anterior (git); o diff por PR também é publicado pelo CI (specs-diff / skill /baseline-diff).' }));
  const reqs = filterReqs(DATA.baseline.requirements, { q: state.q }).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (!reqs.length) { body.append(emptyState({ title: 'Nenhum requisito para a busca', text: 'Limpe a busca para ver o ledger completo.', ctaLabel: 'Limpar busca', ctaOnClick: clearFilters })); return; }
  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'Requisito' }), h('th', { text: 'Versão da baseline' }), h('th', { text: 'Revisão' }), h('th', { text: 'Tipo de mudança' }), h('th', { text: 'Motivo' }))));
  const tb = h('tbody');
  for (const { product, items } of groupByProduct(reqs)) {
    tb.append(h('tr', { class: 'group-row' }, h('td', { colspan: '5' }, ...prodLabelNodes(product), ' · ' + items.length)));
    for (const r of items) tb.append(h('tr', { tabindex: '0', role: 'button', 'aria-label': `Abrir ${r.id}`, onclick: () => openReq(r.id), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(r.id); } } },
      h('td', {}, h('span', { class: 'rid', text: r.id })), h('td', { text: r.version.baseline_version }), h('td', { text: String(r.version.item_revision) }),
      h('td', {}, badge(semChangeLabel(r.version.semantic_change), semChangeCls(r.version.semantic_change))), h('td', { text: r.version.change_reason || '—' })));
  }
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
  // unifica o "req em foco" entre Workspace e Mapa: ao ENTRAR no mapa (não a cada re-render de
  // controle, p.ex. o toggle de isolados que zera a seleção de propósito), foca o último REQ visto.
  if (IMPACT.enterSeed && !IMPACT.st.selectedId && state.selectedId && byId(state.selectedId)) IMPACT.st.selectedId = state.selectedId;
  IMPACT.enterSeed = false;
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
  if (n.kind === 'refinement') return `${n.id}: refinamento de tela${n.title ? ' — ' + n.title : ''}, ${d} conexões. Pressione O para abrir a Usabilidade.`;
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
    const isRef = n.kind === 'refinement';
    const short = (n.id.startsWith('REQ-') || n.id.startsWith('REF-')) ? n.id.slice(4) : n.id;
    const title = req ? truncateLabel(req.title, 22) : (isRef && n.title ? truncateLabel(n.title, 22) : '');      // R3: miniatura útil (id + título)
    const twoLine = !!title;
    const isHub = (n.deg || 0) >= 3;
    const w = Math.max(56, Math.max(short.length * 7.6, title.length * 5.9) + 22);
    const hgt = twoLine ? (isHub ? 34 : 31) : 23;
    const x = n.x - w / 2, y = n.y - hgt / 2;
    const cls = 'node' + (n.asr ? ' asr' : '') + (col.target ? ' target' : '') + (isHub ? ' hub' : '') + (req && req.type === 'non-functional' ? ' nfr' : '') + (isRef ? ' ref' : '');
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
    g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); if (req) openReq(n.id); else if (isRef) openUsability(n.id); });
    g.addEventListener('keydown', (ev) => onNodeKey(ev, n.id, req, isRef));
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
function onNodeKey(ev, id, req, isRef) {
  const k = ev.key;
  if (k === 'Enter' || k === ' ') { ev.preventDefault(); selectNode(id); return; }
  if (k === 'o' || k === 'O') { if (req) openReq(id); else if (isRef) openUsability(id); return; }
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
  const wrapF = document.getElementById('coverage-filters');
  if (wrapF) wrapF.replaceChildren();
  const body = document.getElementById('coverage-body');
  body.replaceChildren();

  const cols = [['acceptance', 'Aceite'], ['method', 'Método'], ['evidence', 'Evidência'], ['adr', 'ADR'], ['service', 'Serviço'], ['infra', 'Infra'], ['slo', 'SLO']];
  const allReqs = DATA.baseline.requirements;
  const reqs = filterReqs(allReqs, { ...state.filters, q: state.q }).slice().sort((a, b) => coverageScore(a) - coverageScore(b));

  // Toolbar de filtro (Produto) + contador — antes a lista filtrava em silêncio.
  if (wrapF) {
    const products = uniqueValues(allReqs, (r) => r.scope && r.scope.product_scope);
    const sel = h('select', { 'aria-label': 'Produto', onchange: (e) => { state.filters.product = e.target.value; renderCoverage(); } }, h('option', { value: '', text: 'Produto' }));
    for (const v of products) { const o = h('option', { value: v, text: productMeta(v).display_name || v }); if (v === state.filters.product) o.selected = true; sel.append(o); }
    wrapF.append(h('label', {}, 'Produto', sel), h('span', { class: 'count', text: `${reqs.length} de ${allReqs.length}` }));
  }

  body.append(h('p', { class: 'muted', text: 'Matriz requisito × evidência/alocação. Verde = preenchido; vermelho = lacuna. Os piores (mais lacunas) aparecem no topo. Links e evidências externos são autorados na iteração (Fase 2+).' }));

  // RESUMO UNIFICADO: uma faixa de chips (sobre os exibidos) + escopos mais rasos num bloco colapsável.
  const cov = DATA.coverage;
  const summary = coverageSummary(reqs);
  const sumCard = h('div', { class: 'card' }, h('h3', {}, secIc('◑'), 'Resumo da cobertura'));
  const metrics = h('div', { class: 'cov-metrics' });
  if (cov && cov.totals) metrics.append(h('span', { class: 'cov-metric' }, h('strong', { text: `${cov.totals.total}` }), h('span', { class: 'muted small', text: ` requisitos na base · ${cov.totals.scopes} escopos` })));
  metrics.append(h('span', { class: 'cov-metric' }, h('strong', { text: `${reqs.length}` }), h('span', { class: 'muted small', text: ' no filtro atual' })));
  sumCard.append(metrics);
  const chips = h('div', { class: 'ws-actions cov-summary' });
  for (const d of summary) {
    chips.append(h('span', { class: 'cov-stat' },
      h('span', { class: 'cov-stat-l', text: d.label }),
      badge(`${d.hit}/${d.total}`, d.pct >= 70 ? 'b-ok' : d.pct >= 30 ? 'b-high' : 'b-crit'),
      h('span', { class: 'muted', text: d.miss ? ` ${d.miss} falt.` : ' completo' })));
  }
  sumCard.append(chips);
  // Escopos mais rasos (detalhe secundário, colapsável) — lacunas reais a preencher por escopo.
  if (cov && cov.totals && cov.by_scope) {
    const dimLbl = { source_paths: 'Origem', links: 'Links', allocation: 'Alocação', evidence: 'Evidência', verification_method: 'Método' };
    const det = h('details', { class: 'cov-scopes' });
    det.append(h('summary', { text: 'Escopos com mais lacunas (sem link/alocação)' }));
    const scopes = Object.entries(cov.by_scope).sort((a, b) => (b[1].without_links + b[1].without_allocation) - (a[1].without_links + a[1].without_allocation)).slice(0, 6);
    const tbl = h('table', { class: 'matrix' });
    tbl.append(h('thead', {}, h('tr', {}, h('th', { text: 'Escopo' }), h('th', { text: 'Total' }), ...cov.dimensions.map((d) => h('th', { text: dimLbl[d] || d })))));
    const stb = h('tbody');
    for (const [scope, c] of scopes) {
      stb.append(h('tr', {}, h('td', { text: scope }), h('td', { text: String(c.total) }),
        ...cov.dimensions.map((d) => { const w = c[`without_${d}`]; return h('td', { class: w === 0 ? 'hit' : 'miss', title: `${dimLbl[d] || d}: ${w === 0 ? 'completo' : w + ' sem'}`, text: w === 0 ? '✓' : `−${w}` }); })));
    }
    tbl.append(stb); det.append(h('p', { class: 'muted small', text: '−N = N requisitos sem aquela dimensão.' }), tbl);
    sumCard.append(det);
  }
  body.append(sumCard);

  if (!reqs.length) { body.append(emptyState({ title: 'Nenhum requisito para os filtros atuais', text: 'Ajuste ou limpe os filtros para ver a matriz completa.', ctaLabel: 'Limpar filtros', ctaOnClick: clearFilters })); return; }

  const wrap = h('div', { class: 'grid-wrap' });
  const t = h('table', { class: 'matrix matrix-sticky' });
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'Requisito' }), h('th', { text: 'Produto' }), ...cols.map((c) => h('th', { text: c[1] })), h('th', { text: 'Cobertura' }))));
  const tb = h('tbody');
  for (const r of reqs) {
    const row = coverageRow(r);
    const pct = Math.round(coverageScore(r) * 100);
    const tr = h('tr', { tabindex: '0', role: 'button', 'aria-label': `Abrir ${r.id} — ${pct}% de cobertura`, onclick: () => openReq(r.id), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(r.id); } } },
      h('td', {}, h('span', { class: 'rid', text: r.id })), h('td', { text: productMeta(r.scope.product_scope).display_name || r.scope.product_scope }),
      ...cols.map((c) => h('td', { class: row[c[0]] ? 'hit' : 'miss', title: `${c[1]}: ${row[c[0]] ? 'presente' : 'ausente'}`, 'aria-label': `${c[1]}: ${row[c[0]] ? 'presente' : 'ausente'}`, text: row[c[0]] ? '✓' : '✕' })),
      h('td', {}, badge(pct + '%', pct >= 70 ? 'b-ok' : pct >= 30 ? 'b-high' : 'b-crit')));
    tb.append(tr);
  }
  t.append(tb); wrap.append(t); body.append(wrap);
}

/* ---------- Fila de reprocessamento ---------- */
// Os motivos chegam como frases pt-BR; a cor sai por palavra-chave (severidade), não por enum fixo.
const reasonLabel = (x) => x;
function reasonCls(x) {
  const s = String(x || '').toLowerCase();
  if (/verifica|evid[êe]ncia/.test(s)) return 'b-crit';
  if (/impacto/.test(s)) return 'b-high';
  if (/maior|major|arquitet/.test(s)) return 'b-nfr';
  return 'b-med';
}
function renderReprocess() {
  const wrap = document.getElementById('reprocess-filters');
  if (wrap) wrap.replaceChildren();
  const body = document.getElementById('reprocess-body');
  body.replaceChildren();
  body.append(changesTabs('reprocess'));
  const q = DATA.baseline.reprocess_queue || [];

  // Fila vazia = bom sinal (nada pendente) → estado-vazio acionável.
  if (!q.length) {
    body.append(emptyState({ title: 'Fila limpa', text: 'Nenhum requisito exige reprocessamento agora. Quando a baseline mudar (alto impacto, lacuna de verificação ou mudança maior), os itens aparecem aqui.', ctaLabel: 'Ver requisitos →', ctaOnClick: () => switchView('explorer') }));
    return;
  }

  // Resumo por motivo (chips clicáveis = filtro) — espelha o padrão do Dev/Usabilidade.
  const reasonCounts = {};
  for (const item of q) for (const x of (item.reasons || [])) reasonCounts[x] = (reasonCounts[x] || 0) + 1;
  const filt = h('div', { class: 'usa-filter', role: 'group', 'aria-label': 'Filtrar por motivo' });
  const fchip = (label, val) => h('button', { class: 'usa-fchip' + ((state.reproFilter.reason || '') === val ? ' is-on' : ''), type: 'button', 'aria-pressed': ((state.reproFilter.reason || '') === val) ? 'true' : 'false', text: label, onclick: () => { state.reproFilter.reason = (state.reproFilter.reason === val ? '' : val); renderReprocess(); } });
  filt.append(fchip('Todos · ' + q.length, ''));
  for (const x of Object.keys(reasonCounts).sort()) filt.append(fchip(reasonLabel(x) + ' · ' + reasonCounts[x], x));
  (wrap || body).append(filt);

  body.append(h('p', { class: 'muted', text: 'Itens que exigem atenção do Claude — priorizados por impacto. Cada motivo leva à sua origem (mapa / cobertura / versões); "analisar" abre o copiloto.' }));

  const shown = state.reproFilter.reason ? q.filter((it) => (it.reasons || []).includes(state.reproFilter.reason)) : q;
  if (!shown.length) {
    body.append(emptyState({ title: 'Nenhum item para este motivo', text: 'Nenhum requisito na fila com o motivo selecionado.', ctaLabel: 'Limpar filtro', ctaOnClick: () => { state.reproFilter.reason = ''; renderReprocess(); } }));
    return;
  }
  // cada motivo deep-linka à evidência que o gerou: impacto→mapa, verificação→Workspace, mudança→Versões
  const motiveTarget = (x, item) => {
    const s = String(x).toLowerCase();
    if (/impacto/.test(s)) return () => openImpactAt(item.id);
    if (/maior|major/.test(s)) return () => { state.q = item.id; const qi = document.getElementById('q'); if (qi) qi.value = item.id; switchView('versions'); };
    return () => openReq(item.id);
  };
  const gw = h('div', { class: 'grid-wrap' });
  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Requisito' }), h('th', { text: 'Produto' }), h('th', { text: 'Título' }), h('th', { text: 'Impacto' }), h('th', { text: 'Motivos' }), h('th', { text: 'Ação' }))));
  const tb = h('tbody');
  shown.forEach((item, i) => {
    const r = byId(item.id);
    tb.append(h('tr', { tabindex: '0', role: 'button', 'aria-label': `Abrir ${item.id}`, onclick: () => openReq(item.id), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(item.id); } } },
      h('td', { text: String(i + 1) }), h('td', {}, h('span', { class: 'rid', text: item.id })),
      h('td', { text: productMeta(item.product).display_name || item.product }),
      h('td', { text: r ? r.title : '' }),
      h('td', {}, badge(`${r ? r.impact_band : 'low'} (${item.impact_score})`, bandCls(r ? r.impact_band : 'low')), r && r.architectural_significance ? h('span', {}, ' ', badge('ASR', 'b-asr')) : ''),
      h('td', {}, ...(item.reasons || []).flatMap((x, j) => [j ? ' ' : '', h('button', { class: 'b ' + reasonCls(x) + ' reason-btn', type: 'button', title: 'ver a origem deste motivo', onclick: (ev) => { ev.stopPropagation(); motiveTarget(x, item)(); }, text: reasonLabel(x) })])),
      h('td', {}, h('button', { class: 'btn-link', type: 'button', onclick: (ev) => { ev.stopPropagation(); openCmdk(`Por que ${item.id} está na fila de reprocessamento e qual a próxima ação?`); }, text: '✨ analisar' }))));
  });
  t.append(tb); gw.append(t); body.append(gw);
}

/* ---------- Desenvolvimento (status REQ → PR → deploy) ---------- */
function devStatusCls(s) {
  return s === 'done' || s === 'deployed' ? 'b-ok' : s === 'blocked' ? 'b-crit' : s === 'not_started' ? 'b-low' : 'b-high';
}
const DEV_STATUS_LBL = { deployed: 'No ar', done: 'Concluído', merged: 'Mesclado', pr_open: 'PR aberto', in_progress: 'Em progresso', blocked: 'Bloqueado', not_started: 'Não iniciado' };
const DEV_STATUS_ORDER = ['deployed', 'done', 'merged', 'pr_open', 'in_progress', 'blocked', 'not_started'];
const devStatusLabel = (s) => DEV_STATUS_LBL[s] || s;
function renderDev() {
  const wrap = document.getElementById('dev-filters');
  wrap.replaceChildren();
  const body = document.getElementById('dev-body');
  body.replaceChildren();
  const st = DATA.implStatus;
  if (!st || !st.items) { body.append(emptyState({ title: 'Sem dados de desenvolvimento', text: 'A esteira ainda não publicou o status de implementação (implementation-status.json). Os requisitos aparecem aqui à medida que entram em PR/deploy.', ctaLabel: 'Ver requisitos →', ctaOnClick: () => switchView('explorer') })); return; }
  const products = uniqueValues(DATA.baseline.requirements, (r) => r.scope && r.scope.product_scope);
  // Só o filtro de Produto fica no select; o Status vira chips-filtro abaixo (distribuição + filtro num gesto).
  const sel = h('select', { 'aria-label': 'Produto', onchange: (e) => { state.devFilter.product = e.target.value; renderDev(); } }, h('option', { value: '', text: 'Produto' }));
  for (const v of products) { const o = h('option', { value: v, text: productMeta(v).display_name || v }); if (v === state.devFilter.product) o.selected = true; sel.append(o); }
  wrap.append(h('label', {}, 'Produto', sel), h('span', { class: 'count', id: 'dev-count' }));

  // Distribuição por status como CHIPS-FILTRO (clicar = filtra; clicar de novo = limpa).
  const counts = (st.counts && st.counts.by_status) || (() => { const m = {}; for (const v of Object.values(st.items)) { const k = v.status || 'not_started'; m[k] = (m[k] || 0) + 1; } return m; })();
  const ordered = [...new Set([...DEV_STATUS_ORDER, ...Object.keys(counts)])].filter((s) => counts[s]);
  const filt = h('div', { class: 'usa-filter', role: 'group', 'aria-label': 'Filtrar por status' });
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
  const fchip = (label, val) => h('button', { class: 'usa-fchip' + ((state.devFilter.status || '') === val ? ' is-on' : ''), type: 'button', 'aria-pressed': ((state.devFilter.status || '') === val) ? 'true' : 'false', text: label, onclick: () => { state.devFilter.status = (state.devFilter.status === val ? '' : val); renderDev(); } });
  filt.append(fchip('Todos · ' + totalItems, ''));
  for (const s of ordered) filt.append(fchip(devStatusLabel(s) + ' · ' + counts[s], s));
  body.append(filt);
  body.append(h('p', { class: 'muted', text: 'Estado da entrega por requisito (REQ → PR → deploy), atualizado pela esteira. Clique numa linha para abrir o requisito.' }));

  const ids = Object.keys(st.items).filter((id) => {
    const it = st.items[id]; const r = byId(id);
    if (state.devFilter.status && it.status !== state.devFilter.status) return false;
    if (state.devFilter.product && (!r || (r.scope && r.scope.product_scope) !== state.devFilter.product)) return false;
    return true;
  }).sort();
  document.getElementById('dev-count').textContent = `${ids.length} de ${Object.keys(st.items).length}`;
  if (!ids.length) { body.append(emptyState({ title: 'Nenhum requisito para os filtros atuais', text: 'Ajuste ou limpe os filtros de status/produto.', ctaLabel: 'Limpar filtros', ctaOnClick: clearFilters })); return; }

  const t = h('table');
  t.append(h('thead', {}, h('tr', {}, h('th', { text: 'Requisito' }), h('th', { text: 'Título' }), h('th', { text: 'Status' }), h('th', { text: 'PR' }), h('th', { text: 'Deploy' }))));
  const tb = h('tbody');
  const devRow = (id) => {
    const it = st.items[id]; const r = byId(id);
    return h('tr', { tabindex: '0', role: 'button', 'aria-label': `Abrir ${id}`, onclick: () => openReq(id), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openReq(id); } } },
      h('td', {}, h('span', { class: 'rid', text: id })),
      h('td', { text: r ? r.title : '' }),
      h('td', {}, badge(devStatusLabel(it.status), devStatusCls(it.status))),
      h('td', {}, it.pr ? h('a', { class: 'btn-link', href: it.pr, target: '_blank', rel: 'noopener', text: 'PR' }) : h('span', { class: 'empty', text: '—' })),
      h('td', { text: it.deployed_at ? it.deployed_at.slice(0, 10) : it.deployment || '—' }));
  };
  // Sem filtro de produto → agrupa por produto (consistência com Explorer/Versões). Com filtro → lista plana.
  if (!state.devFilter.product) {
    const byProd = {};
    for (const id of ids) { const r = byId(id); const p = (r && r.scope && r.scope.product_scope) || 'outros'; (byProd[p] = byProd[p] || []).push(id); }
    for (const p of Object.keys(byProd).sort()) {
      tb.append(h('tr', { class: 'group-row' }, h('td', { colspan: '5' }, ...prodLabelNodes(p), ' · ' + byProd[p].length)));
      for (const id of byProd[p]) tb.append(devRow(id));
    }
  } else {
    for (const id of ids) tb.append(devRow(id));
  }
  const gw = h('div', { class: 'grid-wrap' });
  t.append(tb); gw.append(t); body.append(gw);
}

/* ---------- Editor GUIADO POR IA (autoria assistida → PR no GitHub; a UI NÃO escreve no git)
   Fluxo em estágios: pick (escolher o sistema) → context (mapa/contexto do sistema) →
   chat (conversa grounded que conhece os requisitos) → review (formulário de confirmação,
   schema/collectDraft INTACTOS) → PR. ----------------------------------------------------- */
function freshEditorState() { return { stage: 'pick', product: null, messages: [], draft: null, graph: null, target_req_id: null }; }
function openEditor(id) {
  state.editId = id || null;
  if (id) {
    const r = byId(id);
    state.editor = { stage: 'review', product: (r && r.scope && r.scope.product_scope) || null, messages: [], draft: null, graph: null, target_req_id: id };
  } else {
    state.editor = freshEditorState();
  }
  switchView('editor');
}
function renderEditor() {
  if (!state.editor) state.editor = freshEditorState();
  const body = document.getElementById('editor-body');
  body.replaceChildren();
  const st = state.editor.stage;
  if (st === 'pick') return renderPickStage(body);
  if (st === 'context') return renderContextStage(body);
  if (st === 'refine') return renderRefineStage(body);
  if (st === 'chat') return renderChatStage(body);
  return renderReviewForm(body);
}

/* dados do mapa de UM sistema: nós = requisitos do produto; arestas = vínculos do impact-map
   com AMBAS as pontas no produto. Reusado nos estágios context e chat. */
function productGraphData(product) {
  const reqs = DATA.baseline.requirements.filter((r) => r.scope && r.scope.product_scope === product);
  const ids = new Set(reqs.map((r) => r.id));
  const edges = ((DATA.impact && DATA.impact.edges) || [])
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ from: e.from, to: e.to }));
  return { reqs, nodes: reqs.map((r) => ({ id: r.id, title: r.title || '' })), edges };
}
function buildSystemGraph(product, tall) {
  const g = interactiveGraph({
    tall, label: 'Mapa de requisitos de ' + product,
    nodeClass: (n) => { const r = byId(n.id); return 'imp-' + ((r && r.impact_band) || 'low'); },
    onOpen: (id) => openReq(id),
    detailOf: (n, id) => {
      const r = byId(id); if (!r) return { title: id };
      return { title: r.title || '', openable: true, sub: id + ' · ' + r.status + ' · impacto ' + (r.impact_band || '?'),
        badges: [badge(r.type === 'non-functional' ? 'NFR' : 'funcional', r.type === 'non-functional' ? 'b-nfr' : 'b-fn'), badge(r.priority, prioCls(r.priority))] };
    },
  });
  const data = productGraphData(product);
  g.setData(data.nodes, data.edges);
  return { g, data };
}
function productMeta(product) { return ((DATA.products && DATA.products.products) || []).find((p) => p.name === product) || {}; }
function productReqCount(product) { return DATA.baseline.requirements.filter((r) => r.scope && r.scope.product_scope === product).length; }

/* Estágio 1 — escolher o sistema (a IA só ativa depois disto). */
function renderPickStage(body) {
  const heading = h('h2', { class: 'editor-title', tabindex: '-1', text: 'Sobre qual sistema você quer trabalhar?' });
  body.append(h('div', { class: 'ed-guided-head' }, heading,
    h('p', { class: 'muted', text: 'Escolha um sistema: o assistente de IA conhece os requisitos dele. Você vê o mapa, conversa para entender ou propor uma mudança, e o resultado vira um PR — a UI nunca escreve no git.' })));
  // só PRODUTOS DE SOFTWARE DE NEGÓCIO (exclui infra/plataforma; sites CMS já não têm requisitos)
  const scopes = businessProductScopes(DATA.baseline.requirements, DATA.products);
  const counts = {}; for (const r of DATA.baseline.requirements) { const s = r.scope && r.scope.product_scope; if (s) counts[s] = (counts[s] || 0) + 1; }
  const grid = h('div', { class: 'pick-grid' });
  for (const sc of scopes) {
    const meta = productMeta(sc);
    grid.append(h('button', { class: 'pick-card', type: 'button', 'aria-label': 'Trabalhar no sistema ' + (meta.display_name || sc),
      onclick: () => { state.editor = { stage: 'context', product: sc, messages: [], draft: null, graph: null, target_req_id: null }; renderEditor(); } },
      h('span', { class: 'pick-name', text: meta.display_name || sc }),
      h('span', { class: 'pick-scope', text: sc }),
      meta.vision ? h('span', { class: 'pick-vision', text: truncateLabel(meta.vision, 96) }) : null,
      h('span', { class: 'pick-count' }, badge(counts[sc] + ' requisito' + (counts[sc] === 1 ? '' : 's'), 'b'))));
  }
  body.append(grid);
  body.append(h('div', { class: 'pick-foot' },
    h('button', { class: 'btn', type: 'button', onclick: () => openForgeNew(), text: '+ Criar um sistema novo (Forge)' }),
    h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editId = null; state.editor = { stage: 'review', product: null, messages: [], draft: null, graph: null, target_req_id: null }; renderEditor(); }, text: 'Editor clássico (formulário direto)' })));
  heading.focus();
}

/* breadcrumb reutilizável dos estágios guiados. */
function edCrumbs(product, leaf) {
  const meta = productMeta(product);
  return h('nav', { class: 'ed-crumbs', 'aria-label': 'Você está em' },
    h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editor.stage = 'pick'; renderEditor(); }, text: 'Sistemas' }),
    h('span', { class: 'crumb-sep', 'aria-hidden': 'true', text: '›' }),
    h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editor.stage = 'context'; renderEditor(); }, text: meta.display_name || product }),
    leaf ? h('span', { class: 'crumb-sep', 'aria-hidden': 'true', text: '›' }) : null,
    leaf ? h('span', { class: 'crumb-leaf', text: leaf }) : null);
}

/* Estágio 2 — o sistema hoje: mapa + painel de requisitos. */
function renderContextStage(body) {
  const product = state.editor.product;
  const meta = productMeta(product);
  body.append(edCrumbs(product, null));
  const heading = h('h2', { class: 'editor-title', tabindex: '-1', text: 'O sistema hoje — ' + (meta.display_name || product) });
  body.append(h('div', { class: 'ed-guided-head' }, heading,
    h('p', { class: 'muted', text: meta.vision || 'Veja os requisitos que já definem este sistema. Clique num requisito para focá-lo no mapa; depois, converse com a IA para entender ou propor uma mudança.' })));
  const { g, data } = buildSystemGraph(product, true);
  state.editor.graph = g;
  const wrap = h('div', { class: 'ctx-grid' });
  const right = h('aside', { class: 'sys-panel' });
  // resumo por status
  const byStatus = {}; for (const r of data.reqs) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const sum = h('div', { class: 'sys-sum' }, h('strong', { text: data.reqs.length + ' requisito' + (data.reqs.length === 1 ? '' : 's') }));
  for (const [s, n] of Object.entries(byStatus)) sum.append(badge(s + ' ' + n, 'b'));
  right.append(h('h3', { text: 'Requisitos do sistema' }), sum);
  if (!data.reqs.length) {
    right.append(h('p', { class: 'empty', text: 'Este sistema ainda não tem requisitos. Vá ao chat e descreva o primeiro.' }));
  } else {
    const ul = h('ul', { class: 'sys-list' });
    for (const r of [...data.reqs].sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))) {
      ul.append(h('li', { class: 'sys-item' },
        h('button', { class: 'btn-link rid', type: 'button', onclick: () => state.editor.graph && state.editor.graph.focus(r.id), 'aria-label': 'Focar ' + r.id + ' no mapa', text: r.id }),
        h('span', { class: 'sys-ti', text: truncateLabel(r.title || '', 56) }),
        h('button', { class: 'btn-link sys-refine', type: 'button', onclick: () => { state.editor.target_req_id = r.id; state.editor.stage = 'chat'; renderEditor(); }, title: 'Refinar este requisito com a IA', text: '✎ refinar' })));
    }
    right.append(ul);
  }
  wrap.append(h('div', { class: 'ctx-graph' }, g.el), right);
  body.append(wrap);
  // CAMINHO ÚNICO E FLUIDO: descreva a mudança aqui; a IA classifica INLINE (sem trocar de tela
  // nem repetir o mapa do sistema) e te leva ao caminho certo. chat/formulário = escapes discretos.
  const desc = h('textarea', { class: 'ai-sketch', rows: '3', 'aria-label': 'O que você quer mudar', placeholder: 'ex.: "na tela de perfil (/profile) mostrar o endereço do empreendimento do usuário"' });
  if (state.editor.sketch) desc.value = state.editor.sketch;
  const btn = h('button', { class: 'btn primary', type: 'button', text: '✨ Continuar' });
  const out = h('div', { class: 'ai-out' });
  const statusLive = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  function route(level, data) {
    data = data || {};
    if (level === 'refinement') {
      state.editor.refAnchors = (data.anchors || []).filter((a) => byId(a.requirement_id)).map((a) => ({ requirement_id: a.requirement_id, relation: a.relation || 'refines' }));
      state.editor.refSketch = state.editor.sketch; state.editor._refDrafted = false; state.editor.stage = 'refine'; renderEditor(); return;
    }
    if (level === 'requirement-edit' && data.target_req_id && byId(data.target_req_id)) {
      state.editId = data.target_req_id; state.editor.draft = null;
      state.editor.reviewSketch = state.editor.sketch; state.editor.reviewType = null; state.editor._reqDrafted = false;
      state.editor.stage = 'review'; renderEditor(); return;
    }
    state.editId = null; state.editor.draft = null;
    state.editor.reviewSketch = state.editor.sketch; state.editor.reviewType = data.suggested_type || null; state.editor._reqDrafted = false;
    state.editor.stage = 'review'; renderEditor();
  }
  function renderResult(d) {
    const lm = levelMeta(d.level);
    const card = h('div', { class: 'card classify-card', tabindex: '-1', 'aria-label': 'Recomendação: ' + lm.label },
      h('div', { class: 'classify-head' }, h('span', { class: 'classify-ic', 'aria-hidden': 'true', text: '✨' }), badge(lm.label, lm.cls),
        d.confidence != null ? h('span', { class: 'muted small', text: 'confiança ' + d.confidence }) : null),
      h('p', { class: 'classify-rat', text: d.rationale || lm.desc }));
    const cites = filterCitations((d.anchors || []).map((a) => a.requirement_id).concat(d.target_req_id ? [d.target_req_id] : []), DATA.baseline.requirements);
    if (cites.length) {
      const cc = h('div', { class: 'classify-anchors' }, h('span', { class: 'muted small', text: d.level === 'requirement-edit' ? 'Requisito alvo:' : 'Ancorar em:' }));
      cites.forEach((id) => cc.append(h('button', { class: 'btn-link chat-cite', type: 'button', onclick: () => state.editor.graph && state.editor.graph.focus(id), text: id })));
      card.append(cc);
    }
    const acts = h('div', { class: 'classify-acts' });
    const primary = h('button', { class: 'btn primary', type: 'button',
      text: d.level === 'refinement' ? 'Criar refinamento →' : (d.level === 'requirement-edit' && byId(d.target_req_id) ? 'Editar ' + d.target_req_id + ' →' : 'Criar requisito novo →'),
      onclick: () => route(d.level, d) });
    acts.append(primary);
    if (d.level !== 'refinement') acts.append(h('button', { class: 'btn', type: 'button', text: 'É um refinamento', onclick: () => route('refinement', { anchors: d.anchors || [] }) }));
    if (d.level !== 'new-requirement') acts.append(h('button', { class: 'btn', type: 'button', text: 'É um requisito novo', onclick: () => route('new-requirement', {}) }));
    card.append(h('p', { class: 'muted small', text: 'A IA recomenda; você decide o caminho.' }), acts);
    out.replaceChildren(card);
    statusLive.textContent = 'Recomendação: ' + lm.label + (d.confidence != null ? ' (confiança ' + d.confidence + ')' : '') + '.';
    card.focus();
  }
  async function classify() {
    const sk = (desc.value || '').trim();
    state.editor.sketch = sk;
    if (sk.length < 3) { desc.focus(); statusLive.textContent = 'Descreva a mudança (ao menos uma frase).'; return; }
    out.replaceChildren(h('p', { class: 'muted', text: 'Consultando a IA…' })); statusLive.textContent = 'Consultando a IA…';
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    try {
      const r = await AI.post('/v1/authoring/classify', { product, sketch: sk, grounding: productGrounding(DATA.baseline.requirements, product) });
      if (!r.ok) { const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status; out.replaceChildren(h('div', { class: 'card' }, h('h3', { text: 'IA: ' + code }), h('p', { class: 'muted', text: (r.data && r.data.error && r.data.error.message) || '' }))); return; }
      renderResult(r.data);
    } catch (e) { out.replaceChildren(h('p', { class: 'empty', text: 'Erro de rede ao chamar a IA: ' + (e && e.message ? e.message : e) })); }
    finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
  btn.addEventListener('click', classify);
  desc.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); classify(); } });
  body.append(h('div', { class: 'ctx-describe' },
    h('label', { class: 'fld wide' }, h('span', { class: 'fld-l', text: 'O que você quer mudar neste sistema? (a IA decide se é um refinamento de tela, um ajuste ou um requisito novo)' }), desc),
    h('div', { class: 'ws-actions ctx-describe-act' }, btn,
      h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editor.target_req_id = null; state.editor.stage = 'chat'; renderEditor(); }, text: 'Prefiro conversar' }),
      h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editId = null; state.editor.draft = null; state.editor.stage = 'review'; renderEditor(); }, text: 'Prefiro o formulário' })),
    statusLive, out));
  heading.focus();
  if (state.editor._autoClassify && (desc.value || '').trim().length >= 3) { state.editor._autoClassify = false; classify(); }
}

const INTENT_CHIPS = [
  { label: '❓ Entender o sistema', msg: 'Me explique, com base nos requisitos, o que este sistema faz hoje.' },
  { label: '+ Adicionar capacidade', msg: 'Quero adicionar uma nova capacidade ao sistema. Vou descrever a seguir.' },
  { label: '✎ Refinar um requisito', msg: 'Quero refinar/ajustar um requisito existente.' },
  { label: '⚠ Reportar uma lacuna', msg: 'Acho que falta algo no sistema. Me ajude a identificar e a estruturar.' },
];

/* materializa tokens inline do parseMarkdown em nós DOM (via h()/createTextNode — nunca innerHTML). */
function renderInline(tokens) {
  return (tokens || []).map((t) => {
    if (t.t === 'strong') return h('strong', { text: t.v });
    if (t.t === 'em') return h('em', { text: t.v });
    if (t.t === 'code') return h('code', { class: 'chat-ic', text: t.v });
    if (t.t === 'link') return h('a', { class: 'chat-link', href: t.href, target: '_blank', rel: 'noopener noreferrer nofollow', text: t.v });
    return document.createTextNode(t.v == null ? '' : String(t.v));
  });
}
/* renderiza markdown (headings/listas/negrito/código) como nós DOM CSP-safe. */
function renderMarkdown(text) {
  const out = [];
  for (const blk of parseMarkdown(text)) {
    if (blk.type === 'heading') out.push(h('p', { class: 'chat-h' }, ...renderInline(blk.inline)));
    else if (blk.type === 'ul' || blk.type === 'ol') out.push(h(blk.type, { class: 'chat-list' }, ...blk.items.map((it) => h('li', {}, ...renderInline(it)))));
    else if (blk.type === 'code') out.push(h('pre', { class: 'chat-code' }, h('code', { text: blk.text })));
    else { const kids = []; blk.lines.forEach((ln, idx) => { if (idx) kids.push(h('br')); kids.push(...renderInline(ln)); }); out.push(h('p', { class: 'chat-par' }, ...kids)); }
  }
  return out;
}

/* bolha de chat CSP-safe (só nós via h(), sem innerHTML; assistente=markdown, usuário=texto puro). */
function chatBubble(turn, opts) {
  const onCite = (opts && opts.onCite) || ((id) => { if (state.editor && state.editor.graph) state.editor.graph.focus(id); });
  const who = turn.role === 'user' ? 'is-user' : 'is-ai';
  const b = h('div', { class: 'chat-msg ' + who + (turn.error ? ' is-err' : '') });
  // "fora da base" só quando é uma AFIRMAÇÃO sobre o sistema sem ancoragem (não em pergunta de volta,
  // rascunho proposto ou quando houve citações) — evita o selo aparecer em quase toda resposta.
  if (turn.role === 'assistant' && turn.intent === 'question' && turn.grounded === false && !turn.draft && !turn.next_question && !(turn.citations && turn.citations.length)) {
    b.append(h('div', { class: 'chat-nobase' }, badge('fora da base de requisitos', 'b-low')));
  }
  // Assistente: markdown renderizado (CSP-safe), com fallback p/ texto puro; usuário/erro: texto puro.
  if (turn.role === 'assistant' && !turn.error) {
    let nodes = [];
    try { nodes = renderMarkdown(turn.content || ''); } catch { nodes = []; }
    if (nodes.length) nodes.forEach((n) => b.append(n));
    else String(turn.content || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((p) => b.append(h('p', { class: 'chat-par', text: p })));
  } else {
    String(turn.content || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((p) => b.append(h('p', { class: 'chat-par', text: p })));
  }
  if (turn.citations && turn.citations.length) {
    const c = h('div', { class: 'chat-cites' }, h('span', { class: 'chat-cites-l', text: 'Requisitos citados:' }));
    for (const id of turn.citations) c.append(h('button', { class: 'btn-link chat-cite', type: 'button', onclick: () => onCite(id), text: id }));
    b.append(c);
  }
  // UMA pergunta de cada vez (substitui a lista de open_questions)
  if (turn.next_question) b.append(h('p', { class: 'chat-next-q', text: turn.next_question }));
  // rascunho proposto: card enxuto com CTA (não despeja o draft na prosa)
  if (turn.draft) {
    const d = turn.draft;
    const card = h('div', { class: 'chat-draft-card' },
      h('div', { class: 'chat-draft-head' }, h('span', { class: 'chat-draft-ic', 'aria-hidden': 'true', text: '✦' }), h('strong', { text: d.title || 'Requisito proposto' })),
      h('p', { class: 'chat-draft-st', text: truncateLabel(d.statement || '', 140) }),
      h('div', { class: 'chat-draft-meta' }, badge(typeLabel(d.type) || 'funcional', 'b-fn'), d.priority ? badge(d.priority, prioCls(d.priority)) : null),
      h('button', { class: 'btn primary chat-draft-cta', type: 'button', onclick: () => applyProposalToReview(d), text: 'Revisar mudança →' }));
    b.append(card);
  }
  return b;
}

/* Estágio 3 — chat guiado e grounded (único estágio que usa /v1/authoring/assist). */
function renderChatStage(body) {
  const product = state.editor.product;
  const meta = productMeta(product);
  const count = productReqCount(product);
  body.append(edCrumbs(product, 'Conversa'));
  const heading = h('h2', { class: 'editor-title', tabindex: '-1', text: 'Conversa — ' + (meta.display_name || product) });
  body.append(h('div', { class: 'ed-guided-head' }, heading,
    h('p', { class: 'muted', text: 'Pergunte sobre o sistema (respondo citando os requisitos) ou descreva a mudança que precisa — eu proponho um requisito estruturado para você revisar.' })));
  const wrap = h('div', { class: 'chat-wrap' });
  const left = h('div', { class: 'chat-col' });
  const banner = h('div', {});
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com a IA' });
  // indicador de "digitando" PERSISTENTE (só alterna hidden) — anunciável (texto oculto + aria-busy no log)
  const typingEl = h('div', { class: 'chat-msg is-ai chat-typing', hidden: 'hidden' },
    h('span', { class: 'visually-hidden', text: 'A IA está respondendo…' }),
    h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'dot', 'aria-hidden': 'true' }));
  const actions = h('div', { class: 'chat-actions' });
  const ta = h('textarea', { class: 'chat-input', rows: '2', 'aria-label': 'Sua mensagem', placeholder: 'Pergunte sobre o sistema ou descreva a mudança que você precisa… (Ctrl+Enter envia)' });
  const sendBtn = h('button', { class: 'btn primary', type: 'button', text: 'Enviar' });
  // anexos da conversa (IA multimodal): a mensagem pode vir acompanhada de arquivos
  const chatFiles = filePicker({ label: 'Anexar arquivos à mensagem', buttonLabel: 'Anexar' });
  const { g } = buildSystemGraph(product, false);
  state.editor.graph = g;
  const right = h('aside', { class: 'chat-rail' }, h('h3', { text: 'Mapa do sistema' }), g.el);
  let pending = false, painted = 0;

  function greetingText() {
    const tgt = state.editor.target_req_id;
    return tgt
      ? `Vamos refinar ${tgt}. O que você quer ajustar? Posso explicar o requisito atual e propor a versão revisada.`
      : `Conheço os ${count} requisito(s) de ${meta.display_name || product}. Pergunte sobre o sistema, ou descreva a capacidade/mudança que você precisa — eu proponho um requisito estruturado para você revisar.`;
  }
  function renderActions() {
    actions.replaceChildren();
    // o CTA "Revisar" vive no card de draft DENTRO da bolha (chatBubble); aqui só chips de resposta rápida.
    const last = [...state.editor.messages].reverse().find((m) => m.role === 'assistant' && !m.error);
    const chips = last ? (last.quick_replies || []) : INTENT_CHIPS.map((c) => c.msg);
    const labels = last ? null : INTENT_CHIPS.map((c) => c.label);
    chips.forEach((msg, i) => actions.append(h('button', { class: 'chat-chip', type: 'button', onclick: () => send(msg), text: labels ? labels[i] : msg })));
  }
  // APPEND incremental: só anexa as bolhas NOVAS ao live region (replaceChildren não anuncia de forma confiável).
  function repaint() {
    for (let i = painted; i < state.editor.messages.length; i++) log.insertBefore(chatBubble(state.editor.messages[i]), typingEl);
    painted = state.editor.messages.length;
    typingEl.hidden = !pending;
    log.setAttribute('aria-busy', pending ? 'true' : 'false');
    log.scrollTop = log.scrollHeight;
    renderActions();
  }
  async function send(text) {
    text = String(text || '').trim();
    const files = chatFiles.hasFiles() ? chatFiles.files() : [];
    if ((!text && !files.length) || pending) return;
    // mostra na bolha do usuário a mensagem + os nomes dos anexos (nunca os bytes)
    const attachNote = files.length ? (text ? '\n\n' : '') + '📎 ' + files.map((f) => f.name).join(', ') : '';
    state.editor.messages.push({ role: 'user', content: text + attachNote });
    pending = true; sendBtn.disabled = true; ta.value = ''; repaint();
    try {
      const chatFields = {
        product, target_req_id: state.editor.target_req_id || undefined, message: text,
        history: state.editor.messages.slice(0, -1).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        grounding: productGrounding(DATA.baseline.requirements, product),
        arch_summary: systemContext(DATA.products, product) || undefined, // o chat passa a CONHECER a stack
      };
      // Com anexos → multipart na MESMA rota /v1/authoring/chat; sem anexos → AI.chat (JSON, retrocompat).
      const r = files.length
        ? await AI.postMultipart('/v1/authoring/chat', { fields: chatFields, files })
        : await AI.chat(chatFields);
      if (files.length) chatFiles.clear();
      pending = false; sendBtn.disabled = false;
      if (!r.ok) {
        const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status;
        const msg = r.data && r.data.error ? r.data.error.message : '';
        state.editor.messages.push({ role: 'assistant', error: true, content: 'A IA respondeu com erro (' + code + ')' + (msg ? ': ' + msg : '') + '. Você pode tentar de novo ou preencher manualmente.' });
        repaint(); return;
      }
      const d = r.data || {};
      state.editor.messages.push({
        role: 'assistant', content: d.reply || '(sem resposta)', intent: d.intent,
        citations: filterCitations(d.citations || [], DATA.baseline.requirements),
        grounded: d.grounded !== false, draft: d.draft || null,
        next_question: d.next_question || '', quick_replies: d.quick_replies || [],
      });
      repaint();
    } catch (e) {
      pending = false; sendBtn.disabled = false;
      state.editor.messages.push({ role: 'assistant', error: true, content: 'Erro de rede ao falar com a IA: ' + (e && e.message ? e.message : e) });
      repaint();
    }
  }
  sendBtn.addEventListener('click', () => send(ta.value));
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(ta.value); } });

  // saudação inicial (uma bolha) + indicador de digitando sempre por último no log
  log.append(chatBubble({ role: 'assistant', content: greetingText(), grounded: true }), typingEl);
  left.append(banner, log, actions, chatFiles.el, h('div', { class: 'chat-inputrow' }, ta, sendBtn));
  wrap.append(left, right);
  body.append(wrap);
  repaint();
  heading.focus(); // move o foco ao entrar no estágio (transição de SPA não deve perder o foco)
  AI.health().then((r) => {
    if (!r.ok || !(r.data && r.data.ai)) {
      banner.replaceChildren(h('div', { class: 'chat-banner' },
        h('span', { text: 'A IA está indisponível agora (o servidor respondeu sem ela). Você ainda pode estruturar o requisito manualmente.' }),
        h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editor.stage = 'review'; renderEditor(); }, text: 'Preencher manualmente →' })));
    }
  }).catch(() => {});
}

function applyProposalToReview(draft) {
  // Refinar um requisito EXISTENTE edita-o no lugar (id fixo + URL de edit no PR); senão cria novo.
  const tgt = state.editor.target_req_id;
  state.editId = (tgt && byId(tgt)) ? tgt : null;
  state.editor.draft = draft;
  state.editor.stage = 'review';
  renderEditor();
}

/* Estágio 4 — CONFIRMAÇÃO estruturada (o formulário de sempre; schema/collectDraft INTACTOS). */
function renderReviewForm(body) {
  const ed = state.editId ? byId(state.editId) : null;

  // ---- formulário (campos) — coluna direita ----
  const f = {};
  const form = h('div', { class: 'ed-form' });
  const inp = (v, attrs) => h('input', { type: 'text', value: v ?? '', ...(attrs || {}) });
  const area = (v, rows) => h('textarea', { rows: String(rows || 3) }, v ?? '');
  const sel = (opts, v) => { const s = h('select'); for (const o of opts) { const op = h('option', { value: o, text: o }); if (o === v) op.selected = true; s.append(op); } return s; };
  const section = (title, hint) => { const sec = h('fieldset', { class: 'ed-section' }, h('legend', { text: title })); if (hint) sec.append(h('p', { class: 'ed-hint', text: hint })); const g = h('div', { class: 'ed-grid' }); sec.append(g); form.append(sec); return g; };
  const field = (grid, label, key, el, wide) => { grid.append(h('label', { class: 'fld' + (wide ? ' wide' : '') }, h('span', { class: 'fld-l', text: label }), el)); if (key) f[key] = el; };

  // ---- 1) Identidade ----
  const sId = section('Identidade');
  const scopes = uniqueValues(DATA.baseline.requirements, (r) => r.scope && r.scope.product_scope).filter(Boolean).sort();
  const prodNames = {}; for (const p of ((DATA.products && DATA.products.products) || [])) prodNames[p.name] = p.display_name || p.name;
  const productSel = h('select', { 'aria-label': 'Produto (product_scope)' });
  const edScope = (ed && ed.scope && ed.scope.product_scope) || '';
  // ao editar um requisito cujo produto ainda nao esta na baseline (produto novo), inclui o
  // escopo dele como opcao selecionavel — senao o select casaria com o produto errado.
  const optScopes = edScope && !scopes.includes(edScope) ? [edScope, ...scopes] : scopes;
  for (const sc of optScopes) { const op = h('option', { value: sc, text: prodNames[sc] ? `${prodNames[sc]} · ${sc}` : sc }); if (sc === edScope) op.selected = true; productSel.append(op); }
  productSel.append(h('option', { value: '__new__', text: '+ outro produto…' }));
  // o produto faz parte da identidade do requisito — fixo ao editar (mover de produto = outro fluxo).
  if (ed) productSel.disabled = true;
  const productNew = h('input', { type: 'text', placeholder: 'slug do produto novo (ex.: helpdesk)', hidden: 'hidden', 'aria-label': 'Produto novo' });
  const productScope = () => (productSel.value === '__new__' ? (productNew.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : productSel.value);
  field(sId, 'Produto', null, h('div', { class: 'ed-prod' }, productSel, productNew), true);
  const idInput = h('input', { type: 'text', value: ed?.id || '', readonly: 'readonly', 'aria-label': 'ID do requisito' });
  f.id = idInput;
  const idEdit = h('input', { type: 'checkbox' });
  const recomputeId = () => { if (ed || idEdit.checked) return; const sc = productScope(); idInput.value = sc ? nextReqId(sc, DATA.baseline.requirements.map((r) => r.id)) : ''; };
  field(sId, 'ID', null, h('div', { class: 'ed-id' }, idInput, ed ? null : h('label', { class: 'ed-id-edit' }, idEdit, ' editar manualmente')), true);
  idEdit.addEventListener('change', () => { if (idEdit.checked) idInput.removeAttribute('readonly'); else { idInput.setAttribute('readonly', 'readonly'); recomputeId(); } });
  productSel.addEventListener('change', () => { productNew.hidden = productSel.value !== '__new__'; recomputeId(); runValidation(); });
  productNew.addEventListener('input', recomputeId);
  field(sId, 'Título', 'title', inp(ed?.title), true);

  // ---- 2) Classificação ----
  const sClass = section('Classificação');
  field(sClass, 'Tipo', 'type', sel(['functional', 'non-functional', 'business-rule', 'constraint'], ed?.type || 'functional'));
  field(sClass, 'Aplica-se a', 'applies_to', sel(['product', 'product-foundation', 'shared-module', 'capability', 'portal-template', 'portal-instance', 'platform'], ed?.scope?.applies_to || 'product'));
  field(sClass, 'Status', 'status', sel(['draft', 'proposed', 'approved', 'deprecated', 'retired'], ed?.status || 'proposed'));
  field(sClass, 'Owner', 'owner', inp(ed?.owner || 'plataforma-digital'));

  // ---- 3) Prioridade & criticidade ----
  const sPrio = section('Prioridade & criticidade');
  field(sPrio, 'Prioridade', 'priority', sel(['low', 'medium', 'high', 'critical'], ed?.priority || 'medium'));
  field(sPrio, 'Criticidade', 'criticality', sel(['low', 'medium', 'high', 'critical'], ed?.criticality || ed?.priority || 'medium'));
  field(sPrio, 'Significância arquitetural (ASR)', 'asr', sel(['false', 'true'], String(!!ed?.architectural_significance)));

  // ---- 4) Definição ----
  const sDef = section('Definição');
  field(sDef, 'Enunciado (o sistema DEVE…)', 'statement', area(ed?.statement, 4), true);
  field(sDef, 'Origem / source_paths (1 por linha)', 'source_paths', area((ed?.source?.source_paths || []).join('\n'), 2), true);

  // ---- 5) Aceite & verificação ----
  const sAcc = section('Aceite & verificação');
  field(sAcc, 'Critérios de aceite (1 por linha)', 'acceptance', area((ed?.acceptance_criteria || []).join('\n'), 3), true);
  const VM = ['test-unit', 'test-integration', 'test-e2e', 'architecture-review', 'deployment-policy-check', 'manual-review', 'monitoring', 'demo'];
  const vmSel = new Set(ed?.verification_method || []);
  const vmHint = h('p', { class: 'vm-hint', id: 'vm-hint', text: 'Seleção múltipla — clique para marcar/desmarcar quantos métodos forem aplicáveis.' });
  const vmWrap = h('div', { class: 'vm-chips', role: 'group', 'aria-label': 'Métodos de verificação', 'aria-describedby': 'vm-hint' });
  const vmChips = {};
  for (const m of VM) { const c = h('button', { class: 'vm-chip', type: 'button', 'aria-pressed': vmSel.has(m) ? 'true' : 'false', text: m }); c.addEventListener('click', () => { const on = c.getAttribute('aria-pressed') === 'true'; c.setAttribute('aria-pressed', on ? 'false' : 'true'); if (on) vmSel.delete(m); else vmSel.add(m); }); vmChips[m] = c; vmWrap.append(c); }
  f.methods = { get value() { return [...vmSel]; }, set value(arr) { const want = new Set(Array.isArray(arr) ? arr : []); vmSel.clear(); for (const m of VM) { const on = want.has(m); if (on) vmSel.add(m); if (vmChips[m]) vmChips[m].setAttribute('aria-pressed', on ? 'true' : 'false'); } } };
  field(sAcc, 'Métodos de verificação', null, h('div', { class: 'vm-field' }, vmHint, vmWrap), true);

  // ---- 6) Cenários de qualidade (NFR) — condicional ao tipo ----
  const sNfr = section('Cenários de qualidade (NFR)', 'Obrigatório para requisitos não-funcionais — formato SEI: fonte/estímulo/ambiente/artefato → resposta + medida.');
  const sNfrFieldset = sNfr.parentElement;
  const qs = ed?.quality_scenarios?.[0] || {};
  for (const [k, lbl] of [['qs_source', 'Fonte'], ['qs_stimulus', 'Estímulo'], ['qs_environment', 'Ambiente'], ['qs_artifact', 'Artefato'], ['qs_response', 'Resposta'], ['qs_measure', 'Medida (response_measure)']]) {
    field(sNfr, lbl, k, inp(qs[k.replace('qs_', '').replace('measure', 'response_measure')]));
  }
  const toggleNfr = () => { sNfrFieldset.hidden = f.type.value !== 'non-functional'; };
  f.type.addEventListener('change', toggleNfr);

  // ---- Vínculos & rastreabilidade — SELEÇÃO VISUAL no mapa do sistema ----
  const LINK_TYPES = ['depends_on', 'relates_to', 'refines', 'derives_from', 'constrains', 'conflicts_with', 'allocates_to', 'verifies'];
  const links = (ed && Array.isArray(ed.links)) ? ed.links.map((l) => ({ type: l.type, target: l.target, note: l.note })).filter((l) => l.type && l.target) : [];
  const linkType = sel(LINK_TYPES, 'depends_on');
  // produto cujo MAPA é exibido para vincular. Default = o produto DESTE requisito; pode trocar
  // para vincular a requisitos de OUTROS projetos (ai, sicat, …). Todos os escopos com requisitos.
  const allScopes = uniqueValues(DATA.baseline.requirements, (r) => r.scope && r.scope.product_scope).filter(Boolean).sort();
  const initialProduct = (ed && ed.scope && ed.scope.product_scope) || (state.editor && state.editor.product) || (allScopes[0] || '');
  const mapProductSel = h('select', { 'aria-label': 'Sistema do mapa de vínculos' });
  for (const sc of allScopes) { const dn = productMeta(sc).display_name; const op = h('option', { value: sc, text: (dn && dn !== sc) ? (dn + ' · ' + sc) : sc }); if (sc === initialProduct) op.selected = true; mapProductSel.append(op); }
  const linkProduct = () => mapProductSel.value || initialProduct;
  const sLinks = h('fieldset', { class: 'ed-section ed-links-sec' },
    h('legend', { text: 'Vínculos & rastreabilidade' }),
    h('p', { class: 'ed-hint', text: 'Escolha o tipo de relação e clique num requisito no mapa para vincular (vira aresta no mapa de impacto e vai para o YAML ao gerar). Troque o “Sistema do mapa” para vincular a requisitos de OUTROS projetos. No assistente, “Classificar vínculos (IA)” sugere vínculos automaticamente.' }),
    h('div', { class: 'ed-link-tb' },
      h('label', { class: 'ed-link-tb-f' }, h('span', { class: 'fld-l', text: 'Tipo de relação' }), linkType),
      h('label', { class: 'ed-link-tb-f' }, h('span', { class: 'fld-l', text: 'Sistema do mapa' }), mapProductSel)));
  const linkMapHost = h('div', { class: 'ed-link-map' });
  const linksList = h('ul', { class: 'ed-links' });
  sLinks.append(linkMapHost, h('p', { class: 'ed-links-head muted small', text: 'Vínculos deste requisito' }), linksList);
  form.append(sLinks);

  const linkOf = (id) => links.find((l) => l.target === id);
  function renderLinksList() {
    linksList.replaceChildren();
    if (!links.length) { linksList.append(h('li', { class: 'ed-links-empty muted', text: 'Nenhum vínculo ainda — clique num requisito no mapa acima.' })); return; }
    links.forEach((l) => linksList.append(h('li', { class: 'ed-link-item' },
      badge(l.type, 'b'),
      h('button', { class: 'btn-link rid', type: 'button', title: byId(l.target) ? 'Focar no mapa' : 'alvo externo', onclick: () => { if (linkGraph && byId(l.target)) linkGraph.focus(l.target); }, text: l.target }),
      l.note ? h('span', { class: 'muted small ed-link-note', text: l.note }) : null,
      h('button', { class: 'btn-link ed-link-rm', type: 'button', 'aria-label': 'Remover vínculo ' + l.type + ' ' + l.target, title: 'Remover', onclick: () => removeLink(l.target, l.type), text: '✕' }))));
  }
  // re-marca os nós vinculados no mapa (re-setData; forceLayout é determinístico → posições estáveis,
  // e o painel de detalhe do nó focado re-renderiza com a ação atualizada).
  function syncMark() { if (linkGraph) { const d = productGraphData(linkProduct()); linkGraph.setData(d.nodes, d.edges); } }
  // addLink: dedupe por type+target; nunca vincula a si mesmo. Reusado pelos vínculos sugeridos pela IA.
  function addLink(type, target, note) {
    type = String(type || '').trim(); target = String(target || '').trim();
    if (!type || !target || !LINK_TYPES.includes(type)) return false;
    if (ed && ed.id === target) return false;
    if (links.some((l) => l.type === type && l.target === target)) return false;
    links.push({ type, target, ...(note ? { note: String(note) } : {}) });
    renderLinksList(); syncMark();
    return true;
  }
  function removeLink(target, type) {
    const before = links.length;
    for (let i = links.length - 1; i >= 0; i--) if (links[i].target === target && (!type || links[i].type === type)) links.splice(i, 1);
    if (links.length !== before) { renderLinksList(); syncMark(); }
  }

  let linkGraph = null;
  function buildLinkMap() {
    const product = linkProduct();
    const data = productGraphData(product);
    if (!data.nodes.length) { linkGraph = null; linkMapHost.replaceChildren(h('p', { class: 'empty', text: product ? 'Este sistema ainda não tem requisitos para vincular.' : 'Selecione o produto (acima) para ver o mapa.' })); return; }
    linkGraph = interactiveGraph({
      label: 'Mapa de requisitos — clique para vincular',
      nodeClass: (n) => (linkOf(n.id) ? 'is-linked' : '') + (ed && ed.id === n.id ? ' is-self' : ''),
      onOpen: (id) => { if (byId(id)) openReq(id); },
      detailOf: (n, id) => {
        const r = byId(id) || {};
        const self = ed && ed.id === id;
        const existing = linkOf(id);
        const actions = [];
        if (!self) {
          if (existing) actions.push({ label: '✕ Remover vínculo (' + existing.type + ')', cls: 'btn-link ed-link-danger', onClick: () => removeLink(id) });
          else actions.push({ label: '🔗 Vincular como ' + linkType.value, cls: 'btn primary ig-act', onClick: () => addLink(linkType.value, id) });
        }
        return {
          title: r.title || '',
          sub: id + (self ? ' · este requisito (não vincula a si)' : (existing ? ' · vinculado: ' + existing.type : '')),
          badges: r.type ? [badge(r.type === 'non-functional' ? 'NFR' : 'funcional', r.type === 'non-functional' ? 'b-nfr' : 'b-fn')] : [],
          openable: !!r.id, actions,
        };
      },
    });
    linkGraph.setData(data.nodes, data.edges);
    linkMapHost.replaceChildren(linkGraph.el);
  }
  buildLinkMap();
  renderLinksList();
  mapProductSel.addEventListener('change', buildLinkMap); // trocar o sistema do mapa → vincular cross-projeto
  // ao trocar o produto DO REQUISITO (criação), o mapa acompanha por padrão.
  productSel.addEventListener('change', () => { mapProductSel.value = productScope() || mapProductSel.value; buildLinkMap(); });

  // ---- 7) Versionamento (avançado, recolhido) ----
  const sVerDet = h('details', { class: 'ed-section ed-adv' }, h('summary', { text: 'Versionamento (gerenciado automaticamente)' }));
  sVerDet.append(h('p', { class: 'ed-hint', id: 'ver-auto', text: 'baseline_version e item_revision são gerados automaticamente; ajuste apenas o tipo de mudança e a justificativa.' }));
  const sVer = h('div', { class: 'ed-grid' }); sVerDet.append(sVer); form.append(sVerDet);
  field(sVer, 'baseline_version', 'bver', inp(ed?.version?.baseline_version || '1.0.0', { readonly: 'readonly', title: 'Gerado automaticamente', 'aria-describedby': 'ver-auto' }));
  field(sVer, 'item_revision', 'irev', inp(String(ed ? (ed.version?.item_revision || 1) + 1 : 1), { readonly: 'readonly', title: 'Gerado automaticamente', 'aria-describedby': 'ver-auto' }));
  field(sVer, 'semantic_change', 'sem', sel(['none', 'patch', 'minor', 'major'], ed ? 'minor' : 'none'));
  field(sVer, 'change_reason', 'reason', inp(ed ? '' : 'novo requisito'), true);

  recomputeId();
  toggleNfr();
  const out = h('div');

  // ---- VALIDAÇÃO AUTOMÁTICA (client-side, sem API): roda ao digitar ----
  const valOut = h('div', { class: 'val-out', 'aria-live': 'polite', 'aria-atomic': 'false' });
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
  // anexos do esboço (IA multimodal): a IA pode rascunhar a partir de um documento/planilha/imagem
  const sketchFiles = filePicker({ label: 'Anexar arquivos ao esboço', buttonLabel: 'Anexar arquivos (opcional)' });
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
      const draftFields = { sketch: (sketch.value || '').trim(), scope: productScope() };
      const draftFiles = sketchFiles.hasFiles() ? sketchFiles.files() : []; // arquivos opcionais → multipart
      const r = draftFiles.length
        ? await AI.postMultipart('/v1/authoring/draft', { fields: draftFields, files: draftFiles })
        : await AI.post('/v1/authoring/draft', draftFields);
      if (!r.ok) return showErr(r);
      applyDraftToForm(r.data.draft || {});
      runValidation();
      const warns = (r.data.draft && r.data.draft.warnings) || [];
      aiOut.replaceChildren(h('div', { class: 'card' },
        h('h3', { text: 'Rascunho aplicado (' + (r.data.prompt_version || '') + ')' }),
        h('p', { class: 'muted', text: warns.length ? 'Avisos: ' + warns.join('; ') : 'Campos preenchidos à direita — revise e clique em Gerar YAML.' })));
    });
  }
  // LOOP de reasoning: analisa → corrige (revise) → re-analisa, SOZINHO. A decisão de parar é
  // por LACUNA ACIONÁVEL + PROGRESSO (refineDecision, pura/testada em lib.js), não por um score-alvo
  // fixo: enquanto sobrar lacuna que TRAVA o requisito (blocker/warning) e a IA ainda conseguir
  // reduzir lacunas/subir a prontidão, ela continua corrigindo retroativamente. Só entrega ao
  // humano quando zera as acionáveis (pronto), empaca (platô) ou bate o teto de rodadas (anti-loop).
  let refining = false;
  let refineBtn = null; // ref. ao botão p/ aria-busy/disabled durante o loop
  // rótulo/cor por severidade (apresentação pt-BR; não é heurística de conteúdo): warning é
  // acionável → cor de atenção; só info é opcional. As classes b-crit/b-high/b-low já existem.
  const SEV_LABEL = { blocker: 'crítico', warning: 'atenção', info: 'opcional' };
  const SEV_CLS = { blocker: 'b-crit', warning: 'b-high', info: 'b-low' };
  function doRefine() {
    if (refining) return;
    const MAX = 8, STALE = 2;
    refining = true;
    if (refineBtn) { refineBtn.disabled = true; refineBtn.setAttribute('aria-busy', 'true'); }
    guard(async () => {
      const log = h('div', { class: 'refine-log' }); // log visual (NÃO live — evita inundar o AT)
      // região viva DEDICADA: recebe só o resumo final (1 update => 1 anúncio limpo)
      const liveSummary = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
      aiOut.replaceChildren(h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'asst-spark', 'aria-hidden': 'true', text: '✨' }), ' Analisar & refinar'), h('p', { class: 'muted small', text: 'A IA analisa, corrige e re-analisa sozinha até zerar as lacunas que travam o requisito (ou até não conseguir mais melhorar).' }), liveSummary, log));
      const gapItem = (g) => { const sev = g.severity || 'info'; return h('li', {}, badge(SEV_LABEL[sev] || sev, SEV_CLS[sev] || 'b-low'), ' ' + ((g.field ? g.field + ': ' : '') + (g.message || ''))); };
      const finish = (action, score, dec) => {
        let head;
        if (action === 'ready') head = h('p', { class: 'refine-ok', tabindex: '-1', text: '✓ Requisito pronto (prontidão ' + score + '). Sem lacunas que travem — revise e clique em Gerar YAML.' });
        else if (action === 'plateau') head = h('p', { class: 'refine-warn', tabindex: '-1', text: '⚠ A IA refinou até onde conseguiu (prontidão ' + score + '). Os pontos abaixo precisam da sua decisão — a IA não inventa o que não está definido.' });
        else head = h('p', { class: 'refine-warn', tabindex: '-1', text: 'Parei após ' + MAX + ' rodadas (prontidão ' + score + ') para não ficar em loop. Revise os pontos abaixo.' });
        log.append(head);
        if (dec.actionable.length) { const ul = h('ul', { class: 'errlist' }); dec.actionable.forEach((g) => ul.append(gapItem(g))); log.append(h('p', { class: 'muted small', text: 'Pontos que precisam de você (' + dec.actionable.length + '):' }), ul); }
        if (dec.info.length) { const det = h('details', { class: 'refine-optional' }); det.append(h('summary', { text: dec.info.length + ' sugestão(ões) opcional(is) de polimento' })); const ul = h('ul', { class: 'errlist' }); dec.info.forEach((g) => ul.append(gapItem(g))); det.append(ul); log.append(det); }
        log.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn', type: 'button', text: 'Refinar de novo', onclick: doRefine })));
        liveSummary.textContent = (head.textContent || '') + (dec.actionable.length ? ' ' + dec.actionable.length + ' ponto(s) precisam de você.' : '');
        try { head.focus(); } catch (e) { /* foco best-effort */ }
      };
      let best = null, stale = 0;
      for (let i = 0; i < MAX; i++) {
        const step = h('p', { class: 'refine-step', text: 'Rodada ' + (i + 1) + ' — analisando…' }); log.append(step);
        const ra = await AI.post('/v1/authoring/analyze', { requirement: collectDraft() });
        if (!ra.ok) { showErr(ra); return; }
        const score = ra.data.score != null ? Number(ra.data.score) : 0;
        const gaps = ra.data.gaps || [];
        const dec = refineDecision({ round: i, score, gaps, best, stale, maxRounds: MAX, staleLimit: STALE });
        best = dec.best; stale = dec.stale;
        step.replaceChildren(h('strong', { text: 'Rodada ' + (i + 1) }), ' · prontidão ', h('span', { class: 'refine-score', text: String(score) }), ' · ' + (dec.actionable.length ? dec.actionable.length + ' lacuna(s) crítica(s)' : 'sem lacunas críticas') + (dec.info.length ? ' (+' + dec.info.length + ' opcional)' : ''));
        if (dec.action !== 'fix') return finish(dec.action, score, dec);
        log.append(h('p', { class: 'refine-fix muted small', text: '↳ corrigindo ' + dec.actionable.length + ' lacuna(s) crítica(s) com IA…' }));
        // prioriza as acionáveis no revise; manda as opcionais como contexto secundário
        const rv = await AI.post('/v1/authoring/revise', { requirement: collectDraft(), gaps: dec.actionable.concat(dec.info) });
        if (!rv.ok) { showErr(rv); return; }
        if (rv.data && rv.data.draft) { applyDraftToForm(rv.data.draft); runValidation(); }
      }
    }).finally(() => { refining = false; if (refineBtn) { refineBtn.disabled = false; refineBtn.removeAttribute('aria-busy'); } });
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
      const card = h('div', { class: 'card' }, h('h3', { text: 'Vínculos sugeridos — ' + (r.data.prompt_version || '') }));
      if (!sg.length) card.append(h('p', { class: 'empty', text: 'Nenhum vínculo relevante entre os candidatos.' }));
      else {
        card.append(h('p', { class: 'muted small', text: 'Clique em “adicionar” para incluir o vínculo no requisito (entra no YAML ao gerar).' }));
        const ul = h('ul', { class: 'linklist' });
        sg.forEach((s) => {
          const addBtn = h('button', { class: 'btn-link link-add', type: 'button', text: '+ adicionar' });
          addBtn.addEventListener('click', () => {
            if (addLink(s.type, s.target, s.note)) { addBtn.textContent = '✓ adicionado'; addBtn.disabled = true; addBtn.classList.add('is-added'); }
            else { addBtn.textContent = 'já adicionado'; addBtn.disabled = true; }
          });
          ul.append(h('li', {}, badge(s.type, 'b'), ' ',
            h('button', { class: 'btn-link', type: 'button', onclick: () => openReq(s.target), text: s.target }), ' ',
            h('span', { class: 'muted', text: '(' + (s.confidence != null ? s.confidence : '?') + ') ' + (s.note || '') }), ' ', addBtn));
        });
        card.append(ul);
      }
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
    h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Anexos (opcional)' }), h('p', { class: 'ed-hint', text: 'Anexe um documento, planilha ou imagem — a IA considera o conteúdo ao rascunhar.' }), sketchFiles.el),
    h('div', { class: 'asst-actions' },
      h('button', { class: 'btn primary', type: 'button', text: '✨ Rascunhar com IA', onclick: doDraft }),
      (refineBtn = h('button', { class: 'btn', type: 'button', text: '✨ Analisar & refinar', onclick: doRefine })),
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

  // Veio da conversa guiada? mostra a trilha + atalho para voltar ao chat (vale p/ criar OU refinar).
  const fromChat = state.editor && state.editor.messages && state.editor.messages.length;
  const guided = fromChat && !ed; // proposta de requisito NOVO a partir da conversa
  const headActions = h('div', { class: 'ed-head-actions' });
  if (fromChat) headActions.append(h('button', { class: 'btn-link', type: 'button', onclick: () => { state.editor.stage = 'chat'; renderEditor(); }, text: '← Voltar à conversa' }));
  headActions.append(h('button', { class: 'btn-link', type: 'button', onclick: () => openEditor(null), text: ed ? '+ novo (limpar)' : 'Trocar de sistema' }));
  const reviewHeading = h('h2', { class: 'editor-title', tabindex: '-1', text: ed ? `Editar ${ed.id}` : (guided ? 'Revisar a mudança proposta' : 'Novo requisito') });
  body.append(
    h('div', { class: 'editor-head' },
      h('div', {},
        reviewHeading,
        h('p', { class: 'muted', text: (guided || (ed && fromChat))
          ? 'Revise a proposta da IA (campos pré-preenchidos), ajuste o que precisar e gere o YAML. A UI não escreve no git: o commit é seu (PR). Após o merge, rode /sync-spec.'
          : 'O Assistente de IA redige; a validação verifica duplicatas e sugere vínculos automaticamente — mesmo sem acionar a IA. A UI não escreve no git: o commit é seu (PR). Após o merge, rode /sync-spec.' })),
      headActions),
    h('div', { class: 'editor-grid' }, assistant, formCol));

  // pré-seleção do produto vindo do fluxo guiado (quando não é edição de req existente)
  if (!ed && state.editor && state.editor.product && Array.from(productSel.options).some((o) => o.value === state.editor.product)) {
    productSel.value = state.editor.product; recomputeId();
  }
  // proposta da IA → pré-preenche o formulário (mesmo shape do draft; schema intacto).
  // Vale também ao refinar um req existente (ed != null): a proposta sobrepõe os campos,
  // mantendo id/origem do requisito original (que já foram carregados acima).
  if (state.editor && state.editor.draft) applyDraftToForm(state.editor.draft);

  runValidation();
  reviewHeading.focus(); // move o foco ao entrar no estágio (a11y de navegação SPA)
  // AUTONOMIA: veio do classify com um esboço (níveis "requisito novo"/"editar") → aproveita o texto:
  // pré-preenche o assistente e, p/ requisito NOVO, rascunha automaticamente (não pede p/ redigitar).
  if (state.editor && state.editor.reviewSketch && !state.editor._reqDrafted) {
    state.editor._reqDrafted = true;
    sketch.value = state.editor.reviewSketch;
    if (!ed && (state.editor.reviewType === 'functional' || state.editor.reviewType === 'non-functional')) { f.type.value = state.editor.reviewType; toggleNfr(); }
    if (!ed) AI.health().then((hr) => { if (hr.ok && hr.data && hr.data.ai) doDraft(); }).catch(() => {});
  }

  // Coleta o rascunho a partir do formulario (reusado por Gerar YAML e pela IA de analise).
  function collectDraft() {
    const lines = (f.acceptance.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const methods = (f.methods.value || []).filter(Boolean);
    const srcPaths = (f.source_paths.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const d = {
      id: f.id.value.trim(), slug: f.id.value.trim().toLowerCase(), title: f.title.value.trim(),
      type: f.type.value, status: f.status.value, owner: f.owner.value.trim() || undefined,
      scope: { applies_to: f.applies_to.value, product_scope: productScope() },
      statement: f.statement.value.trim(), priority: f.priority.value, criticality: f.criticality.value,
      architectural_significance: f.asr.value === 'true',
      source: srcPaths.length ? { source_paths: srcPaths } : undefined,
      acceptance_criteria: lines.length ? lines : undefined,
      verification_method: methods.length ? methods : undefined,
      links: links.length ? links.map((l) => ({ type: l.type, target: l.target, ...(l.note ? { note: l.note } : {}) })) : undefined,
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
    const typeMap = { functional: 'functional', non_functional: 'non-functional', 'non-functional': 'non-functional', 'business-rule': 'business-rule', constraint: 'constraint', interface: 'functional' };
    setSel(f.type, typeMap[d.type] || 'functional');
    setSel(f.priority, d.priority);
    setSel(f.criticality, d.criticality);
    if (typeof d.architectural_significance === 'boolean') setSel(f.asr, String(d.architectural_significance));
    if (Array.isArray(d.acceptance_criteria)) f.acceptance.value = d.acceptance_criteria.join('\n');
    if (Array.isArray(d.verification_method)) f.methods.value = d.verification_method;
    // origem (source_paths): só preenche se ainda estiver vazio (não sobrescreve o que o operador pôs).
    if (d.source && Array.isArray(d.source.source_paths) && d.source.source_paths.length && !(f.source_paths.value || '').trim()) {
      f.source_paths.value = d.source.source_paths.join('\n');
    }
    // escopo do rascunho (a IA pode devolver scope.applies_to / scope.product_scope) — preenche
    // sem quebrar a escolha do operador quando o produto vem fixo (edicao desabilita o select).
    if (d.scope && d.scope.applies_to) setSel(f.applies_to, d.scope.applies_to);
    if (!ed && d.scope && d.scope.product_scope) {
      const ps = String(d.scope.product_scope);
      if (Array.from(productSel.options).some((o) => o.value === ps)) productSel.value = ps;
      else { productSel.value = '__new__'; productNew.hidden = false; productNew.value = ps; }
      recomputeId();
    }
    const q = (Array.isArray(d.quality_scenarios) && d.quality_scenarios[0]) || null;
    if (q) { setVal(f.qs_stimulus, q.stimulus); setVal(f.qs_response, q.response); setVal(f.qs_measure, q.measure || q.response_measure); }
    toggleNfr();
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

/* ===================== CAMADA DE REFINAMENTO (REF-*) =====================
   classify: descreve a mudança → a IA recomenda o NÍVEL (refinamento | edição de
   requisito | requisito novo) → o operador confirma e é roteado. refine: autora um
   refinamento RICO de tela ancorado a 1+ requisitos (picker visual no mapa) → YAML → PR. */
function levelMeta(level) {
  if (level === 'refinement') return { label: 'Refinamento de tela', cls: 'b-fn', desc: 'Detalha o comportamento/uma tela de capacidades que JÁ existem — sem alterar o requisito.' };
  if (level === 'requirement-edit') return { label: 'Edição de requisito', cls: 'b-high', desc: 'Ajuste compatível de um requisito existente (patch/minor).' };
  return { label: 'Requisito novo', cls: 'b-crit', desc: 'Capacidade nova/drástica que nenhum requisito cobre ainda.' };
}

/* (renderClassifyStage removido — a classificação agora é INLINE no renderContextStage) */

/* Estágio — autoria de um REFINAMENTO rico (form de tela + picker de âncoras no mapa). */
function renderRefineStage(body) {
  const product = state.editor.product;
  const meta = productMeta(product);
  body.append(edCrumbs(product, 'Refinamento'));
  const reviewHeading = h('h2', { class: 'editor-title', tabindex: '-1', text: 'Refinamento de tela — ' + (meta.display_name || product) });

  // helpers locais (duplicados de propósito — caminho de dados isolado do form do REQUISITO)
  const f = {};
  const form = h('div', { class: 'ed-form' });
  const inp = (v, attrs) => h('input', { type: 'text', value: v ?? '', ...(attrs || {}) });
  const area = (v, rows) => h('textarea', { rows: String(rows || 3) }, v ?? '');
  const sel = (opts, v) => { const s = h('select'); for (const o of opts) { const op = h('option', { value: o, text: o }); if (o === v) op.selected = true; s.append(op); } return s; };
  const section = (title, hint) => { const sec = h('fieldset', { class: 'ed-section' }, h('legend', { text: title })); if (hint) sec.append(h('p', { class: 'ed-hint', text: hint })); const g = h('div', { class: 'ed-grid' }); sec.append(g); form.append(sec); return g; };
  const field = (grid, label, key, el, wide) => { grid.append(h('label', { class: 'fld' + (wide ? ' wide' : '') }, h('span', { class: 'fld-l', text: label }), el)); if (key) f[key] = el; };

  // ---- 1) Identidade ----
  const sId = section('Identidade');
  const refIds = refList().map((x) => x.id);
  const idInput = h('input', { type: 'text', readonly: 'readonly', 'aria-label': 'ID do refinamento', value: nextRefId(product, refIds) });
  f.id = idInput;
  field(sId, 'Produto', null, h('span', { class: 'ed-fixed', text: meta.display_name ? (meta.display_name + ' · ' + product) : product }), true);
  field(sId, 'ID', null, idInput, true);
  field(sId, 'Título', 'title', inp(''), true);
  field(sId, 'Tipo de refino', 'kind', sel(['screen', 'component', 'flow', 'interaction', 'content'], 'screen'));
  field(sId, 'Status', 'status', sel(['draft', 'proposed', 'approved'], 'draft'));

  // ---- 2) Âncoras (requisitos que este refino detalha) — SELEÇÃO VISUAL no mapa ----
  const REF_REL = ['implements', 'refines', 'derives_from', 'relates_to'];
  const anchors = new Map(); // reqId -> relation
  for (const a of (state.editor.refAnchors || [])) if (byId(a.requirement_id)) anchors.set(a.requirement_id, REF_REL.includes(a.relation) ? a.relation : 'refines');
  const anchorRel = sel(REF_REL, 'refines');
  const sAnch = h('fieldset', { class: 'ed-section ed-links-sec' },
    h('legend', { text: 'Âncoras — requisitos que este refino detalha' }),
    h('p', { class: 'ed-hint', text: 'Escolha a relação e clique num requisito no mapa para ancorar (1+ obrigatório; pode incluir requisitos NÃO-funcionais). O refino aponta para o requisito — o requisito não é alterado.' }),
    h('div', { class: 'ed-link-tb' }, h('label', { class: 'ed-link-tb-f' }, h('span', { class: 'fld-l', text: 'Relação' }), anchorRel)));
  const anchorMapHost = h('div', { class: 'ed-link-map' });
  const anchorList = h('ul', { class: 'ed-links' });
  sAnch.append(anchorMapHost, h('p', { class: 'ed-links-head muted small', text: 'Âncoras deste refinamento' }), anchorList);
  form.append(sAnch);
  let anchorGraph = null;
  function renderAnchorList() {
    anchorList.replaceChildren();
    if (!anchors.size) { anchorList.append(h('li', { class: 'ed-links-empty muted', text: 'Nenhuma âncora ainda — clique num requisito no mapa acima.' })); return; }
    for (const [id, rel] of anchors) {
      const r = byId(id) || {};
      anchorList.append(h('li', { class: 'ed-link-item' }, badge(rel, 'b'),
        h('button', { class: 'btn-link rid', type: 'button', onclick: () => anchorGraph && anchorGraph.focus(id), text: id }),
        h('span', { class: 'muted small ed-link-note', text: truncateLabel(r.title || '', 48) }),
        h('button', { class: 'btn-link ed-link-rm', type: 'button', 'aria-label': 'Remover âncora ' + id, title: 'Remover', onclick: () => { anchors.delete(id); renderAnchorList(); syncAnchors(); }, text: '✕' })));
    }
  }
  function syncAnchors() { if (anchorGraph) { const d = productGraphData(product); anchorGraph.setData(d.nodes, d.edges); } }
  function buildAnchorMap() {
    const data = productGraphData(product);
    if (!data.nodes.length) { anchorGraph = null; anchorMapHost.replaceChildren(h('p', { class: 'empty', text: 'Este sistema ainda não tem requisitos para ancorar.' })); return; }
    anchorGraph = interactiveGraph({
      label: 'Mapa de requisitos — clique para ancorar',
      nodeClass: (n) => anchors.has(n.id) ? 'is-anchor' : '',
      onOpen: (id) => { if (byId(id)) openReq(id); },
      detailOf: (n, id) => {
        const r = byId(id) || {};
        const has = anchors.has(id);
        const actions = has
          ? [{ label: '✕ Remover âncora (' + anchors.get(id) + ')', cls: 'btn-link ed-link-danger', onClick: () => { anchors.delete(id); renderAnchorList(); syncAnchors(); } }]
          : [{ label: '⚓ Ancorar como ' + anchorRel.value, cls: 'btn primary ig-act', onClick: () => { anchors.set(id, anchorRel.value); renderAnchorList(); syncAnchors(); } }];
        return { title: r.title || '', sub: id + (has ? ' · âncora: ' + anchors.get(id) : ''), badges: r.type ? [badge(r.type === 'non-functional' ? 'NFR' : 'funcional', r.type === 'non-functional' ? 'b-nfr' : 'b-fn')] : [], openable: !!r.id, actions };
      },
    });
    anchorGraph.setData(data.nodes, data.edges);
    anchorMapHost.replaceChildren(anchorGraph.el);
  }
  buildAnchorMap(); renderAnchorList();

  // ---- 3) Superfície (tela) ----
  const sSurf = section('Superfície (tela)', 'A rota é obrigatória quando o tipo é "screen".');
  field(sSurf, 'Rota', 'route', inp('', { placeholder: '/profile' }));
  field(sSurf, 'Nome da tela', 'surface_name', inp(''));
  field(sSurf, 'Papéis (roles, 1 por linha)', 'roles', area('', 2), true);

  // ---- 4) Comportamento (estados/dados/interações/fluxos) — listas linha-a-linha ----
  const sBeh = section('Comportamento da tela', 'Modele os estados (normal/carregando/erro/vazio), os dados exibidos, as interações e os fluxos.');
  field(sBeh, 'Estados (um por linha: nome | quando | o que mostra)', 'states', area('', 4), true);
  field(sBeh, 'Dados exibidos (um por linha: campo | fonte | editável?)', 'data', area('', 3), true);
  field(sBeh, 'Interações (uma por linha: gatilho | ação | resultado)', 'interactions', area('', 3), true);
  field(sBeh, 'Fluxos (um por linha: passo › passo › passo)', 'flows', area('', 2), true);

  // ---- 5) Aceite & verificação ----
  const sAcc = section('Aceite & verificação');
  field(sAcc, 'Critérios de aceite (1 por linha)', 'acceptance', area('', 3), true);
  const VM = ['test-unit', 'test-integration', 'test-e2e', 'architecture-review', 'deployment-policy-check', 'manual-review', 'monitoring', 'demo'];
  const vmSel = new Set();
  const vmWrap = h('div', { class: 'vm-chips', role: 'group', 'aria-label': 'Métodos de verificação' });
  const vmChips = {};
  for (const m of VM) { const c = h('button', { class: 'vm-chip', type: 'button', 'aria-pressed': 'false', text: m }); c.addEventListener('click', () => { const on = c.getAttribute('aria-pressed') === 'true'; c.setAttribute('aria-pressed', on ? 'false' : 'true'); if (on) vmSel.delete(m); else vmSel.add(m); }); vmChips[m] = c; vmWrap.append(c); }
  f.methods = { get value() { return [...vmSel]; }, set value(arr) { const want = new Set(Array.isArray(arr) ? arr : []); vmSel.clear(); for (const m of VM) { const on = want.has(m); if (on) vmSel.add(m); if (vmChips[m]) vmChips[m].setAttribute('aria-pressed', on ? 'true' : 'false'); } } };
  field(sAcc, 'Métodos de verificação', null, h('div', { class: 'vm-field' }, vmWrap), true);

  // ---- 6) Origem ----
  const sSrc = section('Origem', 'Caminhos reais (relativos à raiz do repo) da tela/código que o refino descreve.');
  field(sSrc, 'source_paths (1 por linha)', 'source_paths', area('', 2), true);

  // ---- 7) Versionamento (auto) ----
  const sVerDet = h('details', { class: 'ed-section ed-adv' }, h('summary', { text: 'Versionamento (gerenciado automaticamente)' }));
  const sVer = h('div', { class: 'ed-grid' }); sVerDet.append(sVer); form.append(sVerDet);
  field(sVer, 'baseline_version', 'bver', inp('1.0.0', { readonly: 'readonly' }));
  field(sVer, 'item_revision', 'irev', inp('1', { readonly: 'readonly' }));
  field(sVer, 'semantic_change', 'sem', sel(['none', 'patch', 'minor', 'major'], 'none'));
  field(sVer, 'change_reason', 'reason', inp('novo refinamento'), true);

  // ---- parse/serialize do comportamento (formato linha-a-linha) ----
  const splitPipe = (line) => line.split('|').map((x) => x.trim());
  function collectRefDraft() {
    const states = (f.states.value || '').split('\n').map((x) => x.trim()).filter(Boolean).map((l) => { const [name, when, ui] = splitPipe(l); return { name: name || 'estado', ...(when ? { when } : {}), ...(ui ? { ui } : {}) }; });
    const data = (f.data.value || '').split('\n').map((x) => x.trim()).filter(Boolean).map((l) => { const [fld, src, ed] = splitPipe(l); return { field: fld || '', source: src || '', editable: /^(sim|true|yes|edit)/i.test(ed || '') }; });
    const interactions = (f.interactions.value || '').split('\n').map((x) => x.trim()).filter(Boolean).map((l) => { const [trigger, action, result] = splitPipe(l); return { trigger: trigger || '', action: action || '', result: result || '' }; });
    const flows = (f.flows.value || '').split('\n').map((x) => x.trim()).filter(Boolean).map((l) => l.split(/›|>/).map((s) => s.trim()).filter(Boolean));
    const roles = (f.roles.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const srcPaths = (f.source_paths.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const accept = (f.acceptance.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const methods = (f.methods.value || []).filter(Boolean);
    const behavior = { states };
    if (data.length) behavior.data = data;
    if (interactions.length) behavior.interactions = interactions;
    if (flows.length) behavior.flows = flows;
    const surface = {};
    if ((f.route.value || '').trim()) surface.route = f.route.value.trim();
    if ((f.surface_name.value || '').trim()) surface.name = f.surface_name.value.trim();
    if (roles.length) surface.roles = roles;
    const d = {
      id: f.id.value.trim(), slug: f.id.value.trim().toLowerCase(), title: f.title.value.trim(),
      kind: f.kind.value, status: f.status.value,
      scope: { product_scope: product, applies_to: f.kind.value === 'screen' ? 'screen' : (f.kind.value === 'component' ? 'component' : (f.kind.value === 'flow' ? 'flow' : 'capability')) },
      anchors: [...anchors].map(([requirement_id, relation]) => ({ requirement_id, relation })),
      ...(Object.keys(surface).length ? { surface } : {}),
      behavior,
      acceptance_criteria: accept.length ? accept : undefined,
      verification_method: methods.length ? methods : undefined,
      source: srcPaths.length ? { source_paths: srcPaths } : undefined,
      version: { baseline_version: f.bver.value.trim() || '1.0.0', item_revision: Number(f.irev.value) || 1, semantic_change: f.sem.value, change_reason: f.reason.value.trim() || undefined },
    };
    return d;
  }
  function applyRefDraftToForm(draft) {
    const d = draft || {};
    const setVal = (el, v) => { if (el && v != null && v !== '') el.value = String(v); };
    const setSel = (el, v) => { if (!el || v == null) return; if (Array.from(el.options).some((o) => o.value === v)) el.value = v; };
    setVal(f.title, d.title);
    setSel(f.kind, d.kind);
    if (d.surface) { setVal(f.route, d.surface.route); setVal(f.surface_name, d.surface.name); if (Array.isArray(d.surface.roles) && d.surface.roles.length && !(f.roles.value || '').trim()) f.roles.value = d.surface.roles.join('\n'); }
    const beh = d.behavior || {};
    if (Array.isArray(beh.states) && beh.states.length) f.states.value = beh.states.map((s) => [s.name, s.when, s.ui].filter((x) => x != null).join(' | ')).join('\n');
    if (Array.isArray(beh.data) && beh.data.length) f.data.value = beh.data.map((x) => [x.field, x.source, x.editable ? 'sim' : 'não'].join(' | ')).join('\n');
    if (Array.isArray(beh.interactions) && beh.interactions.length) f.interactions.value = beh.interactions.map((x) => [x.trigger, x.action, x.result].join(' | ')).join('\n');
    if (Array.isArray(beh.flows) && beh.flows.length) f.flows.value = beh.flows.map((fl) => (Array.isArray(fl) ? fl.join(' › ') : String(fl))).join('\n');
    if (Array.isArray(d.acceptance_criteria) && d.acceptance_criteria.length) f.acceptance.value = d.acceptance_criteria.join('\n');
    if (Array.isArray(d.verification_method)) f.methods.value = d.verification_method;
    if (d.source && Array.isArray(d.source.source_paths) && d.source.source_paths.length && !(f.source_paths.value || '').trim()) f.source_paths.value = d.source.source_paths.join('\n');
  }

  // ---- coluna do assistente de IA ----
  const sketch = h('textarea', { class: 'ai-sketch', rows: '4', 'aria-label': 'Esboço do refinamento', placeholder: 'Descreva a mudança de tela em linguagem natural…' });
  if (state.editor.refSketch) sketch.value = state.editor.refSketch;
  sketch.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); startRefine({ draftFirst: true }); } });
  const aiOut = h('div', { class: 'ai-out' });
  const valOut = h('div', { class: 'val-out', 'aria-live': 'polite' });
  // valida ao vivo; quando ZERA as lacunas, revela o PR automaticamente (genRef) — sem clique extra.
  function runValidation() {
    const errs = validateRefinement(collectRefDraft());
    if (errs.length) {
      const ul = h('ul', { class: 'errlist' });
      errs.forEach((e) => ul.append(h('li', { text: e })));
      valOut.replaceChildren(ul);
      out.replaceChildren();
    } else {
      valOut.replaceChildren(h('p', { class: 'val-ok', text: '✓ Pronto — o PR está logo abaixo.' }));
      genRef();
    }
  }
  function showErr(r) { const code = r.data && r.data.error ? r.data.error.code : 'HTTP ' + r.status; aiOut.replaceChildren(h('div', { class: 'card' }, h('h3', { text: 'IA: ' + code }), h('p', { class: 'muted', text: (r.data && r.data.error && r.data.error.message) || '' }))); }
  async function guard(fn) { aiOut.replaceChildren(h('p', { class: 'muted', text: 'Consultando a IA…' })); try { await fn(); } catch (e) { aiOut.replaceChildren(h('p', { class: 'empty', text: 'Erro de rede: ' + (e && e.message ? e.message : e) })); } }
  function anchorArray() { return [...anchors].map(([requirement_id, relation]) => ({ requirement_id, relation })); }
  // rascunho RICO via IA (grounded: passa os requisitos do produto p/ a IA herdar convenções/rota/papéis).
  async function draftRefOnce() {
    const r = await AI.post('/v1/authoring/draft-refinement', { product, sketch: (sketch.value || '').trim(), anchors: anchorArray(), grounding: productGrounding(DATA.baseline.requirements, product) });
    if (!r.ok) { showErr(r); return false; }
    applyRefDraftToForm(r.data.draft || {}); runValidation();
    return true;
  }
  function doDraftRef() {
    guard(async () => {
      const ok = await draftRefOnce();
      if (ok) aiOut.replaceChildren(h('div', { class: 'card' }, h('h3', { text: 'Rascunho aplicado' }), h('p', { class: 'muted', text: 'Campos preenchidos à direita — revise e gere o YAML, ou clique "Refinar com IA" para a IA analisar e corrigir.' })));
    });
  }
  // loop autônomo de refino (reusa a decisão pura refineDecision; endpoints de REFINAMENTO).
  let refining = false; let refineBtn = null;
  const SEV_LABEL = { blocker: 'crítico', warning: 'atenção', info: 'opcional' };
  const SEV_CLS = { blocker: 'b-crit', warning: 'b-high', info: 'b-low' };
  // corpo do loop analisar→corrigir→re-analisar (sem guard próprio; chamado por startRefine).
  async function runLoopBody() {
    const MAX = 8, STALE = 2;
    const log = h('div', { class: 'refine-log' });
    const liveSummary = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    aiOut.replaceChildren(h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'asst-spark', 'aria-hidden': 'true', text: '✨' }), ' Refinar com IA'), h('p', { class: 'muted small', text: 'A IA analisa, corrige e re-analisa o refinamento sozinha até zerar as lacunas que travam (ou até não conseguir mais melhorar).' }), liveSummary, log));
    const gapItem = (gp) => { const sev = gp.severity || 'info'; return h('li', {}, badge(SEV_LABEL[sev] || sev, SEV_CLS[sev] || 'b-low'), ' ' + ((gp.field ? gp.field + ': ' : '') + (gp.message || ''))); };
    const finish = (action, score, dec) => {
      let head;
      if (action === 'ready') head = h('p', { class: 'refine-ok', tabindex: '-1', text: '✓ Refinamento pronto (prontidão ' + score + '). Revise e gere o YAML.' });
      else if (action === 'plateau') head = h('p', { class: 'refine-warn', tabindex: '-1', text: '⚠ A IA refinou até onde conseguiu (prontidão ' + score + '). Os pontos abaixo precisam da sua decisão — a IA não inventa o que não está definido.' });
      else head = h('p', { class: 'refine-warn', tabindex: '-1', text: 'Parei após ' + MAX + ' rodadas (prontidão ' + score + ').' });
      log.append(head);
      if (dec.actionable.length) { const ul = h('ul', { class: 'errlist' }); dec.actionable.forEach((gp) => ul.append(gapItem(gp))); log.append(h('p', { class: 'muted small', text: 'Pontos que precisam de você (' + dec.actionable.length + '):' }), ul); }
      if (dec.info.length) { const det = h('details', { class: 'refine-optional' }); det.append(h('summary', { text: dec.info.length + ' sugestão(ões) opcional(is)' })); const ul = h('ul', { class: 'errlist' }); dec.info.forEach((gp) => ul.append(gapItem(gp))); det.append(ul); log.append(det); }
      log.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn', type: 'button', text: 'Refinar de novo', onclick: () => startRefine({ draftFirst: false }) })));
      liveSummary.textContent = head.textContent || '';
      try { head.focus(); } catch (e) { /* best-effort */ }
    };
    let best = null, stale = 0;
    for (let i = 0; i < MAX; i++) {
      const step = h('p', { class: 'refine-step', text: 'Rodada ' + (i + 1) + ' — analisando…' }); log.append(step);
      const ra = await AI.post('/v1/authoring/analyze-refinement', { refinement: collectRefDraft() });
      if (!ra.ok) { showErr(ra); return; }
      const score = ra.data.score != null ? Number(ra.data.score) : 0;
      const dec = refineDecision({ round: i, score, gaps: ra.data.gaps || [], best, stale, maxRounds: MAX, staleLimit: STALE });
      best = dec.best; stale = dec.stale;
      step.replaceChildren(h('strong', { text: 'Rodada ' + (i + 1) }), ' · prontidão ', h('span', { class: 'refine-score', text: String(score) }), ' · ' + (dec.actionable.length ? dec.actionable.length + ' lacuna(s) crítica(s)' : 'sem lacunas críticas') + (dec.info.length ? ' (+' + dec.info.length + ' opcional)' : ''));
      if (dec.action !== 'fix') return finish(dec.action, score, dec);
      log.append(h('p', { class: 'refine-fix muted small', text: '↳ corrigindo ' + dec.actionable.length + ' lacuna(s) com IA…' }));
      const rv = await AI.post('/v1/authoring/revise-refinement', { refinement: collectRefDraft(), gaps: dec.actionable.concat(dec.info) });
      if (!rv.ok) { showErr(rv); return; }
      if (rv.data && rv.data.draft) { applyRefDraftToForm(rv.data.draft); runValidation(); }
    }
  }
  // AÇÃO ÚNICA "Refinar com IA": rascunha (se draftFirst) e roda o loop até pronto/platô. Autônomo.
  function startRefine({ draftFirst }) {
    if (refining) return;
    refining = true;
    if (refineBtn) { refineBtn.disabled = true; refineBtn.setAttribute('aria-busy', 'true'); }
    guard(async () => {
      if (draftFirst) {
        aiOut.replaceChildren(h('p', { class: 'muted', text: 'Rascunhando o refinamento com a IA…' }));
        const ok = await draftRefOnce();
        if (!ok) return;
      }
      await runLoopBody();
    }).finally(() => { refining = false; if (refineBtn) { refineBtn.disabled = false; refineBtn.removeAttribute('aria-busy'); } });
  }

  const status = h('p', { class: 'muted small', id: 'ref-ai-status' });
  AI.health().then((r) => { status.textContent = (r.ok && r.data && r.data.ai) ? 'IA habilitada (gpt-5). Cole seu token de operador para rascunhar/analisar.' : 'IA desabilitada no servidor — o formulário funciona sem ela.'; }).catch(() => { status.textContent = 'reqhub-api indisponível — o formulário funciona sem a IA.'; });
  const tok = h('input', { type: 'password', class: 'ai-tok', placeholder: 'token do operador', value: AI.getToken() });
  const assistant = h('section', { class: 'editor-assistant' },
    h('div', { class: 'asst-head' }, h('span', { class: 'asst-spark', 'aria-hidden': 'true', text: '✨' }), h('h3', { text: 'Assistente de IA' })),
    status,
    h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: 'Descreva a mudança de tela (esboço)' }), sketch),
    h('div', { class: 'asst-actions' },
      (refineBtn = h('button', { class: 'btn primary', type: 'button', text: '✨ Refinar com IA', onclick: () => startRefine({ draftFirst: true }) })),
      h('button', { class: 'btn-link', type: 'button', text: 'só rascunhar', title: 'Preenche o formulário sem rodar a análise', onclick: doDraftRef })),
    aiOut,
    h('div', { class: 'asst-val' }, h('h4', { text: 'Validação automática' }), valOut),
    h('details', { class: 'asst-token' }, h('summary', { text: 'Token de operador (IA)' }),
      h('div', { class: 'ws-actions' }, tok, h('button', { class: 'btn-link', type: 'button', text: 'Salvar', onclick: () => { AI.setToken(tok.value.trim()); status.textContent = 'Token salvo neste navegador.'; } }))));

  // ---- gerar YAML → PR (a UI nunca escreve git) ----
  const out = h('div');
  function genRef() {
    out.replaceChildren();
    const d = collectRefDraft();
    const errs = validateRefinement(d);
    if (errs.length) { out.append(h('div', { class: 'card' }, h('h3', { text: 'Corrija antes de gerar' }), h('ul', { class: 'errlist' }, ...errs.map((e) => h('li', { text: e }))))); return; }
    const yaml = toYaml(d) + '\n';
    const filePath = `specs/refinements/${product}/${d.id}.yaml`;
    const newUrl = `https://github.com/${REPO}/new/main?filename=${encodeURIComponent(filePath)}&value=${encodeURIComponent(yaml)}`;
    out.append(h('div', { class: 'card' }, h('h3', { text: filePath }), h('pre', { class: 'yaml' }, yaml),
      h('div', { class: 'ws-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { if (navigator.clipboard) navigator.clipboard.writeText(yaml); }, text: 'Copiar YAML' }),
        h('a', { class: 'btn', href: newUrl, target: '_blank', rel: 'noopener' }, 'Abrir no GitHub (novo → PR)')),
      h('p', { class: 'muted', text: 'O PR passa pelo gate specs-governance (schema/âncoras/origem/drift). A baseline é regenerada por /sync-spec após o merge.' })));
  }
  // o PR aparece sozinho quando a validação zera (runValidation→genRef); sem botão "Gerar YAML".
  const formCol = h('section', { class: 'editor-formcol' }, form, out);
  // revalida ao vivo quando o operador edita o formulário (debounce) → o PR acompanha as edições.
  let valTimer = null;
  form.addEventListener('input', () => { clearTimeout(valTimer); valTimer = setTimeout(runValidation, 350); });

  body.append(h('div', { class: 'editor-head' }, h('div', {}, reviewHeading,
    h('p', { class: 'muted', text: 'Um refinamento detalha o funcionamento de uma TELA ancorado a 1+ requisitos — sem alterar o requisito. A UI não escreve no git: o commit é seu (PR).' }))),
    h('div', { class: 'editor-grid' }, assistant, formCol));
  runValidation();
  reviewHeading.focus();
  // AUTONOMIA: veio do classify com esboço + âncoras → rascunha automaticamente (form pré-preenchido),
  // se a IA estiver habilitada. Senão, o form fica pronto para preenchimento manual (fail-closed).
  if (state.editor.refSketch && anchors.size && !state.editor._refDrafted) {
    state.editor._refDrafted = true;
    AI.health().then((hr) => { if (hr.ok && hr.data && hr.data.ai) doDraftRef(); }).catch(() => {});
  }
}

/* ---------- navegação / abas ---------- */
/* ===================== Forge — construir um produto a partir de requisitos =====================
   Hub de produtos → detalhe com breadcrumb + stepper (Definir → Arquitetura → Build).
   Lê dados estáticos (products/blueprints/build-plan/implementation-status); a IA (opcional,
   fail-closed) propõe requisitos. A UI NUNCA escreve no git — mostra o YAML e o caminho do PR. */

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
  aiusage: [['path', { d: 'M3 12a9 9 0 1 1 18 0' }], ['path', { d: 'M12 12l4-2.5' }], ['line', { x1: 3, y1: 20, x2: 21, y2: 20 }]],
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
  explorer: { title: 'Explorador', sub: 'Navegue e filtre todos os requisitos' },
  workspace: { title: 'Workspace', sub: 'Detalhe do requisito selecionado' },
  versions: { title: 'Mudanças', sub: 'Versões, diffs semânticos e fila de reprocessamento' },
  impact: { title: 'Mapa de impacto', sub: 'Grafo de dependências entre requisitos' },
  coverage: { title: 'Cobertura', sub: 'Requisitos × evidência e alocação' },
  usability: { title: 'Usabilidade', sub: 'Telas e refinamentos — o funcionamento detalhado, ancorado aos requisitos' },
  reprocess: { title: 'Mudanças', sub: 'Fila de reprocessamento — o que revisar após mudanças na baseline' },
  dev: { title: 'Desenvolvimento', sub: 'Status de entrega por requisito (REQ → PR → deploy)' },
  editor: { title: 'Editor', sub: 'Autoria assistida por IA → PR no git' },
  forge: { title: 'Forja', sub: 'Do brief ao produto publicado — requisitos, telas, documentação e pipeline' },
  aiusage: { title: 'Uso da IA', sub: 'Custo/tokens/limites — Claude (Anthropic) e OpenAI + assinatura Claude Code (5h/semana)' },
};

// A1a (Forja 4.0): overview morreu (KPIs no hub do Studio); dev/usability saem da navegação e
// migram para o Studio (A1b). reprocess vive como sub-aba de "Mudanças" (nav-item = versions).
const RENDER = { explorer: renderExplorer, workspace: renderWorkspace, versions: renderVersions, impact: renderImpact, coverage: renderCoverage, usability: renderUsability, reprocess: renderReprocess, dev: renderDev, editor: renderEditor, forge: renderForge, aiusage: renderAiUsage };
// Views sem item próprio na sidebar acendem o item "dono" (fusão/migração A1a).
const NAV_ALIAS = { reprocess: 'versions', usability: 'coverage', dev: 'forge' };
function switchView(view) {
  if (view === 'impact' && state.view !== 'impact') IMPACT.enterSeed = true; // semeia o "req em foco" só na ENTRADA
  if (state.view === 'aiusage' && view !== 'aiusage') disconnectAiStream(); // fecha o SSE ao sair do painel
  state.view = view;
  const navView = NAV_ALIAS[view] || view;
  for (const it of document.querySelectorAll('.nav-item')) {
    const sel = it.dataset.view === navView;
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
  writeHash();
}
// Hash routing leve: a URL reflete a tela (e o REQ/produto em foco) — torna o estado linkável
// e permite deep-link DE OUTROS APPS (ex.: o Console abre /reqs#/explorer?product=<app>).
function writeHash() {
  try {
    let h = '#/' + state.view;
    const qp = [];
    if (state.view === 'workspace' && state.selectedId) qp.push('id=' + encodeURIComponent(state.selectedId));
    if (state.filters && state.filters.product && ['explorer', 'coverage'].includes(state.view)) qp.push('product=' + encodeURIComponent(state.filters.product));
    // (E1, Forja 4.1) detalhe do produto no Studio é linkável: #/forge?product=<slug> —
    // mesmo formato que a casca global emite (surfaceLink) e que applyHashRoute lê.
    if (state.view === 'forge' && state.forge && state.forge.product && !state.forge.newMode) qp.push('product=' + encodeURIComponent(state.forge.product));
    if (qp.length) h += '?' + qp.join('&');
    if (location.hash !== h) history.replaceState(null, '', h);
  } catch { /* ignore */ }
}
// Hashes de abas mortas na A1a: deep-links antigos (Console, favoritos) continuam funcionando.
const LEGACY_HASH = { overview: 'forge', dev: 'forge', usability: 'coverage' };
function applyHashRoute() {
  const m = (location.hash || '').match(/^#\/([a-z-]+)(?:\?(.*))?$/i);
  if (!m) return false;
  const view = LEGACY_HASH[m[1]] || m[1];
  if (!RENDER[view]) return false;
  const params = new URLSearchParams(m[2] || '');
  // (E1, Forja 4.1) na Forja, product= é o CONTEXTO DE PRODUTO (abre o detalhe por state);
  // nos demais views mantém o comportamento antigo (filtro de produto do Explorador/Cobertura).
  if (view === 'forge') {
    const p = params.get('product');
    state.forge.product = p || null;
    if (p) { state.forge.newMode = false; state.forge.newKind = null; }
  } else if (params.get('product')) state.filters.product = params.get('product');
  if (params.get('id') && byId(params.get('id'))) state.selectedId = params.get('id');
  if (view === 'workspace' && !state.selectedId) return false; // sem REQ → cai no default
  switchView(view);
  return true;
}
function openReq(id) { state.selectedId = id; RECENTS.push(id); switchView('workspace'); const t = document.getElementById('tab-workspace'); if (t) t.focus(); }
function openUsability(id) { state.usabilitySel = id; switchView('usability'); const t = document.getElementById('tab-usability'); if (t) t.focus(); }
// Destino SIMÉTRICO a openReq: foca o REQ no Mapa de impacto (Workspace/Reprocesso/copiloto ↔ Mapa).
function openImpactAt(id) {
  if (!byId(id) && !(DATA.impact && DATA.impact.nodes && DATA.impact.nodes.find((n) => n.id === id))) return;
  if (!IMPACT.st) IMPACT.st = { products: null, edgeTypes: null, includeIsolated: false, selectedId: null, hoverId: null, query: '' };
  IMPACT.st.selectedId = id;
  // se o nó é isolado e estiver oculto, revela os isolados para conseguir focá-lo
  if (DATA.impact && (!IMPACT.deg || !IMPACT.deg[id])) IMPACT.st.includeIsolated = true;
  switchView('impact');
  centerOnNode(id); showInspector(id, false);
  const t = document.getElementById('tab-impact'); if (t) t.focus();
}

/* ===================== Usabilidade — telas/refinamentos (o funcionamento detalhado) =====================
   Navega produto → refinamentos agrupados por tipo → ACESSO (rota+papéis) + comportamento detalhado
   (estados coloridos / dados / interações / fluxos numerados), ancorado aos requisitos. Fail-soft. */
const KIND_LABEL = { screen: 'Tela', component: 'Componente', flow: 'Fluxo', interaction: 'Interação', content: 'Conteúdo' };
const KIND_PLURAL = { screen: 'Telas', component: 'Componentes', flow: 'Fluxos', interaction: 'Interações', content: 'Conteúdos' };
const KIND_ORDER = ['screen', 'component', 'flow', 'interaction', 'content'];
function usStateClass(name) {
  const n = String(name || '').toLowerCase();
  if (/err|fail|timeout|falh/.test(n)) return 'st-error';
  if (/carreg|loading|skeleton/.test(n)) return 'st-loading';
  if (/vazio|empty|sem /.test(n)) return 'st-empty';
  if (/ocult|hidden|anon|anôn|401|403|gated|sem login|logout/.test(n)) return 'st-hidden';
  if (/normal|pronto|sucesso|logad|operad|revelad/.test(n)) return 'st-normal';
  return 'st-default';
}
function renderUsability() {
  const body = document.getElementById('usability-body');
  body.replaceChildren();
  const refs = refList();
  if (!refs.length) {
    body.append(h('div', { class: 'card' }, h('h3', { text: 'Nenhum refinamento ainda' }),
      h('p', { class: 'muted', text: 'Refinamentos descrevem o funcionamento detalhado de uma tela ancorado a 1+ requisitos — sem alterar o requisito. Crie um no Editor → “Descrever uma mudança”.' }),
      h('div', { class: 'ws-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => switchView('editor'), text: 'Ir ao Editor →' }))));
    return;
  }
  // DRILL: tela selecionada → detalhe focado (com voltar). Senão → mapa visual (grade de cards).
  const sel = state.usabilitySel ? refById(state.usabilitySel) : null;
  if (sel) { renderUsabilityDetail(body, sel); return; }

  const byProd = {};
  for (const r of refs) { const p = r.scope?.product_scope || r.product || 'outros'; (byProd[p] = byProd[p] || []).push(r); }
  const prods = Object.keys(byProd).sort();
  if (state.usabilityProd && !byProd[state.usabilityProd]) state.usabilityProd = null;

  body.append(h('p', { class: 'muted usa-intro', text: 'O mapa de telas de cada sistema — clique numa tela para ver o comportamento detalhado (estados, dados, interações, fluxos) e propor uma mudança.' }));
  if (prods.length > 1) {
    const filt = h('div', { class: 'usa-filter', role: 'group', 'aria-label': 'Filtrar por sistema' });
    const chip = (label, val) => h('button', { class: 'usa-fchip' + ((state.usabilityProd || null) === val ? ' is-on' : ''), type: 'button', 'aria-pressed': ((state.usabilityProd || null) === val) ? 'true' : 'false', text: label, onclick: () => { state.usabilityProd = val; renderUsability(); } });
    filt.append(chip('Todos os sistemas', null));
    for (const p of prods) filt.append(chip((productMeta(p).display_name || p) + ' · ' + byProd[p].length, p));
    body.append(filt);
  }
  const showProds = state.usabilityProd ? [state.usabilityProd] : prods;
  for (const p of showProds) {
    const items = byProd[p].slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const byKind = {}; for (const r of items) byKind[r.kind || 'component'] = (byKind[r.kind || 'component'] || 0) + 1;
    const sub = KIND_ORDER.filter((k) => byKind[k]).map((k) => (byKind[k] > 1 ? (KIND_PLURAL[k] || k) : (KIND_LABEL[k] || k)) + ' ' + byKind[k]).join(' · ');
    body.append(h('div', { class: 'usa-prodhead' }, h('h3', { text: productMeta(p).display_name || p }), h('span', { class: 'muted small', text: sub })));
    const grid = h('div', { class: 'usa-grid' });
    for (const r of items) grid.append(usaCard(r));
    body.append(grid);
  }
}
/* card visual de uma tela/refinamento no mapa (kind + rota + chips de estado coloridos + meta). */
function usaCard(r) {
  const beh = r.behavior || {};
  const states = Array.isArray(beh.states) ? beh.states : [];
  const card = h('button', { class: 'usa-card', type: 'button', title: r.title || r.id, 'aria-label': (KIND_LABEL[r.kind] || 'componente') + ': ' + (r.title || r.id), onclick: () => { state.usabilitySel = r.id; renderUsability(); } });
  card.append(h('div', { class: 'usa-card-top' }, badge(KIND_LABEL[r.kind] || r.kind || 'componente', 'b-fn'),
    (r.surface && r.surface.route) ? h('span', { class: 'usability-route', text: r.surface.route }) : null));
  card.append(h('div', { class: 'usa-card-ti', text: truncateLabel(r.title || r.id, 64) }));
  if (states.length) { const sc = h('div', { class: 'usa-card-states', 'aria-hidden': 'true' }); states.slice(0, 8).forEach((s) => sc.append(h('span', { class: 'usa-sdot ' + usStateClass(s.name), title: s.name }))); card.append(sc); }
  const nReq = (r.anchors || []).length, nInt = (beh.interactions || []).length, nState = states.length;
  card.append(h('div', { class: 'usa-card-foot muted small', text: nState + ' estado' + (nState === 1 ? '' : 's') + ' · ' + nReq + ' req' + (nInt ? ' · ' + nInt + ' interaç' + (nInt === 1 ? 'ão' : 'ões') : '') }));
  return card;
}
function renderUsabilityDetail(host, r) {
  host.replaceChildren();
  if (!r) { host.append(h('p', { class: 'empty', text: 'Selecione uma tela no mapa.' })); return; }
  const uProd = r.scope?.product_scope || r.product;
  const kindLabel = KIND_LABEL[r.kind] || r.kind || 'componente';
  const route = r.surface && r.surface.route;
  // VOLTAR ao mapa de telas (drill-down fluido)
  host.append(h('nav', { class: 'ed-crumbs', 'aria-label': 'Você está em' },
    h('button', { class: 'btn-link', type: 'button', onclick: () => { state.usabilitySel = null; renderUsability(); }, text: '‹ Telas de ' + (productMeta(uProd).display_name || uProd) })));
  const heading = h('h2', { class: 'usability-title', tabindex: '-1', text: r.title || r.id });
  host.append(h('div', { class: 'usa-detail-head' }, badge(kindLabel, 'b-fn'), heading, r.status ? badge(r.status, 'b') : null, h('span', { class: 'muted small usa-detail-id', text: r.id })));

  const grid = h('div', { class: 'usa-detail-grid' });
  const main = h('div', { class: 'usa-main' });
  const side = h('aside', { class: 'usa-side' });
  const beh = r.behavior || {};
  // MAIN — o comportamento (estados/dados/interações/fluxos/aceite)
  if (Array.isArray(beh.states) && beh.states.length) {
    const c = h('div', { class: 'card' }, h('h3', {}, secIc('◑'), ' Estados (' + beh.states.length + ')'));
    const g2 = h('div', { class: 'usa-states' });
    for (const s of beh.states) g2.append(h('div', { class: 'usa-state ' + usStateClass(s.name) },
      h('div', { class: 'usa-state-h' }, h('span', { class: 'us-dot', 'aria-hidden': 'true' }), h('strong', { text: s.name })),
      s.when ? h('p', { class: 'usa-state-w muted small', text: 'Quando: ' + s.when }) : null,
      s.ui ? h('p', { class: 'usa-state-u', text: s.ui }) : null));
    c.append(g2); main.append(c);
  }
  if (Array.isArray(beh.data) && beh.data.length) {
    const c = h('div', { class: 'card' }, h('h3', {}, secIc('▦'), ' Dados exibidos'));
    const tb = h('tbody');
    for (const d of beh.data) tb.append(h('tr', {}, h('td', {}, h('code', { text: d.field })), h('td', { text: d.source }), h('td', {}, badge(d.editable ? 'editável' : 'leitura', d.editable ? 'b-high' : 'b-low'))));
    c.append(h('table', { class: 'usability-table' }, h('thead', {}, h('tr', {}, h('th', { text: 'Campo' }), h('th', { text: 'Fonte' }), h('th', { text: 'Modo' }))), tb)); main.append(c);
  }
  if (Array.isArray(beh.interactions) && beh.interactions.length) {
    const c = h('div', { class: 'card' }, h('h3', {}, secIc('⇄'), ' Interações'));
    const ul = h('ul', { class: 'usability-inter' });
    for (const it of beh.interactions) ul.append(h('li', {}, h('span', { class: 'ui-trig', text: it.trigger }), h('span', { class: 'ui-arr', 'aria-hidden': 'true', text: ' → ' }), h('span', { class: 'ui-act', text: it.action }), h('span', { class: 'ui-arr', 'aria-hidden': 'true', text: ' → ' }), h('span', { class: 'ui-res muted', text: it.result })));
    c.append(ul); main.append(c);
  }
  if (Array.isArray(beh.flows) && beh.flows.length) {
    const c = h('div', { class: 'card' }, h('h3', {}, secIc('↡'), ' Fluxos do usuário'));
    for (const fl of beh.flows) { const steps = Array.isArray(fl) ? fl : [fl]; const ol = h('ol', { class: 'usability-steps' }); steps.forEach((p) => ol.append(h('li', { text: p }))); c.append(ol); }
    main.append(c);
  }
  if (Array.isArray(r.acceptance_criteria) && r.acceptance_criteria.length) {
    main.append(h('div', { class: 'card' }, h('h3', {}, secIc('✓'), ' Critérios de aceite'), h('ul', { class: 'usability-acc' }, ...r.acceptance_criteria.map((x) => h('li', { text: x })))));
  }
  if (!main.children.length) main.append(h('div', { class: 'card' }, h('p', { class: 'empty', text: 'Sem comportamento detalhado ainda — clique em "Propor mudança nesta tela" para descrever.' })));

  // SIDE — acesso, requisitos, ação, origem (a régua do Workspace: lateral estreita)
  const accCard = h('div', { class: 'card' }, h('h3', {}, secIc('⊙'), ' Acesso'));
  accCard.append(h('div', { class: 'ua-row' }, h('span', { class: 'ua-k', text: 'Rota' }),
    route ? h('span', { class: 'ua-route', text: route }) : h('span', { class: 'muted small', text: 'sem rota (dentro de outra tela)' }),
    (route && uProd === 'portal') ? h('a', { class: 'btn-link ua-open', href: route, target: '_blank', rel: 'noopener', text: 'abrir ↗' }) : null));
  const roles = (r.surface && r.surface.roles) || [];
  accCard.append(h('div', { class: 'ua-row' }, h('span', { class: 'ua-k', text: 'Quem acessa' }),
    roles.length ? h('span', { class: 'ua-roles' }, ...roles.map((x) => badge(x, 'b-low'))) : h('span', { class: 'muted small', text: 'público' })));
  side.append(accCard);
  const anc = Array.isArray(r.anchors) ? r.anchors : [];
  if (anc.length) {
    const ac = h('div', { class: 'card' }, h('h3', {}, secIc('⚓'), ' Detalha os requisitos'));
    const al = h('div', { class: 'usa-anchorlist' });
    anc.forEach((a) => { const req = byId(a.requirement_id); al.append(h('button', { class: 'btn-link usa-anchor', type: 'button', title: req ? req.title : '', onclick: () => openReq(a.requirement_id) }, badge(a.relation, 'b-low'), ' ', h('span', { text: a.requirement_id }))); });
    ac.append(al); side.append(ac);
  }
  side.append(h('div', { class: 'card usa-action' }, h('button', { class: 'btn primary', type: 'button', text: '✨ Propor mudança nesta tela →', onclick: () => {
    state.editId = null;
    state.editor = { stage: 'refine', product: uProd, messages: [], draft: null, graph: null, target_req_id: null, refAnchors: anc.map((a) => ({ requirement_id: a.requirement_id, relation: a.relation || 'refines' })), refSketch: '', _refDrafted: true };
    switchView('editor');
  } })));
  if (r.source && Array.isArray(r.source.source_paths) && r.source.source_paths.length) {
    side.append(h('div', { class: 'card' }, h('h3', {}, secIc('⌗'), ' Origem no código'), h('ul', { class: 'usa-src' }, ...r.source.source_paths.map((s) => h('li', {}, h('code', { text: s }))))));
  }
  grid.append(main, side);
  host.append(grid);
  heading.focus();
}

/* Briefing proativo da base — insights DETERMINÍSTICOS (sempre on) sobre dados já carregados,
   cada um com deep-link, e um atalho para perguntar à IA. Não depende do servidor. */
function overviewBriefing(reqs, prods) {
  const card = h('div', { class: 'ov-card ov-briefing' }, h('h3', {}, secIc('✦'), 'Briefing da base'));
  const list = h('div', { class: 'ov-brief-list' });
  const row = (sev, text, onClick) => h('button', { class: 'ov-brief-i', type: 'button', onclick: onClick },
    h('span', { class: 'ov-brief-dot ' + sev, 'aria-hidden': 'true' }), h('span', { class: 'ov-brief-t', text }), h('span', { class: 'ov-brief-go', 'aria-hidden': 'true', text: '→' }));
  // 1. ASR sem método de verificação (risco arquitetural não verificado)
  const asrNoVerif = reqs.filter((r) => r && r.architectural_significance && !((r.verification_method || []).length));
  if (asrNoVerif.length) list.append(row('is-crit', `${asrNoVerif.length} requisito(s) ASR sem método de verificação`, () => { state.filters = { asr: 'yes' }; switchView('explorer'); }));
  // 2. fila — itens de ALTO IMPACTO (o topo prioritário, não a fila inteira)
  const qcrit = ((DATA.baseline && DATA.baseline.reprocess_queue) || []).filter((it) => it.impact_score >= 70);
  if (qcrit.length) list.append(row('is-warn', `${qcrit.length} requisito(s) de alto impacto a reprocessar`, () => switchView('reprocess')));
  // 3. produtos sem nada no ar ainda
  const stalled = (prods || []).filter((p) => p.progress && (p.progress.live || 0) === 0 && p.reqCount > 0);
  if (stalled.length) list.append(row('is-info', `${stalled.length} produto(s) ainda sem nada no ar`, () => switchView('forge')));
  // 4. dimensão de cobertura mais fraca da base
  if (DATA.coverage && DATA.coverage.totals && DATA.coverage.totals.coverage_pct) {
    const dimLbl = { source_paths: 'origem', links: 'links', allocation: 'alocação', evidence: 'evidência', verification_method: 'método de verificação' };
    let worst = null;
    for (const d of (DATA.coverage.dimensions || [])) { const pct = DATA.coverage.totals.coverage_pct[d]; if (worst === null || pct < worst.pct) worst = { d, pct }; }
    if (worst && worst.pct < 60) list.append(row('is-info', `Cobertura de ${dimLbl[worst.d] || worst.d} em ${worst.pct}% (a mais baixa)`, () => switchView('coverage')));
  }
  if (!list.children.length) list.append(h('p', { class: 'muted small', text: 'Nenhuma anomalia crítica detectada — a base está saudável.' }));
  card.append(list);
  card.append(h('div', { class: 'ws-actions' }, h('button', { class: 'btn-link', type: 'button', onclick: () => openCmdk('Quais requisitos exigem mais atenção agora e por quê?'), text: '✨ Perguntar à IA sobre a base →' })));
  return card;
}

// (A1a) A Visão geral morreu como aba: o hub da Forja é a front-door — KPIs na linha forge-stats
// e anomalias no overviewBriefing (reusado lá). Deep-links #/overview redirecionam via LEGACY_HASH.

function wireNav() {
  const items = [...document.querySelectorAll('.nav-item')];
  items.forEach((it, i) => {
    // Nome acessível: em modo colapsado a .nav-label some (display:none) e o botão fica só com
    // o ícone — title + aria-label preservam o rótulo p/ leitor de tela e tooltip.
    const lbl = it.querySelector('.nav-label');
    const name = lbl ? lbl.textContent.trim() : '';
    if (name) { it.title = name; it.setAttribute('aria-label', name); }
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
// Badges de estado VIVO na sidebar — a casca vira painel de atenção sem abrir cada tela.
function refreshNavBadges() {
  const setBadge = (tabId, text, cls) => {
    const it = document.getElementById(tabId); if (!it) return;
    let b = it.querySelector('.nav-badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = h('span', { class: 'nav-badge' }); it.appendChild(b); }
    b.className = 'nav-badge' + (cls ? ' ' + cls : '');
    b.textContent = text;
  };
  // Mudanças: nº de itens de ALTO IMPACTO na fila de reprocessamento (o topo, não a fila inteira).
  const q = (DATA.baseline && DATA.baseline.reprocess_queue) || [];
  const crit = q.filter((it) => it.impact_score >= 70).length;
  setBadge('tab-versions', crit ? String(crit) : '', 'is-crit');
  // Forja: % no ar (entrega) — visão de progresso na porta de entrada.
  const items = (DATA.implStatus && DATA.implStatus.items) ? Object.values(DATA.implStatus.items) : [];
  if (items.length) {
    const deployed = items.filter((x) => x && ['deployed', 'done', 'merged'].includes(x.status)).length;
    setBadge('tab-forge', Math.round((deployed / items.length) * 100) + '%', 'is-ok');
  }
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
  if (collapse) {
    collapse.setAttribute('aria-pressed', app.classList.contains('is-collapsed') ? 'true' : 'false');
    collapse.addEventListener('click', () => {
      const col = app.classList.toggle('is-collapsed');
      collapse.setAttribute('aria-pressed', col ? 'true' : 'false');
      localStorage.setItem('reqhub-sidebar', col ? 'collapsed' : 'open');
    });
  }
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = app.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (scrim) scrim.hidden = !open;
  });
  if (scrim) scrim.addEventListener('click', () => { app.classList.remove('is-open'); scrim.hidden = true; if (toggle) toggle.setAttribute('aria-expanded', 'false'); });
}
function wireSearch() {
  const q = document.getElementById('q');
  q.addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    if (['explorer', 'versions', 'coverage'].includes(state.view)) RENDER[state.view]();
    if (state.view === 'impact' && IMPACT.st) { IMPACT.st.query = state.q; locateNode(state.q); }
  });
  // Enter = busca GLOBAL: abre o REQ se o termo casa um id/título exato, senão vai ao Explorador filtrado.
  q.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const term = (q.value || '').trim();
    if (!term) return;
    const reqs = (DATA.baseline && DATA.baseline.requirements) || [];
    const low = term.toLowerCase();
    const exact = reqs.find((r) => r.id.toLowerCase() === low) || reqs.find((r) => (r.title || '').toLowerCase() === low);
    if (exact) { openReq(exact.id); return; }
    state.q = term;
    if (state.view !== 'explorer') switchView('explorer'); else renderExplorer();
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
/* (tema e identidade vivem na casca global <platform-shell> — wireTheme/wireUserMenu removidos) */

/* ===================== Copiloto onipresente (Ctrl-K / ✨ na topbar) =====================
   Tira a IA do funil Editor/Forge: pergunta à base grounded R1 (AI.ask) DE QUALQUER tela,
   com citações que deep-linkam (openReq / openImpactAt). Fail-closed: sem IA, vira typeahead
   puro (matchesQuery) que lista e abre requisitos. CSP-safe (h(), sem inline). */
const CMDK = { messages: [], product: null, el: null, open: false };
function wireCommandPalette() {
  const tools = document.querySelector('.topbar-tools');
  if (!tools) return;
  const btn = h('button', { class: 'icon-btn cmdk-btn', id: 'cmdk-btn', type: 'button', 'aria-label': 'Perguntar à base (Ctrl+K)', title: 'Perguntar à base — Ctrl+K' }, h('span', { 'aria-hidden': 'true', text: '✨' }));
  btn.addEventListener('click', () => openCmdk());
  tools.insertBefore(btn, tools.firstChild);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openCmdk(); }
    else if (e.key === 'Escape' && CMDK.open) closeCmdk();
  });
}
function productScopeOptions() { return uniqueValues((DATA.baseline && DATA.baseline.requirements) || [], (r) => r.scope && r.scope.product_scope); }
function cmdkDefaultProduct() {
  const sel = state.selectedId && byId(state.selectedId);
  if (sel && sel.scope && sel.scope.product_scope) return sel.scope.product_scope;
  if (state.editor && state.editor.product) return state.editor.product;
  if (state.forge && state.forge.product) return state.forge.product;
  const o = productScopeOptions(); return o[0] || null;
}
function buildCmdk() {
  const overlay = h('div', { class: 'cmdk-overlay', hidden: 'hidden' });
  const panel = h('div', { class: 'cmdk', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Perguntar à base de requisitos' });
  const prodSel = h('select', { class: 'cmdk-prod', 'aria-label': 'Sistema (contexto da pergunta)' });
  const head = h('div', { class: 'cmdk-head' },
    h('span', { class: 'cmdk-ic', 'aria-hidden': 'true', text: '✨' }),
    h('strong', { class: 'cmdk-title', text: 'Perguntar à base' }),
    h('label', { class: 'cmdk-prod-l' }, h('span', { class: 'muted small', text: 'sistema:' }), prodSel),
    h('button', { class: 'cmdk-x', type: 'button', 'aria-label': 'Fechar', onclick: () => closeCmdk() }, '×'));
  const banner = h('div', {});
  const log = h('div', { class: 'cmdk-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Respostas da IA' });
  const typingEl = h('div', { class: 'chat-msg is-ai chat-typing', hidden: 'hidden' }, h('span', { class: 'visually-hidden', text: 'A IA está respondendo…' }), h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'dot', 'aria-hidden': 'true' }));
  const hits = h('div', { class: 'cmdk-hits' }); // typeahead instantâneo (sem IA)
  const ta = h('textarea', { class: 'cmdk-input', rows: '1', 'aria-label': 'Pergunte sobre a base', placeholder: 'Pergunte sobre a base… (Enter envia · Esc fecha)' });
  const sendBtn = h('button', { class: 'btn primary cmdk-send', type: 'button', text: 'Perguntar' });
  panel.append(head, banner, log, hits, h('div', { class: 'cmdk-inputrow' }, ta, sendBtn));
  overlay.append(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCmdk(); });
  // focus-trap (WCAG 2.4.3): Tab/Shift+Tab circula só dentro do diálogo (o fundo fica inert em openCmdk).
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.body.appendChild(overlay);

  let pending = false, painted = 0;
  const onCite = (id) => { closeCmdk(); openReq(id); };
  function repaint() {
    for (let i = painted; i < CMDK.messages.length; i++) log.insertBefore(chatBubble(CMDK.messages[i], { onCite }), typingEl);
    painted = CMDK.messages.length;
    if (![...log.children].includes(typingEl)) log.append(typingEl);
    typingEl.hidden = !pending; log.setAttribute('aria-busy', pending ? 'true' : 'false');
    log.scrollTop = log.scrollHeight;
  }
  function renderHits() {
    hits.replaceChildren();
    const term = (ta.value || '').trim();
    if (term.length < 2) return;
    const reqs = (DATA.baseline && DATA.baseline.requirements) || [];
    const matches = reqs.filter((r) => matchesQuery(r, term)).slice(0, 6);
    if (!matches.length) return;
    hits.append(h('div', { class: 'cmdk-hits-l muted small', text: 'Requisitos que casam:' }));
    for (const r of matches) hits.append(h('button', { class: 'cmdk-hit', type: 'button', onclick: () => { closeCmdk(); openReq(r.id); } },
      h('span', { class: 'rid', text: r.id }), h('span', { class: 'cmdk-hit-t', text: truncateLabel(r.title || '', 56) })));
  }
  async function send() {
    const text = (ta.value || '').trim();
    if (!text || pending) return;
    const up = await AI.aiAvailable();
    if (!up) { // fail-closed: sem IA, o typeahead é a resposta
      renderHits();
      banner.replaceChildren(h('div', { class: 'cmdk-banner' }, h('span', { text: 'A IA está indisponível agora — mostrando os requisitos que casam com a busca. Clique para abrir.' })));
      return;
    }
    CMDK.messages.push({ role: 'user', content: text });
    ta.value = ''; hits.replaceChildren(); pending = true; sendBtn.disabled = true; repaint();
    try {
      const r = await AI.ask({ question: text, product: CMDK.product, history: CMDK.messages.slice(0, -1).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) });
      pending = false; sendBtn.disabled = false;
      if (!r.ok) { CMDK.messages.push({ role: 'assistant', error: true, content: 'A IA respondeu com erro' + (r.error && r.error.code ? ' (' + r.error.code + ')' : '') + '. Tente de novo.' }); repaint(); return; }
      CMDK.messages.push({ role: 'assistant', content: r.reply || '(sem resposta)', intent: r.intent, citations: r.citations, grounded: r.grounded, draft: r.draft, next_question: r.next_question });
      repaint();
    } catch (e) { pending = false; sendBtn.disabled = false; CMDK.messages.push({ role: 'assistant', error: true, content: 'Erro de rede ao falar com a IA.' }); repaint(); }
  }
  sendBtn.addEventListener('click', send);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener('input', renderHits);
  prodSel.addEventListener('change', () => { CMDK.product = prodSel.value; CMDK.messages = []; painted = 0; log.replaceChildren(typingEl); greet(); });
  function greet() {
    const meta = productMeta(CMDK.product);
    log.insertBefore(chatBubble({ role: 'assistant', grounded: true, content: 'Pergunte sobre ' + (meta.display_name || CMDK.product || 'a base') + ' — respondo citando os requisitos, e os IDs abrem direto. Ex.: "quais requisitos tratam de autenticação?"' }, { onCite }), typingEl);
  }
  CMDK.el = { overlay, panel, prodSel, log, ta, typingEl, banner, hits, repaint, renderHits, greet, reset() { painted = 0; } };
}
async function openCmdk(seedQuestion) {
  if (!CMDK.el) buildCmdk();
  const { overlay, prodSel, log, ta, typingEl, banner } = CMDK.el;
  // (re)popula o seletor de sistema, default = produto do REQ em foco
  const opts = productScopeOptions();
  if (!CMDK.product || !opts.includes(CMDK.product)) CMDK.product = cmdkDefaultProduct();
  prodSel.replaceChildren(...opts.map((p) => { const o = h('option', { value: p, text: productMeta(p).display_name || p }); if (p === CMDK.product) o.selected = true; return o; }));
  banner.replaceChildren();
  if (!CMDK.messages.length) { log.replaceChildren(typingEl); CMDK.el.reset(); CMDK.el.greet(); }
  CMDK.returnFocus = document.activeElement; // restaura o foco ao gatilho que abriu (não só à topbar)
  overlay.hidden = false; CMDK.open = true;
  document.body.classList.add('cmdk-on');
  // isola o resto do app de teclado/AT enquanto o modal está aberto (o overlay é irmão de #app)
  const app = document.getElementById('app'); if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
  // banner se a IA estiver fora
  AI.aiAvailable().then((up) => { if (!up) banner.replaceChildren(h('div', { class: 'cmdk-banner' }, h('span', { text: 'IA indisponível — a busca abaixo lista os requisitos que casam (sem síntese). ' }))); });
  if (seedQuestion) { ta.value = seedQuestion; CMDK.el.renderHits(); }
  setTimeout(() => ta.focus(), 30);
}
function closeCmdk() {
  if (!CMDK.el) return;
  CMDK.el.overlay.hidden = true; CMDK.open = false;
  document.body.classList.remove('cmdk-on');
  const app = document.getElementById('app'); if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
  // devolve o foco ao gatilho real (botão na lista/card), com fallback ao ✨ da topbar
  const r = CMDK.returnFocus;
  if (r && document.contains(r) && r.offsetParent !== null && typeof r.focus === 'function') r.focus();
  else { const b = document.getElementById('cmdk-btn'); if (b) b.focus(); }
  CMDK.returnFocus = null;
}

/* ===================== Painel "Uso da IA" (Claude + OpenAI) — admin only =====================
   Consome /reqs/api/v1/ai-usage/* (telemetria interna + contas + live SSE). CSP-safe: DOM via
   h()/svg, cor de status por CLASSE (nada inline). Gating por platform-admins. */
function applyAdminGating() {
  const admin = !!(state.me && state.me.isAdmin);
  const grp = document.getElementById('nav-group-ai'); if (grp) grp.hidden = !admin;
  const tab = document.getElementById('tab-aiusage');
  if (tab) { tab.disabled = !admin; if (!admin) tab.setAttribute('aria-disabled', 'true'); else tab.removeAttribute('aria-disabled'); }
}
function fmtUsd(n) { const v = Number(n) || 0; if (v === 0) return 'US$ 0'; if (v < 1) return 'US$ ' + v.toFixed(v < 0.01 ? 4 : 3); return 'US$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtTokens(n) { const v = Number(n) || 0; if (v >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'; if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return String(Math.round(v)); }
function fmtInt(n) { return (Number(n) || 0).toLocaleString('pt-BR'); }
function aiSeverityCls(pct) { const p = Number(pct) || 0; return p >= 90 ? 'danger' : p >= 70 ? 'warn' : 'ok'; }
function aiSeverityLabel(pct) { const p = Number(pct) || 0; return p >= 90 ? 'crítico' : p >= 70 ? 'atenção' : 'ok'; }
function windowLabel() { const m = { '24h': '24h', '7d': '7d', '30d': '30d', '90d': '90d', mtd: 'mês' }; return m[state.aiUsage.window] || state.aiUsage.window; }
function aiSourceBadge(p) { return p && p.account ? badge('oficial (conta)', 'b-ok') : badge('estimado (telemetria)', 'b-low'); }

// gauge SVG de % (arco; comprimento por atributo, cor por CLASSE — CSP-safe)
function aiGauge(pct, label) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const len = Math.PI * 54;
  const s = svg('svg', { class: 'aiu-gauge', viewBox: '0 0 120 70', role: 'img', 'aria-label': (label || 'limite') + ': ' + Math.round(p) + '% (' + aiSeverityLabel(p) + ')' });
  s.append(svg('path', { class: 'aiu-gauge-track', d: 'M8 62 A54 54 0 0 1 112 62', fill: 'none' }));
  s.append(svg('path', { class: 'aiu-gauge-arc ' + aiSeverityCls(p), d: 'M8 62 A54 54 0 0 1 112 62', fill: 'none', 'stroke-dasharray': String(len), 'stroke-dashoffset': String(len * (1 - p / 100)) }));
  const t = svg('text', { class: 'aiu-gauge-v', x: '60', y: '54', 'text-anchor': 'middle' }); t.textContent = Math.round(p) + '%';
  s.append(t);
  return s;
}

function aiUsageToolbar() {
  const bar = h('div', { class: 'toolbar aiu-toolbar' });
  const winSel = h('select', { class: 'aiu-win', 'aria-label': 'Janela de tempo' });
  for (const [v, lbl] of [['24h', 'Últimas 24h'], ['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['mtd', 'Mês corrente']]) {
    const o = h('option', { value: v, text: lbl }); if (v === state.aiUsage.window) o.selected = true; winSel.append(o);
  }
  winSel.addEventListener('change', (e) => { state.aiUsage.window = e.target.value; renderAiUsage(); });
  bar.append(h('label', { class: 'aiu-win-l' }, h('span', { text: 'Janela' }), winSel));
  bar.append(aiLiveIndicator());
  const refresh = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Atualizar', title: 'Atualizar' }); refresh.append(icon('reprocess', 16));
  refresh.addEventListener('click', () => renderAiUsage());
  bar.append(refresh);
  return bar;
}
function aiLiveText(s) { return s === 'live' ? 'ao vivo' : s === 'reconnecting' ? 'reconectando…' : s === 'offline' ? 'ao vivo indisponível' : 'conectando…'; }
function aiLiveIndicator() {
  const s = state.aiUsage.liveState;
  return h('span', { class: 'aiu-live is-' + s, id: 'aiu-live-ind', role: 'status', 'aria-live': 'off' }, h('span', { class: 'aiu-live-dot', 'aria-hidden': 'true' }), h('span', { class: 'aiu-live-t', text: aiLiveText(s) }));
}
function setLiveState(s) { state.aiUsage.liveState = s; const el = document.getElementById('aiu-live-ind'); if (el) { el.className = 'aiu-live is-' + s; const t = el.querySelector('.aiu-live-t'); if (t) t.textContent = aiLiveText(s); } }

function aiSourcesBanner(sh0) {
  const sh = sh0 || {};
  const lab = { ok: 'ok', configured: 'pronto', degraded: 'degradado', down: 'fora', absent: 'ausente', error: 'erro', unknown: '?' };
  const cls = (st) => (st === 'ok' || st === 'configured') ? 'ok' : (st === 'absent') ? 'off' : 'warn';
  const item = (name, st) => h('span', { class: 'aiu-src-pill is-' + cls(st), text: name + ': ' + (lab[st] || st) });
  return h('div', { class: 'aiu-sources', 'aria-label': 'Estado das fontes de dados' },
    item('Prometheus', sh.prometheus), item('Langfuse', sh.langfuse), item('conta OpenAI', sh.openaiAdmin), item('conta Anthropic', sh.anthropicAdmin));
}

function aiKpi(label, value, sub) {
  const c = h('div', { class: 'aiu-kpi' }, h('div', { class: 'k-l', text: label }), h('div', { class: 'k-v', text: value }));
  if (sub) c.append(sub);
  return c;
}
function aiLiveBlock(provider) {
  return h('div', { class: 'aiu-live-rates', 'data-prov': provider, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    h('span', { class: 'aiu-rate' }, h('b', { class: 'r-cost', text: '—' }), ' US$/min'),
    h('span', { class: 'aiu-rate' }, h('b', { class: 'r-tok', text: '—' }), ' tok/min'),
    h('span', { class: 'aiu-rate' }, h('b', { class: 'r-req', text: '—' }), ' req/min'));
}
function applyAiRates(snap) {
  for (const pr of (snap.providers || [])) {
    const el = document.querySelector('.aiu-live-rates[data-prov="' + pr.provider + '"]'); if (!el) continue;
    const rc = el.querySelector('.r-cost'); if (rc) rc.textContent = (pr.rolling.costUsdPerMin || 0).toFixed(4);
    const rt = el.querySelector('.r-tok'); if (rt) rt.textContent = fmtTokens(pr.rolling.tokensPerMin || 0);
    const rq = el.querySelector('.r-req'); if (rq) rq.textContent = String(Math.round(pr.rolling.requestsPerMin || 0));
  }
}

function aiModuleTable(p) {
  const mods = p.modules || [];
  const wrap = h('div', { class: 'aiu-tbl-wrap' }, h('h3', { class: 'aiu-tbl-h' }, secIc('▤'), 'Consumo por módulo'));
  if (!mods.length) { wrap.append(h('p', { class: 'muted', text: 'Sem consumo interno nesta janela.' })); return wrap; }
  const total = mods.reduce((a, m) => a + (m.internal.cost || 0), 0) || 1;
  const tbl = h('table', { class: 'aiu-tbl' });
  tbl.append(h('thead', {}, h('tr', {}, h('th', { text: 'Módulo' }), h('th', { class: 'num', text: 'Custo' }), h('th', { class: 'num', text: 'Tokens' }), h('th', { class: 'num', text: 'Req.' }), h('th', { text: '% do provedor' }))));
  const tb = h('tbody');
  for (const m of mods) {
    const pct = Math.round(((m.internal.cost || 0) / total) * 100);
    tb.append(h('tr', {}, h('td', { text: m.module }), h('td', { class: 'num', text: fmtUsd(m.internal.cost) }), h('td', { class: 'num', text: fmtTokens((m.internal.tokensIn || 0) + (m.internal.tokensOut || 0)) }), h('td', { class: 'num', text: fmtInt(m.internal.requests) }), h('td', { class: 'aiu-bar-cell' }, miniBar(pct, 'ok'), h('span', { class: 'aiu-bar-n', text: pct + '%' }))));
  }
  tbl.append(tb); wrap.append(tbl); return wrap;
}
function aiModelTable(p) {
  const agg = new Map();
  for (const m of (p.modules || [])) for (const md of (m.models || [])) {
    const e = agg.get(md.model) || { model: md.model, cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 };
    e.cost += md.cost || 0; e.tokensIn += md.tokensIn || 0; e.tokensOut += md.tokensOut || 0; e.requests += md.requests || 0; agg.set(md.model, e);
  }
  const rows = [...agg.values()].sort((a, b) => b.cost - a.cost);
  const wrap = h('div', { class: 'aiu-tbl-wrap' }, h('h3', { class: 'aiu-tbl-h' }, secIc('◳'), 'Consumo por modelo'));
  if (!rows.length) { wrap.append(h('p', { class: 'muted', text: '—' })); return wrap; }
  const total = rows.reduce((a, m) => a + m.cost, 0) || 1;
  const tbl = h('table', { class: 'aiu-tbl' });
  tbl.append(h('thead', {}, h('tr', {}, h('th', { text: 'Modelo' }), h('th', { class: 'num', text: 'Custo' }), h('th', { class: 'num', text: 'Tokens' }), h('th', { class: 'num', text: 'Req.' }), h('th', { text: '%' }))));
  const tb = h('tbody');
  for (const m of rows) { const pct = Math.round((m.cost / total) * 100); tb.append(h('tr', {}, h('td', {}, h('code', { text: m.model })), h('td', { class: 'num', text: fmtUsd(m.cost) }), h('td', { class: 'num', text: fmtTokens(m.tokensIn + m.tokensOut) }), h('td', { class: 'num', text: fmtInt(m.requests) }), h('td', { class: 'aiu-bar-cell' }, miniBar(pct, 'ok'), h('span', { class: 'aiu-bar-n', text: pct + '%' })))); }
  tbl.append(tb); wrap.append(tbl); return wrap;
}

// ── Assinatura Claude Code (Opus/Sonnet) — janelas 5h/semana (sem API pública; agregado local) ──
// Plano Claude (ASSINATURA) — espelha a tela "Uso" do app desktop (Configurações → Uso):
// plano, sessão atual %, limites semanais (todos os modelos / só Sonnet) e créditos. Sem API pública
// + cache do desktop efêmero → o admin informa pelo formulário; o painel espelha. Distinto da CHAVE
// DE API Anthropic (custo real dos apps), que aparece nos cards de provedor abaixo.
function aiPlanCard(label, pctv, subline) {
  const c = h('div', { class: 'aiu-kpi' }, h('div', { class: 'k-l', text: label }), h('div', { class: 'k-v', text: (pctv == null ? '—' : pctv + '%') }));
  if (pctv != null) c.append(miniBar(pctv, 'accent'));
  if (subline) c.append(h('div', { class: 'muted aiu-k-sub', text: subline }));
  return c;
}
function aiSubscriptionSection(sub) {
  const wrap = h('div', { class: 'aiu-tbl-wrap' });
  wrap.append(h('h3', { class: 'aiu-tbl-h' }, secIc('◔'), 'Plano Claude (assinatura) — limites de uso'));
  const has = sub && (sub.source === 'manual' || sub.source === 'auto');
  const auto = sub && sub.source === 'auto';
  if (has) {
    const tail = auto ? '   ·   ao vivo (probe automático da assinatura)' : '   ·   espelha o app desktop (Configurações → Uso)';
    wrap.append(h('p', { class: 'muted' }, h('b', { text: 'Plano: ' + (sub.plan || '—') }), h('span', { text: tail })));
    const grid = h('div', { class: 'aiu-kpis' });
    const seg = sub.session || {}; const wa = sub.weeklyAll || {}; const ws = sub.weeklySonnet || {}; const cr = sub.credits || {};
    const segSub = seg.resetsLabel ? 'reinicia ' + seg.resetsLabel : (seg.note || 'janela de 5h');
    grid.append(aiPlanCard('Sessão atual', seg.pct, segSub));
    grid.append(aiPlanCard('Semanal — todos os modelos', wa.pct, wa.resetsLabel ? 'reinicia ' + wa.resetsLabel : null));
    grid.append(aiPlanCard('Semanal — só Sonnet', ws.pct, ws.resetsLabel ? 'reinicia ' + ws.resetsLabel : null));
    const credVal = (cr.spent == null) ? '—' : (cr.currency || 'BRL') + ' ' + Number(cr.spent).toFixed(2);
    const credCard = h('div', { class: 'aiu-kpi' }, h('div', { class: 'k-l', text: 'Créditos de uso' }), h('div', { class: 'k-v', text: credVal }));
    if (cr.pct != null) credCard.append(miniBar(cr.pct, 'accent'));
    const credSub = (cr.pct != null ? cr.pct + '% usado' : '') + (cr.resetsLabel ? (cr.pct != null ? ' · ' : '') + 'reinicia ' + cr.resetsLabel : '');
    if (credSub) credCard.append(h('div', { class: 'muted aiu-k-sub', text: credSub }));
    grid.append(credCard);
    wrap.append(grid);
    let when = '—'; try { when = sub.updatedAt ? new Date(sub.updatedAt).toLocaleString('pt-BR') : '—'; } catch { when = sub.updatedAt || '—'; }
    const src = auto
      ? 'Atualizado automaticamente (probe da assinatura): ' + when + '. Lê os limites direto da Anthropic via headers de rate-limit.'
      : 'Atualizado: ' + when + (sub.updatedBy ? ' por ' + sub.updatedBy : '') + '. Informado manualmente — o app desktop é a fonte oficial.';
    wrap.append(h('p', { class: 'muted', text: src }));
  } else {
    wrap.append(h('p', { class: 'muted', text: (sub && sub.note) || 'Sem dados do plano — o probe automático ainda não rodou. Configure scripts/sync-claude-plan-usage.ps1 (token dedicado), ou preencha manualmente abaixo.' }));
  }
  wrap.append(aiPlanForm(has ? sub : null));
  return wrap;
}
function aiPlanForm(cur) {
  cur = cur || {};
  const seg = cur.session || {}; const wa = cur.weeklyAll || {}; const ws = cur.weeklySonnet || {}; const cr = cur.credits || {};
  const details = h('details', { class: 'aiu-plan-form' });
  details.append(h('summary', { text: 'Atualizar números do plano (admin)' }));
  const grid = h('div', { class: 'aiu-form-grid' });
  const field = (label, key, val, ph, type) => h('label', { class: 'aiu-field' },
    h('span', { class: 'muted', text: label }),
    h('input', { id: 'plan-' + key, class: 'aiu-input', type: type || 'number', step: 'any', value: (val == null ? '' : String(val)), placeholder: ph || '' }));
  grid.append(field('Plano', 'plan', cur.plan || 'Max (20x)', 'Max (20x)', 'text'));
  grid.append(field('Sessão atual (%)', 'sessionPct', seg.pct, '0'));
  grid.append(field('Semanal — todos os modelos (%)', 'weeklyAllPct', wa.pct, '49'));
  grid.append(field('Reinício semanal', 'weeklyReset', wa.resetsLabel || 'seg., 07:00', 'seg., 07:00', 'text'));
  grid.append(field('Semanal — só Sonnet (%)', 'weeklySonnetPct', ws.pct, '16'));
  grid.append(field('Créditos gastos', 'creditsSpent', cr.spent, '0'));
  grid.append(field('Moeda', 'creditsCurrency', cr.currency || 'BRL', 'BRL', 'text'));
  grid.append(field('Créditos usados (%)', 'creditsPct', cr.pct, '0'));
  grid.append(field('Reinício créditos', 'creditsReset', cr.resetsLabel || '', 'Jul 1', 'text'));
  details.append(grid);
  const msg = h('span', { class: 'muted', id: 'plan-form-msg' });
  const save = h('button', { class: 'aiu-btn', type: 'button', text: 'Salvar' });
  save.addEventListener('click', async () => {
    const v = (k) => { const el = document.getElementById('plan-' + k); return el ? el.value : ''; };
    const nv = (k) => { const s = String(v(k)).trim(); return s === '' ? null : Number(s); };
    const payload = {
      plan: v('plan'),
      session: { pct: nv('sessionPct') },
      weeklyAll: { pct: nv('weeklyAllPct'), resetsLabel: v('weeklyReset') },
      weeklySonnet: { pct: nv('weeklySonnetPct'), resetsLabel: v('weeklyReset') },
      credits: { spent: nv('creditsSpent'), currency: v('creditsCurrency'), pct: nv('creditsPct'), resetsLabel: v('creditsReset') },
    };
    save.disabled = true; msg.textContent = 'Salvando…';
    try {
      const r = await AI.post('/v1/ai-usage/subscription', payload);
      if (r && r.ok) { msg.textContent = 'Salvo.'; renderAiUsage(); }
      else { msg.textContent = 'Falha: ' + ((r && r.data && r.data.error && r.data.error.message) || (r && r.status) || 'erro'); save.disabled = false; }
    } catch (e) { msg.textContent = 'Erro: ' + e.message; save.disabled = false; }
  });
  details.append(h('div', { class: 'aiu-form-actions' }, save, msg));
  return details;
}

// ── Visão por PRODUTO → MODELO → CUSTO (o que o operador quer ver claro) ──
// Agrega providers[].modules[].models[] num mapa produto -> modelos (cross-provider).
function aiUnifiedProductRows(bd) {
  const map = new Map();
  for (const p of (bd.providers || [])) {
    for (const m of (p.modules || [])) {
      let prod = map.get(m.module);
      if (!prod) { prod = { product: m.module, cost: 0, tokensIn: 0, tokensOut: 0, requests: 0, models: [] }; map.set(m.module, prod); }
      for (const md of (m.models || [])) {
        prod.models.push({ model: md.model, provider: p.provider, providerLabel: p.label, cost: md.cost || 0, tokensIn: md.tokensIn || 0, tokensOut: md.tokensOut || 0, requests: md.requests || 0 });
        prod.cost += md.cost || 0; prod.tokensIn += md.tokensIn || 0; prod.tokensOut += md.tokensOut || 0; prod.requests += md.requests || 0;
      }
    }
  }
  return [...map.values()].sort((a, b) => (b.cost || 0) - (a.cost || 0));
}
// Linhas produto->modelo de UM provedor (sem coluna de provedor).
function aiProviderProductRows(p) {
  return (p.modules || []).map((m) => ({
    product: m.module,
    cost: (m.internal && m.internal.cost) || 0,
    tokensIn: (m.internal && m.internal.tokensIn) || 0,
    tokensOut: (m.internal && m.internal.tokensOut) || 0,
    requests: (m.internal && m.internal.requests) || 0,
    models: (m.models || []).map((md) => ({ model: md.model, cost: md.cost || 0, tokensIn: md.tokensIn || 0, tokensOut: md.tokensOut || 0, requests: md.requests || 0 })),
  }));
}
// Tabela AGRUPADA: cada produto é um cabeçalho com subtotal; abaixo, os modelos que ele usa,
// com o custo POR MODELO. opts.showProvider = mostra de qual provedor é cada modelo.
function aiGroupedProductModelTable(productRows, opts) {
  opts = opts || {};
  const showProvider = !!opts.showProvider;
  const wrap = h('div', { class: 'aiu-tbl-wrap' }, h('h3', { class: 'aiu-tbl-h' }, secIc('▦'), opts.title || 'Consumo por produto e modelo'));
  if (!productRows.length) { wrap.append(h('p', { class: 'muted', text: opts.empty || 'Sem consumo interno nesta janela.' })); return wrap; }
  const grand = productRows.reduce((a, p) => a + (p.cost || 0), 0) || 1;
  const tbl = h('table', { class: 'aiu-tbl aiu-tbl-grouped' });
  const head = [h('th', { text: 'Produto / modelo' })];
  if (showProvider) head.push(h('th', { text: 'Provedor' }));
  head.push(h('th', { class: 'num', text: 'Custo' }), h('th', { class: 'num', text: 'Tokens' }), h('th', { class: 'num', text: 'Req.' }), h('th', { text: opts.pctLabel || '% do total' }));
  tbl.append(h('thead', {}, h('tr', {}, ...head)));
  const tb = h('tbody');
  for (const prod of productRows) {
    const ppct = Math.round(((prod.cost || 0) / grand) * 100);
    const grp = [h('td', { class: 'aiu-grp-name' }, h('span', { class: 'aiu-dot', 'aria-hidden': 'true' }), h('strong', { text: prod.product }))];
    if (showProvider) grp.push(h('td', {}));
    grp.push(h('td', { class: 'num' }, h('strong', { text: fmtUsd(prod.cost) })), h('td', { class: 'num', text: fmtTokens((prod.tokensIn || 0) + (prod.tokensOut || 0)) }), h('td', { class: 'num', text: fmtInt(prod.requests) }), h('td', { class: 'aiu-bar-cell' }, miniBar(ppct, 'accent'), h('span', { class: 'aiu-bar-n', text: ppct + '%' })));
    tb.append(h('tr', { class: 'aiu-grp' }, ...grp));
    const models = (prod.models || []).slice().sort((a, b) => (b.cost || 0) - (a.cost || 0));
    if (!models.length) { const span = showProvider ? 6 : 5; tb.append(h('tr', { class: 'aiu-sub' }, h('td', { class: 'aiu-sub-model muted', colspan: String(span), text: 'sem modelo registrado' }))); }
    for (const md of models) {
      const mpct = Math.round(((md.cost || 0) / (prod.cost || 1)) * 100);
      const cells = [h('td', { class: 'aiu-sub-model' }, h('span', { class: 'aiu-tree', 'aria-hidden': 'true', text: '└' }), h('code', { text: md.model }))];
      if (showProvider) cells.push(h('td', {}, h('span', { class: 'aiu-prov-chip aiu-prov-' + md.provider }, secIc(md.provider === 'anthropic' ? '✶' : '◆'), h('span', { text: md.providerLabel || md.provider }))));
      cells.push(h('td', { class: 'num', text: fmtUsd(md.cost) }), h('td', { class: 'num', text: fmtTokens((md.tokensIn || 0) + (md.tokensOut || 0)) }), h('td', { class: 'num', text: fmtInt(md.requests) }), h('td', { class: 'aiu-bar-cell' }, miniBar(mpct, 'ok'), h('span', { class: 'aiu-bar-n', text: mpct + '%' })));
      tb.append(h('tr', { class: 'aiu-sub' }, ...cells));
    }
  }
  tbl.append(tb); wrap.append(tbl); return wrap;
}
// Resumo no topo: total agregado de TODOS os provedores (bd.totals).
function aiUsageSummary(bd) {
  const t = bd.totals || { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 };
  const kpis = h('div', { class: 'aiu-kpis aiu-kpis-top' });
  kpis.append(aiKpi('Custo total (' + windowLabel() + ')', fmtUsd(t.cost)));
  kpis.append(aiKpi('Tokens entrada', fmtTokens(t.tokensIn)));
  kpis.append(aiKpi('Tokens saída', fmtTokens(t.tokensOut)));
  kpis.append(aiKpi('Requisições', fmtInt(t.requests)));
  return kpis;
}
// Seção de visão geral cross-provider (o "barramento" produto×modelo×custo pedido).
function aiUnifiedSection(bd) {
  const sec = h('section', { class: 'aiu-provider aiu-unified', 'aria-label': 'Visão geral por produto e modelo' });
  sec.append(h('div', { class: 'aiu-prov-h' }, h('h2', { class: 'aiu-prov-t', tabindex: '-1' }, secIc('▦'), 'Visão geral — produto × modelo × custo'), h('span', { class: 'aiu-src-badge', text: 'estimado (telemetria)' })));
  sec.append(aiUsageSummary(bd));
  sec.append(aiGroupedProductModelTable(aiUnifiedProductRows(bd), { showProvider: true, title: 'Cada produto, os modelos que ele consome e o custo por modelo', empty: 'Nenhum produto registrou uso de IA nesta janela — use as aplicações e os custos aparecem aqui.' }));
  return sec;
}

function providerSection(p) {
  const acc = p.account; const intr = p.internal || {};
  const cost = acc ? acc.cost : intr.cost; const tin = acc ? acc.tokensIn : intr.tokensIn;
  const tout = acc ? acc.tokensOut : intr.tokensOut; const reqs = acc ? acc.requests : intr.requests;
  const sec = h('section', { class: 'aiu-provider', 'aria-label': p.label });
  sec.append(h('div', { class: 'aiu-prov-h' }, h('h2', { class: 'aiu-prov-t', tabindex: '-1' }, secIc(p.provider === 'anthropic' ? '✶' : '◆'), p.label), aiSourceBadge(p)));
  if (p.provider === 'anthropic' && !acc && (intr.requests || 0) === 0 && (!p.modules || !p.modules.length)) {
    sec.append(h('div', { class: 'aiu-empty-claude' }, h('p', { class: 'muted', text: 'Claude ainda não está em uso na plataforma — o painel já está pronto: assim que um módulo passar a consumir a API da Anthropic (ou você plugar a chave admin da conta), custo, tokens, modelos e limites aparecem aqui automaticamente.' })));
  }
  const kpis = h('div', { class: 'aiu-kpis' });
  kpis.append(aiKpi('Custo (' + windowLabel() + ')', fmtUsd(cost), aiSourceBadge(p)));
  kpis.append(aiKpi('Tokens entrada', fmtTokens(tin)));
  kpis.append(aiKpi('Tokens saída', fmtTokens(tout)));
  kpis.append(aiKpi('Requisições', fmtInt(reqs)));
  if (p.budget) kpis.append(aiKpi('Orçamento mensal', Math.round(p.budget.pctOfLimit) + '%', h('span', { class: 'aiu-kpi-band ' + aiSeverityCls(p.budget.pctOfLimit), text: aiSeverityLabel(p.budget.pctOfLimit) })));
  sec.append(kpis);
  sec.append(aiLiveBlock(p.provider));
  const gauges = h('div', { class: 'aiu-gauges' });
  if (p.budget) gauges.append(h('div', { class: 'aiu-gauge-wrap' }, aiGauge(p.budget.pctOfLimit, 'Orçamento mensal'), h('span', { class: 'aiu-gauge-l', text: 'Orçamento — US$ ' + Number(p.budget.spentUsd).toFixed(2) + ' / ' + Number(p.budget.monthlyUsd).toFixed(2) })));
  for (const rl of (p.limits && p.limits.rateLimits) || []) gauges.append(h('div', { class: 'aiu-gauge-wrap' }, aiGauge(rl.pctUsed, rl.kind), h('span', { class: 'aiu-gauge-l', text: rl.kind + ' — ' + fmtInt(rl.remaining) + '/' + fmtInt(rl.limit) + ' ' + (rl.unit || '') })));
  if (gauges.children.length) sec.append(gauges);
  sec.append(aiGroupedProductModelTable(aiProviderProductRows(p), { title: 'Consumo por produto e modelo neste provedor', pctLabel: '% do provedor' }));
  sec.append(aiModelTable(p));
  if (!acc) sec.append(h('p', { class: 'aiu-note muted', text: 'Conta oficial indisponível (chave admin não configurada) — números acima são estimados pela telemetria interna.' }));
  else if (p.drift != null) sec.append(h('p', { class: 'aiu-note muted', text: 'Conta oficial (faturada, ' + (acc.lag || 'diário') + '). Diferença vs. estimado: US$ ' + Number(p.drift).toFixed(2) + '.' }));
  if (p.claudeCodeSubscriptionNote) sec.append(h('p', { class: 'aiu-note muted aiu-note-claude', text: p.claudeCodeSubscriptionNote }));
  return sec;
}

function renderAiAlerts(alerts) {
  const el = document.getElementById('aiusage-alerts'); if (!el) return;
  el.replaceChildren();
  for (const a of (alerts || [])) {
    const crit = a.severity === 'critical';
    el.append(h('div', { class: 'aiu-alert is-' + (crit ? 'danger' : 'warn'), role: crit ? 'alert' : 'status', 'aria-live': crit ? 'assertive' : 'polite' },
      h('span', { class: 'aiu-alert-ic', 'aria-hidden': 'true', text: crit ? '⚠' : '!' }),
      h('div', { class: 'aiu-alert-tx' }, h('strong', { text: a.title }), h('p', { text: a.detail || '' }))));
  }
  const it = document.getElementById('tab-aiusage');
  if (it) { let b = it.querySelector('.nav-badge'); const n = (alerts || []).length; if (!n) { if (b) b.remove(); } else { if (!b) { b = h('span', { class: 'nav-badge' }); it.appendChild(b); } b.className = 'nav-badge is-crit'; b.textContent = String(n); } }
}

function connectAiStream() {
  if (state.aiUsage.es || !(state.me && state.me.isAdmin) || state.view !== 'aiusage') return;
  setLiveState('connecting');
  let es; try { es = AI.stream('/v1/ai-usage/stream'); } catch { setLiveState('offline'); return; }
  state.aiUsage.es = es;
  es.addEventListener('rates', (ev) => { try { applyAiRates(JSON.parse(ev.data)); setLiveState('live'); state.aiUsage.reconnectMs = 1000; } catch { /* frame inválido */ } });
  es.addEventListener('error', () => { setLiveState('reconnecting'); scheduleAiReconnect(); });
}
function scheduleAiReconnect() {
  if (state.view !== 'aiusage') { disconnectAiStream(); return; }
  if (state.aiUsage.es) { try { state.aiUsage.es.close(); } catch { /* ignore */ } state.aiUsage.es = null; }
  clearTimeout(state.aiUsage.reconnectTimer);
  const delay = Math.min(30000, state.aiUsage.reconnectMs);
  state.aiUsage.reconnectMs = Math.min(30000, state.aiUsage.reconnectMs * 2);
  state.aiUsage.reconnectTimer = setTimeout(() => { if (state.view === 'aiusage') connectAiStream(); else setLiveState('offline'); }, delay);
}
function disconnectAiStream() {
  clearTimeout(state.aiUsage.reconnectTimer); state.aiUsage.reconnectTimer = null;
  if (state.aiUsage.es) { try { state.aiUsage.es.close(); } catch { /* ignore */ } state.aiUsage.es = null; }
  setLiveState('off');
}

function aiUsageSkeleton() { const w = h('div', { class: 'aiu-skel' }); for (let i = 0; i < 2; i++) w.append(h('div', { class: 'aiu-skel-card' })); return w; }

async function renderAiUsage() {
  const body = document.getElementById('aiusage-body'); if (!body) return;
  if (!(state.me && state.me.isAdmin)) {
    disconnectAiStream();
    body.replaceChildren(emptyState({ title: 'Acesso restrito', text: 'O painel de Uso da IA é exclusivo de platform-admins.' }));
    const al = document.getElementById('aiusage-alerts'); if (al) al.replaceChildren();
    return;
  }
  body.setAttribute('aria-busy', 'true');
  body.replaceChildren(aiUsageToolbar(), aiUsageSkeleton());
  const win = state.aiUsage.window;
  let res; let alertsRes;
  let subRes;
  try { [res, alertsRes, subRes] = await Promise.all([AI.get('/v1/ai-usage/breakdown?window=' + win), AI.get('/v1/ai-usage/alerts?window=' + win), AI.get('/v1/ai-usage/subscription')]); } catch { res = { ok: false }; }
  body.removeAttribute('aria-busy');
  if (!res || !res.ok) {
    body.replaceChildren(aiUsageToolbar(), emptyState({ title: 'Uso da IA indisponível', text: 'Não foi possível agregar o consumo (status ' + ((res && res.status) || 'rede') + ').', ctaLabel: 'Tentar de novo', ctaOnClick: renderAiUsage }));
    return;
  }
  const bd = res.data; state.aiUsage.lastBreakdown = bd;
  renderAiAlerts((alertsRes && alertsRes.ok && alertsRes.data && alertsRes.data.alerts) || []);
  const frag = document.createDocumentFragment();
  frag.append(aiUsageToolbar());
  frag.append(aiSourcesBanner(bd.sourcesHealth));
  frag.append(aiSubscriptionSection(subRes && subRes.ok ? subRes.data : null));
  frag.append(aiUnifiedSection(bd));
  for (const p of (bd.providers || [])) frag.append(providerSection(p));
  body.replaceChildren(frag);
  connectAiStream();
}

async function init() {
  document.documentElement.classList.remove('no-js');
  // registra a navegação no registry compartilhado ANTES de qualquer render — o Studio (studio.js)
  // chama nav.switchView/openReq/overviewBriefing sem importar o app.js (sem ciclo ESM, ver core.js).
  Object.assign(nav, { switchView, openReq, overviewBriefing });
  // tema e identidade agora vivem na casca global (<platform-shell>) — sem wireTheme/wireUserMenu aqui.
  wireIcons(); wireNav(); wireSidebar(); wireSearch(); wireFullscreen();
  // identidade p/ gating do painel de Uso da IA (a casca não reemite o me). Fail-soft: erro => não-admin.
  try { const r = await fetch('api/v1/me', { headers: { Accept: 'application/json' } }); state.me = r.ok ? await r.json() : null; } catch { state.me = null; }
  applyAdminGating();
  try {
    const [b, im, rt] = await Promise.all([
      fetch('data/current-baseline.json').then((r) => { if (!r.ok) throw new Error('baseline ' + r.status); return r.json(); }),
      fetch('data/impact-map.json').then((r) => r.json()),
      fetch('data/retrieval-manifest.json').then((r) => r.json()),
    ]);
    DATA.baseline = b; DATA.impact = im; DATA.retrieval = rt;
    // opcionais (toleram ausência): diff de baseline, registry de artefatos, embeddings.
    const opt = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    [DATA.history, DATA.registry, DATA.embeddings, DATA.implStatus, DATA.coverage, DATA.products, DATA.blueprints, DATA.capabilities, DATA.appsIndex] = await Promise.all([opt('data/history.json'), opt('data/registry.json'), opt('data/embeddings.json'), opt('data/implementation-status.json'), opt('data/coverage-report.json'), opt('data/products.json'), opt('data/blueprints.json'), opt('data/capabilities.json'), opt('data/apps-index.json')]);
    // (D1, Forja 4.1) snapshot IMUTÁVEL do baked ANTES de qualquer estado vivo: o merge do Studio
    // preenche campos/implStatus a partir daqui (o replace antigo destruía a referência no 1º apply).
    DATA.baked = { products: DATA.products, implStatus: DATA.implStatus };
  } catch (err) {
    setStatus('Falha ao carregar a base de requisitos: ' + err.message, true);
    return;
  }
  setStatus('');
  const c = DATA.baseline.counts;
  document.getElementById('foot-meta').textContent = `${c.total} requisitos · metamodelo ${DATA.baseline.metamodel_version || '?'} · hash ${String(DATA.baseline.baseline_hash).slice(0, 12)}`;
  buildExplorerFilters();
  refreshNavBadges();
  wireCommandPalette();
  if (!applyHashRoute()) switchView('forge'); // deep-link da URL (ex.: vindo do Console) ou padrão: o Studio
  window.addEventListener('hashchange', () => applyHashRoute()); // deep-link em aba já aberta (idempotente)
}
init();




