// vendor-kits.mjs — vendora kits @flavioneto11 (ESM puros, em packages/) como .tgz dentro de
// apps/<app>/api/vendor/, resolvendo a CADEIA transitiva de @flavioneto11 (ex.: ai-core → ai-kit).
// Por quê: o build da imagem da api tem contexto = apps/<app>/api, sem acesso a packages/. Kits
// precisam estar VENDORADOS (file:vendor/*.tgz) + COPY vendor no Dockerfile. Helper compartilhado
// pelo scaffold (e re-executável). Puro o suficiente: kitDeps() só lê package.json; packKits() roda npm pack.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PKG_DIR = path.join(REPO_ROOT, 'packages');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Kits que vivem SÓ no frontend (design system / casca) — nunca vão para o vendor da API.
const FRONTEND_ONLY = new Set(['design-tokens', 'platform-shell', 'ui-vue', 'ui-react']);

/** 'packages/ai-core' | '@flavioneto11/ai-core' | 'ai-core' -> 'ai-core' (nome curto do pacote). */
export function shortName(ref) {
  return String(ref || '').replace(/^packages\//, '').replace(/^@flavioneto11\//, '').trim();
}

function pkgJsonOf(short) {
  const p = path.join(PKG_DIR, short, 'package.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Resolve a CADEIA de kits @flavioneto11 da API (entradas + transitivos via package.json),
 *  filtrando kits frontend e refs sem package.json. Retorna nomes curtos, determinístico. */
export function resolveKitChain(refs) {
  const want = (Array.isArray(refs) ? refs : []).map(shortName).filter((s) => s && !FRONTEND_ONLY.has(s));
  const out = [];
  const seen = new Set();
  const visit = (short) => {
    if (seen.has(short) || FRONTEND_ONLY.has(short)) return;
    const pj = pkgJsonOf(short);
    if (!pj) return; // ref sem pacote local (ex.: lib externa) — ignora
    seen.add(short);
    const deps = { ...(pj.dependencies || {}), ...(pj.peerDependencies || {}) };
    for (const d of Object.keys(deps)) if (d.startsWith('@flavioneto11/')) visit(shortName(d));
    out.push(short); // pós-ordem: dependências antes dos dependentes (irrelevante p/ npm, mas estável)
  };
  for (const s of want) visit(s);
  return out;
}

/** Mapa de dependências file:vendor/*.tgz para o package.json (sem empacotar — só lê versões). */
export function kitDeps(refs) {
  const deps = {};
  for (const short of resolveKitChain(refs)) {
    const pj = pkgJsonOf(short);
    deps[`@flavioneto11/${short}`] = `file:vendor/flavioneto11-${short}-${pj.version}.tgz`;
  }
  return deps;
}

/** Empacota (npm pack) cada kit da cadeia em <apiDir>/vendor/. Retorna os arquivos gerados. */
export function packKits(apiDir, refs) {
  const chain = resolveKitChain(refs);
  if (!chain.length) return [];
  const vendorDir = path.join(apiDir, 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });
  const files = [];
  for (const short of chain) {
    // shell:true — no Windows, npm.cmd (arquivo .cmd) só roda via shell (senão spawnSync dá EINVAL).
    const out = execFileSync(NPM, ['pack', path.join(PKG_DIR, short), '--pack-destination', vendorDir, '--json'], { encoding: 'utf8', cwd: REPO_ROOT, shell: true });
    let fn;
    try { fn = JSON.parse(out)[0].filename; } catch { fn = String(out).trim().split(/\s+/).pop(); }
    files.push(fn);
  }
  return files;
}

// CLI: node vendor-kits.mjs <apiDir> <ref...>  (ex.: node vendor-kits.mjs apps/x/api packages/ai-core)
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [apiDir, ...refs] = process.argv.slice(2);
  if (!apiDir) { console.error('uso: node vendor-kits.mjs <apiDir> <ref...>'); process.exit(2); }
  const files = packKits(apiDir, refs);
  console.log(`[vendor-kits] ${files.length} kit(s) em ${path.join(apiDir, 'vendor')}: ${files.join(', ')}`);
}
