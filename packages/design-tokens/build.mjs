// =============================================================================
// build.mjs — gera, por MARCA, o arquivo de tokens SINCRONIZADO dentro de cada app
// (src/tokens.generated.css). Fonte única: tokens.json. Cada app builda em contexto
// Docker isolado (não alcança packages/), por isso o token vai por codegen-sync +
// drift-check (mesmo idioma da baseline de specs/). Determinístico.
//
// Uso:  node build.mjs           # escreve os *.generated.css
//       node build.mjs --check   # NÃO escreve; exit 1 se algum estiver desatualizado
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveForgeTokensCss, DEFAULT_BRAND } from './forge-brand.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json'), 'utf8'));
const CHECK = process.argv.includes('--check');

// marca -> diretório-alvo (app que consome). Apps Vite standalone: o arquivo vai p/ src/.
const TARGETS = {
  rmambiental: 'apps/rmambiental/src/tokens.generated.css',
  anarabottini: 'apps/anarabottini/src/tokens.generated.css',
};

// ---- apps web GERADOS pela Forja (marca própria via brand.json, tokens --ui-*) ---------------
// Descoberta determinística: todo produto com interfaces incluindo "web" cujo frontend já existe
// no disco. A marca vem de specs/products/<app>/brand.json (ou DEFAULT_BRAND se ausente). Assim o
// drift-gate (`--check`) passa a cobrir os apps gerados sem mudança no workflow.
function discoverForgeApps() {
  const out = [];
  const prodDir = path.join(REPO, 'specs', 'products');
  if (!fs.existsSync(prodDir)) return out;
  for (const name of fs.readdirSync(prodDir).sort()) {
    const pj = path.join(prodDir, name, 'product.json');
    if (!fs.existsSync(pj)) continue;
    let product;
    try { product = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { continue; }
    const interfaces = Array.isArray(product.interfaces) ? product.interfaces : ['api'];
    if (!interfaces.includes('web')) continue;
    const app = product.name || name;
    const feSrc = path.join(REPO, 'apps', app, 'frontend', 'src');
    if (!fs.existsSync(feSrc)) continue; // só apps cujo frontend já foi scaffoldado
    const bp = path.join(prodDir, name, 'brand.json');
    let brand = { ...DEFAULT_BRAND, name: product.display_name || app };
    if (fs.existsSync(bp)) { try { brand = { ...brand, ...JSON.parse(fs.readFileSync(bp, 'utf8')) }; } catch {} }
    out.push({ app, brand, rel: path.join('apps', app, 'frontend', 'src', 'tokens.generated.css').replace(/\\/g, '/') });
  }
  return out;
}

function colorBlock(selector, colorScheme, colors, brand, withParams) {
  const order = ['bg', 'surface', 'surface2', 'fg', 'muted', 'neon', 'on-neon', ...brand.secondaryKeys, 'ink'];
  const lines = [`${selector} {`, `  color-scheme: ${colorScheme};`];
  for (const k of order) {
    if (colors[k] === undefined) throw new Error(`marca ${brand.label}: cor "${k}" ausente em ${selector}`);
    lines.push(`  --${k}: ${colors[k]};`);
  }
  if (withParams) {
    // parâmetros de componente (gradiente/sombra/alphas) — deixam o @layer de componentes
    // IDÊNTICO entre apps; a nuance de marca vive aqui.
    lines.push(`  --gradient-brand: ${brand.gradient};`);
    lines.push(`  --btn-brightness: ${brand.btn.brightness};`);
    lines.push(`  --btn-shadow-alpha: ${brand.btn.shadowAlpha};`);
    lines.push(`  --btn-ghost-hover-border-alpha: ${brand.btn.ghostHoverBorderAlpha};`);
    lines.push(`  --btn-ghost-hover-bg-alpha: ${brand.btn.ghostHoverBgAlpha};`);
    lines.push(`  --scrollbar-thumb-alpha: ${brand.scrollbarThumbAlpha};`);
    lines.push(`  --scrollbar-thumb-hover-alpha: ${brand.scrollbarThumbHoverAlpha};`);
    lines.push(`  --selection-alpha: ${brand.selectionAlpha};`);
    lines.push(`  --glass-bg-alpha: ${brand.glassBgAlpha};`);
    lines.push(`  --glass-border-alpha: ${brand.glassBorderAlpha};`);
    lines.push(`  --tech-grid-alpha: ${brand.techGridAlpha};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function render(brandKey) {
  const brand = tokens.brands[brandKey];
  const out = [];
  out.push(`/* GERADO por packages/design-tokens/build.mjs — marca: ${brandKey} (${brand.label}).`);
  out.push(`   NÃO EDITAR À MÃO: edite packages/design-tokens/tokens.json e rode \`node build.mjs\`.`);
  out.push(`   CI valida drift com \`node build.mjs --check\`. */`);
  out.push(colorBlock(':root', 'light', brand.light, brand, true));
  if (brand.dark) out.push('', colorBlock('.dark', 'dark', brand.dark, brand, false));
  out.push('');
  out.push('html { scroll-behavior: smooth; }');
  out.push(`section[id] { scroll-margin-top: ${tokens.structural.scrollMarginTop}; }`);
  out.push('::selection { background: rgb(var(--neon) / var(--selection-alpha)); }');
  out.push('::-webkit-scrollbar { width: 10px; height: 10px; }');
  out.push('::-webkit-scrollbar-track { background: rgb(var(--bg)); }');
  out.push('::-webkit-scrollbar-thumb { background: rgb(var(--fg) / var(--scrollbar-thumb-alpha)); border-radius: 8px; }');
  out.push('::-webkit-scrollbar-thumb:hover { background: rgb(var(--fg) / var(--scrollbar-thumb-hover-alpha)); }');
  return out.join('\n') + '\n';
}

// alvos: marcas hand-authored (tokens.json) + apps web gerados (brand.json -> --ui-*)
const jobs = [
  ...Object.entries(TARGETS).map(([brandKey, rel]) => ({ label: brandKey, rel, content: render(brandKey) })),
  ...discoverForgeApps().map(({ app, brand, rel }) => ({ label: 'forge:' + app, rel, content: deriveForgeTokensCss(brand) })),
];

let drift = false;
for (const { label, rel, content } of jobs) {
  const abs = path.join(REPO, rel);
  if (CHECK) {
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (cur !== content) { drift = true; console.error(`\x1b[31m[design-tokens] desatualizado: ${rel} — rode \`node build.mjs\` e commite.\x1b[0m`); }
  } else {
    fs.writeFileSync(abs, content);
    console.log(`[design-tokens] ${label} -> ${rel}`);
  }
}
if (CHECK) {
  if (drift) process.exit(1);
  console.log(`\x1b[32m[design-tokens] OK — ${jobs.length} alvo(s) em dia.\x1b[0m`);
}
