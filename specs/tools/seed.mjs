// =============================================================================
// seed.mjs — bootstrap da base de requisitos a partir dos dados extraídos dos
// produtos reais (seed-input.json, derivado da pesquisa + leitura do código).
//
// Gera specs/requirements/<product>/<id>.yaml conformes ao schema. NÃO fabrica
// rastreabilidade (links) nem evidências — esses campos são autorados na iteração
// e pela UI (workbench). A lacuna de verificação resultante é REAL e aparece, de
// propósito, na fila de reprocessamento (build-baseline). É um bootstrap idempotente
// por conteúdo: re-rodar regera os mesmos arquivos.
//
// Uso: node seed.mjs        (lê seed-input.json; escreve specs/requirements/**)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as toYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REQ_DIR = path.join(SPECS_DIR, 'requirements');
const input = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-input.json'), 'utf8'));

// produto extraído -> product_scope + diretório
const PRODUCTS = {
  sicat: { scope: 'sicat', dir: 'sicat', owner: 'plataforma-digital', origin: 'codebase apps/sicat + research-2026-06' },
  gymops: { scope: 'gymops', dir: 'gymops', owner: 'plataforma-digital', origin: 'codebase apps/gymops + research-2026-06' },
  portalCms: { scope: 'cms', dir: 'cms', owner: 'plataforma-digital', origin: 'codebase portal/CMS + research-2026-06' },
};

function mapScope(scopeStr, product) {
  const out = { product_scope: product };
  if (!scopeStr || scopeStr === 'product') out.applies_to = 'product';
  else if (scopeStr === 'shared-module') out.applies_to = 'shared-module';
  else if (typeof scopeStr === 'string' && scopeStr.startsWith('capability:')) {
    out.applies_to = 'capability';
    out.capability = scopeStr.slice('capability:'.length);
  } else out.applies_to = 'product';
  return out;
}

// ordena chaves p/ saída YAML estável e legível
function orderedDoc(d) {
  const order = [
    'id', 'slug', 'title', 'type', 'status', 'owner', 'scope', 'statement',
    'business_rationale', 'source', 'priority', 'criticality',
    'architectural_significance', 'risk_tags', 'acceptance_criteria',
    'verification_method', 'evidence_links', 'quality_scenarios', 'links',
    'version', 'allocation',
  ];
  const out = {};
  for (const k of order) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

let count = 0;
for (const [key, meta] of Object.entries(PRODUCTS)) {
  const product = input[key];
  if (!product) continue;
  const outDir = path.join(REQ_DIR, meta.dir);
  fs.mkdirSync(outDir, { recursive: true });

  const asr = new Set(product.architecturally_significant ?? []);

  for (const fr of product.functional_requirements ?? []) {
    const doc = orderedDoc({
      id: fr.proposed_id,
      slug: fr.proposed_id.toLowerCase(),
      title: fr.title,
      type: 'functional',
      status: 'approved',
      owner: meta.owner,
      scope: mapScope(fr.scope, meta.scope),
      statement: fr.statement,
      source: { stakeholder: meta.scope, origin: meta.origin },
      priority: fr.priority ?? 'medium',
      criticality: fr.priority ?? 'medium',
      architectural_significance: asr.has(fr.proposed_id),
      version: { baseline_version: '1.0.0', item_revision: 1, semantic_change: 'none', change_reason: 'baseline inicial (bootstrap)' },
    });
    fs.writeFileSync(path.join(outDir, `${fr.proposed_id}.yaml`), toYaml(doc, { lineWidth: 0 }));
    count++;
  }

  for (const nfr of product.non_functional_requirements ?? []) {
    const qs = nfr.quality_scenario;
    const doc = orderedDoc({
      id: nfr.proposed_id,
      slug: nfr.proposed_id.toLowerCase(),
      title: nfr.title,
      type: 'non-functional',
      status: 'approved',
      owner: meta.owner,
      scope: { applies_to: 'product', product_scope: meta.scope },
      statement: `O sistema deve atender ao atributo de qualidade "${nfr.title}": ${qs.response}`,
      source: { stakeholder: meta.scope, origin: meta.origin },
      priority: 'high',
      criticality: 'high',
      architectural_significance: asr.has(nfr.proposed_id),
      quality_scenarios: [qs],
      version: { baseline_version: '1.0.0', item_revision: 1, semantic_change: 'none', change_reason: 'baseline inicial (bootstrap)' },
    });
    fs.writeFileSync(path.join(outDir, `${nfr.proposed_id}.yaml`), toYaml(doc, { lineWidth: 0 }));
    count++;
  }
}

console.log(`[seed] ${count} requisitos escritos em specs/requirements/{sicat,gymops,cms}/`);
