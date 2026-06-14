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
export function buildWorkOrder(req, edges, baseline) {
  const id = req.id;
  const scope = (req.scope && req.scope.product_scope) || 'unknown';
  const restricted = RESTRICTED_SCOPES.has(scope);
  const allowed_paths = restricted ? [] : SCOPE_PATHS[scope] || [`apps/${scope}/**`];
  const outgoing = (edges || []).filter((e) => e.from === id);
  const incoming = (edges || []).filter((e) => e.to === id);
  const rq = (baseline.reprocess_queue || []).find((q) => q.id === id);
  return {
    req_id: id,
    revision: (req.version && req.version.item_revision) || 1,
    product_scope: scope,
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

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(process.cwd(), 'work-order.json');
  const ids = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
  if (!ids.length) { console.error('uso: node make-work-order.mjs <REQ-ID> [REQ-ID...] [--out file]'); process.exit(2); }

  const baseline = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'current-baseline.json'), 'utf8'));
  const impact = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'impact-map.json'), 'utf8'));
  const byId = new Map(baseline.requirements.map((r) => [r.id, r]));

  const orders = [];
  for (const id of ids) {
    const req = byId.get(id);
    if (!req) { console.error(`[work-order] requisito não encontrado na baseline: ${id}`); process.exit(1); }
    orders.push(buildWorkOrder(req, impact.edges, baseline));
  }
  fs.writeFileSync(outPath, JSON.stringify({ count: orders.length, orders }, null, 2) + '\n');
  console.log(`[work-order] ${orders.length} ordem(ns) -> ${outPath}`);
  for (const o of orders) console.log(`  ${o.req_id} [${o.product_scope}${o.restricted ? ', RESTRITO' : ''}] allowed=${o.allowed_paths.join(',') || '(nenhum)'}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('make-work-order.mjs')) main();
