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

const STATUSES = ['not_started', 'in_progress', 'pr_open', 'merged', 'deployed', 'done', 'blocked'];
const KEEP = ['status', 'req_revision', 'pr', 'branch', 'commit', 'run_id', 'deployment', 'deployed_at', 'notes'];

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).items ?? {} : {};

const items = {};
for (const r of [...baseline.requirements].sort((a, b) => a.id.localeCompare(b.id))) {
  const p = prior[r.id] || {};
  const entry = { status: STATUSES.includes(p.status) ? p.status : 'not_started', req_revision: r.version?.item_revision ?? 1 };
  for (const k of KEEP) if (k !== 'status' && k !== 'req_revision' && p[k] != null) entry[k] = p[k];
  // ordena campos de forma estável
  const ordered = {};
  for (const k of KEEP) if (entry[k] !== undefined) ordered[k] = entry[k];
  items[r.id] = ordered;
}

const byStatus = {};
for (const id of Object.keys(items)) byStatus[items[id].status] = (byStatus[items[id].status] || 0) + 1;

const payload = {
  metamodel_version: baseline.metamodel_version ?? null,
  baseline_hash: baseline.baseline_hash,
  counts: { total: Object.keys(items).length, by_status: byStatus },
  items,
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
