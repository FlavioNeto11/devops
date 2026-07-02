// =============================================================================
// impl-status.mjs — gera/reconcilia specs/baseline/implementation-status.json:
// o estado de DESENVOLVIMENTO por requisito (REQ → PR → deploy), consumido pela
// aba "Desenvolvimento" do Reqhub e atualizado pela esteira (req-implement).
//
// Reconcilia (idempotente, determinístico): preserva o status conhecido de cada
// requisito, cria novos como `not_started`, remove entradas de requisitos que não
// existem mais na baseline. `--check` falha se a baseline tem requisito sem entrada
// (ou entrada órfã) — força regenerar junto com a baseline (no /sync-spec).
//
// Uso:  node impl-status.mjs           # escreve/atualiza
//       node impl-status.mjs --check   # NÃO escreve; exit 1 se desatualizado
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const BASELINE = path.join(SPECS_DIR, 'baseline', 'current-baseline.json');
const OUT = path.join(SPECS_DIR, 'baseline', 'implementation-status.json');
const CHECK = process.argv.includes('--check');
// --set <REQ-ID> key=value ...  -> mescla campos no item (usado pela esteira p/
// marcar status=pr_open/merged/deployed + pr/branch/commit/run_id/deployment).
// `provenance` (Forja 4.0 B4, OPCIONAL/warn-only): string livre com a origem da geração,
// ex. "prompt=forge-propose-requirements@3 model=claude-x" — setável via --set; nenhum
// gate falha pela ausência dela.
const SET = process.argv.includes('--set');
let setReq = null;
const setOverrides = {};
if (SET) {
  const a = process.argv.slice(process.argv.indexOf('--set') + 1).filter((x) => !x.startsWith('--'));
  setReq = a[0];
  for (const kv of a.slice(1)) { const i = kv.indexOf('='); if (i > 0) setOverrides[kv.slice(0, i)] = kv.slice(i + 1); }
}

const STATUSES = ['not_started', 'in_progress', 'pr_open', 'merged', 'deployed', 'done', 'blocked'];
const KEEP = ['status', 'req_revision', 'pr', 'branch', 'commit', 'run_id', 'deployment', 'deployed_at', 'provenance', 'notes'];
const isRef = (id) => /^REF-/.test(id || '');

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const priorAll = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const prior = priorAll.items ?? {};
const priorRef = priorAll.refinement_items ?? {};
// --set roteia REF-* para refinement_items; REQ-* para items.
if (SET && setReq) {
  const bag = isRef(setReq) ? priorRef : prior;
  bag[setReq] = { ...(bag[setReq] || {}), ...setOverrides };
}

// Reconcilia uma coleção (requisitos OU refinamentos) preservando status conhecido.
function reconcile(list) {
  const out = {};
  for (const r of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
    const bag = isRef(r.id) ? priorRef : prior;
    const p = bag[r.id] || {};
    const entry = { status: STATUSES.includes(p.status) ? p.status : 'not_started', req_revision: r.version?.item_revision ?? 1 };
    for (const k of KEEP) if (k !== 'status' && k !== 'req_revision' && p[k] != null) entry[k] = p[k];
    const ordered = {};
    for (const k of KEEP) if (entry[k] !== undefined) ordered[k] = entry[k];
    out[r.id] = ordered;
  }
  return out;
}

const items = reconcile(baseline.requirements ?? []);
const refinementItems = reconcile(baseline.refinements ?? []);

const byStatus = {};
for (const id of Object.keys(items)) byStatus[items[id].status] = (byStatus[items[id].status] || 0) + 1;
const refByStatus = {};
for (const id of Object.keys(refinementItems)) refByStatus[refinementItems[id].status] = (refByStatus[refinementItems[id].status] || 0) + 1;

const payload = {
  metamodel_version: baseline.metamodel_version ?? null,
  baseline_hash: baseline.baseline_hash,
  counts: { total: Object.keys(items).length, by_status: byStatus, refinements: { total: Object.keys(refinementItems).length, by_status: refByStatus } },
  items,
  refinement_items: refinementItems,
};
const content = JSON.stringify(payload, null, 2) + '\n';

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (cur !== content) {
    console.error('\x1b[31m[impl-status] implementation-status.json desatualizado — rode `node impl-status.mjs` e commite.\x1b[0m');
    process.exit(1);
  }
  console.log(`\x1b[32m[impl-status] OK — ${Object.keys(items).length} requisitos; status em dia.\x1b[0m`);
} else {
  fs.writeFileSync(OUT, content);
  console.log(`[impl-status] ${Object.keys(items).length} requisitos -> specs/baseline/implementation-status.json (${JSON.stringify(byStatus)})`);
}
