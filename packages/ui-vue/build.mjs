// =============================================================================
// build.mjs — sincroniza o KIT @flavioneto11/ui-vue (src/**) para DENTRO de cada app web
// gerado pela Forja, em apps/<app>/frontend/src/ui/**. Mesmo idioma de
// design-tokens/platform-shell: o app builda em contexto Docker isolado e não alcança
// packages/, então o kit vai por codegen-sync + drift-check. Determinístico.
//
// Também roda um GREP-GATE de CSP: nenhum .vue do kit pode ter `style=`/`:style`/`v-html`.
//
// Uso:  node build.mjs           # escreve o kit nos apps web + valida CSP
//       node build.mjs --check   # NÃO escreve; exit 1 se algum estiver desatualizado/CSP
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(__dirname, 'src');
const CHECK = process.argv.includes('--check');
const NOTE = 'SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.';

// ---- coleta recursiva dos arquivos do kit ----
function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return out;
}
const KIT_FILES = walk(SRC);

// ---- grep-gate de CSP (no FONTE do kit) ----
function cspViolations() {
  const bad = [];
  for (const rel of KIT_FILES) {
    if (!rel.endsWith('.vue')) continue;
    const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
    if (/\sstyle\s*=/.test(raw) || /:style\b/.test(raw)) bad.push(rel + ' (style inline)');
    if (/v-html\b/.test(raw)) bad.push(rel + ' (v-html)');
  }
  return bad;
}

// ---- conteúdo a sincronizar (com nota de origem onde for seguro) ----
function bodyFor(rel) {
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
  if (rel.endsWith('.css')) return '/* ' + NOTE + ' */\n' + raw;
  if (rel.endsWith('.js')) return '// ' + NOTE + '\n' + raw;
  if (rel.endsWith('.vue')) return '<!-- ' + NOTE + ' -->\n' + raw;
  return raw;
}

// ---- descobre apps web gerados (produto interfaces:web + frontend já existe) ----
function discoverApps() {
  const apps = [];
  const prodDir = path.join(REPO, 'specs', 'products');
  if (!fs.existsSync(prodDir)) return apps;
  for (const name of fs.readdirSync(prodDir).sort()) {
    const pj = path.join(prodDir, name, 'product.json');
    if (!fs.existsSync(pj)) continue;
    let product; try { product = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { continue; }
    const interfaces = Array.isArray(product.interfaces) ? product.interfaces : ['api'];
    if (!interfaces.includes('web')) continue;
    const app = product.name || name;
    if (fs.existsSync(path.join(REPO, 'apps', app, 'frontend', 'src'))) apps.push(app);
  }
  return apps;
}

// ---- CSP primeiro (sempre bloqueia) ----
const violations = cspViolations();
if (violations.length) {
  console.error('\x1b[31m[ui-vue] CSP: ' + violations.length + ' violação(ões):\x1b[0m');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}

const apps = discoverApps();
let drift = false, count = 0;
for (const app of apps) {
  for (const rel of KIT_FILES) {
    count++;
    const content = bodyFor(rel);
    const abs = path.join(REPO, 'apps', app, 'frontend', 'src', 'ui', rel);
    if (CHECK) {
      const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (cur !== content) { drift = true; console.error(`\x1b[31m[ui-vue] desatualizado: apps/${app}/frontend/src/ui/${rel}\x1b[0m`); }
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
  if (!CHECK) console.log(`[ui-vue] kit -> apps/${app}/frontend/src/ui/ (${KIT_FILES.length} arquivos)`);
}
if (CHECK) {
  if (drift) process.exit(1);
  console.log(`\x1b[32m[ui-vue] OK — CSP limpo; ${count} arquivo(s) em ${apps.length} app(s) em dia.\x1b[0m`);
} else {
  console.log(`[ui-vue] CSP limpo; ${apps.length} app(s) sincronizado(s).`);
}
