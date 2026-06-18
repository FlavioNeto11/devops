// =============================================================================
// coverage-report.mjs — métrica "da cobertura": gera specs/baseline/coverage-report.json
// a partir da baseline. Por escopo e no total, conta requisitos SEM cada dimensão de
// rastreabilidade — links, alocação, origem (source_paths), evidência e método de
// verificação — para o reqhub mostrar onde a base ainda está "rasa".
//
// Determinístico (lê a baseline gerada; ordena por escopo; sem timestamp) — o CI usa
// `--check` p/ exigir que o relatório commitado esteja em dia com a baseline.
//
// Uso:  node coverage-report.mjs           # escreve/atualiza
//       node coverage-report.mjs --check   # NÃO escreve; exit 1 se desatualizado
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const BASELINE = path.join(SPECS_DIR, 'baseline', 'current-baseline.json');
const OUT = path.join(SPECS_DIR, 'baseline', 'coverage-report.json');
const CHECK = process.argv.includes('--check');

const has = (arr) => Array.isArray(arr) && arr.length > 0;
const hasAllocation = (a) =>
  !!a && ['adr_refs', 'service_refs', 'infra_refs', 'slo_refs', 'architecture_refs'].some((k) => has(a[k]));

// Set de requisitos que têm ao menos um refinamento ancorado (preenchido em build()).
let refAnchoredReqIds = new Set();

// Dimensões medidas (chave -> predicado "ESTÁ coberto").
const DIMS = {
  links: (r) => has(r.links),
  allocation: (r) => hasAllocation(r.allocation),
  source_paths: (r) => has(r.source?.source_paths),
  evidence: (r) => has(r.evidence_links),
  verification_method: (r) => has(r.verification_method),
  refinement: (r) => refAnchoredReqIds.has(r.id),
};

function emptyCounts() {
  const c = { total: 0 };
  for (const d of Object.keys(DIMS)) c[`without_${d}`] = 0;
  return c;
}

function build() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const reqs = [...(baseline.requirements ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  // requisitos com ao menos um refinamento (REF-*) ancorado → dimensão "refinement"
  refAnchoredReqIds = new Set();
  for (const rf of baseline.refinements ?? []) for (const a of rf.anchors ?? []) refAnchoredReqIds.add(a.requirement_id);

  const totals = emptyCounts();
  const byScopeMap = {};
  for (const r of reqs) {
    const scope = r.scope?.product_scope ?? 'unknown';
    if (!byScopeMap[scope]) byScopeMap[scope] = emptyCounts();
    const bucket = byScopeMap[scope];
    bucket.total++; totals.total++;
    for (const [d, covered] of Object.entries(DIMS)) {
      if (!covered(r)) { bucket[`without_${d}`]++; totals[`without_${d}`]++; }
    }
  }

  // ordena escopos e arredonda percentuais de cobertura (determinístico)
  const by_scope = {};
  for (const scope of Object.keys(byScopeMap).sort()) {
    const c = byScopeMap[scope];
    const pct = {};
    for (const d of Object.keys(DIMS)) {
      pct[d] = c.total ? Math.round(((c.total - c[`without_${d}`]) / c.total) * 1000) / 10 : 0;
    }
    by_scope[scope] = { ...c, coverage_pct: pct };
  }
  const coverage_pct = {};
  for (const d of Object.keys(DIMS)) {
    coverage_pct[d] = totals.total ? Math.round(((totals.total - totals[`without_${d}`]) / totals.total) * 1000) / 10 : 0;
  }

  return {
    metamodel_version: baseline.metamodel_version ?? null,
    baseline_hash: baseline.baseline_hash,
    dimensions: Object.keys(DIMS),
    totals: { ...totals, scopes: Object.keys(by_scope).length, coverage_pct },
    by_scope,
  };
}

const content = JSON.stringify(build(), null, 2) + '\n';

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (cur !== content) {
    console.error('\x1b[31m[coverage] coverage-report.json desatualizado — rode `node coverage-report.mjs` e commite.\x1b[0m');
    process.exit(1);
  }
  console.log('\x1b[32m[coverage] OK — coverage-report.json em dia.\x1b[0m');
} else {
  fs.writeFileSync(OUT, content);
  const t = JSON.parse(content).totals;
  console.log(`[coverage] ${t.total} requisitos em ${t.scopes} escopos -> coverage-report.json (origem ${t.coverage_pct.source_paths}% · links ${t.coverage_pct.links}% · alocação ${t.coverage_pct.allocation}%)`);
}
