// node --test — garante a DERIVAÇÃO de marca: contraste WCAG AA + cobertura de tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, contrast, ensureContrast, relLuminance, deriveForgeTokensCss, RAMPS, normalizeBrand } from './forge-brand.mjs';

test('hexToRgb aceita #rgb e #rrggbb e rejeita lixo', () => {
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('4f46e5'), [79, 70, 229]);
  assert.throws(() => hexToRgb('xyz'));
});

test('contrast: preto x branco ~ 21', () => {
  assert.ok(contrast([0, 0, 0], [255, 255, 255]) > 20.9);
});

test('ensureContrast atinge o alvo sobre fundo claro e escuro', () => {
  const onWhite = ensureContrast([120, 120, 255], [255, 255, 255], 4.5);
  assert.ok(contrast(onWhite, [255, 255, 255]) >= 4.5);
  const onDark = ensureContrast([40, 40, 90], [12, 12, 12], 4.5);
  assert.ok(contrast(onDark, [12, 12, 12]) >= 4.5);
});

const parse = (s) => s.split(/\s+/).map(Number);
function varsOf(css, selectorBlock) {
  // extrai as vars do primeiro bloco que começa com selectorBlock
  const start = css.indexOf(selectorBlock);
  const sub = css.slice(start, css.indexOf('}', start));
  const map = {};
  for (const m of sub.matchAll(/--(ui-[a-z0-9-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}

const BRANDS = [
  { name: 'A', accent: '#4f46e5', neutralBase: 'slate', radius: 'md' },
  { name: 'B', accent: '#0d9488', neutralBase: 'graphite', radius: 'lg' },
  { name: 'C', accent: '#e11d48', neutralBase: 'zinc', radius: 'sm' },
  { name: 'D', accent: '#b45309', neutralBase: 'warm', radius: 'md' },
];

for (const b of BRANDS) {
  test(`deriveForgeTokensCss(${b.name}/${b.neutralBase}): cobertura + contraste AA`, () => {
    const css = deriveForgeTokensCss(b);
    // blocos light + dark + system
    assert.ok(css.includes(':root {'));
    assert.ok(css.includes('[data-theme="dark"], .dark {'));
    assert.ok(css.includes('@media (prefers-color-scheme: dark)'));
    const light = varsOf(css, ':root {');
    // tokens essenciais presentes
    for (const k of ['ui-bg', 'ui-surface', 'ui-fg', 'ui-muted', 'ui-border', 'ui-accent', 'ui-accent-fg', 'ui-accent-strong', 'ui-ok', 'ui-warn', 'ui-danger', 'ui-radius-md', 'ui-font-display']) {
      assert.ok(light['ui-' === '' ? k : k] !== undefined, 'falta --' + k);
    }
    const surface = parse(light['ui-surface']);
    const fg = parse(light['ui-fg']);
    // texto normal sobre surface: AA
    assert.ok(contrast(fg, surface) >= 4.5, 'fg/surface < 4.5');
    // acento/ok/warn/danger como TEXTO sobre surface: AA garantido pela derivação
    for (const k of ['ui-accent-strong', 'ui-ok', 'ui-warn', 'ui-danger']) {
      assert.ok(contrast(parse(light[k]), surface) >= 4.49, k + ' < 4.5 sobre surface');
    }
    // texto sobre preenchimento de acento (accent-fg sobre accent): AA
    assert.ok(contrast(parse(light['ui-accent-fg']), parse(light['ui-accent'])) >= 4.49, 'accent-fg/accent < 4.5');
  });
}

test('normalizeBrand cai p/ defaults seguros', () => {
  const b = normalizeBrand({ accent: '#123456', neutralBase: 'inexistente', radius: 'xxl' });
  assert.equal(b.neutralBase, 'slate');
  assert.equal(b.radius, 'md');
});

test('dark do slate é escuro (luminância baixa)', () => {
  assert.ok(relLuminance(RAMPS.slate.dark.bg.split(/\s+/).map(Number)) < 0.05);
});
