// node --test — helpers PUROS do kit (sem DOM/Vue): validators, format, status-map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { required, minLen, email, numeric, min, runRules } from './src/lib/validators.js';
import { humanize, formatValue, formatCurrency } from './src/lib/format.js';
import { resolveTone, statusLabel } from './src/lib/status-map.js';
import { resolveGlyph } from './src/lib/glyphs.js';

test('validators: required', () => {
  assert.equal(required()(''), 'Obrigatório');
  assert.equal(required()('  '), 'Obrigatório');
  assert.equal(required()([]), 'Obrigatório');
  assert.equal(required()('x'), '');
});
test('validators: minLen/email/numeric/min', () => {
  assert.ok(minLen(3)('ab'));
  assert.equal(minLen(3)('abc'), '');
  assert.ok(email()('nope'));
  assert.equal(email()('a@b.co'), '');
  assert.ok(numeric()('x'));
  assert.equal(numeric()('42'), '');
  assert.ok(min(10)('5'));
  assert.equal(min(10)('20'), '');
});
test('validators: runRules devolve a 1ª mensagem', () => {
  assert.equal(runRules([required(), minLen(3)], ''), 'Obrigatório');
  assert.equal(runRules([required(), minLen(3)], 'ab'), 'Mínimo de 3 caracteres');
  assert.equal(runRules([required(), minLen(3)], 'abc'), '');
});

test('format: humanize', () => {
  assert.equal(humanize('order_id'), 'Order id');
  assert.equal(humanize('createdAt'), 'Created At');
  assert.equal(humanize('total-price'), 'Total price');
});
test('format: formatValue por tipo', () => {
  assert.equal(formatValue(null, 'text'), '—');
  assert.equal(formatValue(true, 'boolean'), 'Sim');
  assert.equal(formatValue('2020-01-15', 'date').length > 0, true);
  assert.ok(formatCurrency(50).includes('R$'));
  assert.equal(formatValue(5, (v) => 'v=' + v), 'v=5');
});

test('status-map: resolveTone por palavra-chave', () => {
  assert.equal(resolveTone('paid'), 'success');
  assert.equal(resolveTone('FAILED'), 'error');
  assert.equal(resolveTone('pending'), 'warning');
  assert.equal(resolveTone('processing'), 'running');
  assert.equal(resolveTone('xyz'), 'neutral');
  assert.equal(resolveTone(''), 'neutral');
});
test('status-map: statusLabel usa dicionário PT (chaves cruas do banco -> rótulo)', () => {
  assert.equal(statusLabel('no_show'), 'Faltou');
  assert.equal(statusLabel('cancelled'), 'Cancelado');
  assert.equal(statusLabel('canceled'), 'Cancelado'); // grafia US
  assert.equal(statusLabel('completed'), 'Concluído');
  assert.equal(statusLabel('pending'), 'Pendente');
  assert.equal(statusLabel('in_progress'), 'Em andamento');
  assert.equal(statusLabel('No-Show'), 'Faltou'); // normaliza case + separador
  assert.equal(statusLabel('  ACTIVE '), 'Ativo'); // normaliza trim/case
});
test('status-map: statusLabel cai no humanize p/ desconhecido e respeita o explícito', () => {
  assert.equal(statusLabel('foo_bar'), 'Foo bar'); // fora do dicionário -> humanize
  assert.equal(statusLabel('x', 'Rótulo'), 'Rótulo'); // explícito vence
});

test('glyphs: nome canônico vira glifo, emoji passa intacto, nome desconhecido não vaza', () => {
  // nomes canônicos → glifo (não a palavra literal)
  assert.equal(resolveGlyph('doc'), '📄');
  assert.equal(resolveGlyph('clock'), '🕘');
  assert.equal(resolveGlyph('search'), '🔎');
  assert.equal(resolveGlyph('DOC'), '📄'); // case-insensitive
  // glifo/emoji já pronto → intacto
  assert.equal(resolveGlyph('📄'), '📄');
  assert.equal(resolveGlyph('🔎'), '🔎');
  // vazio → fallback (default e custom)
  assert.equal(resolveGlyph(''), '∅');
  assert.equal(resolveGlyph(undefined), '∅');
  assert.equal(resolveGlyph(null, '⚠'), '⚠');
  // nome canônico desconhecido → fallback (NUNCA a palavra literal)
  assert.equal(resolveGlyph('unknownname'), '∅');
});
