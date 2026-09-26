// ADR-010, Passo 3/8/9 — varredura da copy do frontend efetivamente roteado.
// Lê App.jsx, descobre quais páginas estão em <Route element={...}> e falha se alguma delas (ou o
// próprio shell) contém frase perigosa da tese antiga. As telas congeladas continuam no repositório,
// mas não podem estar importadas nem roteadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DANGEROUS } from '../test-support/dangerous-phrases.mjs';

const SRC = new URL('../../frontend/src/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8');
const app = existsSync(new URL('App.jsx', SRC)) ? read('App.jsx') : null;
const skip = app ? false : 'frontend ausente nesta cópia';

const FROZEN = ['Marketplace', 'TituloDossie', 'InvestidorCarteira', 'GestaoTitulos', 'GestaoTituloDetail', 'GestaoFinanceiro', 'GestaoAlugueis', 'GateRegulatorio', 'Auditoria', 'AuditoriaTitulo'];

// Remove comentários (// e /* */) para que avisos de DEPRECATED não contem como copy.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

function routedPages() {
  const imports = Object.fromEntries([...app.matchAll(/import\s+(\w+)(?:,\s*\{[^}]*\})?\s+from\s+'\.\/pages\/(\w+)\.jsx'/g)].map((m) => [m[1], m[2]]));
  const used = new Set([...app.matchAll(/element=\{(?:<RequireRole[^>]*>)?<(\w+)/g)].map((m) => m[1]));
  return Object.entries(imports).filter(([name]) => used.has(name)).map(([, file]) => file);
}

test('telas congeladas não são importadas nem roteadas', { skip }, () => {
  for (const name of FROZEN) {
    assert.ok(!new RegExp(`from '\\./pages/${name}\\.jsx'`).test(app), `${name} ainda importada em App.jsx`);
    assert.ok(existsSync(new URL(`pages/${name}.jsx`, SRC)), `${name} deve continuar no repositório (rastreabilidade)`);
    assert.match(read(`pages/${name}.jsx`), /DEPRECATED \(ADR-010\)/, `${name} sem cabeçalho DEPRECATED`);
  }
  for (const p of ['/marketplace', '/investidor/*', '/gestao/titulos', '/gestao/alugueis', '/gestao/gate']) assert.ok(app.includes(`'${p}'`), `${p} deve redirecionar para /desativado`);
  assert.ok(!/to="\/marketplace"/.test(app), 'navegação não pode apontar para o marketplace');
});

test('copy das páginas roteadas e do shell sem frases da tese antiga', { skip }, () => {
  const pages = routedPages();
  assert.ok(pages.includes('PortalHome') && pages.includes('RecuperacaoDetail'), `páginas roteadas: ${pages.join(', ')}`);
  const files = ['App.jsx', 'recovery-ui.jsx', ...pages.map((p) => `pages/${p}.jsx`)];
  const hits = [];
  for (const rel of files) {
    const text = stripComments(read(rel));
    for (const re of DANGEROUS) if (re.test(text)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('home pública sem linguagem de investimento ou tokenização como produto', { skip }, () => {
  const home = stripComments(read('pages/PortalHome.jsx'));
  for (const re of [/investir/i, /investimento/i, /retorno/i, /tokeniza/i, /marketplace/i, /liquidez/i, /desconto/i]) {
    assert.ok(!re.test(home), `PortalHome contém ${re}`);
  }
  assert.match(home, /Documento antigo não é ativo/);
});
