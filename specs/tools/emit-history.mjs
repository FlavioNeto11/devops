// =============================================================================
// emit-history.mjs — gera specs/baseline/history.json: o DIFF real da baseline
// atual vs. a versão anterior (no git) de current-baseline.json. Consumido pela
// tela "Versões & mudanças" do Reqhub (diff de baseline de verdade na UI).
//
// Determinístico dado o estado do git: compara o working tree contra o commit
// imediatamente anterior que tocou specs/baseline/current-baseline.json.
// NÃO entra no drift-check (build-baseline só gere os 3 artefatos canônicos).
//
// Uso: node emit-history.mjs   (rode após regenerar a baseline; ex.: no /sync-spec)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO = path.resolve(SPECS_DIR, '..');
const REL = 'specs/baseline/current-baseline.json';
const OUT = path.join(SPECS_DIR, 'baseline', 'history.json');

const FIELDS = ['statement', 'status', 'priority', 'criticality', 'architectural_significance', 'acceptance_criteria', 'verification_method', 'evidence_links', 'quality_scenarios', 'links', 'suggested_links', 'allocation', 'scope'];

function git(args) {
  try { return execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; }
}
function indexById(baseline) {
  return new Map((baseline?.requirements ?? []).map((r) => [r.id, r]));
}
function readJson(str) { try { return JSON.parse(str); } catch { return null; } }

const current = readJson(fs.readFileSync(path.join(SPECS_DIR, 'baseline', 'current-baseline.json'), 'utf8'));

// commits que tocaram o arquivo (mais recente primeiro). A "versão anterior" é o
// último COMMIT cujo conteúdo difere do working tree: se há mudança pendente (ainda
// não commitada), prev = commits[0]; se a árvore está limpa, prev = commits[1].
const commits = git(`log -n 8 --format=%H -- ${REL}`).split('\n').filter(Boolean);
const head0 = commits[0] ? readJson(git(`show ${commits[0]}:${REL}`)) : null;
const pending = head0 && head0.baseline_hash !== current.baseline_hash;
const prevRef = (pending ? commits[0] : commits[1]) || '';
let prev = null;
if (prevRef) prev = readJson(git(`show ${prevRef}:${REL}`));

const baseMap = indexById(prev);
const headMap = indexById(current);

const lite = (r) => ({ id: r.id, title: r.title, product: r.scope?.product_scope, type: r.type, impact_band: r.impact_band });
const added = [];
const removed = [];
const changed = [];
for (const [id, r] of headMap) if (!baseMap.has(id)) added.push(lite(r));
for (const [id, r] of baseMap) if (!headMap.has(id)) removed.push(lite(r));
for (const [id, h] of headMap) {
  const b = baseMap.get(id);
  if (!b) continue;
  const fields = FIELDS.filter((f) => JSON.stringify(b[f] ?? null) !== JSON.stringify(h[f] ?? null));
  const verChanged = JSON.stringify(b.version ?? null) !== JSON.stringify(h.version ?? null);
  if (fields.length || verChanged) {
    changed.push({ ...lite(h), semantic_change: h.version?.semantic_change ?? 'none', change_reason: h.version?.change_reason ?? '', fields, impact_delta: (h.impact_score ?? 0) - (b.impact_score ?? 0) });
  }
}

const history = {
  metamodel_version: current.metamodel_version ?? null,
  has_previous: !!prev,
  from: prev ? { commit: prevRef.slice(0, 12), baseline_hash: prev.baseline_hash } : null,
  to: { commit: pending ? 'working-tree' : (commits[0] || '').slice(0, 12), baseline_hash: current.baseline_hash },
  counts: { added: added.length, removed: removed.length, changed: changed.length },
  added: added.sort((a, b) => a.id.localeCompare(b.id)),
  removed: removed.sort((a, b) => a.id.localeCompare(b.id)),
  changed: changed.sort((a, b) => a.id.localeCompare(b.id)),
};
fs.writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n');
console.log(`[history] specs/baseline/history.json: +${added.length} ~${changed.length} -${removed.length} (vs ${prevRef ? prevRef.slice(0, 12) : 'nenhum anterior'})`);
