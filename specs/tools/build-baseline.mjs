// =============================================================================
// build-baseline.mjs — gera a baseline consumida pela UI e pelo Claude.
// -----------------------------------------------------------------------------
// Lê todos os artefatos de requisito (specs/requirements/**/*.yaml), valida contra
// specs/schema/requirement.schema.json (ajv) + checa integridade (ids únicos, links
// sem alvo pendente), e emite em specs/baseline/:
//   - current-baseline.json   : todos os requisitos + métricas + score de impacto
//   - impact-map.json         : grafo (nós: requisitos+artefatos; arestas: links tipados)
//   - retrieval-manifest.json : índice id→arquivo p/ recuperação do Claude
//
// Saída DETERMINÍSTICA (sem timestamp; ordenada por id; hash de conteúdo) — assim o CI
// consegue checar "baseline commitada == baseline regerada" (drift) com --check.
//
// Uso:
//   node build-baseline.mjs           # gera/atualiza os arquivos
//   node build-baseline.mjs --check   # NÃO escreve; falha (exit 1) se houver erro de
//                                      # schema/integridade OU drift vs. o commitado.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REQ_DIR = path.join(SPECS_DIR, 'requirements');
const SCHEMA_PATH = path.join(SPECS_DIR, 'schema', 'requirement.schema.json');
const OUT_DIR = path.join(SPECS_DIR, 'baseline');

const CHECK = process.argv.includes('--check');
const METAMODEL_VERSION = '1.0.0'; // versão do metamodelo (schema + shape da baseline) consumido pelo workbench/Claude

// Registry de artefatos externos (svc/infra/slo/test) — vocabulário controlado.
function loadRegistry() {
  const p = path.join(SPECS_DIR, 'registry', 'artifacts.yaml');
  if (!fs.existsSync(p)) return {};
  try { return parseYaml(fs.readFileSync(p, 'utf8')) ?? {}; } catch { return {}; }
}
function registryIds(reg) {
  return new Set([...(reg.services ?? []), ...(reg.infra ?? []), ...(reg.slos ?? []), ...(reg.tests ?? [])].map((x) => x.id));
}

function fail(msg) {
  console.error(`\x1b[31m[specs] ${msg}\x1b[0m`);
  process.exitCode = 1;
}

// --- 1) carregar artefatos -----------------------------------------------------
function loadRequirements() {
  if (!fs.existsSync(REQ_DIR)) return [];
  const files = fs
    .readdirSync(REQ_DIR, { recursive: true })
    .filter((f) => typeof f === 'string' && /\.ya?ml$/.test(f))
    .map((f) => path.join(REQ_DIR, f));
  const items = [];
  for (const file of files) {
    let doc;
    try {
      doc = parseYaml(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      fail(`YAML inválido em ${path.relative(SPECS_DIR, file)}: ${e.message}`);
      continue;
    }
    items.push({ file: path.relative(SPECS_DIR, file).replace(/\\/g, '/'), doc });
  }
  return items;
}

// --- 2) validar (schema + integridade) ----------------------------------------
function validate(items) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const validateFn = ajv.compile(schema);

  const ids = new Map();
  const slugs = new Map();
  let ok = true;

  for (const { file, doc } of items) {
    if (!validateFn(doc)) {
      ok = false;
      for (const err of validateFn.errors) {
        fail(`${file} :: ${err.instancePath || '/'} ${err.message}`);
      }
    }
    if (doc && doc.id) {
      if (ids.has(doc.id)) {
        ok = false;
        fail(`id duplicado '${doc.id}' em ${file} e ${ids.get(doc.id)}`);
      } else ids.set(doc.id, file);
    }
    if (doc && doc.slug) {
      if (slugs.has(doc.slug)) {
        ok = false;
        fail(`slug duplicado '${doc.slug}' em ${file} e ${slugs.get(doc.slug)}`);
      } else slugs.set(doc.slug, file);
    }
  }

  // links para outros REQ-* devem existir (não-REQ são artefatos externos: ADR-, svc-, etc.)
  for (const { file, doc } of items) {
    for (const link of doc?.links ?? []) {
      const t = link.target ?? '';
      if (/^REQ-/.test(t) && !ids.has(t)) {
        ok = false;
        fail(`link pendente em ${file}: '${link.type} -> ${t}' (requisito alvo não existe)`);
      }
    }
  }

  // Artefatos externos: ADR-NNNN existe em docs/decisions/NNNN-*.md; svc-/infra-/slo-/test-
  // existem no registry (specs/registry/artifacts.yaml). Prefixo desconhecido => aviso (não falha).
  const decisionsDir = path.resolve(SPECS_DIR, '..', 'docs', 'decisions');
  const adrNums = fs.existsSync(decisionsDir)
    ? new Set(fs.readdirSync(decisionsDir).map((f) => (f.match(/^(\d+)-/) || [])[1]).filter(Boolean).map(Number))
    : new Set();
  const regIds = registryIds(loadRegistry());
  const checkExternal = (file, t) => {
    if (!t || /^REQ-/.test(t)) return;
    const adr = /^ADR-(\d+)/.exec(t);
    if (adr) { if (!adrNums.has(Number(adr[1]))) { ok = false; fail(`ADR inexistente em ${file}: '${t}' (não há docs/decisions/${adr[1]}-*.md)`); } return; }
    if (/^(svc|infra|slo|test)-/.test(t)) { if (!regIds.has(t)) { ok = false; fail(`artefato fora do registry em ${file}: '${t}' (declare em specs/registry/artifacts.yaml)`); } return; }
    console.error(`\x1b[33m[specs] aviso: alvo externo com prefixo desconhecido em ${file}: '${t}'\x1b[0m`);
  };
  for (const { file, doc } of items) {
    for (const l of doc?.links ?? []) checkExternal(file, l.target);
    const a = doc?.allocation ?? {};
    for (const t of [...(a.adr_refs ?? []), ...(a.service_refs ?? []), ...(a.infra_refs ?? []), ...(a.slo_refs ?? []), ...(a.architecture_refs ?? [])]) checkExternal(file, t);
  }

  // ENFORCE DE ORIGEM: source.source_paths deve apontar p/ caminhos REAIS (relativos à
  // raiz do repo) que EXISTEM. Fecha a pergunta "sem fabricar" — um requisito não pode
  // declarar uma origem inexistente. (Sem source_paths não falha; existindo, valida.)
  const REPO_ROOT = path.resolve(SPECS_DIR, '..');
  for (const { file, doc } of items) {
    for (const sp of doc?.source?.source_paths ?? []) {
      if (typeof sp !== 'string' || !sp.trim() || /^([a-zA-Z]:[\\/]|[\\/]|\.\.)/.test(sp)) {
        ok = false; fail(`source_path inválido em ${file}: '${sp}' (use caminho relativo à raiz do repo)`); continue;
      }
      if (!fs.existsSync(path.join(REPO_ROOT, sp))) {
        ok = false; fail(`source_path inexistente em ${file}: '${sp}' (origem fabricada? o caminho não existe no repo)`);
      }
    }
  }
  return ok;
}

// --- 3) score de impacto (5 fatores da pesquisa) -------------------------------
// abrangência de escopo · criticidade de negócio · significância arquitetural ·
// natureza de segurança/regulatória · lacuna de verificação. 0..100.
function impactScore(doc) {
  let s = 0;
  const applies = doc.scope?.applies_to;
  if (applies === 'shared-module' || applies === 'platform') s += 25;
  else if (applies === 'capability' || applies === 'portal-template') s += 15;
  else s += 5;

  const crit = doc.criticality ?? doc.priority;
  s += { critical: 25, high: 18, medium: 10, low: 4 }[crit] ?? 8;

  if (doc.architectural_significance) s += 20;

  const tags = (doc.risk_tags ?? []).join(' ').toLowerCase();
  if (/secur|regulat|complian|lgpd|seguran|cetesb/.test(tags) || /secur|seguran/.test(doc.scope?.domain ?? '')) s += 15;

  // lacuna de verificação: sem método OU sem evidência
  const hasMethod = (doc.verification_method ?? []).length > 0;
  const hasEvidence = (doc.evidence_links ?? []).length > 0;
  if (!hasMethod || !hasEvidence) s += 15;

  return Math.min(100, s);
}

function band(score) {
  return score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
}

// --- 4) montar artefatos -------------------------------------------------------
function stable(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function build(items) {
  const registry = loadRegistry();
  const reqs = items
    .map(({ file, doc }) => ({ ...doc, _file: file, impact_score: impactScore(doc), impact_band: band(impactScore(doc)) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // current-baseline.json
  const byProduct = {};
  const byStatus = {};
  const byType = {};
  for (const r of reqs) {
    const p = r.scope?.product_scope ?? 'unknown';
    byProduct[p] = (byProduct[p] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }
  const baselineCore = {
    schema: 'specs/schema/requirement.schema.json',
    counts: { total: reqs.length, by_product: byProduct, by_status: byStatus, by_type: byType },
    requirements: reqs.map(({ _file, ...r }) => ({ ...r, file: _file })),
  };
  const baselineHash = crypto.createHash('sha256').update(stable(baselineCore.requirements)).digest('hex');
  const currentBaseline = { metamodel_version: METAMODEL_VERSION, baseline_hash: baselineHash, ...baselineCore };

  // impact-map.json (grafo)
  const nodes = new Map();
  function addNode(id, kind, extra = {}) {
    if (!nodes.has(id)) nodes.set(id, { id, kind, ...extra });
  }
  const edges = [];
  for (const r of reqs) {
    addNode(r.id, 'requirement', {
      title: r.title,
      type: r.type,
      product: r.scope?.product_scope,
      asr: !!r.architectural_significance,
      impact_score: r.impact_score,
      impact_band: r.impact_band,
    });
    for (const link of r.links ?? []) {
      const t = link.target;
      if (!/^REQ-/.test(t)) {
        const kind = /^ADR-/.test(t) ? 'adr' : /^svc-/.test(t) ? 'service' : /^infra-/.test(t) ? 'infra' : /^test-/.test(t) ? 'test' : /^slo-/.test(t) ? 'slo' : 'artifact';
        addNode(t, kind);
      }
      edges.push({ from: r.id, to: t, type: link.type });
    }
    // arestas PROPOSTAS (suggested_links): não são verdade canônica; entram marcadas
    // como proposed para a UI/Claude sugerirem sem contaminar o grafo aprovado.
    for (const link of r.suggested_links ?? []) {
      const t = link.target;
      if (!/^REQ-/.test(t)) {
        const kind = /^ADR-/.test(t) ? 'adr' : /^svc-/.test(t) ? 'service' : /^infra-/.test(t) ? 'infra' : /^test-/.test(t) ? 'test' : /^slo-/.test(t) ? 'slo' : 'artifact';
        addNode(t, kind);
      }
      edges.push({ from: r.id, to: t, type: link.type, proposed: true });
    }
    // arestas de ALOCAÇÃO (requisito -> artefato externo): alimentam a cobertura e o grafo.
    const al = r.allocation || {};
    for (const field of ['adr_refs', 'service_refs', 'infra_refs', 'slo_refs', 'architecture_refs']) {
      for (const t of al[field] || []) {
        const kind = /^ADR-/.test(t) ? 'adr' : /^svc-/.test(t) ? 'service' : /^infra-/.test(t) ? 'infra' : /^slo-/.test(t) ? 'slo' : 'artifact';
        addNode(t, kind);
        edges.push({ from: r.id, to: t, type: 'allocates_to', allocation: true });
      }
    }
  }
  const impactMap = {
    metamodel_version: METAMODEL_VERSION,
    baseline_hash: baselineHash,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => (a.from + a.to + a.type).localeCompare(b.from + b.to + b.type)),
  };

  // retrieval-manifest.json (índice p/ o Claude)
  const retrieval = {
    metamodel_version: METAMODEL_VERSION,
    baseline_hash: baselineHash,
    items: reqs.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      product: r.scope?.product_scope,
      capability: r.scope?.capability ?? null,
      asr: !!r.architectural_significance,
      impact_band: r.impact_band,
      file: r._file,
    })),
  };

  // fila de reprocessamento (o que exige atenção do Claude): impacto alto, lacuna de
  // verificação (sem método OU sem evidência) ou mudança incompatível (major).
  const reprocessQueue = reqs
    .map((r) => {
      const missingMethod = !(r.verification_method ?? []).length;
      const missingEvidence = !(r.evidence_links ?? []).length;
      const isMajor = r.version?.semantic_change === 'major';
      const reasons = [];
      if (r.impact_band === 'high') reasons.push('alto impacto');
      if (missingMethod) reasons.push('sem método de verificação');
      else if (missingEvidence) reasons.push('sem evidência de verificação');
      if (isMajor) reasons.push('mudança major (incompatível)');
      return { r, reasons };
    })
    .filter((x) => x.reasons.length)
    .map(({ r, reasons }) => ({ id: r.id, title: r.title, product: r.scope?.product_scope, impact_score: r.impact_score, reasons }))
    .sort((a, b) => b.impact_score - a.impact_score);
  currentBaseline.reprocess_queue = reprocessQueue;

  return {
    'current-baseline.json': stable(currentBaseline),
    'impact-map.json': stable(impactMap),
    'retrieval-manifest.json': stable(retrieval),
    'registry.json': stable({ metamodel_version: METAMODEL_VERSION, ...registry }),
  };
}

// --- 5) escrever ou checar -----------------------------------------------------
function main() {
  const items = loadRequirements();
  const valid = validate(items);
  if (!valid) {
    console.error('\x1b[31m[specs] validação FALHOU — baseline não gerada.\x1b[0m');
    process.exit(1);
  }
  const artifacts = build(items);

  if (CHECK) {
    let drift = false;
    for (const [name, content] of Object.entries(artifacts)) {
      const p = path.join(OUT_DIR, name);
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      if (cur !== content) {
        drift = true;
        fail(`baseline desatualizada: ${path.relative(SPECS_DIR, p)} difere do regerado. Rode 'npm run build' em specs/tools e commite.`);
      }
    }
    if (drift) process.exit(1);
    console.log(`\x1b[32m[specs] OK — ${items.length} requisitos válidos; baseline em dia.\x1b[0m`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
  }
  console.log(`\x1b[32m[specs] baseline gerada: ${items.length} requisitos -> ${path.relative(SPECS_DIR, OUT_DIR)}/{current-baseline,impact-map,retrieval-manifest}.json\x1b[0m`);
}

main();
