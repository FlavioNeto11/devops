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

// Resumo da matriz de cobertura: por dimensão, quantos requisitos cobrem (hit)
// e quantos faltam (miss), com o percentual. Puro — entrada são os requisitos.
export function coverageSummary(reqs) {
  const dims = [
    ['acceptance', 'Aceite'], ['method', 'Método'], ['evidence', 'Evidência'],
    ['adr', 'ADR'], ['service', 'Serviço'], ['infra', 'Infra'], ['slo', 'SLO'],
  ];
  const total = reqs.length;
  return dims.map(([key, label]) => {
    const hit = reqs.reduce((acc, r) => acc + (coverageRow(r)[key] ? 1 : 0), 0);
    return { key, label, hit, miss: total - hit, total, pct: total ? Math.round((hit / total) * 100) : 0 };
  });
}

// Lista de "recentes": prepõe `id`, remove duplicata anterior e limita a `max`.
// Puro: não toca localStorage; ids inválidos (vazios) são ignorados.
export function recentList(prev, id, max = 8) {
  const base = Array.isArray(prev) ? prev.filter((x) => typeof x === 'string' && x) : [];
  if (!id) return base.slice(0, max);
  return [id, ...base.filter((x) => x !== id)].slice(0, max);
}

/* ---------- similaridade semântica (embeddings locais) ---------- */
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vetores já normalizados => produto interno = cosseno
}
// top-N requisitos mais similares a `id` (exclui o próprio), por cosseno.
export function topSimilar(vectors, id, n = 5) {
  const base = vectors?.[id];
  if (!base) return [];
  return Object.keys(vectors)
    .filter((k) => k !== id)
    .map((k) => ({ id: k, score: Math.round(cosineSim(base, vectors[k]) * 1000) / 1000 }))
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
}

/* ---------- emissor YAML mínimo (edição assistida) ---------- */
export function scalarYaml(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^[\s>|@`%#&*!?{}\[\],'"-]/.test(s) || /[:#]\s|\s$|[\n\t]|: /.test(s) || /^(true|false|null|~)$/i.test(s) || /^[\d.]+$/.test(s)) {
    return JSON.stringify(s); // flow scalar com aspas (YAML aceita JSON string)
  }
  return s;
}
function renderKV(prefix, k, v, indent) {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v) && v.length === 0) return `${prefix}${k}: []`;
    if (!Array.isArray(v) && Object.keys(v).length === 0) return `${prefix}${k}: {}`;
    return `${prefix}${k}:\n${toYaml(v, indent + 1)}`;
  }
  return `${prefix}${k}: ${scalarYaml(v)}`;
}
export function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null || typeof value !== 'object') return scalarYaml(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item).filter(([, v]) => v !== undefined);
        return entries.map(([k, v], i) => renderKV(i === 0 ? `${pad}- ` : `${pad}  `, k, v, indent + 1)).join('\n');
      }
      return `${pad}- ${scalarYaml(item)}`;
    }).join('\n');
  }
  return Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => renderKV(pad, k, v, indent)).join('\n');
}

/* ---------- validação básica do rascunho de requisito ---------- */
export function validateDraft(d) {
  const errs = [];
  if (!/^REQ-[A-Z0-9]+-(NFR-)?[0-9]{3,4}$/.test(d.id || '')) errs.push('id deve casar REQ-<PRODUTO>-NNNN (ou REQ-<PRODUTO>-NFR-NNN)');
  if (!d.title || d.title.length < 3) errs.push('título obrigatório (>= 3 chars)');
  if (!d.statement || d.statement.length < 10) errs.push('enunciado obrigatório (>= 10 chars)');
  if (!d.scope || !d.scope.product_scope) errs.push('escopo.product_scope obrigatório');
  if (!(d.source && Array.isArray(d.source.source_paths) && d.source.source_paths.length)) errs.push('origem obrigatória: informe ao menos um caminho-fonte (source.source_paths)');
  if (!['functional', 'non-functional', 'business-rule', 'constraint'].includes(d.type)) errs.push('tipo inválido');
  if (d.type === 'non-functional' && !(d.quality_scenarios && d.quality_scenarios.length)) errs.push('NFR exige ao menos um quality_scenario');
  return errs;
}
