#!/usr/bin/env node
// validate-portal-contract.mjs — validador dependency-free dos contratos canônicos de portal.
//
// Molde: apps/sicat/backend/scripts/ai-smoke/validate-sicat-chat-catalog.mjs (Node puro, sem deps).
// Itera docs/portal-contracts/<portal>/, resolve a versão por LATEST, e para cada `endpoints.jsonl`:
//   - parse JSONL (linha a linha; dedup por id E por método+path)
//   - valida o shape de cada endpoint
//   - recomputa o content_hash canônico e compara com o manifest.json
//   - coverage por grupo funcional (warning) + anti-baixa-confiança (sample_count<3 → warning)
// Saída: relatório MD+JSON em artifacts/portal-contracts/; process.exitCode=1 se houver erro.
//
// Flags:
//   --portal <slug>   valida só um portal
//   --write-hash      recomputa e REGRAVA o content_hash de cada manifest (carimbo), sem validar hash
//   --json-only       não escreve o MD

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACTS_DIR = path.join(ROOT, 'docs', 'portal-contracts');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts', 'portal-contracts');
const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const TOKEN_MODES = new Set(['none', 'authorization', 'x-access-token', 'both']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/u;
const LOW_CONFIDENCE_SAMPLES = 3;

const args = process.argv.slice(2);
const portalFilter = readFlagValue(args, '--portal');
const writeHash = args.includes('--write-hash');
const jsonOnly = args.includes('--json-only');

function readFlagValue(list, flag) {
  const i = list.indexOf(flag);
  return i >= 0 ? list[i + 1] : null;
}

// ── hash canônico (chaves ordenadas recursivamente) ────────────────────────
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function contentHashOfEndpoints(records) {
  const canonical = records.map((r) => JSON.stringify(canonicalize(r))).join('\n');
  return `sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

// ── parsing ────────────────────────────────────────────────────────────────
function parseEndpointsJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const issues = [];
  const records = [];
  const ids = new Map();
  const methodPaths = new Map();

  let lastContentLine = 0;
  for (let i = 0; i < lines.length; i += 1) if (lines[i].trim()) lastContentLine = i + 1;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (lineNumber < lastContentLine) {
        issues.push({ severity: 'error', filePath, line: lineNumber, code: 'BLANK_LINE_INSIDE_FILE', message: 'Linha vazia no meio do arquivo.' });
      }
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      issues.push({ severity: 'error', filePath, line: lineNumber, code: 'INVALID_JSONL_LINE', message: `JSON inválido: ${error.message}` });
      continue;
    }
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (id) {
      if (ids.has(id)) issues.push({ severity: 'error', filePath, line: lineNumber, code: 'DUPLICATE_ID', message: `ID duplicado: ${id}` });
      else ids.set(id, lineNumber);
    }
    const mp = `${String(parsed.method || '').toUpperCase()} ${parsed.path_template || ''}`;
    if (parsed.method && parsed.path_template) {
      if (methodPaths.has(mp)) issues.push({ severity: 'error', filePath, line: lineNumber, code: 'DUPLICATE_METHOD_PATH', message: `método+path duplicado: ${mp}` });
      else methodPaths.set(mp, lineNumber);
    }
    records.push({ lineNumber, data: parsed });
  }
  return { issues, records };
}

function validateEndpointShape(filePath, entry) {
  const { lineNumber, data } = entry;
  const out = [];
  const err = (code, message) => out.push({ severity: 'error', filePath, line: lineNumber, code, message });
  const warn = (code, message) => out.push({ severity: 'warning', filePath, line: lineNumber, code, message });

  const id = typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) err('EMPTY_ID', 'id ausente.');
  else if (!ID_RE.test(id)) err('UNSTABLE_ID_FORMAT', `id fora do padrão: ${id}`);

  if (!data.group) err('EMPTY_GROUP', 'group ausente.');
  if (!data.title) err('EMPTY_TITLE', 'title ausente.');

  const method = String(data.method || '').toUpperCase();
  if (!METHODS.has(method)) err('INVALID_METHOD', `method inválido: ${data.method}`);

  const pathTemplate = typeof data.path_template === 'string' ? data.path_template : '';
  if (!pathTemplate.startsWith('/')) err('INVALID_PATH_TEMPLATE', 'path_template deve começar com "/".');

  // params declarados ⇔ params no template
  const templateParams = [...pathTemplate.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const declared = Array.isArray(data.path_params) ? data.path_params.map((p) => p && p.name).filter(Boolean) : [];
  if (!Array.isArray(data.path_params)) err('INVALID_PATH_PARAMS', 'path_params deve ser array.');
  for (const p of templateParams) if (!declared.includes(p)) err('UNDECLARED_PATH_PARAM', `{${p}} no template sem entrada em path_params.`);
  for (const p of declared) if (!templateParams.includes(p)) err('ORPHAN_PATH_PARAM', `path_param "${p}" não aparece no template.`);

  const auth = data.auth || {};
  if (typeof auth.required !== 'boolean') err('INVALID_AUTH_REQUIRED', 'auth.required deve ser boolean.');
  if (!TOKEN_MODES.has(auth.token_header_mode)) err('INVALID_TOKEN_HEADER_MODE', `auth.token_header_mode inválido: ${auth.token_header_mode}`);

  if (!data.request || typeof data.request.schema !== 'object') err('MISSING_REQUEST_SCHEMA', 'request.schema ausente.');
  if (!data.response || typeof data.response.schema !== 'object') err('MISSING_RESPONSE_SCHEMA', 'response.schema ausente.');

  if (typeof data.requires_captcha !== 'boolean') err('MISSING_REQUIRES_CAPTCHA', 'requires_captcha deve ser boolean.');

  const obs = data.observability || {};
  if (!Number.isInteger(obs.sample_count) || obs.sample_count < 1) err('INVALID_SAMPLE_COUNT', 'observability.sample_count deve ser inteiro >= 1.');
  else if (obs.sample_count < LOW_CONFIDENCE_SAMPLES) warn('LOW_CONFIDENCE_ENDPOINT', `sample_count=${obs.sample_count} (< ${LOW_CONFIDENCE_SAMPLES}): baixa confiança.`);

  return out;
}

function validateManifest(versionDir, records) {
  const manifestPath = path.join(versionDir, 'manifest.json');
  const issues = [];
  if (!fs.existsSync(manifestPath)) {
    issues.push({ severity: 'error', filePath: manifestPath, code: 'MISSING_MANIFEST', message: 'manifest.json ausente.' });
    return { issues, manifestPath, manifest: null };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    issues.push({ severity: 'error', filePath: manifestPath, code: 'INVALID_MANIFEST_JSON', message: error.message });
    return { issues, manifestPath, manifest: null };
  }
  const recomputed = contentHashOfEndpoints(records.map((r) => r.data));
  if (manifest.endpoint_count !== records.length) {
    issues.push({ severity: 'error', filePath: manifestPath, code: 'ENDPOINT_COUNT_MISMATCH', message: `endpoint_count=${manifest.endpoint_count} mas há ${records.length} endpoints.` });
  }
  if (writeHash) {
    manifest.content_hash = recomputed;
    manifest.endpoint_count = records.length;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else if (manifest.content_hash !== recomputed) {
    issues.push({ severity: 'error', filePath: manifestPath, code: 'CONTENT_HASH_MISMATCH', message: `content_hash não bate (esperado ${recomputed}). Rode --write-hash após editar endpoints.jsonl.` });
  }
  return { issues, manifestPath, manifest, recomputed };
}

function resolveVersionDir(portalDir) {
  const latestFile = path.join(portalDir, 'LATEST');
  if (!fs.existsSync(latestFile)) return null;
  const version = fs.readFileSync(latestFile, 'utf8').trim();
  const dir = path.join(portalDir, version);
  return fs.existsSync(dir) ? { version, dir } : null;
}

function listPortals() {
  if (!fs.existsSync(CONTRACTS_DIR)) return [];
  return fs.readdirSync(CONTRACTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'schema')
    .map((d) => d.name)
    .filter((slug) => !portalFilter || slug === portalFilter);
}

// ── run ──────────────────────────────────────────────────────────────────
const report = { generatedAt: new Date().toISOString(), portals: [], issues: [] };

for (const portal of listPortals()) {
  const portalDir = path.join(CONTRACTS_DIR, portal);
  const resolved = resolveVersionDir(portalDir);
  if (!resolved) {
    report.issues.push({ severity: 'error', filePath: portalDir, code: 'NO_LATEST_VERSION', message: `Portal ${portal} sem LATEST válido.` });
    continue;
  }
  const endpointsPath = path.join(resolved.dir, 'endpoints.jsonl');
  if (!fs.existsSync(endpointsPath)) {
    report.issues.push({ severity: 'error', filePath: endpointsPath, code: 'MISSING_ENDPOINTS', message: 'endpoints.jsonl ausente.' });
    continue;
  }
  const { issues: parseIssues, records } = parseEndpointsJsonl(endpointsPath);
  const shapeIssues = records.flatMap((r) => validateEndpointShape(endpointsPath, r));
  const { issues: manifestIssues, manifest } = validateManifest(resolved.dir, records);

  const groups = new Set(records.map((r) => r.data.group).filter(Boolean));
  const portalIssues = [...parseIssues, ...shapeIssues, ...manifestIssues];
  report.portals.push({ portal, version: resolved.version, endpointCount: records.length, groups: [...groups], hasManifest: Boolean(manifest) });
  report.issues.push(...portalIssues);
}

const errors = report.issues.filter((i) => i.severity === 'error');
const warnings = report.issues.filter((i) => i.severity === 'warning');
report.ok = errors.length === 0;
report.summary = { portals: report.portals.length, errors: errors.length, warnings: warnings.length };

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
const stamp = report.generatedAt.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(ARTIFACTS_DIR, `validate-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`);
if (!jsonOnly) {
  const md = [
    `# Validação de contratos de portal — ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    `Portais: ${report.summary.portals} · erros: ${report.summary.errors} · warnings: ${report.summary.warnings}`,
    '',
    ...report.portals.map((p) => `- **${p.portal}** \`${p.version}\` — ${p.endpointCount} endpoints (${p.groups.join(', ')})`),
    '',
    ...(report.issues.length ? ['## Achados', '', ...report.issues.map((i) => `- [${i.severity}] \`${i.code}\` ${i.filePath}${i.line ? `:${i.line}` : ''} — ${i.message}`)] : ['Sem achados.']),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `validate-${stamp}.md`), md);
}

console.log(`Validação de contratos: ${report.ok ? 'PASS' : 'FAIL'} (${report.summary.errors} erros, ${report.summary.warnings} warnings)`);
for (const i of errors) console.error(`  [error] ${i.code} ${i.filePath}${i.line ? `:${i.line}` : ''} — ${i.message}`);
if (writeHash) console.log('content_hash carimbado nos manifests.');
if (!report.ok) process.exitCode = 1;
