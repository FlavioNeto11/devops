#!/usr/bin/env node
/**
 * Scanner de segredos para arquivos VERSIONADOS (git ls-files), com BASELINE.
 *
 * - Detecta credenciais reais (CNPJ/CPF/e-mail/senha CETESB), JWTs e campos de
 *   senha em JSON/HAR em arquivos rastreados.
 * - NÃO imprime valores sensíveis — apenas rótulo + caminhos.
 * - Literais sensíveis vêm de `.env.e2e` (não versionado) quando presente.
 * - BASELINE (`scripts/security/secrets-baseline.json`, só caminhos): achados já
 *   conhecidos/pré-existentes são tolerados; o gate falha apenas em achados NOVOS.
 *   Isso permite plugar o gate no CI sem bloquear por exposições legadas, enquanto
 *   impede regressões. À medida que a remediação avança, rode `--update-baseline`.
 *
 * Uso:
 *   node scripts/security/scan-secrets.mjs               # gate (falha só em novos)
 *   node scripts/security/scan-secrets.mjs --update-baseline
 *   node scripts/security/scan-secrets.mjs --all         # ignora baseline (auditoria)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = resolve(ROOT, 'scripts/security/secrets-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const ALL = process.argv.includes('--all');
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.har', '.yaml', '.yml', '.js', '.mjs', '.cjs', '.ts', '.vue', '.ps1', '.sh', '.env', '.example']);
const MAX_BYTES = 3 * 1024 * 1024;

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0 && process.env[t.slice(0, i).trim()] === undefined) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadDotenv(resolve(ROOT, '.env.e2e'));

const literals = [
  ['CNPJ_EMPRESA', process.env.CETESB_COMPANY_DOCUMENT],
  ['CPF_USUARIO', process.env.CETESB_USER_CPF],
  ['EMAIL_CETESB', process.env.CETESB_USER_EMAIL],
  ['SENHA_CETESB', process.env.CETESB_USER_PASSWORD],
  ['NOME_CETESB', process.env.CETESB_USER_NAME]
].filter(([, v]) => v && String(v).trim().length >= 4);

const patterns = [
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['campo_senha_json', /"(?:senha|password|parSenha|usuSenha)"\s*:\s*"[^"]{3,}"/i]
];

const categories = [...literals.map(([k]) => k), ...patterns.map(([k]) => k)];

let trackedFiles = [];
try {
  trackedFiles = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error('[scan-secrets] git ls-files falhou:', e?.message || e);
  process.exit(2);
}

// Coleta achados por categoria -> Set de arquivos
const hits = new Map(categories.map((k) => [k, new Set()]));
for (const rel of trackedFiles) {
  if (!TEXT_EXT.has(extname(rel).toLowerCase())) continue;
  const abs = resolve(ROOT, rel);
  try {
    if (!existsSync(abs) || statSync(abs).size > MAX_BYTES) continue;
    const content = readFileSync(abs, 'utf8');
    for (const [k, v] of literals) if (content.includes(v)) hits.get(k).add(rel);
    for (const [k, rx] of patterns) if (rx.test(content)) hits.get(k).add(rel);
  } catch { /* binário/erro */ }
}

// --update-baseline: grava só caminhos (sem valores sensíveis)
if (UPDATE) {
  const out = {};
  for (const k of categories) out[k] = [...hits.get(k)].sort();
  writeFileSync(BASELINE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Apenas caminhos de arquivos com exposição conhecida/pré-existente. Sem valores sensíveis. Reduza ao remediar.', files: out }, null, 2) + '\n');
  const total = categories.reduce((a, k) => a + hits.get(k).size, 0);
  console.log(`[scan-secrets] baseline atualizado: ${BASELINE_PATH} (${total} ocorrências arquivo×categoria).`);
  process.exit(0);
}

// Carrega baseline
let baseline = {};
if (!ALL && existsSync(BASELINE_PATH)) {
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files || {}; } catch {}
}
const inBaseline = (cat, file) => Array.isArray(baseline[cat]) && baseline[cat].includes(file);

let baselined = 0;
let novos = 0;
const novosList = [];
console.log('=== Scanner de segredos (arquivos versionados) ===');
console.log(`Arquivos de texto analisados: ${trackedFiles.filter((f) => TEXT_EXT.has(extname(f).toLowerCase())).length} | baseline: ${ALL ? 'IGNORADO (--all)' : (existsSync(BASELINE_PATH) ? 'ativo' : 'ausente')}`);
for (const k of categories) {
  const files = [...hits.get(k)].sort();
  const news = files.filter((f) => !inBaseline(k, f));
  baselined += files.length - news.length;
  if (news.length) { novos += news.length; novosList.push([k, news]); }
  const tag = news.length ? '⚠️ NOVOS' : (files.length ? '· baselined' : '✅');
  console.log(`  ${tag.padEnd(12)} ${k}: ${files.length} (novos: ${news.length})`);
}

if (novos > 0) {
  console.log('\n[!] EXPOSIÇÕES NOVAS (fora do baseline) — corrija antes de commitar/pushar:');
  for (const [k, files] of novosList) { console.log(`  ${k}:`); for (const f of files.slice(0, 20)) console.log(`     - ${f}`); }
  console.log('\nSe forem legítimas e inevitáveis, rode: node scripts/security/scan-secrets.mjs --update-baseline');
  process.exit(1);
}
console.log(`\nOK: nenhuma exposição NOVA. (${baselined} ocorrências pré-existentes toleradas via baseline — ver docs/security/credential-exposure-runbook.md)`);
