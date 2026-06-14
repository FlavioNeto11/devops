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

const [, , basePath, headPath] = process.argv;
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
