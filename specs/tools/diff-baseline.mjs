// =============================================================================
// diff-baseline.mjs — relatório de mudanças entre duas baselines (change-report).
// -----------------------------------------------------------------------------
// Compara dois current-baseline.json (base vs. alvo) por `id` e emite Markdown:
// adicionados / removidos / alterados, com semantic_change e delta de impacto.
// Usado pelo CI specs-diff (compara a baseline COMMITADA na base do PR vs. a do HEAD)
// e pela skill /baseline-diff.
//
// Uso: node diff-baseline.mjs <base.json> <head.json>
//   base.json ausente/vazio => tudo é "adicionado".
// =============================================================================
import fs from 'node:fs';

function load(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8').trim();
    if (!raw) return new Map();
    const j = JSON.parse(raw);
    return new Map((j.requirements ?? []).map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const positionals = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [basePath, headPath] = positionals;
const ENFORCE = flags.includes('--enforce'); // falha (exit 1) se mudança semântica sem versionar
const base = load(basePath);
const head = load(headPath);

const added = [];
const removed = [];
const changed = [];

for (const [id, r] of head) {
  if (!base.has(id)) added.push(r);
}
for (const [id, r] of base) {
  if (!head.has(id)) removed.push(r);
}
const FIELDS = ['statement', 'status', 'priority', 'criticality', 'architectural_significance', 'acceptance_criteria', 'verification_method', 'quality_scenarios', 'links', 'scope'];
for (const [id, h] of head) {
  const b = base.get(id);
  if (!b) continue;
  const diffFields = FIELDS.filter((f) => JSON.stringify(b[f] ?? null) !== JSON.stringify(h[f] ?? null));
  const verChanged = JSON.stringify(b.version ?? null) !== JSON.stringify(h.version ?? null);
  if (diffFields.length || verChanged) {
    changed.push({ h, b, diffFields, sem: h.version?.semantic_change ?? 'none', dScore: (h.impact_score ?? 0) - (b.impact_score ?? 0) });
  }
}

const L = [];
L.push('## Relatório de impacto — base de requisitos');
L.push('');
if (!added.length && !removed.length && !changed.length) {
  L.push('_Sem mudanças de requisitos nesta alteração._');
  console.log(L.join('\n'));
  process.exit(0);
}
L.push(`**${added.length}** adicionado(s) · **${changed.length}** alterado(s) · **${removed.length}** removido(s).`);
L.push('');

const major = changed.filter((c) => c.sem === 'major');
const asrTouched = [...added, ...changed.map((c) => c.h)].filter((r) => r.architectural_significance);
if (major.length || asrTouched.length) {
  L.push(`> ⚠️ **Atenção:** ${major.length} mudança(s) **major** (incompatível) e ${asrTouched.length} requisito(s) **ASR** tocado(s) — rode \`/impact-review\`.`);
  L.push('');
}

function row(r, extra = '') {
  return `| \`${r.id}\` | ${r.scope?.product_scope ?? '—'} | ${r.type} | ${r.title.slice(0, 60)} | ${extra} |`;
}

if (added.length) {
  L.push('### Adicionados');
  L.push('| id | produto | tipo | título | impacto |');
  L.push('|---|---|---|---|---|');
  for (const r of added.sort((a, b) => a.id.localeCompare(b.id))) L.push(row(r, `${r.impact_band ?? '—'} (${r.impact_score ?? 0})`));
  L.push('');
}
if (changed.length) {
  L.push('### Alterados');
  L.push('| id | produto | tipo | título | mudança |');
  L.push('|---|---|---|---|---|');
  for (const c of changed.sort((a, b) => a.h.id.localeCompare(b.h.id))) {
    const delta = c.dScore ? ` · Δimpacto ${c.dScore > 0 ? '+' : ''}${c.dScore}` : '';
    L.push(row(c.h, `**${c.sem}** [${c.diffFields.join(', ') || 'version'}]${delta}`));
  }
  L.push('');
}
if (removed.length) {
  L.push('### Removidos');
  L.push('| id | produto | tipo | título | |');
  L.push('|---|---|---|---|---|');
  for (const r of removed.sort((a, b) => a.id.localeCompare(b.id))) L.push(row(r));
  L.push('');
}

console.log(L.join('\n'));

// --enforce: toda mudança de campo SEMÂNTICO exige versionamento explícito.
// (item_revision aumentado + semantic_change != none + change_reason preenchido.)
// É o gatilho que força "questão de versão" a cada alteração de requisito.
if (ENFORCE) {
  const SEMANTIC = ['statement', 'acceptance_criteria', 'quality_scenarios', 'links', 'scope', 'status', 'priority', 'criticality', 'architectural_significance'];
  const violations = [];
  for (const c of changed) {
    const semChanged = SEMANTIC.some((f) => JSON.stringify(c.b[f] ?? null) !== JSON.stringify(c.h[f] ?? null));
    if (!semChanged) continue;
    const bRev = c.b.version?.item_revision ?? 0;
    const hRev = c.h.version?.item_revision ?? 0;
    const sc = c.h.version?.semantic_change ?? 'none';
    const reason = (c.h.version?.change_reason ?? '').trim();
    if (hRev <= bRev) violations.push(`${c.h.id}: campo semântico mudou mas version.item_revision não aumentou (${bRev} -> ${hRev}).`);
    if (sc === 'none') violations.push(`${c.h.id}: version.semantic_change deve ser patch/minor/major (está 'none').`);
    if (!reason) violations.push(`${c.h.id}: version.change_reason está vazio.`);
  }
  if (violations.length) {
    console.error('\n[enforce] Versionamento semântico obrigatório — violações:');
    for (const v of violations) console.error('  - ' + v);
    console.error('::error::Mudou requisito sem versionar. Incremente item_revision, classifique semantic_change e preencha change_reason.');
    process.exit(1);
  }
}
