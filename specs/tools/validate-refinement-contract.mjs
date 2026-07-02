// =============================================================================
// validate-refinement-contract.mjs — anti-fabricação de CONTRATO nos refinamentos.
// -----------------------------------------------------------------------------
// Valida REFs (specs/refinements/**) contra o CONTRATO REAL da API do produto
// (openapi.yaml do app). Regra: rota/campo citado em behavior.data[].source e nas
// interactions (ex.: "PUT /v1/reports") DEVE existir no contrato — ou o item deve
// declarar EXPLICITAMENTE contract:"proposed" (endpoint/campo NOVO a criar).
//
// É código DETERMINÍSTICO que REJEITA com erro ESTRUTURADO (exit 1 + JSON no
// stdout) — nunca conserta em silêncio, nunca usa mapa de sinônimos. O grounding
// da IA acontece no PROMPT (a autoria recebe o contrato real); este tool é o gate
// estrutural que barra fabricação (ex.: REF citando payload.report_type quando o
// contrato documenta `type`; rota /api/settings que não existe).
//
// Honestidade da prova: campo só vira ERRO quando o schema da rota é FECHADO
// (properties declaradas). Rota com shape ABERTO (ex.: items: {type: object} sem
// properties) não permite PROVAR ausência -> vira WARNING estruturado
// (field-unverifiable) para conferência nos repositories reais.
//
// Uso:
//   node validate-refinement-contract.mjs --product <name>        # todos os REFs do produto
//   node validate-refinement-contract.mjs --file <ref.yaml>       # um REF (produto vem do scope)
//   node validate-refinement-contract.mjs --file <ref.yaml> --contract <openapi.yaml>
//
// Sem contrato openapi no app => exit 0 com {skipped} (produto não é contract-first).
// Consumidores: motor generate-ui (Forja) na autoria; specs-governance (REFs mudados no PR).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// Locais canônicos do contrato openapi de um app da plataforma (primeiro que existir).
export const contractLocations = (product) => [
  path.join('apps', product, 'api', 'src', 'openapi', 'openapi.yaml'),
  path.join('apps', product, 'api', 'openapi', 'openapi.yaml'),
  path.join('apps', product, 'api', 'openapi.yaml'),
];

// "api:/v1/reports?x=1" -> "/v1/reports" | fonte não-API (REQ-..., svc-..., Unit.addr) -> null
export function extractApiPath(source) {
  const m = String(source || '').match(/^api:\s*(\/\S*)/i);
  if (!m) return null;
  const p = m[1].split(/[?#]/)[0].replace(/\/+$/, '');
  return p || '/';
}

// Candidatos DETERMINÍSTICOS de normalização (não é mapa de sinônimo — é normalização
// de prefixo de borda: o frontend chama <base>/api/<path> e o contrato documenta /v1/<path>).
export function pathCandidates(cited) {
  let base = String(cited || '').trim();
  if (!base.startsWith('/')) base = '/' + base;
  base = base.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const out = new Set([base]);
  const noApi = base.replace(/^\/api(?=\/|$)/, '') || '/';
  out.add(noApi);
  for (const b of [base, noApi]) {
    if (b !== '/' && !/^\/v\d+(\/|$)/.test(b)) out.add('/v1' + b);
  }
  return [...out];
}

// Match de template openapi: segmento {param} do template casa com qualquer segmento
// citado; segmento literal exige igualdade; parâmetro citado (:id ou {id}) NÃO casa
// com literal do template.
export function templateMatch(template, cited) {
  const ts = String(template).split('/').filter(Boolean);
  const cs = String(cited).split('/').filter(Boolean);
  if (ts.length !== cs.length) return false;
  for (let i = 0; i < ts.length; i++) {
    const tParam = /^\{.+\}$/.test(ts[i]);
    if (tParam) continue;
    const cParam = /^\{.+\}$/.test(cs[i]) || /^:./.test(cs[i]);
    if (cParam || ts[i] !== cs[i]) return false;
  }
  return true;
}

// Parseia o openapi.yaml em { paths: [{ template, methods:Set, fields:Set, open:bool }] }.
// fields = união dos nomes alcançáveis (parâmetros não-header + propriedades de request/
// response, com $ref resolvido). open = algum nó de schema é aberto (objeto sem
// properties / additionalProperties:true / array sem items) => ausência de campo NÃO é provável.
export function parseContract(yamlText) {
  const spec = parseYaml(yamlText);
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    throw new Error('openapi invalido: bloco paths ausente');
  }
  const resolveRef = (ref) => {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    let node = spec;
    for (const part of ref.slice(2).split('/')) node = node && node[part];
    return node || null;
  };
  const collect = (schema, fields, state, depth, seen) => {
    if (!schema || typeof schema !== 'object' || depth > 12) return;
    if (schema.$ref) {
      if (seen.has(schema.$ref)) return;
      seen.add(schema.$ref);
      collect(resolveRef(schema.$ref), fields, state, depth + 1, seen);
      return;
    }
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(schema[key])) for (const s of schema[key]) collect(s, fields, state, depth + 1, seen);
    }
    if (schema.type === 'array' || schema.items) {
      if (schema.items && typeof schema.items === 'object') collect(schema.items, fields, state, depth + 1, seen);
      else state.open = true; // array sem items declarado => shape aberto
      return;
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [k, v] of Object.entries(schema.properties)) {
        fields.add(k);
        collect(v, fields, state, depth + 1, seen);
      }
      if (schema.additionalProperties === true) state.open = true;
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') collect(schema.additionalProperties, fields, state, depth + 1, seen);
      return;
    }
    const isObjectish = schema.type === 'object' || (!schema.type && !schema.enum && !schema.$ref && !schema.oneOf && !schema.anyOf && !schema.allOf);
    if (isObjectish) {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') collect(schema.additionalProperties, fields, state, depth + 1, seen);
      else state.open = true; // objeto sem properties => shape aberto
    }
  };
  const paths = [];
  for (const [template, item] of Object.entries(spec.paths)) {
    if (!item || typeof item !== 'object') continue;
    const entry = { template, methods: new Set(), fields: new Set(), open: false };
    const state = { open: false };
    for (const [m, op] of Object.entries(item)) {
      if (!HTTP_METHODS.includes(m.toLowerCase()) || !op || typeof op !== 'object') continue;
      entry.methods.add(m.toLowerCase());
      for (const prm of [].concat(item.parameters || [], op.parameters || [])) {
        const rp = prm && prm.$ref ? resolveRef(prm.$ref) : prm;
        if (rp && rp.name && rp.in !== 'header') entry.fields.add(rp.name); // header (X-Role) não é campo de tela
      }
      const schemas = [];
      const rb = op.requestBody && op.requestBody.$ref ? resolveRef(op.requestBody.$ref) : op.requestBody;
      for (const c of Object.values((rb && rb.content) || {})) if (c && c.schema) schemas.push(c.schema);
      for (const resp of Object.values(op.responses || {})) {
        const rr = resp && resp.$ref ? resolveRef(resp.$ref) : resp;
        for (const c of Object.values((rr && rr.content) || {})) if (c && c.schema) schemas.push(c.schema);
      }
      for (const s of schemas) collect(s, entry.fields, state, 0, new Set());
    }
    entry.open = state.open;
    paths.push(entry);
  }
  return { paths };
}

// Valida UM refinamento contra o contrato parseado. Devolve { errors, warnings, proposed }.
// Item marcado contract:"proposed" = endpoint/campo NOVO a criar (EXPLÍCITO) — nunca é erro.
export function checkRefinement(ref, contract) {
  const errors = [];
  const warnings = [];
  const proposed = [];
  const refId = (ref && ref.id) || '(sem id)';
  const findRoute = (cited) => {
    for (const cand of pathCandidates(cited)) {
      const hit = contract.paths.find((e) => templateMatch(e.template, cand));
      if (hit) return hit;
    }
    return null;
  };

  const data = (ref && ref.behavior && Array.isArray(ref.behavior.data)) ? ref.behavior.data : [];
  data.forEach((item, i) => {
    const cited = extractApiPath(item && item.source);
    if (!cited) return; // fonte não-API (REQ-..., svc-..., dominio) — fora do escopo deste gate
    if (item.contract === 'proposed') {
      proposed.push({ ref: refId, where: 'behavior.data[' + i + ']', field: item.field, source: item.source, note: 'endpoint/campo NOVO a criar (marcado explicitamente)' });
      return;
    }
    const hit = findRoute(cited);
    if (!hit) {
      errors.push({
        code: 'route-not-in-contract', ref: refId, where: 'behavior.data[' + i + '].source', cited, field: item.field,
        message: 'rota "' + cited + '" nao existe no contrato openapi',
        hint: 'cite uma rota REAL do contrato ou marque o item com contract:"proposed" (endpoint novo a criar)',
        known_routes_sample: contract.paths.slice(0, 12).map((e) => e.template),
      });
      return;
    }
    const field = item && item.field;
    if (field && !hit.fields.has(field)) {
      if (hit.open) {
        warnings.push({
          code: 'field-unverifiable', ref: refId, where: 'behavior.data[' + i + '].field', field, route: hit.template,
          message: 'campo "' + field + '" nao consta no schema da rota ' + hit.template + ', mas o contrato dessa rota tem shape ABERTO (objeto sem properties) — confirme no repository real do app',
        });
      } else {
        errors.push({
          code: 'field-not-in-contract', ref: refId, where: 'behavior.data[' + i + '].field', field, route: hit.template,
          message: 'campo "' + field + '" nao existe no schema da rota ' + hit.template,
          hint: 'use um campo REAL do contrato/repository ou marque o item com contract:"proposed"',
          known_fields: [...hit.fields].sort(),
        });
      }
    }
  });

  const interactions = (ref && ref.behavior && Array.isArray(ref.behavior.interactions)) ? ref.behavior.interactions : [];
  const RX = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s'"`,;)]+)/g;
  interactions.forEach((item, i) => {
    const action = String((item && item.action) || '');
    for (const m of action.matchAll(RX)) {
      const method = m[1];
      const cited = m[2].split(/[?#]/)[0].replace(/\/+$/, '') || '/';
      if (item.contract === 'proposed') {
        proposed.push({ ref: refId, where: 'behavior.interactions[' + i + ']', method, cited, note: 'endpoint NOVO a criar (marcado explicitamente)' });
        continue;
      }
      const hit = findRoute(cited);
      if (!hit) {
        errors.push({
          code: 'interaction-route-not-in-contract', ref: refId, where: 'behavior.interactions[' + i + '].action', method, cited,
          message: 'rota "' + method + ' ' + cited + '" nao existe no contrato openapi',
          hint: 'cite uma rota REAL do contrato ou marque a interacao com contract:"proposed"',
        });
        continue;
      }
      if (!hit.methods.has(method.toLowerCase())) {
        errors.push({
          code: 'interaction-method-not-in-contract', ref: refId, where: 'behavior.interactions[' + i + '].action', method, cited, route: hit.template,
          message: 'a rota ' + hit.template + ' existe mas NAO documenta o metodo ' + method,
          hint: 'ajuste o metodo para um documentado ou marque a interacao com contract:"proposed"',
          known_methods: [...hit.methods].map((x) => x.toUpperCase()),
        });
      }
    }
  });

  return { errors, warnings, proposed };
}

function parseArgs(argv) {
  const a = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') a.product = argv[++i];
    else if (argv[i] === '--file') a.files.push(argv[++i]);
    else if (argv[i] === '--contract') a.contract = argv[++i];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.product && args.files.length === 0) {
    console.error('uso: node validate-refinement-contract.mjs --product <name> | --file <ref.yaml> [--contract <openapi.yaml>]');
    process.exit(2);
  }

  // 1) carrega os REFs alvo
  let refFiles = args.files.slice();
  if (args.product) {
    const dir = path.join(SPECS_DIR, 'refinements', args.product);
    if (fs.existsSync(dir)) {
      refFiles = refFiles.concat(fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => path.join(dir, f)));
    }
  }
  if (refFiles.length === 0) {
    console.log(JSON.stringify({ ok: true, skipped: 'nenhum REF encontrado', product: args.product || null }, null, 2));
    process.exit(0);
  }
  const refs = refFiles.map((f) => {
    const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
    return { file: f, ref: parseYaml(fs.readFileSync(abs, 'utf8')) };
  });

  // 2) resolve o produto (arg ou scope do REF) e o contrato
  const product = args.product || (refs[0].ref && refs[0].ref.scope && refs[0].ref.scope.product_scope) || null;
  let contractPath = args.contract || null;
  if (!contractPath && product) {
    contractPath = contractLocations(product).map((p) => path.join(REPO_ROOT, p)).find((p) => fs.existsSync(p)) || null;
  }
  if (!contractPath) {
    // produto sem contrato openapi não é contract-first — nada a validar aqui (explícito, não silencioso).
    console.log(JSON.stringify({ ok: true, skipped: 'sem contrato openapi para o produto — nada a validar', product, refs_checked: 0 }, null, 2));
    process.exit(0);
  }
  const contract = parseContract(fs.readFileSync(contractPath, 'utf8'));

  // 3) valida
  const all = { errors: [], warnings: [], proposed: [] };
  for (const { file, ref } of refs) {
    const scopeProduct = ref && ref.scope && ref.scope.product_scope;
    if (product && scopeProduct && scopeProduct !== product) continue; // REF de outro produto (mistura de --file)
    const r = checkRefinement(ref, contract);
    for (const e of r.errors) all.errors.push({ ...e, file });
    for (const w of r.warnings) all.warnings.push({ ...w, file });
    for (const p of r.proposed) all.proposed.push({ ...p, file });
  }

  const result = {
    ok: all.errors.length === 0,
    product,
    contract: path.relative(REPO_ROOT, contractPath).replace(/\\/g, '/'),
    refs_checked: refs.length,
    errors: all.errors,
    warnings: all.warnings,
    proposed: all.proposed,
  };
  console.log(JSON.stringify(result, null, 2));
  console.error('[validate-refinement-contract] ' + refs.length + ' REF(s) vs ' + result.contract + ': '
    + all.errors.length + ' erro(s), ' + all.warnings.length + ' aviso(s), ' + all.proposed.length + ' item(ns) propostos como novos.');
  process.exit(all.errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('validate-refinement-contract.mjs')) main();
