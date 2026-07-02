#!/usr/bin/env node
// write-promoted-contract.mjs — materializa no repo um contrato canônico promovido pelo
// portal-recorder (workflow portal-contract-promote.yml, event portal-contract-promote).
//
// FAIL-CLOSED: valida o client_payload ANTES de escrever qualquer arquivo —
//   - portal_slug ^[a-z][a-z0-9-]{1,30}$ e version ^\d{4}-\d{2}-\d{2}$ (sem path traversal)
//   - export.manifest coerente (portal/version/endpoint_count) com export.endpoints
//   - NENHUM sample_request/sample_response (samples não entram no git — inflam tokens/risco)
//   - content_hash recomputado (algoritmo canônico do validate-portal-contract.mjs) bate
//   - ids e método+path únicos
// Depois escreve docs/portal-contracts/<slug>/<version>/{manifest.json,endpoints.jsonl}
// e atualiza LATEST (promoção = vira a versão ativa; o validador do repo valida a LATEST).
//
// Dependency-free (node puro). Uso:
//   node scripts/portal-contracts/write-promoted-contract.mjs --payload promote-payload.json

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/;
const CONTRACTS_DIR = path.join(process.cwd(), 'docs', 'portal-contracts');

function die(message) {
  console.error(`[write-promoted-contract] ERRO: ${message}`);
  process.exit(1);
}

// hash canônico — idêntico a scripts/portal-contracts/validate-portal-contract.mjs
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

// ── payload ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const payloadIdx = args.indexOf('--payload');
const payloadPath = payloadIdx >= 0 ? args[payloadIdx + 1] : null;
if (!payloadPath || !fs.existsSync(payloadPath)) die('use --payload <arquivo.json> (client_payload do repository_dispatch)');

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} catch (e) {
  die(`payload não é JSON válido: ${e.message}`);
}

const slug = String(payload.portal_slug || '');
if (!SLUG_RE.test(slug)) die(`portal_slug inválido: '${slug}' (esperado ${SLUG_RE})`);
const version = String(payload.version || '');
if (!VERSION_RE.test(version)) die(`version inválida: '${version}' (esperado yyyy-mm-dd)`);

const exp = payload.export;
if (!exp || typeof exp !== 'object' || Array.isArray(exp)) die('export ausente no payload');
const manifest = exp.manifest;
const endpoints = exp.endpoints;
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) die('export.manifest ausente');
if (!Array.isArray(endpoints) || endpoints.length === 0) die('export.endpoints deve ser array não-vazio');

// ── coerência manifest ↔ payload ↔ endpoints ─────────────────────────────────
if (manifest.portal !== slug) die(`manifest.portal ('${manifest.portal}') difere de portal_slug ('${slug}')`);
if (manifest.version !== version) die(`manifest.version ('${manifest.version}') difere de version ('${version}')`);
if (manifest.endpoint_count !== endpoints.length) die(`manifest.endpoint_count (${manifest.endpoint_count}) difere do nº de endpoints (${endpoints.length})`);

const ids = new Set();
const methodPaths = new Set();
for (const [i, ep] of endpoints.entries()) {
  const at = `endpoints[${i}]`;
  if (!ep || typeof ep !== 'object' || Array.isArray(ep)) die(`${at} não é objeto`);
  if ('sample_request' in ep || 'sample_response' in ep) die(`${at} carrega samples — samples NÃO entram no git (promova um export canônico)`);
  if (!ID_RE.test(String(ep.id || ''))) die(`${at}.id inválido: '${ep.id}'`);
  if (ids.has(ep.id)) die(`${at}.id duplicado: '${ep.id}'`);
  ids.add(ep.id);
  const mp = `${String(ep.method || '').toUpperCase()} ${ep.path_template || ''}`;
  if (methodPaths.has(mp)) die(`${at}: método+path duplicado: '${mp}'`);
  methodPaths.add(mp);
  if (!String(ep.path_template || '').startsWith('/')) die(`${at}.path_template deve começar com '/'`);
}

const recomputed = contentHashOfEndpoints(endpoints);
if (manifest.content_hash !== recomputed) {
  die(`content_hash não bate (manifest=${manifest.content_hash}, recomputado=${recomputed}) — payload adulterado ou serialização divergente`);
}

// ── escrita (só depois de TUDO validado) ─────────────────────────────────────
const versionDir = path.join(CONTRACTS_DIR, slug, version);
fs.mkdirSync(versionDir, { recursive: true });
fs.writeFileSync(path.join(versionDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(versionDir, 'endpoints.jsonl'), `${endpoints.map((e) => JSON.stringify(e)).join('\n')}\n`);
fs.writeFileSync(path.join(CONTRACTS_DIR, slug, 'LATEST'), `${version}\n`);

console.log(`[write-promoted-contract] ok: docs/portal-contracts/${slug}/${version}/ (${endpoints.length} endpoints) + LATEST=${version}`);
