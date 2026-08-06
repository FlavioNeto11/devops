// =============================================================================
// renderers/gymops.mjs — renderer da marca ADOTADA "gymops" (brownfield).
// OPT-IN explícito no build.mjs (produtos `origin: adopted` são PULADOS pelo
// discoverForgeApps() de propósito). TRANSCREVE as vars hsl atuais do css global
// do app — zero mudança visual por construção.
//
// Diferente das outras marcas, o alvo NÃO é um arquivo inteiro: o pipeline
// Next.js + Tailwind do gymops exige que as diretivas @tailwind fiquem no TOPO de
// apps/gymops/apps/web/src/app/globals.css, então o codegen gera só o BLOCO
// `@layer base { :root/.dark }` e o build.mjs o substitui ENTRE os marcadores
// /* @generated-tokens:start */ ... /* @generated-tokens:end */ daquele arquivo.
//
// Fonte dos VALORES: tokens.json (brands.gymops.hsl) — triplas HSL sem hsl(),
// no formato que o tailwind.config.ts consome via `hsl(var(--x))`. Determinístico.
// =============================================================================

// Ordem EXATA das variáveis (espelha o globals.css histórico do app).
const CORE_ORDER = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
];
const SIDEBAR_ORDER = ['sidebar', 'sidebar-foreground', 'sidebar-muted', 'sidebar-accent', 'sidebar-border'];

function req(map, key, ctx) {
  if (!map || map[key] === undefined) throw new Error(`marca gymops: valor "${key}" ausente em ${ctx}`);
  return map[key];
}

function varLines(order, palette, indent, ctx) {
  return order.map((k) => `${indent}--${k}: ${req(palette, k, ctx)};`);
}

// Bloco entre os marcadores do globals.css (sem os marcadores; termina com \n).
export function renderGymopsHslBlock(brand) {
  const hsl = brand.hsl;
  const out = [];
  out.push('@layer base {');
  out.push('  :root {');
  out.push(...varLines(CORE_ORDER, hsl.light, '    ', 'brands.gymops.hsl.light'));
  out.push(`    --radius: ${req(hsl, 'radius', 'brands.gymops.hsl')};`);
  out.push('');
  out.push('    /* Sidebar grafite (igual nos dois modos). */');
  out.push(...varLines(SIDEBAR_ORDER, hsl.sidebar.light, '    ', 'brands.gymops.hsl.sidebar.light'));
  out.push('  }');
  out.push('');
  out.push('  .dark {');
  out.push(...varLines(CORE_ORDER, hsl.dark, '    ', 'brands.gymops.hsl.dark'));
  out.push('');
  out.push(...varLines(SIDEBAR_ORDER, hsl.sidebar.dark, '    ', 'brands.gymops.hsl.sidebar.dark'));
  out.push('  }');
  out.push('}');
  return out.join('\n') + '\n';
}
