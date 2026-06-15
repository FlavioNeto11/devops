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

/* ============================================================================
   MAPA DE IMPACTO — grafo orgânico (force-directed) + paleta automática.
   Tudo PURO e testável. As posições derivam de um HASH ESTÁVEL do id (sem
   aleatoriedade de runtime, sem relógio): mesmas entradas => mesmas posições,
   logo o mapa nunca "reembaralha" entre renders.
   ============================================================================ */

// Hash estável FNV-1a (32 bits) — semente determinística de posição/desempate.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  const str = s == null ? '' : String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function hash01(s) { return hashStr(s) / 4294967296; }

// grau (nº de conexões) por id, a partir das arestas.
export function degreeMap(edges) {
  const d = {};
  for (const e of edges || []) { d[e.from] = (d[e.from] || 0) + 1; d[e.to] = (d[e.to] || 0) + 1; }
  return d;
}

/* ---------- cor por produto (paleta automática estável) + contraste WCAG ---------- */
// HSL (h:0..360, s/l:0..1) -> hex. Puro.
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
// luminância relativa WCAG de um hex (#rrggbb).
export function relLuminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const ch = [m[1], m[2], m[3]].map((p) => {
    const v = parseInt(p, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
// razão de contraste WCAG entre dois hex (>= 1).
export function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// melhor cor de texto (claro/escuro) sobre um fundo — SEMPRE >= 4.5:1, pois o
// máximo de contraste a preto/branco é >= 4.58:1 para qualquer cor de fundo.
export function textColorFor(bgHex) {
  const light = '#ffffff', dark = '#000000';
  return contrastRatio(bgHex, light) >= contrastRatio(bgHex, dark) ? light : dark;
}
// paleta: cada produto (ordenado) recebe um matiz por ÂNGULO ÁUREO -> cores
// distinguíveis e ESTÁVEIS (independem da seleção). Texto por contraste.
export function productPalette(products) {
  const list = [...new Set((products || []).filter((p) => p != null && p !== ''))].sort();
  const GOLDEN = 137.508;
  const pal = {};
  list.forEach((p, i) => {
    const hue = Math.round((i * GOLDEN) % 360);
    const fill = hslToHex(hue, 0.58, 0.55);
    pal[p] = { product: p, hue, fill, text: textColorFor(fill) };
  });
  return pal;
}
// cor de um nó: produto -> paleta; alvo de alocação (sem produto) -> grafite neutro.
export function nodeColor(node, palette) {
  const p = node && node.product;
  if (p && palette && palette[p]) return palette[p];
  return { product: null, hue: null, fill: '#3a4654', text: '#ffffff', target: true };
}

/* ---------- vizinhança para realce (clique) ---------- */
// realce de um nó: vizinhos diretos (Set) + arestas que o conectam.
export function highlightSet(edges, id) {
  const neighbors = new Set();
  const conn = [];
  for (const e of edges || []) {
    if (e.from === id) { neighbors.add(e.to); conn.push(e); }
    else if (e.to === id) { neighbors.add(e.from); conn.push(e); }
  }
  return { focus: id, neighbors, edges: conn };
}

/* ---------- visibilidade do mapa (produtos + isolados + revelação cross-product) ----------
   Decide quais nós/arestas aparecem. PURO. Regras:
   - products: Set de produtos selecionados (vazio/null => todos);
   - includeIsolated: mostra nós de grau 0 (após o filtro de tipo de aresta);
   - edgeTypes: Set de tipos de aresta permitidos (vazio/null => todos);
   - selectedId: REVELAÇÃO — o nó selecionado e seus vizinhos diretos SEMPRE
     aparecem, mesmo de produto não selecionado (mostra a conexão);
   - alvos de alocação (sem produto) aparecem quando tocam um nó visível. */
export function visibleGraph(nodes, edges, opts = {}) {
  const prodSel = opts.products && opts.products.size ? opts.products : null;
  const types = opts.edgeTypes && opts.edgeTypes.size ? opts.edgeTypes : null;
  const includeIsolated = !!opts.includeIsolated;
  const selectedId = opts.selectedId || null;
  const es = (edges || []).filter((e) => !types || types.has(e.type));
  const deg = degreeMap(es);
  const inProduct = (n) => !prodSel || (n.product && prodSel.has(n.product));
  // BASE por produto + isolamento (independe da seleção): primeiro os REQs…
  const base = new Set();
  for (const n of nodes) {
    if (!n.product) continue;           // alvos: 2ª passada
    if (!inProduct(n)) continue;
    if (!includeIsolated && !deg[n.id]) continue;
    base.add(n.id);
  }
  // …depois os alvos de alocação (sem produto), se tocam um REQ da base.
  for (const n of nodes) {
    if (n.product || base.has(n.id)) continue;
    if (es.some((e) => (e.from === n.id && base.has(e.to)) || (e.to === n.id && base.has(e.from)))) base.add(n.id);
  }
  // REVELAÇÃO cross-product: vizinhos diretos do selecionado que NÃO estão na base
  // (de produto não selecionado) — aparecem só p/ mostrar a conexão.
  const revealed = new Set();
  if (selectedId) {
    for (const e of es) {
      if (e.from === selectedId && !base.has(e.to)) revealed.add(e.to);
      if (e.to === selectedId && !base.has(e.from)) revealed.add(e.from);
    }
  }
  const visible = new Set(base);
  if (selectedId) visible.add(selectedId);   // o selecionado é sempre visível
  for (const id of revealed) visible.add(id);
  const vedges = es.filter((e) => visible.has(e.from) && visible.has(e.to));
  return { nodeIds: visible, revealed, edges: vedges, degree: deg };
}

/* ---------- rótulo curto p/ a miniatura do nó ---------- */
export function truncateLabel(s, max = 26) {
  const t = String(s == null ? '' : s).trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const soft = cut.replace(/\s+\S*$/, '');
  return (soft.length >= max * 0.6 ? soft : cut).trimEnd() + '…';
}

/* ---------- layout force-directed determinístico (Fruchterman-Reingold + clustering) ----------
   Posiciona `nodes` num quadro W×H. PURO/determinístico (init por hash do id, nº
   fixo de iterações). Forças: repulsão entre todos os pares (O(n^2)); mola nas
   arestas; gravidade ao centro; clustering ao centroide do próprio grupo (produto,
   ou 'infra' p/ alvos) => forma "regiões" no mapa. Retorna nós {…,x,y,deg}
   normalizados ao quadro com padding. */
export function forceLayout(nodes, edges, opts = {}) {
  const W = opts.width || 1000;
  const H = opts.height || 680;
  const pad = opts.pad || 64;
  const n = (nodes || []).length;
  if (!n) return { nodes: [], edges: [], width: W, height: H };
  const iterations = opts.iterations || (n > 200 ? 220 : 360);
  const kRep = opts.repulsion || 7400;
  const kAttr = opts.attraction || 0.04;
  const rest = opts.restLength || 110;
  const kCluster = opts.cluster != null ? opts.cluster : 0.011;
  const kGravity = opts.gravity != null ? opts.gravity : 0.011;
  const cx = W / 2, cy = H / 2;
  const groupOf = (nd) => nd.product || 'infra';
  const pos = new Map();
  for (const nd of nodes) {
    pos.set(nd.id, {
      x: cx + (hash01(nd.id + ':x') - 0.5) * W * 0.8,
      y: cy + (hash01(nd.id + ':y') - 0.5) * H * 0.8,
    });
  }
  const E = (edges || []).filter((e) => pos.has(e.from) && pos.has(e.to));
  let temp = Math.max(W, H) / 8;
  const cool = temp / (iterations + 1);
  const disp = new Map(nodes.map((nd) => [nd.id, { x: 0, y: 0 }]));
  for (let it = 0; it < iterations; it++) {
    for (const nd of nodes) { const d = disp.get(nd.id); d.x = 0; d.y = 0; }
    for (let i = 0; i < n; i++) {
      const a = pos.get(nodes[i].id);
      for (let j = i + 1; j < n; j++) {
        const b = pos.get(nodes[j].id);
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { // desempate determinístico por hash do par
          dx = (hashStr(nodes[i].id + '|' + nodes[j].id) % 7) - 3 || 1;
          dy = (hashStr(nodes[j].id + '|' + nodes[i].id) % 7) - 3 || 1;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = kRep / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        const da = disp.get(nodes[i].id), db = disp.get(nodes[j].id);
        da.x += fx; da.y += fy; db.x -= fx; db.y -= fy;
      }
    }
    for (const e of E) {
      const a = pos.get(e.from), b = pos.get(e.to);
      let dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = kAttr * (d - rest);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      const da = disp.get(e.from), db = disp.get(e.to);
      da.x -= fx; da.y -= fy; db.x += fx; db.y += fy;
    }
    const cent = new Map();
    for (const nd of nodes) {
      const g = groupOf(nd); const p = pos.get(nd.id);
      const c = cent.get(g) || { x: 0, y: 0, n: 0 };
      c.x += p.x; c.y += p.y; c.n++; cent.set(g, c);
    }
    for (const [, c] of cent) { c.x /= c.n; c.y /= c.n; }
    for (const nd of nodes) {
      const p = pos.get(nd.id), d = disp.get(nd.id);
      const c = cent.get(groupOf(nd));
      if (c) { d.x += (c.x - p.x) * kCluster; d.y += (c.y - p.y) * kCluster; }
      d.x += (cx - p.x) * kGravity; d.y += (cy - p.y) * kGravity;
    }
    for (const nd of nodes) {
      const p = pos.get(nd.id), d = disp.get(nd.id);
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
    }
    temp -= cool;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) { const p = pos.get(nd.id); if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  const s = Math.min((W - 2 * pad) / Math.max(1e-6, maxX - minX), (H - 2 * pad) / Math.max(1e-6, maxY - minY));
  const offX = pad + ((W - 2 * pad) - (maxX - minX) * s) / 2;
  const offY = pad + ((H - 2 * pad) - (maxY - minY) * s) / 2;
  const deg = degreeMap(edges);
  const out = nodes.map((nd) => {
    const p = pos.get(nd.id);
    return { ...nd, x: offX + (p.x - minX) * s, y: offY + (p.y - minY) * s, deg: deg[nd.id] || 0 };
  });
  // Relaxação de COLISÃO (determinística, anisotrópica para a forma dos chips):
  // garante um respiro mínimo entre nós — o mapa "abre" em vez de ficar amontoado.
  const mdx = opts.minDistX || 138, mdy = opts.minDistY || 58;
  const loX = pad, hiX = W - pad, loY = pad, hiY = H - pad;
  for (let p = 0; p < (opts.collidePasses || 16); p++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[i].x - out[j].x, dy = out[i].y - out[j].y;
        let nd = Math.sqrt((dx / mdx) * (dx / mdx) + (dy / mdy) * (dy / mdy));
        if (nd === 0) { dx = ((hashStr(out[i].id + '~' + out[j].id) % 7) - 3) || 1; dy = ((hashStr(out[j].id + '~' + out[i].id) % 7) - 3) || 1; nd = Math.sqrt((dx / mdx) * (dx / mdx) + (dy / mdy) * (dy / mdy)); }
        if (nd < 1) {
          const f = (1 / nd - 1) / 2;
          out[i].x += dx * f; out[i].y += dy * f;
          out[j].x -= dx * f; out[j].y -= dy * f;
        }
      }
    }
    for (const o of out) { o.x = Math.max(loX, Math.min(hiX, o.x)); o.y = Math.max(loY, Math.min(hiY, o.y)); }
  }
  return { nodes: out, edges: E, width: W, height: H };
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
