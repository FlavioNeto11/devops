// Reqhub — funções PURAS (sem DOM/fetch), testáveis com node:test.
// A baseline (specs/baseline/*.json) é a entrada; estas funções derivam visões.

export function norm(s) {
  return (s == null ? '' : String(s)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function matchesQuery(req, q) {
  if (!q) return true;
  const n = norm(q);
  return (
    norm(req.id).includes(n) ||
    norm(req.title).includes(n) ||
    norm(req.statement).includes(n) ||
    (req.risk_tags || []).some((t) => norm(t).includes(n)) ||
    norm(req.scope && req.scope.capability).includes(n)
  );
}

export function filterReqs(reqs, f = {}) {
  return reqs.filter((r) => {
    if (f.product && (r.scope && r.scope.product_scope) !== f.product) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.asr === 'yes' && !r.architectural_significance) return false;
    if (f.asr === 'no' && r.architectural_significance) return false;
    if (f.band && r.impact_band !== f.band) return false;
    if (f.q && !matchesQuery(r, f.q)) return false;
    return true;
  });
}

export function groupByProduct(reqs) {
  const map = new Map();
  for (const r of reqs) {
    const p = (r.scope && r.scope.product_scope) || '—';
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([product, items]) => ({ product, items: items.slice().sort((a, b) => a.id.localeCompare(b.id)) }));
}

export function neighborhood(edges, id) {
  return {
    outgoing: edges.filter((e) => e.from === id),
    incoming: edges.filter((e) => e.to === id),
  };
}

export function coverageRow(r) {
  const a = r.allocation || {};
  return {
    acceptance: (r.acceptance_criteria || []).length > 0,
    method: (r.verification_method || []).length > 0,
    evidence: (r.evidence_links || []).length > 0,
    adr: (a.adr_refs || []).length > 0,
    service: (a.service_refs || []).length > 0,
    infra: (a.infra_refs || []).length > 0,
    slo: (a.slo_refs || []).length > 0,
  };
}

export function coverageScore(r) {
  const row = coverageRow(r);
  const keys = Object.keys(row);
  return keys.filter((k) => row[k]).length / keys.length;
}

export function uniqueValues(reqs, pick) {
  return [...new Set(reqs.map(pick).filter((v) => v != null && v !== ''))].sort();
}

// Layout do grafo: nós em COLUNAS por produto, empilhados verticalmente. Puro.
// filterId != null => recorta para a vizinhança (o nó + adjacentes).
export function graphLayout(nodes, edges, filterId = null) {
  let ns = nodes;
  let es = edges;
  if (filterId) {
    const keep = new Set([filterId]);
    for (const e of edges) {
      if (e.from === filterId) keep.add(e.to);
      if (e.to === filterId) keep.add(e.from);
    }
    ns = nodes.filter((n) => keep.has(n.id));
    es = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  const cols = {};
  const order = [];
  for (const n of ns) {
    const c = n.product || 'externo';
    if (!cols[c]) {
      cols[c] = [];
      order.push(c);
    }
    cols[c].push(n);
  }
  order.sort();
  const COLW = 250;
  const ROWH = 40;
  const PADX = 24;
  const PADY = 44;
  const pos = {};
  order.forEach((c, ci) => {
    cols[c].slice().sort((a, b) => a.id.localeCompare(b.id)).forEach((n, ri) => {
      pos[n.id] = { x: PADX + ci * COLW, y: PADY + ri * ROWH, col: c };
    });
  });
  const maxRows = order.reduce((m, c) => Math.max(m, cols[c].length), 1);
  return {
    nodes: ns.map((n) => ({ ...n, ...pos[n.id] })),
    edges: es,
    columns: order,
    colX: order.reduce((o, c, ci) => ((o[c] = PADX + ci * COLW), o), {}),
    width: PADX * 2 + Math.max(1, order.length) * COLW,
    height: PADY + maxRows * ROWH + PADY,
  };
}

export function bandRank(band) {
  return band === 'high' ? 3 : band === 'medium' ? 2 : 1;
}
