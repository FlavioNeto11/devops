#!/usr/bin/env node
/**
 * scan-shared-resources.mjs
 * -------------------------
 * Gera o inventário de RECURSOS COMPARTILHADOS da plataforma + quem consome qual versão,
 * para o DevOps Console exibir (seção "Compartilhados") com detecção de DRIFT.
 *
 * Fonte: o repositório (este script roda no host/CI, onde packages/ e apps/ existem — os
 * serviços do console NÃO leem o repo em runtime). Saída baked na imagem do pm-api:
 *   console/pm-api/src/data/shared-resources.json
 *
 * Recursos:
 *  - npm: packages canônicos (packages/<pkg>/package.json) x consumo nos apps
 *    (apps/<app>/.../package.json com @flavioneto11 em deps/devDeps): status ok|outdated|ahead por projeto.
 *  - infra/contrato (informativo, sem drift por projeto): Helm app-template, realm Keycloak, devops.yaml.
 *
 * Uso: node scripts/scan-shared-resources.mjs   (re-rode quando bumpar/re-vendorizar uma lib)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = join(ROOT, 'packages');
const APPS_DIR = join(ROOT, 'apps');
const OUT = join(ROOT, 'console', 'pm-api', 'src', 'data', 'shared-resources.json');
const REPO = 'https://github.com/FlavioNeto11/devops/tree/main';
const SCOPE = '@flavioneto11/';
const SKIP = new Set(['node_modules', 'vendor', 'dist', '.git', '.next', 'build', 'coverage', 'artifacts']);

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function rel(p) { return p.slice(ROOT.length + 1).replace(/\\/g, '/'); }

// Versão a partir de "file:.../flavioneto11-<pkg>-<ver>.tgz" ou de um range semver (^/~/=).
function parseVersion(val) {
  if (typeof val !== 'string') return null;
  const tgz = val.match(/-(\d+\.\d+\.\d+[^/\\]*)\.tgz/);
  if (tgz) return tgz[1];
  const range = val.match(/(\d+\.\d+\.\d+[\w.-]*)/);
  return range ? range[1] : null;
}
// Compara x.y.z numericamente; null se não-parseável (evita falso drift).
function cmp(a, b) {
  const pa = String(a).split('.'); const pb = String(b).split('.');
  for (let i = 0; i < 3; i += 1) {
    const x = Number(pa[i]); const y = Number(pb[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// 1) Pacotes canônicos
const canonical = {};
if (existsSync(PKG_DIR)) {
  for (const d of readdirSync(PKG_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const pj = readJson(join(PKG_DIR, d.name, 'package.json'));
    if (pj?.name) canonical[pj.name] = { version: pj.version || '0.0.0', repoPath: `packages/${d.name}`, description: pj.description || '' };
  }
}

// 2) Consumo por app (varre package.json sob apps/<key>/)
const consumersByPkg = {};
function walk(dir, projectKey) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, projectKey);
    else if (e.name === 'package.json') {
      const pj = readJson(full);
      if (!pj) continue;
      const deps = { ...(pj.dependencies || {}), ...(pj.devDependencies || {}) };
      for (const [name, val] of Object.entries(deps)) {
        if (!name.startsWith(SCOPE)) continue;
        const ver = parseVersion(val) || '?';
        const can = canonical[name]?.version;
        let status = 'unknown';
        if (can && ver !== '?') { const c = cmp(ver, can); status = c === 0 ? 'ok' : c < 0 ? 'outdated' : c > 0 ? 'ahead' : 'unknown'; }
        (consumersByPkg[name] ||= []).push({ project: projectKey, version: ver, status, path: rel(full) });
      }
    }
  }
}
const appKeys = existsSync(APPS_DIR)
  ? readdirSync(APPS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const key of appKeys) walk(join(APPS_DIR, key), key);

// 3) Recursos npm
const resources = [];
for (const [name, meta] of Object.entries(canonical)) {
  const consumers = (consumersByPkg[name] || []).sort((a, b) => a.project.localeCompare(b.project));
  const driftCount = consumers.filter((c) => c.status === 'outdated' || c.status === 'ahead').length;
  resources.push({ name, kind: 'npm', canonicalVersion: meta.version, repoPath: meta.repoPath, repoUrl: `${REPO}/${meta.repoPath}`, description: meta.description, consumers, driftCount });
}

// 4) Infra/contrato (informativo)
function chartVersion() {
  const c = join(ROOT, 'templates', 'app-template', 'Chart.yaml');
  if (!existsSync(c)) return null;
  const m = readFileSync(c, 'utf8').match(/^version:\s*(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
const sharedConsumers = (keys) => keys.filter((k) => appKeys.includes(k)).map((p) => ({ project: p, version: '—', status: 'shared', path: '' }));
resources.push({ name: 'templates/app-template (Helm)', kind: 'infra', canonicalVersion: chartVersion() || '—', repoPath: 'templates/app-template', repoUrl: `${REPO}/templates/app-template`, description: 'Chart Helm que transforma o devops.yaml de cada app em Deployments/Services/IngressRoutes.', consumers: sharedConsumers(appKeys), driftCount: 0 });
resources.push({ name: 'Keycloak — realm nvit (SSO/OIDC)', kind: 'infra', canonicalVersion: 'nvit', repoPath: 'platform/keycloak', repoUrl: `${REPO}/platform/keycloak`, description: 'Realm OIDC compartilhado para login SSO; cada app tem seu client no mesmo realm.', consumers: sharedConsumers(['sicat', 'gymops']), driftCount: 0 });
resources.push({ name: 'Contrato devops.yaml', kind: 'contract', canonicalVersion: '—', repoPath: 'docs/new-project-contract.md', repoUrl: 'https://github.com/FlavioNeto11/devops/blob/main/docs/new-project-contract.md', description: 'Schema declarativo (roteamento/serviços) de cada app, consumido pela esteira de deploy.', consumers: sharedConsumers(appKeys), driftCount: 0 });

const out = { generatedAt: new Date().toISOString(), resources };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

console.log(`[scan-shared] ${resources.length} recursos -> ${rel(OUT)}`);
for (const r of resources) {
  console.log(`  - ${r.name} (${r.kind}) v${r.canonicalVersion} · ${r.consumers.length} consumidor(es)${r.driftCount ? ` · DRIFT ${r.driftCount}` : ''}`);
}
