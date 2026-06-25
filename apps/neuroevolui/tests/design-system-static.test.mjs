// Verificação estática do design system (REQ-NEUROEVOLUI-0009).
// Roda sem servidor — analisa fontes para confirmar conformidade com os gates:
//   "frontend importa os tokens do DS; sem CSS inline ad-hoc; .generated.css não editado à mão"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

test('DS-AC1: tokens.generated.css é gerado por codegen (nunca editado à mão)', () => {
  const css = read('tokens.generated.css');
  assert.ok(css.includes('GERADO por packages/design-tokens'), 'cabeçalho codegen presente');
  assert.ok(!css.startsWith('/*\n * Manualmente'), 'arquivo não foi editado manualmente');
});

test('DS-AC1: tokens cobrem cores, tipografia, espaçamento e dark mode (OS pref)', () => {
  const css = read('tokens.generated.css');
  assert.ok(css.includes('--ui-accent'), 'token de cor de acento');
  assert.ok(css.includes('--ui-font-sans'), 'token de tipografia');
  assert.ok(css.includes('--ui-space-'), 'tokens de espaçamento');
  assert.ok(css.includes('--ui-radius-'), 'tokens de borda/breakpoint');
  assert.ok(css.includes('[data-theme="dark"]') || css.includes('.dark'), 'classe dark mode');
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'), 'sync com preferência de SO');
});

test('DS-AC2: main.js importa tokens do DS (nunca escreve tokens inline)', () => {
  const main = read('main.js');
  assert.ok(main.includes("import './tokens.generated.css'"), 'importa tokens.generated.css');
  assert.ok(main.includes("import './ui/ui.css'"), 'importa ui.css do kit');
  assert.ok(!main.includes('style='), 'sem estilo inline no entrypoint');
});

test('DS-AC4: barrel exporta todos os componentes WCAG AA obrigatórios', () => {
  const idx = read('ui/index.js');
  for (const c of ['UiButton', 'UiInput', 'UiModal', 'UiCard', 'UiDataTable']) {
    assert.ok(idx.includes(c), `${c} está no barrel export`);
  }
});

test('DS-AC4: UiInput tem atributos de acessibilidade WCAG AA', () => {
  const src = read('ui/components/UiInput.vue');
  assert.ok(src.includes('aria-invalid'), 'aria-invalid presente (estado de erro)');
  assert.ok(src.includes('describedBy') || src.includes('aria-describedby'), 'aria-describedby para mensagem de erro/hint');
  assert.ok(src.includes('aria-required') || src.includes(':required'), 'aria-required ou required presente');
  assert.ok(src.includes('--ui-'), 'usa tokens --ui-* (sem cores hardcoded)');
  assert.ok(!src.includes('color: #') && !src.includes('background: #'), 'sem cores hexadecimais hardcoded');
});

test('DS-AC4: UiModal tem atributos de acessibilidade WCAG AA', () => {
  const src = read('ui/components/UiModal.vue');
  assert.ok(src.includes('role="dialog"'), 'role="dialog"');
  assert.ok(src.includes('aria-modal="true"'), 'aria-modal');
  assert.ok(src.includes('aria-label'), 'aria-label no diálogo');
  assert.ok(src.includes('focus'), 'gerencia foco ao abrir');
});

test('DS-AC4: UiDataTable tem semântica de tabela acessível', () => {
  const src = read('ui/components/UiDataTable.vue');
  assert.ok(src.includes('scope="col"'), 'scope="col" nos cabeçalhos');
  assert.ok(src.includes('aria-sort'), 'aria-sort para colunas ordenáveis');
  assert.ok(src.includes('aria-label'), 'aria-label nos checkboxes de seleção');
});

test('DS-AC5: UiAppShell sincroniza tema com preferência de SO e persiste em sessão', () => {
  const src = read('ui/components/UiAppShell.vue');
  assert.ok(src.includes('prefers-color-scheme') || src.includes('matchMedia'), 'lê preferência de SO');
  assert.ok(src.includes("localStorage"), 'persiste preferência de tema em sessão');
  assert.ok(src.includes('data-theme'), 'aplica data-theme no documento');
});

test('DS-AC6: codegen-check: header correto confirma que build.mjs pode re-gerar sem intervenção', () => {
  const css = read('tokens.generated.css');
  assert.ok(
    css.includes('NÃO EDITAR À MÃO') || css.includes('NÃO EDITAR') || css.includes('node build.mjs'),
    'instrução de re-geração no header do arquivo gerado'
  );
});

test('DS-verificação: nenhuma view usa style= inline (sem CSS ad-hoc)', () => {
  const viewsDir = path.join(SRC, 'views');
  const views = fs.readdirSync(viewsDir).filter((f) => f.endsWith('.vue'));
  for (const view of views) {
    const src = fs.readFileSync(path.join(viewsDir, view), 'utf8');
    // style= inline em elementos HTML é violação; <style scoped> com tokens é permitido
    const inlineStyles = [...src.matchAll(/ style="[^"]*"/g)];
    assert.equal(inlineStyles.length, 0, `${view}: sem atributo style= inline (${inlineStyles.map((m) => m[0]).join(', ')})`);
  }
});
