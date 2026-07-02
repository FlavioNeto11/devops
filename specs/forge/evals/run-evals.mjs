// =============================================================================
// run-evals.mjs — eval DETERMINÍSTICO dos geradores da Forja (Forja 4.0 — B4).
// SEM LLM, SEM rede: para cada golden brief em specs/forge/evals/golden/*.json,
// roda os geradores determinísticos num diretório temporário e valida a ESTRUTURA
// do que eles produzem:
//   1. forge-write-reqs (writeFromPayload)  -> REQ-*.yaml schema-válidos + product.json
//      + architecture.json + build-plan.json (mesmo caminho do greenfield-launch.yml);
//   2. apply-capabilities (resolveBlocks)   -> DEFAULT_BLOCKS forçados, fecho de
//      `requires`, drop de bloco incompatível com a stack (catálogo REAL da baseline);
//   3. apply-capabilities (buildManifest)   -> manifesto com aggregated/detail/verification
//      + provenance (catalog_source_sha).
//
// BLOQUEANTE no CI (job forge-evals do ai-evals.yml) em PR que toca specs/forge/** ou
// apps/reqhub/api/src/prompts.js: se um refactor do gerador quebrar a estrutura emitida,
// o PR não mescla. A validação de schema usa ajv+yaml de specs/tools (npm ci lá antes);
// sem as deps instaladas, degrada para checks estruturais próprios com aviso — a menos
// que FORGE_EVALS_STRICT=1 (o CI seta), quando a ausência das deps é erro.
//
// Uso:  node specs/forge/evals/run-evals.mjs           # roda todos os goldens
// =============================================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFromPayload } from '../../tools/forge-write-reqs.mjs';
import { loadCatalog, resolveBlocks, buildManifest, DEFAULT_BLOCKS } from '../apply-capabilities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..', '..');
const GOLDEN_DIR = path.join(__dirname, 'golden');
const STRICT = process.env.FORGE_EVALS_STRICT === '1';

// Deps de validação vêm de specs/tools (yaml + ajv). Fail-soft fora do CI.
function loadValidationDeps() {
  try {
    const req = createRequire(path.join(SPECS_DIR, 'tools', 'package.json'));
    const YAML = req('yaml');
    const Ajv2020 = req('ajv/dist/2020.js'); // o schema é draft 2020-12 (mesmo import do build-baseline.mjs)
    const addFormats = req('ajv-formats');
    const schemaPath = path.join(SPECS_DIR, 'schema', 'requirement.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new (Ajv2020.default || Ajv2020)({ allErrors: true, strict: false });
    (addFormats.default || addFormats)(ajv);
    return { YAML, validateReq: ajv.compile(schema) };
  } catch (e) {
    if (STRICT) throw new Error(`FORGE_EVALS_STRICT=1 e deps de validação indisponíveis (rode npm ci em specs/tools): ${e.message}`);
    console.warn(`[forge-evals] AVISO: yaml/ajv indisponíveis (${e.message}) — degradando p/ checks estruturais próprios. Rode npm ci em specs/tools p/ o eval completo.`);
    return { YAML: null, validateReq: null };
  }
}

/** Roda UM golden brief; retorna a lista de falhas (vazia = passou). Puro exceto o tmpdir. */
export function runGolden(golden, { byId, YAML, validateReq }) {
  const failures = [];
  const fail = (msg) => failures.push(msg);
  const p = golden.payload || {};
  const expect = golden.expect || {};
  const name = p.product;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-eval-'));

  try {
    // 1) forge-write-reqs: emissão de requisitos + product files num specs/ temporário.
    let result;
    try {
      result = writeFromPayload(p, { specsDir: path.join(dir, 'specs'), repoRoot: dir });
    } catch (e) {
      fail(`writeFromPayload lançou: ${e.message}`);
      return failures;
    }
    if (result.name !== name) fail(`name esperado ${name}, veio ${result.name}`);
    if (expect.stack && result.stack !== expect.stack) fail(`stack esperada ${expect.stack}, veio ${result.stack}`);
    if (expect.ids && JSON.stringify(result.ids) !== JSON.stringify(expect.ids)) {
      fail(`ids esperados ${JSON.stringify(expect.ids)}, vieram ${JSON.stringify(result.ids)}`);
    }

    // 1a) cada REQ-*.yaml existe, parseia e é schema-válido (ou passa nos checks estruturais).
    for (let i = 0; i < result.ids.length; i++) {
      const id = result.ids[i];
      const file = path.join(dir, 'specs', 'requirements', name, id + '.yaml');
      if (!fs.existsSync(file)) { fail(`${id}: YAML não emitido (${file})`); continue; }
      const text = fs.readFileSync(file, 'utf8');
      const reqIn = (p.requirements || [])[i] || {};
      if (YAML && validateReq) {
        let doc;
        try { doc = YAML.parse(text); } catch (e) { fail(`${id}: YAML inválido — ${e.message}`); continue; }
        if (!validateReq(doc)) {
          const errs = (validateReq.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
          fail(`${id}: NÃO passa no requirement.schema.json — ${errs}`);
        }
        if (doc.id !== id) fail(`${id}: campo id divergente (${doc.id})`);
        if (doc.scope?.product_scope !== name) fail(`${id}: product_scope esperado ${name}, veio ${doc.scope?.product_scope}`);
        if (!Array.isArray(doc.acceptance_criteria) || !doc.acceptance_criteria.length) fail(`${id}: acceptance_criteria vazio`);
        if (reqIn.type === 'non-functional' && (!Array.isArray(doc.quality_scenarios) || !doc.quality_scenarios.length)) {
          fail(`${id}: non-functional sem quality_scenarios sintetizados`);
        }
      } else {
        // fallback estrutural (sem yaml/ajv): asserts por linha, no estilo forge-write-reqs.test.mjs
        if (!new RegExp(`^id: ${id}$`, 'm').test(text)) fail(`${id}: linha 'id:' ausente/divergente`);
        if (!new RegExp(`product_scope: ${name}$`, 'm').test(text)) fail(`${id}: product_scope ausente/divergente`);
        if (!/^acceptance_criteria:$/m.test(text)) fail(`${id}: acceptance_criteria ausente`);
        if (reqIn.type === 'non-functional' && !/^quality_scenarios:$/m.test(text)) fail(`${id}: non-functional sem quality_scenarios`);
      }
    }

    // 1b) product.json + architecture.json + build-plan.json emitidos e coerentes.
    const prodFile = path.join(dir, 'specs', 'products', name, 'product.json');
    if (!fs.existsSync(prodFile)) fail(`product.json não emitido`);
    else {
      const prod = JSON.parse(fs.readFileSync(prodFile, 'utf8'));
      if (prod.name !== name) fail(`product.json name divergente (${prod.name})`);
      if (expect.stack && prod.stack !== expect.stack) fail(`product.json stack divergente (${prod.stack})`);
      if (JSON.stringify(prod.requirement_ids) !== JSON.stringify(result.ids)) fail('product.json requirement_ids != ids emitidos');
      if (!prod.phases || !prod.phases.requirements) fail('product.json sem phases');
    }
    if (!fs.existsSync(path.join(dir, 'specs', 'products', name, 'architecture.json'))) fail('architecture.json não emitido');
    if (!fs.existsSync(path.join(dir, 'apps/reqhub/frontend/data/products', name, 'build-plan.json'))) fail('build-plan.json não emitido');

    // 2) resolução de blocos contra o catálogo REAL (baseline commitada).
    const selected = ((p.architecture && p.architecture.selected_blocks) || []).map((b) => (b && b.id) || b).filter(Boolean);
    const stack = (p.architecture && p.architecture.stack) || expect.stack || null;
    const resolved = resolveBlocks(selected, stack, byId);
    for (const b of DEFAULT_BLOCKS) {
      const def = byId.get(b);
      const compatible = def && (!stack || def.compatible_stacks.includes(stack));
      if (compatible && !resolved.includes(b)) fail(`bloco default '${b}' não foi forçado na resolução`);
    }
    for (const b of expect.resolved_blocks_include || []) if (!resolved.includes(b)) fail(`bloco esperado '${b}' ausente do resolvido [${resolved.join(', ')}]`);
    for (const b of expect.resolved_blocks_exclude || []) if (resolved.includes(b)) fail(`bloco '${b}' deveria ter sido dropado (stack ${stack})`);

    // 3) manifesto de capacidades: estrutura + provenance.
    const manifest = buildManifest({ app: name, stack, blocks: resolved, byId });
    for (const k of ['services', 'infra', 'env', 'reuses']) {
      if (!Array.isArray(manifest.aggregated?.[k])) fail(`manifesto sem aggregated.${k}`);
    }
    if (!Array.isArray(manifest.detail) || manifest.detail.length !== resolved.length) fail('manifesto detail incompleto');
    for (const d of manifest.detail || []) {
      if (!d.title) fail(`detail '${d.id}' sem title`);
      if (!Array.isArray(d.verification)) fail(`detail '${d.id}' sem verification`);
    }
    if (typeof manifest.catalog_source_sha !== 'string' || !manifest.catalog_source_sha.length) fail('manifesto sem catalog_source_sha (provenance)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return failures;
}

/** Roda todos os goldens; retorna { total, failed, failures: { [golden]: [msgs] } }. */
export function runAll({ goldenDir = GOLDEN_DIR } = {}) {
  const byId = loadCatalog();
  if (!byId.size) throw new Error('catálogo vazio (specs/baseline/capabilities.json) — rode build-products.mjs');
  const deps = loadValidationDeps();
  const files = fs.readdirSync(goldenDir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`nenhum golden brief em ${goldenDir}`);
  const failures = {};
  for (const f of files) {
    const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, f), 'utf8'));
    const fs_ = runGolden(golden, { byId, ...deps });
    if (fs_.length) failures[f] = fs_;
  }
  return { total: files.length, failed: Object.keys(failures).length, failures };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const r = runAll();
    for (const [g, msgs] of Object.entries(r.failures)) for (const m of msgs) console.error(`[forge-evals] ${g}: ${m}`);
    if (r.failed) { console.error(`[forge-evals] REPROVOU — ${r.failed}/${r.total} golden briefs com falha estrutural.`); process.exit(1); }
    console.log(`[forge-evals] OK — ${r.total} golden briefs; geradores determinísticos com estrutura íntegra.`);
  } catch (e) {
    console.error('[forge-evals] FALHOU:', e.message);
    process.exit(1);
  }
}
