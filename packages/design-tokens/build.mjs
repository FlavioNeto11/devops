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
import { renderSicatCss, renderSicatVuetifyTheme } from './renderers/sicat.mjs';
import { renderPlatformTokensBlock } from './renderers/platform.mjs';

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
    // Produtos ADOTADOS (brownfield, ex.: sicat/gymops) têm frontend pré-Forja com tokens
    // artesanais próprios — o codegen NÃO deve sobrescrevê-los com a marca default da Forja.
    if (product.origin === 'adopted') continue;
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
  out.push('@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }');
  out.push(`section[id] { scroll-margin-top: ${tokens.structural.scrollMarginTop}; }`);
  out.push('::selection { background: rgb(var(--neon) / var(--selection-alpha)); }');
  out.push('::-webkit-scrollbar { width: 10px; height: 10px; }');
  out.push('::-webkit-scrollbar-track { background: rgb(var(--bg)); }');
  out.push('::-webkit-scrollbar-thumb { background: rgb(var(--fg) / var(--scrollbar-thumb-alpha)); border-radius: 8px; }');
  out.push('::-webkit-scrollbar-thumb:hover { background: rgb(var(--fg) / var(--scrollbar-thumb-hover-alpha)); }');
  return out.join('\n') + '\n';
}

// ---- marcas de apps ADOTADOS (brownfield) — OPT-IN explícito por marca ----------------------
// discoverForgeApps() PULA produtos `origin: adopted` de propósito (frontend pré-Forja com
// tokens artesanais); a adoção acontece AQUI, com renderer próprio por marca que TRANSCREVE a
// paleta atual do app (zero mudança visual). Fonte dos valores: tokens.json (brands.<app>).
function adoptedJobs() {
  const out = [];
  if (tokens.brands.sicat) {
    out.push({ label: 'adopted:sicat (css)', rel: 'apps/sicat/frontend/src/styles/tokens.generated.css', content: renderSicatCss(tokens.brands.sicat) });
    out.push({ label: 'adopted:sicat (vuetify)', rel: 'apps/sicat/frontend/src/plugins/vuetify-theme.generated.js', content: renderSicatVuetifyTheme(tokens.brands.sicat) });
  }
  return out;
}

// ---- marca da PLATAFORMA (casca global) ------------------------------------------------------
// A paleta neutra `--p-*` da casca (packages/platform-shell/platform-tokens.css) também nasce
// daqui (marca "platform") — elimina a manutenção manual dupla dos mesmos valores. O alvo é o
// ARQUIVO-FONTE do codegen da casca (não uma cópia dentro de apps/): este build gera o bloco
// entre marcadores e DEPOIS o platform-shell/build.mjs distribui a cópia p/ os frontends.
// Só o bloco de vars é gerado (o header de prosa do arquivo continua hand-authored).
function platformShellJobs() {
  const out = [];
  if (tokens.brands.platform) {
    out.push({ label: 'platform (casca global)', rel: 'packages/platform-shell/platform-tokens.css', content: renderPlatformTokensBlock(tokens.brands.platform), markers: true });
  }
  return out;
}

// ---- replace-entre-marcadores ---------------------------------------------------------------
// Para arquivos que o dono possui (não são 100% gerados), o job com `markers: true` troca apenas
// o conteúdo entre `/* @generated-tokens:start ... */` (linha única) e `/* @generated-tokens:end */`,
// preservando o resto do arquivo. Falha alto se os marcadores não existirem.
const MARKER_START = '/* @generated-tokens:start';
const MARKER_END = '/* @generated-tokens:end */';
function spliceMarkers(current, block, rel) {
  const i = current.indexOf(MARKER_START);
  if (i === -1) throw new Error(`[design-tokens] marcador "${MARKER_START} ... */" ausente em ${rel}`);
  const afterStartLine = current.indexOf('\n', i);
  if (afterStartLine === -1) throw new Error(`[design-tokens] marcador de início sem quebra de linha em ${rel}`);
  const j = current.indexOf(MARKER_END, afterStartLine);
  if (j === -1) throw new Error(`[design-tokens] marcador "${MARKER_END}" ausente em ${rel}`);
  return current.slice(0, afterStartLine + 1) + block + current.slice(j);
}

// alvos: marcas hand-authored (tokens.json) + marca da plataforma (casca) + marcas adotadas
// (renderers/) + apps web gerados (brand.json -> --ui-*)
const jobs = [
  ...Object.entries(TARGETS).map(([brandKey, rel]) => ({ label: brandKey, rel, content: render(brandKey) })),
  ...platformShellJobs(),
  ...adoptedJobs(),
  ...discoverForgeApps().map(({ app, brand, rel }) => ({ label: 'forge:' + app, rel, content: deriveForgeTokensCss(brand) })),
];

let drift = false;
for (const { label, rel, content, markers } of jobs) {
  const abs = path.join(REPO, rel);
  if (markers) {
    const cur = fs.readFileSync(abs, 'utf8'); // arquivo-alvo TEM de existir (com marcadores)
    const next = spliceMarkers(cur, content, rel);
    if (CHECK) {
      if (cur !== next) { drift = true; console.error(`\x1b[31m[design-tokens] desatualizado: ${rel} (bloco @generated-tokens) — rode \`node build.mjs\` e commite.\x1b[0m`); }
    } else {
      if (cur !== next) fs.writeFileSync(abs, next);
      console.log(`[design-tokens] ${label} -> ${rel} (entre marcadores)`);
    }
    continue;
  }
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
