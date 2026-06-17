// =============================================================================
// build-plan.mjs — gera o PLANO DE BUILD (DAG/waves) de um produto greenfield a
// partir dos requisitos do produto (baseline) + as arestas depends_on (impact-map).
// Saída: specs/products/<name>/build-plan.json (validado depois por build-products).
//
// O plano é uma PROJEÇÃO navegável da ordem de construção; a verdade das deps são
// os links[type=depends_on] nos YAMLs. O scaffold_req (applies_to:product-foundation)
// é a fundação — implementado pela fase C (scaffold-product.ps1, humano), não pela
// esteira; tudo mais depende dele.
//
// Uso:  node build-plan.mjs <product> [--out file]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');

// Pura/testável: ordenação topológica (Kahn) com detecção de ciclo.
// deps: Map<id, Set<id>> (id depende de cada id do set => deps vêm ANTES).
export function topoSort(ids, deps) {
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []])); // dep -> [dependentes]
  for (const id of ids) {
    for (const d of deps.get(id) || []) {
      if (!indeg.has(d)) continue; // dep fora do produto: ignora (ordem intra-produto)
      indeg.set(id, indeg.get(id) + 1);
      adj.get(d).push(id);
    }
  }
  // fila determinística: ordem alfabética entre os elegíveis
  const ready = ids.filter((id) => indeg.get(id) === 0).sort();
  const order = [];
  while (ready.length) {
    const n = ready.shift();
    order.push(n);
    for (const m of (adj.get(n) || []).sort()) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) { ready.push(m); ready.sort(); }
    }
  }
  if (order.length !== ids.length) {
    const cyclic = ids.filter((id) => !order.includes(id));
    return { ok: false, cycle: cyclic, order: [] };
  }
  return { ok: true, order };
}

// Pura/testável: monta o build-plan a partir dos requisitos do produto + arestas.
export function planBuild({ product, blueprint, baselineHash, reqs, edges }) {
  const ids = reqs.map((r) => r.id);
  const idSet = new Set(ids);
  // deps intra-produto: aresta {from, to, type:depends_on} => from depende de to.
  const deps = new Map(ids.map((id) => [id, new Set()]));
  for (const e of edges || []) {
    if (e.type === 'depends_on' && idSet.has(e.from) && idSet.has(e.to)) deps.get(e.from).add(e.to);
  }
  // scaffold = fundação; tudo depende dele (mesmo sem aresta explícita).
  const scaffold = reqs.find((r) => r.scope?.applies_to === 'product-foundation');
  const scaffoldReq = scaffold ? scaffold.id : null;
  if (scaffoldReq) for (const id of ids) if (id !== scaffoldReq) deps.get(id).add(scaffoldReq);

  const sorted = topoSort(ids, deps);
  if (!sorted.ok) return { ok: false, error: `ciclo de dependências entre requisitos: ${sorted.cycle.join(', ')}` };

  // waves = níveis topológicos (mesma "altura" = pode rodar junto). Gate auto por padrão.
  const level = new Map();
  for (const id of sorted.order) {
    let lv = 0;
    for (const d of deps.get(id)) lv = Math.max(lv, (level.get(d) ?? 0) + 1);
    level.set(id, lv);
  }
  const byLevel = new Map();
  for (const id of sorted.order) {
    const lv = level.get(id);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(id);
  }
  const waves = [...byLevel.keys()].sort((a, b) => a - b).map((lv, i) => ({
    id: lv === 0 && scaffoldReq && byLevel.get(lv).includes(scaffoldReq) ? 'w0-foundation' : `w${i}`,
    gate: 'auto',
    work_orders: byLevel.get(lv).sort(),
    ...(i > 0 ? { depends_on: [`w${i - 1}`] } : {}),
  }));

  const plan = {
    product,
    blueprint,
    baseline_hash: baselineHash,
    generated_by: 'forge.build-plan@1',
    status: 'proposed',
    scaffold_req: scaffoldReq,
    modules: [],
    waves,
    order: sorted.order,
  };
  return { ok: true, plan };
}

function stable(obj) { return JSON.stringify(obj, null, 2) + '\n'; }

function main() {
  const args = process.argv.slice(2);
  const product = args.find((a) => !a.startsWith('--'));
  if (!product) { console.error('uso: node build-plan.mjs <product> [--out file]'); process.exit(2); }
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(SPECS_DIR, 'products', product, 'build-plan.json');

  const productJson = path.join(SPECS_DIR, 'products', product, 'product.json');
  if (!fs.existsSync(productJson)) { console.error(`[build-plan] produto não encontrado: ${productJson}`); process.exit(1); }
  const prod = JSON.parse(fs.readFileSync(productJson, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'current-baseline.json'), 'utf8'));
  const impact = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'impact-map.json'), 'utf8'));
  const reqs = baseline.requirements.filter((r) => r.scope?.product_scope === product);
  if (!reqs.length) { console.error(`[build-plan] nenhum requisito com product_scope='${product}' na baseline`); process.exit(1); }

  const res = planBuild({ product, blueprint: prod.blueprint, baselineHash: baseline.baseline_hash, reqs, edges: impact.edges });
  if (!res.ok) { console.error(`[build-plan] ${res.error}`); process.exit(1); }
  fs.writeFileSync(outPath, stable(res.plan));
  console.log(`[build-plan] ${reqs.length} requisitos -> ${path.relative(SPECS_DIR, outPath)} (${res.plan.waves.length} waves; scaffold=${res.plan.scaffold_req || '(nenhum)'})`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-plan.mjs')) main();
