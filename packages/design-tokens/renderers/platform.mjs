// =============================================================================
// renderers/platform.mjs — renderer da marca "platform" (a CASCA GLOBAL NovaIT).
// Gera o bloco de vars `--p-*` de packages/platform-shell/platform-tokens.css —
// a paleta neutra da plataforma + escalas estruturais — a partir de tokens.json
// (brands.platform). Valores TRANSCRITOS do CSS histórico da casca: zero mudança
// visual por construção.
//
// Diferente das marcas de app, o alvo NÃO é um arquivo dentro de apps/: é o
// ARQUIVO-FONTE do codegen da casca. A ordem do pipeline é
//   design-tokens (este renderer, entre marcadores) -> platform-shell/build.mjs
//   (codegen-sync distribui platform-tokens.css para os 4 frontends).
// O build.mjs substitui só o bloco ENTRE os marcadores
// /* @generated-tokens:start */ ... /* @generated-tokens:end */ daquele arquivo
// (o header de prosa continua hand-authored). Determinístico.
//
// Fonte dos VALORES: tokens.json (brands.platform) — cores em triplas RGB (p/
// casar com rgb(var(--p-x) / <alpha>)), escalas estruturais e sombras por modo.
// =============================================================================

import { badgePair } from '../forge-brand.mjs';

// Ordem EXATA das variáveis (espelha o platform-tokens.css histórico da casca).
const PALETTE_ORDER = ['bg', 'surface', 'surface2', 'fg', 'muted', 'neon', 'on-neon', 'accent2', 'ok', 'warn', 'danger', 'border', 'ink'];
// tons de status que ganham par de BADGE tintado (bg sólido + fg validado ≥4,5:1 sobre ele).
const BADGE_TONES = ['ok', 'warn', 'danger'];
const parseTriplet = (s) => String(s).trim().split(/\s+/).map(Number);
const TEXT_ORDER = ['xs', 'sm', 'md', 'lg'];
const SPACE_ORDER = ['1', '2', '3', '4', '5', '6'];
const RADIUS_ORDER = ['sm', 'md', 'lg', 'pill'];
const Z_ORDER = ['bar', 'pop'];
const SHADOW_ORDER = ['sm', 'md', 'lg'];

function req(map, key, ctx) {
  if (!map || map[key] === undefined) throw new Error(`marca platform: valor "${key}" ausente em ${ctx}`);
  return map[key];
}

function paletteLines(palette, indent, ctx) {
  return PALETTE_ORDER.map((k) => `${indent}--p-${k}: ${req(palette, k, ctx)};`);
}

function shadowLines(shadows, indent, ctx) {
  return SHADOW_ORDER.map((k) => `${indent}--p-shadow-${k}: ${req(shadows, k, ctx)};`);
}

// Pares de BADGE (par bg tintado SÓLIDO + fg validado ≥4,5:1 sobre ele) — o modelo correto
// dos status. Antes os consumidores usavam `color: rgb(var(--p-warn))` sobre `rgb(var(--p-warn)
// / 0.12)` e o texto reprovava AA (medido 2,80:1 warn / 2,88:1 ok). O bg é composto no mesmo α
// 0.12 dos aliases `-soft` (zero mudança visível no fundo; só o texto escurece/clareia).
function badgeLines(palette, indent, ctx) {
  const surface = parseTriplet(req(palette, 'surface', ctx));
  const lines = [];
  for (const k of BADGE_TONES) {
    const { bg, fg } = badgePair(parseTriplet(req(palette, k, ctx)), surface, { alpha: 0.12 });
    lines.push(`${indent}--p-${k}-badge-bg: ${bg.join(' ')};`);
    lines.push(`${indent}--p-${k}-badge-fg: ${fg.join(' ')};`);
  }
  return lines;
}

// corpo do modo escuro (cores + sombras) — usado 2x: no bloco explícito
// ([data-theme=dark] / .dark) e no fallback @media (prefers-color-scheme: dark),
// que assim ficam SEMPRE espelhados (antes eram duplicados à mão).
function darkBody(brand, indent) {
  return [
    `${indent}color-scheme: dark;`,
    ...paletteLines(brand.palette.dark, indent, 'brands.platform.palette.dark'),
    ...badgeLines(brand.palette.dark, indent, 'brands.platform.palette.dark'),
    ...shadowLines(brand.shadows.dark, indent, 'brands.platform.shadows.dark'),
  ];
}

// Bloco entre os marcadores do platform-tokens.css (sem os marcadores; termina com \n).
export function renderPlatformTokensBlock(brand) {
  const s = brand.structural;
  const out = [];
  out.push(':root {');
  out.push('  color-scheme: light;');
  out.push(...paletteLines(brand.palette.light, '  ', 'brands.platform.palette.light'));
  out.push(...badgeLines(brand.palette.light, '  ', 'brands.platform.palette.light'));
  out.push('');
  out.push('  /* ---- escalas ESTRUTURAIS (independentes de tema) ----------------------------');
  out.push('     Promovem os "números mágicos" da casca a tokens: tipografia, espaçamento,');
  out.push('     raio, z-index e sombra. Apps podem aliasar (ex.: --radius: var(--p-radius-lg)).');
  out.push('     As sombras ganham override mais forte no dark (blocos abaixo). */');
  out.push(`  --p-font-sans: ${req(s, 'font-sans', 'brands.platform.structural')};`);
  out.push(`  --p-font-display: ${req(s, 'font-display', 'brands.platform.structural')};`);
  out.push(...TEXT_ORDER.map((k) => `  --p-text-${k}: ${req(s.text, k, 'brands.platform.structural.text')};`));
  out.push(...SPACE_ORDER.map((k) => `  --p-space-${k}: ${req(s.space, k, 'brands.platform.structural.space')};`));
  out.push(...RADIUS_ORDER.map((k) => `  --p-radius-${k}: ${req(s.radius, k, 'brands.platform.structural.radius')};`));
  out.push(...Z_ORDER.map((k) => `  --p-z-${k}: ${req(s.z, k, 'brands.platform.structural.z')};`));
  out.push(...shadowLines(brand.shadows.light, '  ', 'brands.platform.shadows.light'));
  out.push('}');
  out.push('/* dark explícito (toggle da casca: [data-theme=dark] / .dark) */');
  out.push('[data-theme="dark"], .dark {');
  out.push(...darkBody(brand, '  '));
  out.push('}');
  out.push('/* dark por preferência do SISTEMA quando não há escolha explícita do usuário */');
  out.push('@media (prefers-color-scheme: dark) {');
  out.push('  :root:not([data-theme="light"]) {');
  out.push(...darkBody(brand, '    '));
  out.push('  }');
  out.push('}');
  return out.join('\n') + '\n';
}
