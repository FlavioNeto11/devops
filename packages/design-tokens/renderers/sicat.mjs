// =============================================================================
// renderers/sicat.mjs — renderer da marca ADOTADA "sicat" (brownfield).
// OPT-IN explícito no build.mjs: produtos `origin: adopted` são PULADOS pelo
// discoverForgeApps() de propósito (frontend pré-Forja, tokens artesanais); a adoção
// dos tokens acontece AQUI, marca a marca, TRANSCREVENDO a paleta atual do app —
// zero mudança visual por construção.
//
// Gera DOIS arquivos dentro de apps/sicat/frontend:
//   - src/styles/tokens.generated.css      (substitui o antigo styles/tokens.css à mão)
//   - src/plugins/vuetify-theme.generated.js (substitui o objeto de tema inline do plugin)
//
// Fonte dos VALORES: tokens.json (brands.sicat) — paletas css light/dark, sombras,
// gradientes e o mapa vuetify (valores "@<nome>" referenciam a cor homônima de
// css.<modo>, garantindo fonte única). A ESTRUTURA não-cor (fontes, raios, espaços,
// breakpoints) é fixa desta marca e vive aqui. Determinístico.
// =============================================================================

// Ordem EXATA das variáveis no arquivo gerado (espelha o tokens.css histórico do app —
// mantém o diff legível e o resultado estável).
const BASE_ORDER = [
  'bg', 'bg-accent', 'surface', 'surface-raised', 'surface-subtle', 'sidebar',
  'border', 'border-strong', 'text', 'text-muted',
  'primary', 'primary-dark', 'primary-contrast',
  'error', 'success', 'warning', 'info',
];
const STATUS_ORDER = [
  'status-neutral-bg', 'status-neutral-fg',
  'status-running-bg', 'status-running-fg',
  'status-success-bg', 'status-success-fg',
  'status-error-bg', 'status-error-fg',
  'status-warning-bg', 'status-warning-fg',
];
const VUETIFY_ORDER = [
  'primary', 'secondary', 'success', 'warning', 'error', 'info',
  'background', 'surface', 'surface-bright', 'surface-light',
];

function req(map, key, ctx) {
  if (!map || map[key] === undefined) throw new Error(`marca sicat: valor "${key}" ausente em ${ctx}`);
  return map[key];
}

function colorLines(palette, indent, ctx) {
  const line = (k) => `${indent}--color-${k}: ${req(palette, k, ctx)};`;
  return [...BASE_ORDER.map(line), '', ...STATUS_ORDER.map(line)];
}

// corpo do modo escuro (cores + sombras + gradientes) — usado 2x: no bloco
// :root[data-theme='dark'] e no fallback @media (prefers-color-scheme: dark),
// que assim ficam SEMPRE espelhados (antes eram duplicados à mão).
function darkBody(brand, indent) {
  return [
    ...colorLines(brand.css.dark, indent, 'brands.sicat.css.dark'),
    '',
    `${indent}--shadow-sm: ${req(brand.shadows.dark, 'sm', 'shadows.dark')};`,
    `${indent}--shadow-md: ${req(brand.shadows.dark, 'md', 'shadows.dark')};`,
    `${indent}--shadow-lg: ${req(brand.shadows.dark, 'lg', 'shadows.dark')};`,
    `${indent}--gradient-primary: ${req(brand.gradients.dark, 'primary', 'gradients.dark')};`,
    `${indent}--gradient-hero: ${req(brand.gradients.dark, 'hero', 'gradients.dark')};`,
  ];
}

function generatedHeader(what) {
  return [
    `/* GERADO por packages/design-tokens/build.mjs — marca: sicat (adotada; ${what}).`,
    '   NÃO EDITAR À MÃO: edite packages/design-tokens/tokens.json e rode `node build.mjs`.',
    '   CI valida drift com `node build.mjs --check`. */',
  ];
}

export function renderSicatCss(brand) {
  const out = [];
  out.push(...generatedHeader('paleta transcrita do app, zero mudança visual'));
  out.push('/* =============================================================================');
  out.push('   Design tokens — SICAT');
  out.push('   -----------------------------------------------------------------------------');
  out.push('   Paleta MONOCROMÁTICA institucional: o chrome (fundos, superfícies, bordas,');
  out.push('   texto) vive numa escala única de cinza-frio (slate), sem tinte verde; a marca');
  out.push('   entra por UM acento verde-petróleo escuro e dessaturado (identidade ambiental');
  out.push('   CETESB sem cara de template). Regras do redesign:');
  out.push('     - nada de gradiente chamativo no chrome (hero/nav/ativo) — superfícies lisas;');
  out.push('     - raios contidos (8/12/16) e sombras discretas de 1-2 níveis;');
  out.push('     - cores de STATUS continuam semânticas (sucesso/erro/aviso/execução), porém');
  out.push('       dessaturadas para sentar na escala neutra.');
  out.push('   ============================================================================= */');
  out.push(':root {');
  out.push("  --font-family-base: 'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;");
  out.push("  --font-family-display: 'Manrope', 'Public Sans', system-ui, sans-serif;");
  out.push('  --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;');
  out.push('');
  out.push(...colorLines(brand.css.light, '  ', 'brands.sicat.css.light'));
  out.push('');
  out.push('  --radius-sm: 8px;');
  out.push('  --radius-md: 12px;');
  out.push('  --radius-lg: 16px;');
  out.push('');
  out.push('  --space-1: 4px;');
  out.push('  --space-2: 8px;');
  out.push('  --space-3: 12px;');
  out.push('  --space-4: 16px;');
  out.push('  --space-5: 20px;');
  out.push('  --space-6: 24px;');
  out.push('  --space-7: 32px;');
  out.push('  --space-8: 40px;');
  out.push('');
  out.push(`  --shadow-sm: ${req(brand.shadows.light, 'sm', 'shadows.light')};`);
  out.push(`  --shadow-md: ${req(brand.shadows.light, 'md', 'shadows.light')};`);
  out.push(`  --shadow-lg: ${req(brand.shadows.light, 'lg', 'shadows.light')};`);
  out.push('  /* Gradiente quase plano (primary -> primary-dark): pontos que ainda usam o');
  out.push('     token ganham profundidade sutil sem o look multicolorido antigo. */');
  out.push(`  --gradient-primary: ${req(brand.gradients.light, 'primary', 'gradients.light')};`);
  out.push(`  --gradient-hero: ${req(brand.gradients.light, 'hero', 'gradients.light')};`);
  out.push('');
  out.push('  --breakpoint-tablet: 768px;');
  out.push('  --breakpoint-desktop: 1200px;');
  out.push('  --app-max-width: 1440px;');
  out.push('}');
  out.push('');
  out.push(":root[data-theme='dark'] {");
  out.push('  /* Grafite frio — mesma escala neutra do light, invertida. */');
  out.push(...darkBody(brand, '  '));
  out.push('}');
  out.push('');
  out.push('/* Dark por padrão quando o SO está em dark — SEM quebrar o toggle manual.');
  out.push('   O JS (bootstrapDocumentTheme) define `data-theme` cedo a partir da preferência');
  out.push('   salva ou do SO; este bloco só vale enquanto NENHUM `data-theme` foi aplicado');
  out.push('   (`:root:not([data-theme])`), atuando como fallback/anti-FOUC antes do JS rodar.');
  out.push('   Assim que o atributo existe (light OU dark, manual ou automático), estas regras');
  out.push('   deixam de valer e a escolha do usuário sempre vence. Espelha os tokens de');
  out.push("   `:root[data-theme='dark']`. */");
  out.push('@media (prefers-color-scheme: dark) {');
  out.push('  :root:not([data-theme]) {');
  out.push(...darkBody(brand, '    '));
  out.push('  }');
  out.push('}');
  return out.join('\n') + '\n';
}

// resolve "@<nome>" contra a paleta css do modo (fonte única) ou aceita hex literal.
function resolveVuetify(brand, mode) {
  const refs = req(brand.vuetify, mode, 'brands.sicat.vuetify');
  return VUETIFY_ORDER.map((key) => {
    const raw = req(refs, key, `brands.sicat.vuetify.${mode}`);
    const value = raw.startsWith('@') ? req(brand.css[mode], raw.slice(1), `brands.sicat.css.${mode} (ref ${raw})`) : raw;
    return [key, value];
  });
}

function vuetifyColorsBlock(pairs, indent) {
  return pairs.map(([key, value]) => {
    const prop = /^[a-zA-Z_$][\w$]*$/.test(key) ? key : `'${key}'`;
    return `${indent}${prop}: '${value}',`;
  });
}

export function renderSicatVuetifyTheme(brand) {
  const out = [];
  out.push(...generatedHeader('tema Vuetify derivado dos MESMOS tokens do CSS'));
  out.push('');
  out.push('// Paleta monocromática institucional (ver styles/tokens.generated.css): chrome em');
  out.push('// escala neutra de cinza-frio; UM acento verde-petróleo escuro. Sincronia com os');
  out.push('// tokens CSS é garantida na fonte (packages/design-tokens/tokens.json).');
  out.push('export const sicatVuetifyThemes = {');
  out.push('  vuexy: {');
  out.push('    dark: false,');
  out.push('    colors: {');
  out.push(...vuetifyColorsBlock(resolveVuetify(brand, 'light'), '      '));
  out.push('    }');
  out.push('  },');
  out.push('  vuexyDark: {');
  out.push('    dark: true,');
  out.push('    colors: {');
  out.push(...vuetifyColorsBlock(resolveVuetify(brand, 'dark'), '      '));
  out.push('    }');
  out.push('  }');
  out.push('};');
  return out.join('\n') + '\n';
}
