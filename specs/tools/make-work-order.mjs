// =============================================================================
// make-work-order.mjs — converte um (ou mais) REQ-ID numa "ordem de trabalho"
// estruturada (work-order.json) para a Claude implementar headless (esteira
// req-implement). Deriva o conteúdo SOMENTE de fontes canônicas: current-baseline
// (requisito completo), impact-map (vizinhança), reprocess_queue, e o escopo do
// produto (paths permitidos + blast-radius). NÃO é texto livre.
//
// Uso: node make-work-order.mjs <REQ-ID> [REQ-ID...] [--out work-order.json]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');

// product_scope -> globs que a Claude PODE tocar headless. Escopos de infra/CI/CD
// ficam RESTRITOS (allowed_paths vazio) -> a skill abre PR-rascunho p/ revisão humana.
export const SCOPE_PATHS = {
  sicat: ['apps/sicat/**'],
  gymops: ['apps/gymops/**'],
  rmambiental: ['apps/rmambiental/**'],
  anarabottini: ['apps/anarabottini/**'],
  'portal-recorder': ['apps/portal-recorder/**'],
  reqhub: ['apps/reqhub/**'],
  cms: ['console/pm-api/**', 'console/site-renderer/**', 'console/frontend/**'],
  console: ['console/**'],
  portal: ['portal/**'],
  ai: ['packages/ai-core/**', 'packages/ai-kit/**', 'apps/ai-control-plane/**'],
  oidc: ['packages/oidc-kit/**'],
  specs: ['specs/**'],
  'portal-contracts': ['apps/portal-recorder/**', 'docs/portal-contracts/**'],
};
export const RESTRICTED_SCOPES = new Set(['keycloak', 'traefik', 'argocd', 'observability', 'platform', 'cicd']);

// Pura e testável: monta a ordem de trabalho de UM requisito.
// `products` (opcional): mapa product_scope -> product.json (de specs/products/*),
// usado p/ resolver o app de um produto GREENFIELD e anexar o blueprint. Mantém
// retrocompat: sem `products`, o comportamento é o legado (fallback apps/<scope>/**).
export function buildWorkOrder(req, edges, baseline, products = {}) {
  const id = req.id;
  const scope = (req.scope && req.scope.product_scope) || 'unknown';
  const restricted = RESTRICTED_SCOPES.has(scope);
  const product = products[scope] || null;
  const appName = (product && product.name) || scope;
  const allowed_paths = restricted ? [] : SCOPE_PATHS[scope] || [`apps/${appName}/**`];
  const blueprint = (req.scope && req.scope.blueprint) || (product && product.blueprint) || null;
  const outgoing = (edges || []).filter((e) => e.from === id);
  const incoming = (edges || []).filter((e) => e.to === id);
  const rq = (baseline.reprocess_queue || []).find((q) => q.id === id);
  return {
    req_id: id,
    revision: (req.version && req.version.item_revision) || 1,
    product_scope: scope,
    blueprint,
    restricted,
    requirement: {
      title: req.title,
      type: req.type,
      statement: req.statement,
      acceptance_criteria: req.acceptance_criteria || [],
      verification_method: req.verification_method || [],
      quality_scenarios: req.quality_scenarios || [],
      priority: req.priority,
      criticality: req.criticality,
      architectural_significance: !!req.architectural_significance,
      file: req.file,
    },
    impact: { outgoing, incoming, allocation: req.allocation || {} },
    reprocess_reasons: (rq && rq.reasons) || [],
    allowed_paths,
    gates_expected: ['Validar requisitos e baseline', 'Reqhub gate', 'ci-apps'],
    pr_template: {
      title: `feat(${scope}): implementa ${id} — ${req.title}`.slice(0, 90),
      trailer: `Closes-Req: ${id}`,
      labels: ['requirement', 'claude-generated'],
      base: 'main',
      head: `req/${id}/r${(req.version && req.version.item_revision) || 1}`,
    },
  };
}

// Carrega os produtos greenfield registrados (specs/products/*/product.json) num
// mapa product_scope -> product.json. Habilita o guard a conhecer um app NOVO.
export function loadProducts(specsDir = SPECS_DIR) {
  const dir = path.join(specsDir, 'products');
  const map = {};
  if (!fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name, 'product.json');
    if (!fs.existsSync(p)) continue;
    try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j && j.name) map[j.name] = j; } catch { /* ignora produto malformado; build-products --check pega */ }
  }
  return map;
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(process.cwd(), 'work-order.json');
  const ids = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
  if (!ids.length) { console.error('uso: node make-work-order.mjs <REQ-ID> [REQ-ID...] [--out file]'); process.exit(2); }

  const baseline = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'current-baseline.json'), 'utf8'));
  const impact = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'impact-map.json'), 'utf8'));
  const byId = new Map(baseline.requirements.map((r) => [r.id, r]));
  const products = loadProducts();

  const orders = [];
  for (const id of ids) {
    const req = byId.get(id);
    if (!req) { console.error(`[work-order] requisito não encontrado na baseline: ${id}`); process.exit(1); }
    const scope = (req.scope && req.scope.product_scope) || 'unknown';
    // Fecha o fallback silencioso: um scope só vira apps/<scope>/** se for conhecido
    // (em SCOPE_PATHS, RESTRITO, ou um produto registrado em specs/products/).
    const known = !!SCOPE_PATHS[scope] || RESTRICTED_SCOPES.has(scope) || !!products[scope];
    if (!known) {
      console.error(`[work-order] product_scope DESCONHECIDO: '${scope}' (não está em SCOPE_PATHS, não é RESTRITO, e não há specs/products/${scope}/product.json). Registre o produto antes de implementar.`);
      process.exit(1);
    }
    orders.push(buildWorkOrder(req, impact.edges, baseline, products));
  }
  fs.writeFileSync(outPath, JSON.stringify({ count: orders.length, orders }, null, 2) + '\n');
  console.log(`[work-order] ${orders.length} ordem(ns) -> ${outPath}`);
  for (const o of orders) console.log(`  ${o.req_id} [${o.product_scope}${o.restricted ? ', RESTRITO' : ''}] allowed=${o.allowed_paths.join(',') || '(nenhum)'}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('make-work-order.mjs')) main();
