// =============================================================================
// build-products.mjs — valida e indexa os artefatos do FORGE (geração greenfield):
//   - specs/blueprints/<id>/blueprint.json      (catálogo de stacks-ouro)
//   - specs/products/<name>/product.json         (brief + estado das fases)
//   - specs/products/<name>/build-plan.json      (DAG + ordem; opcional até a fase de arquitetura)
//
// Valida contra os schemas (ajv) + integridade (id == pasta, blueprint referenciado
// existe, build-plan casa com o produto, regras de tier/base_path) e EMITE,
// determinístico, em specs/baseline/:
//   - blueprints.json   : catálogo p/ a UI do Forge (com tier/profile do preset)
//   - products.json     : lista de produtos + fases p/ a UI do Forge
//   - capabilities.json : índice dos blocos + catalog_hash (sha256 estável do catálogo
//                         blocos+blueprints, mesmo padrão do baseline_hash)
//
// Saída sem timestamp/ordenada (igual build-baseline) p/ o CI checar drift com --check.
//
// Uso:  node build-products.mjs            # gera/atualiza
//       node build-products.mjs --check    # NÃO escreve; falha em erro OU drift
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');
const SCHEMA_DIR = path.join(SPECS_DIR, 'schema');
const BLUEPRINTS_DIR = path.join(SPECS_DIR, 'blueprints');
const PRODUCTS_DIR = path.join(SPECS_DIR, 'products');
const REQUIREMENTS_DIR = path.join(SPECS_DIR, 'requirements');
const CAPABILITIES_DIR = path.join(SPECS_DIR, 'forge', 'capabilities', 'blocks');
const OUT_DIR = path.join(SPECS_DIR, 'baseline');
const CHECK = process.argv.includes('--check');

function fail(msg) { console.error(`\x1b[31m[products] ${msg}\x1b[0m`); process.exitCode = 1; }
function stable(obj) { return JSON.stringify(obj, null, 2) + '\n'; }

// --- helpers puros (exportados p/ teste) ----------------------------------------
// Tier do blueprint: campo opcional aditivo — ausente = t3 (produto completo).
export function blueprintTier(blueprint) { return (blueprint && blueprint.tier) || 't3'; }

// base_path permitido por produto: /<name>; produto cms_portal (ou blueprint t1)
// também aceita /sites/<name> (o portal publicado é servido pelo site-renderer).
export function basePathErrors(prod, blueprint) {
  const isCmsPortal = prod.app_type === 'cms_portal' || blueprintTier(blueprint) === 't1';
  const allowed = isCmsPortal ? [`/${prod.name}`, `/sites/${prod.name}`] : [`/${prod.name}`];
  if (!allowed.includes(prod.base_path)) {
    return [`products/${prod.name}: base_path '${prod.base_path}' deveria ser ${allowed.map((a) => `'${a}'`).join(' ou ')}`];
  }
  return [];
}

// Regras de tier: produto sobre blueprint t1 (portal sem código, executor = CMS)
// NÃO pode declarar blocos de capacidade (todo bloco é código) — manifesto mentiroso.
export function tierBlockErrors(prod, blueprint) {
  const errs = [];
  if (blueprintTier(blueprint) === 't1' && (prod.capability_blocks || []).length > 0) {
    errs.push(`products/${prod.name}: blueprint '${prod.blueprint}' é t1 (portal sem código — o executor é o CMS); capability_blocks ${JSON.stringify(prod.capability_blocks)} não se aplicam (bloco de capacidade é código)`);
  }
  return errs;
}

// Hash estável do CATÁLOGO (blocos + blueprints), mesmo padrão do baseline_hash do
// build-baseline.mjs: sha256 do JSON estável dos índices ordenados. Muda quando o
// conteúdo do catálogo muda; carimbado nos manifestos por apply-capabilities.mjs.
export function computeCatalogHash(blueprintsIndexArr, capabilitiesIndexArr) {
  return crypto.createHash('sha256').update(stable({ blueprints: blueprintsIndexArr, capabilities: capabilitiesIndexArr })).digest('hex');
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
function compile(name) { return ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))); }
const vBlueprint = compile('blueprint.schema.json');
const vProduct = compile('product.schema.json');
const vBuildPlan = compile('build-plan.schema.json');
const vCapability = compile('capability.schema.json');

function listDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// --- blueprints ---------------------------------------------------------------
function loadBlueprints() {
  const out = [];
  for (const id of listDirs(BLUEPRINTS_DIR)) {
    const p = path.join(BLUEPRINTS_DIR, id, 'blueprint.json');
    if (!fs.existsSync(p)) { fail(`blueprint sem blueprint.json: specs/blueprints/${id}/`); continue; }
    let doc;
    try { doc = readJson(p); } catch (e) { fail(`JSON inválido em specs/blueprints/${id}/blueprint.json: ${e.message}`); continue; }
    if (!vBlueprint(doc)) { for (const err of vBlueprint.errors) fail(`blueprints/${id} :: ${err.instancePath || '/'} ${err.message}`); continue; }
    if (doc.id !== id) fail(`blueprint id '${doc.id}' != pasta '${id}' (specs/blueprints/${id}/)`);
    out.push(doc);
  }
  return out;
}

// --- capabilities (blocos de capacidade do Forge) -----------------------------
function loadCapabilities() {
  const out = [];
  if (!fs.existsSync(CAPABILITIES_DIR)) return out;
  for (const f of fs.readdirSync(CAPABILITIES_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const id = f.replace(/\.json$/, '');
    let doc;
    try { doc = readJson(path.join(CAPABILITIES_DIR, f)); } catch (e) { fail(`JSON inválido em specs/forge/capabilities/blocks/${f}: ${e.message}`); continue; }
    if (!vCapability(doc)) { for (const err of vCapability.errors) fail(`capabilities/${id} :: ${err.instancePath || '/'} ${err.message}`); continue; }
    if (doc.id !== id) fail(`capability id '${doc.id}' != arquivo '${f}' (specs/forge/capabilities/blocks/)`);
    // anti-fabricação: todo reference.path tem de existir no repo
    for (const ref of doc.reference || []) {
      if (!fs.existsSync(path.resolve(REPO_ROOT, ref.path))) fail(`capabilities/${id}: reference.path inexistente no repo: '${ref.path}' (exemplar fantasma)`);
    }
    out.push(doc);
  }
  return out;
}

// --- requisitos existentes (anti-fabricação) -----------------------------------
// Um arquivo por requisito, nome do arquivo == id (o build-baseline valida isso).
function loadRequirementIds() {
  const ids = new Set();
  for (const scope of listDirs(REQUIREMENTS_DIR)) {
    for (const f of fs.readdirSync(path.join(REQUIREMENTS_DIR, scope)).filter((f) => f.endsWith('.yaml'))) {
      ids.add(f.replace(/\.yaml$/, ''));
    }
  }
  return ids;
}

// --- adoção brownfield (anti-adoção-de-fachada) ---------------------------------
// Produto com origin=adopted documenta um app REAL em apps/<name>. Cada bloco de
// capacidade declarado precisa de EVIDÊNCIA no catálogo: pelo menos um
// reference.path dentro de apps/<name>/. Bloco sem evidência = fachada → build falha.
function validateAdoptedEvidence(prod, capabilityById) {
  const prefix = `apps/${prod.name}/`;
  for (const blockId of prod.capability_blocks || []) {
    const cap = capabilityById.get(blockId);
    if (!cap) continue; // inexistente já reportado pelo check genérico em loadProducts

    const hasEvidence = (cap.reference || []).some((ref) => {
      const rel = String(ref.path).replace(/\\/g, '/');
      return (rel === `apps/${prod.name}` || rel.startsWith(prefix)) && fs.existsSync(path.resolve(REPO_ROOT, rel));
    });
    if (!hasEvidence) {
      fail(`products/${prod.name} (origin=adopted): capability_block '${blockId}' sem evidência — nenhum reference.path do catálogo aponta para dentro de apps/${prod.name}/ (adoção de fachada)`);
    }
  }
}

// --- products + build-plans ---------------------------------------------------
function loadProducts(blueprintById, requirementIds, capabilityById) {
  const products = [];
  for (const name of listDirs(PRODUCTS_DIR)) {
    const pp = path.join(PRODUCTS_DIR, name, 'product.json');
    if (!fs.existsSync(pp)) { fail(`produto sem product.json: specs/products/${name}/`); continue; }
    let prod;
    try { prod = readJson(pp); } catch (e) { fail(`JSON inválido em specs/products/${name}/product.json: ${e.message}`); continue; }
    if (!vProduct(prod)) { for (const err of vProduct.errors) fail(`products/${name} :: ${err.instancePath || '/'} ${err.message}`); continue; }
    if (prod.name !== name) fail(`product name '${prod.name}' != pasta '${name}' (specs/products/${name}/)`);
    const blueprint = blueprintById.get(prod.blueprint);
    if (!blueprint) fail(`products/${name}: blueprint '${prod.blueprint}' não existe em specs/blueprints/`);
    for (const msg of basePathErrors(prod, blueprint)) fail(msg);
    // regras de tier: produto sobre blueprint t1 não declara blocos (portal sem código)
    for (const msg of tierBlockErrors(prod, blueprint)) fail(msg);
    // anti-fabricação: todo capability_block declarado precisa existir no catálogo
    for (const id of prod.capability_blocks || []) {
      if (!capabilityById.has(id)) fail(`products/${name}: capability_block '${id}' não existe em specs/forge/capabilities/blocks/`);
    }
    // anti-fabricação: todo requirement_id declarado precisa existir em specs/requirements/**
    for (const id of prod.requirement_ids || []) {
      if (!requirementIds.has(id)) fail(`products/${name}: requirement_id '${id}' não existe em specs/requirements/** (requisito fantasma)`);
    }
    // adoção brownfield: blocos declarados exigem evidência real dentro de apps/<name>/
    if (prod.origin === 'adopted') validateAdoptedEvidence(prod, capabilityById);

    // build-plan.json é opcional até a fase de arquitetura
    const bpPath = path.join(PRODUCTS_DIR, name, 'build-plan.json');
    if (fs.existsSync(bpPath)) {
      let plan;
      try { plan = readJson(bpPath); } catch (e) { fail(`JSON inválido em specs/products/${name}/build-plan.json: ${e.message}`); plan = null; }
      if (plan) {
        if (!vBuildPlan(plan)) { for (const err of vBuildPlan.errors) fail(`products/${name}/build-plan :: ${err.instancePath || '/'} ${err.message}`); }
        else {
          if (plan.product !== name) fail(`products/${name}/build-plan: product '${plan.product}' != '${name}'`);
          if (plan.blueprint !== prod.blueprint) fail(`products/${name}/build-plan: blueprint '${plan.blueprint}' != product.blueprint '${prod.blueprint}'`);
          // todo REQ do plano deve estar na lista do produto
          const reqSet = new Set(prod.requirement_ids || []);
          for (const id of plan.order || []) if (!reqSet.has(id)) fail(`products/${name}/build-plan: order tem '${id}' fora de product.requirement_ids`);
        }
      }
    }
    products.push(prod);
  }
  return products;
}

// --- resumo de arquitetura/stack por produto ----------------------------------
// Deriva um texto COMPACTO e DETERMINÍSTICO de specs/products/<name>/architecture.json
// (stack base + blocos de capacidade + títulos das ADRs). É o que o chat de autoria passa
// a conhecer para responder sobre tecnologia SEM perguntar "qual framework". Opcional/fail-soft.
function architectureSummary(name) {
  const ap = path.join(PRODUCTS_DIR, name, 'architecture.json');
  if (!fs.existsSync(ap)) return '';
  let arch;
  try { arch = readJson(ap); } catch (e) { fail(`JSON inválido em specs/products/${name}/architecture.json: ${e.message}`); return ''; }
  const adrs = Array.isArray(arch.adrs) ? arch.adrs : [];
  const lines = [];
  const lead = String(arch.stack_rationale || '').trim() || String((adrs[0] && adrs[0].decision) || '').trim();
  if (lead) lines.push(`Stack/decisão base: ${lead}`);
  const blocks = [...new Set(adrs.flatMap((a) => (Array.isArray(a.blocks) ? a.blocks : [])))].sort();
  if (blocks.length) lines.push(`Blocos de capacidade: ${blocks.join(', ')}.`);
  const titles = adrs.map((a) => String(a.title || '').trim()).filter(Boolean);
  if (titles.length) lines.push(`Decisões (ADRs): ${titles.join('; ')}.`);
  return lines.join('\n').slice(0, 1500);
}

// --- montar índices (determinísticos) -----------------------------------------
function build() {
  const blueprints = loadBlueprints().sort((a, b) => a.id.localeCompare(b.id));
  const capabilities = loadCapabilities().sort((a, b) => a.id.localeCompare(b.id));
  const capIds = new Set(capabilities.map((c) => c.id));
  // integridade do catálogo: requires/conflicts apontam para blocos reais
  for (const c of capabilities) {
    for (const r of c.requires || []) if (!capIds.has(r)) fail(`capabilities/${c.id}: requires '${r}' não existe em specs/forge/capabilities/blocks/`);
    for (const x of c.conflicts_with || []) if (!capIds.has(x)) fail(`capabilities/${c.id}: conflicts_with '${x}' não existe`);
  }
  // blueprint -> blocos: existem e são stack-compatíveis
  for (const b of blueprints) {
    for (const id of [...(b.default_blocks || []), ...(b.compatible_blocks || [])]) {
      const cap = capabilities.find((c) => c.id === id);
      if (!cap) { fail(`blueprints/${b.id}: bloco '${id}' não existe em specs/forge/capabilities/blocks/`); continue; }
      if (b.base_stack && !cap.compatible_stacks.includes(b.base_stack)) fail(`blueprints/${b.id}: bloco '${id}' não é compatível com a stack '${b.base_stack}'`);
    }
  }
  const capabilityById = new Map(capabilities.map((c) => [c.id, c]));
  const blueprintById = new Map(blueprints.map((b) => [b.id, b]));
  const requirementIds = loadRequirementIds();
  const products = loadProducts(blueprintById, requirementIds, capabilityById).sort((a, b) => a.name.localeCompare(b.name));

  const blueprintsIndex = {
    blueprints: blueprints.map((b) => ({ id: b.id, version: b.version, name: b.name, summary: b.summary || '', tier: blueprintTier(b), profile: b.profile || null, stack: b.stack, services: b.services, db: b.db ?? null, reuses: b.reuses || [], base_stack: b.base_stack ?? null, default_blocks: b.default_blocks || [], compatible_blocks: b.compatible_blocks || [] })),
  };
  const capabilitiesArr = capabilities.map((c) => ({ id: c.id, title: c.title, description: c.description, category: c.category, requires: c.requires || [], conflicts_with: c.conflicts_with || [], compatible_stacks: c.compatible_stacks, tiers: c.tiers || [], reuses: c.reuses || [], reference: (c.reference || []).map((r) => ({ stack: r.stack, path: r.path, note: r.note })), scaffold_overlay: c.scaffold_overlay || {}, work_order_guidance: c.work_order_guidance, verification: c.verification, default_adrs: c.default_adrs || [] }));
  // hash estável do catálogo (blocos + blueprints) — carimbado nos applied-capabilities.json
  const catalogHash = computeCatalogHash(blueprintsIndex.blueprints, capabilitiesArr);
  const capabilitiesIndex = { catalog_hash: catalogHash, capabilities: capabilitiesArr };
  const productsIndex = {
    products: products.map((p) => ({
      name: p.name, display_name: p.display_name, base_path: p.base_path, blueprint: p.blueprint,
      origin: p.origin || 'greenfield',
      vision: p.vision, app_type: p.app_type || 'product_software',
      architecture_summary: architectureSummary(p.name),
      requirement_ids: p.requirement_ids || [], phases: p.phases,
    })),
  };
  // (D3, Forja 4.1) apps-index.json: TODO app implantável do monorepo (apps/<name> com devops.yaml),
  // com a flag has_product — o hub do Studio deriva daqui a seção "Apps fora da Forja" (visibilidade
  // + CTA de adoção) sem fabricar requisitos. Determinístico e ordenado (drift-check como os demais).
  const appsIndex = { apps: loadAppsIndex(new Set(products.map((p) => p.name))) };

  return {
    'blueprints.json': stable(blueprintsIndex),
    'products.json': stable(productsIndex),
    'capabilities.json': stable(capabilitiesIndex),
    'apps-index.json': stable(appsIndex),
  };
}

// Varre apps/<name>/devops.yaml (raiz do monorepo) e devolve [{ name, base_path, app_type, has_product }].
// Fail-soft por app (devops.yaml ilegível -> pulado com warning). `forge-pilot-v2` é fixture do
// contrato v2 (README dela) — excluída por não ser app implantável de verdade.
const APPS_INDEX_EXCLUDE = new Set(['forge-pilot-v2']);
function loadAppsIndex(productNames) {
  const appsDir = path.join(SPECS_DIR, '..', 'apps');
  if (!fs.existsSync(appsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || APPS_INDEX_EXCLUDE.has(entry.name)) continue;
    const dy = path.join(appsDir, entry.name, 'devops.yaml');
    if (!fs.existsSync(dy)) continue;
    let doc = null;
    try { doc = YAML.parse(fs.readFileSync(dy, 'utf8')); } catch { console.warn(`[products] aviso: devops.yaml ilegível em apps/${entry.name} — pulado do apps-index`); continue; }
    const app = (doc && doc.app) || {};
    out.push({
      name: entry.name,
      base_path: app.basePath || '/' + entry.name,
      app_type: app.appType || 'product_software',
      has_product: productNames.has(entry.name),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const artifacts = build();
  if (process.exitCode === 1) { console.error('\x1b[31m[products] validação FALHOU.\x1b[0m'); process.exit(1); }

  if (CHECK) {
    let drift = false;
    for (const [name, content] of Object.entries(artifacts)) {
      const p = path.join(OUT_DIR, name);
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      if (cur !== content) { drift = true; fail(`índice desatualizado: baseline/${name} difere do regerado. Rode 'node build-products.mjs' e commite.`); }
    }
    if (drift) process.exit(1);
    console.log('\x1b[32m[products] OK — blueprints/produtos válidos; índices em dia.\x1b[0m');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(OUT_DIR, name), content);
  console.log(`\x1b[32m[products] índices gerados -> specs/baseline/{blueprints,products,capabilities}.json\x1b[0m`);
}

// só roda como CLI — importável pelos testes (helpers puros exportados) sem efeito colateral
if (process.argv[1] && process.argv[1].endsWith('build-products.mjs')) main();
