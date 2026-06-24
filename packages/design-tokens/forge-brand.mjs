// =============================================================================
// forge-brand.mjs — DERIVA, de um descritor de marca pequeno (brand.json), o conjunto
// COMPLETO de tokens semânticos `--ui-*` (light + dark + preferência do sistema) que o
// kit packages/ui-vue consome. Determinístico e com CONTRASTE WCAG AA garantido (texto
// 4.5:1, UI 3:1). Cada app web gerado pela Forja tem identidade PRÓPRIA só trocando o
// brand.json — sem tocar componente.
//
// brand.json:
//   { "name": "ShopDesk", "accent": "#4f46e5",
//     "neutralBase": "slate|graphite|zinc|warm",  // ramp neutro (temperatura)
//     "radius": "sm|md|lg",                        // arredondamento
//     "displayFont": "Sora",                       // fonte de títulos
//     "vibe": "..." }                              // livre, não usado no build
//
// Exporta:
//   - RAMPS, DEFAULT_BRAND
//   - normalizeBrand(brand) -> descritor validado/normalizado
//   - deriveForgeTokensCss(brand) -> string CSS (tokens.generated.css)
//   - helpers de cor (hexToRgb, relLuminance, contrast, ensureContrast) p/ teste
// =============================================================================

// ---- ramps neutros (triplas RGB) — papéis: bg surface surface2 fg muted faint border borderStrong
// Cada ramp dá um light e um dark. Valores no espírito do Tailwind (slate/neutral/zinc/stone).
export const RAMPS = {
  slate: {
    light: { bg: '248 250 252', surface: '255 255 255', surface2: '241 245 249', fg: '15 23 42', muted: '100 116 139', faint: '148 163 184', border: '226 232 240', borderStrong: '203 213 225' },
    dark: { bg: '15 19 28', surface: '24 30 42', surface2: '33 41 56', fg: '226 232 240', muted: '148 163 184', faint: '100 116 139', border: '42 51 67', borderStrong: '58 70 90' },
  },
  graphite: {
    light: { bg: '250 250 250', surface: '255 255 255', surface2: '244 244 245', fg: '24 24 27', muted: '82 82 91', faint: '113 113 122', border: '228 228 231', borderStrong: '212 212 216' },
    dark: { bg: '10 10 11', surface: '22 22 25', surface2: '34 34 39', fg: '244 244 245', muted: '161 161 170', faint: '113 113 122', border: '39 39 44', borderStrong: '58 58 66' },
  },
  zinc: {
    light: { bg: '250 250 250', surface: '255 255 255', surface2: '245 245 245', fg: '23 23 23', muted: '115 115 115', faint: '163 163 163', border: '229 229 229', borderStrong: '212 212 212' },
    dark: { bg: '12 12 12', surface: '23 23 23', surface2: '38 38 38', fg: '245 245 245', muted: '163 163 163', faint: '115 115 115', border: '38 38 38', borderStrong: '64 64 64' },
  },
  warm: {
    light: { bg: '250 250 249', surface: '255 255 255', surface2: '245 245 244', fg: '28 25 23', muted: '120 113 108', faint: '168 162 158', border: '231 229 228', borderStrong: '214 211 209' },
    dark: { bg: '12 11 10', surface: '25 23 22', surface2: '41 37 36', fg: '245 245 244', muted: '168 162 158', faint: '120 113 108', border: '41 37 36', borderStrong: '68 64 60' },
  },
};

const RADII = {
  sm: { sm: '5px', md: '7px', lg: '10px' },
  md: { sm: '7px', md: '10px', lg: '14px' },
  lg: { sm: '9px', md: '13px', lg: '18px' },
};

// status semânticos fixos (não variam por marca — semântica é universal)
const STATUS = {
  light: { ok: '21 128 61', warn: '180 83 9', danger: '185 28 28' },
  dark: { ok: '74 222 128', warn: '251 191 36', danger: '248 113 113' },
};

export const DEFAULT_BRAND = { name: 'App', accent: '#4f46e5', neutralBase: 'slate', radius: 'md', displayFont: 'Sora', vibe: '' };

// ---- helpers de cor -----------------------------------------------------------
export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('accent inválido (hex esperado, ex.: #4f46e5): ' + hex);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const triplet = (rgb) => rgb.map((n) => Math.round(n)).join(' ');
const parseTriplet = (s) => s.split(/\s+/).map(Number);

function srgbToLin(c) { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
export function relLuminance(rgb) { const [r, g, b] = rgb.map(srgbToLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const la = relLuminance(a), lb = relLuminance(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); }
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const BLACK = [0, 0, 0], WHITE = [255, 255, 255];

// melhor cor de TEXTO sobre um fundo (branco vs quase-preto), por contraste.
export function bestText(onRgb, ink) { return contrast(WHITE, onRgb) >= contrast(ink, onRgb) ? WHITE : ink; }

// ajusta `fg` (escurecendo ou clareando) até atingir o contraste-alvo sobre `bg`.
export function ensureContrast(fg, bg, target = 4.5) {
  if (contrast(fg, bg) >= target) return fg;
  const toward = relLuminance(bg) > 0.4 ? BLACK : WHITE; // fundo claro -> escurece; escuro -> clareia
  let best = fg;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const cand = mix(fg, toward, t);
    best = cand;
    if (contrast(cand, bg) >= target) break;
  }
  return best;
}

// ---- normalização -------------------------------------------------------------
export function normalizeBrand(brand) {
  const b = { ...DEFAULT_BRAND, ...(brand || {}) };
  if (!RAMPS[b.neutralBase]) b.neutralBase = 'slate';
  if (!RADII[b.radius]) b.radius = 'md';
  b.accent = b.accent || DEFAULT_BRAND.accent;
  hexToRgb(b.accent); // valida cedo
  b.displayFont = b.displayFont || 'Sora';
  return b;
}

// ---- derivação do bloco de tokens p/ um esquema (light|dark) ------------------
function schemeVars(scheme, ramp, accentRgb, ink) {
  const n = ramp[scheme];
  const st = STATUS[scheme];
  const accentText = scheme === 'dark' ? mix(accentRgb, WHITE, 0.35) : accentRgb; // acento visível no dark
  const surfaceRgb = parseTriplet(n.surface);
  const bgRgb = parseTriplet(n.bg);
  const accentFg = bestText(accentRgb, ink);                       // texto sobre o preenchimento de acento
  const accentStrong = ensureContrast(accentText, surfaceRgb, 4.5); // acento como TEXTO/link sobre surface
  const okStrong = ensureContrast(parseTriplet(st.ok), surfaceRgb, 4.5);
  const warnStrong = ensureContrast(parseTriplet(st.warn), surfaceRgb, 4.5);
  const dangerStrong = ensureContrast(parseTriplet(st.danger), surfaceRgb, 4.5);
  return [
    `  color-scheme: ${scheme};`,
    `  --ui-bg: ${n.bg};`,
    `  --ui-surface: ${n.surface};`,
    `  --ui-surface-2: ${n.surface2};`,
    `  --ui-fg: ${n.fg};`,
    `  --ui-muted: ${n.muted};`,
    `  --ui-faint: ${n.faint};`,
    `  --ui-border: ${n.border};`,
    `  --ui-border-strong: ${n.borderStrong};`,
    `  --ui-accent: ${triplet(scheme === 'dark' ? mix(accentRgb, WHITE, 0.18) : accentRgb)};`,
    `  --ui-accent-fg: ${triplet(accentFg)};`,
    `  --ui-accent-strong: ${triplet(accentStrong)};`,
    `  --ui-ok: ${triplet(okStrong)};`,
    `  --ui-warn: ${triplet(warnStrong)};`,
    `  --ui-danger: ${triplet(dangerStrong)};`,
    `  --ui-info: ${triplet(accentStrong)};`,
  ];
}

export function deriveForgeTokensCss(brandIn) {
  const brand = normalizeBrand(brandIn);
  const ramp = RAMPS[brand.neutralBase];
  const accentRgb = hexToRgb(brand.accent);
  const ink = parseTriplet(ramp.light.fg); // quase-preto da marca p/ texto sobre acento claro
  const rad = RADII[brand.radius];
  const structural = [
    `  --ui-font-sans: Inter, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;`,
    `  --ui-font-display: ${brand.displayFont}, var(--ui-font-sans);`,
    `  --ui-font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;`,
    `  --ui-text-xs: 11.5px;`,
    `  --ui-text-sm: 13px;`,
    `  --ui-text-md: 14px;`,
    `  --ui-text-lg: 16px;`,
    `  --ui-text-xl: 20px;`,
    `  --ui-space-1: 4px;`,
    `  --ui-space-2: 8px;`,
    `  --ui-space-3: 12px;`,
    `  --ui-space-4: 16px;`,
    `  --ui-space-5: 24px;`,
    `  --ui-space-6: 32px;`,
    `  --ui-radius-sm: ${rad.sm};`,
    `  --ui-radius-md: ${rad.md};`,
    `  --ui-radius-lg: ${rad.lg};`,
    `  --ui-radius-pill: 999px;`,
    `  --ui-z-bar: 50;`,
    `  --ui-z-modal: 80;`,
    `  --ui-shadow-sm: 0 1px 2px rgb(2 6 23 / 0.06), 0 1px 3px rgb(2 6 23 / 0.10);`,
    `  --ui-shadow-md: 0 6px 16px -8px rgb(2 6 23 / 0.18), 0 16px 44px -20px rgb(2 6 23 / 0.20);`,
    `  --ui-shadow-lg: 0 24px 70px -24px rgb(2 6 23 / 0.42);`,
  ];
  const darkShadows = [
    `  --ui-shadow-sm: 0 1px 3px rgb(0 0 0 / 0.45);`,
    `  --ui-shadow-md: 0 8px 24px -6px rgb(0 0 0 / 0.5);`,
    `  --ui-shadow-lg: 0 28px 80px -24px rgb(0 0 0 / 0.62);`,
  ];
  const out = [];
  out.push(`/* GERADO por packages/design-tokens/build.mjs (forge-brand) — marca: ${brand.name} (accent ${brand.accent}, ${brand.neutralBase}).`);
  out.push(`   NÃO EDITAR À MÃO: edite specs/products/<app>/brand.json e rode \`node build.mjs\`. CI valida com \`--check\`. */`);
  out.push(':root {');
  out.push(...schemeVars('light', ramp, accentRgb, ink));
  out.push(...structural);
  out.push('}');
  out.push('[data-theme="dark"], .dark {');
  out.push(...schemeVars('dark', ramp, accentRgb, ink));
  out.push(...darkShadows);
  out.push('}');
  out.push('@media (prefers-color-scheme: dark) {');
  out.push('  :root:not([data-theme="light"]) {');
  out.push(...schemeVars('dark', ramp, accentRgb, ink).map((l) => '  ' + l));
  out.push(...darkShadows.map((l) => '  ' + l));
  out.push('  }');
  out.push('}');
  out.push('html { scroll-behavior: smooth; }');
  out.push('::selection { background: rgb(var(--ui-accent) / 0.22); }');
  out.push('::-webkit-scrollbar { width: 10px; height: 10px; }');
  out.push('::-webkit-scrollbar-track { background: rgb(var(--ui-bg)); }');
  out.push('::-webkit-scrollbar-thumb { background: rgb(var(--ui-faint) / 0.6); border-radius: 8px; }');
  out.push('::-webkit-scrollbar-thumb:hover { background: rgb(var(--ui-muted) / 0.8); }');
  return out.join('\n') + '\n';
}
