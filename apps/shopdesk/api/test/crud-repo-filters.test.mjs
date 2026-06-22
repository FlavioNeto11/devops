// crud-repo-filters.test.mjs — testa buildFilters() (pura) sem necessidade de Postgres.
// Verifica que q e status produzem cláusulas WHERE e parâmetros corretos para o CRUD genérico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilters } from '../src/repositories/filters.js';

const INV_COLS = [
  { name: 'sku', type: 'text', required: true },
  { name: 'productName', type: 'text', required: true },
  { name: 'quantity', type: 'number', required: true },
  { name: 'reorderPoint', type: 'number', required: false },
  { name: 'location', type: 'text', required: false },
  { name: 'status', type: 'status', required: false },
];
const INV_WRITABLE = INV_COLS.map((c) => ({
  field: c.name,
  col: c.name.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()),
}));

test('buildFilters: sem filtros retorna apenas cláusula de tenant', () => {
  const { clauses, params } = buildFilters(INV_COLS, INV_WRITABLE, '', '');
  assert.deepEqual(clauses, ['tenant_id=$1']);
  assert.deepEqual(params, []);
});

test('buildFilters: q pesquisa em colunas de texto (sku, product_name, location)', () => {
  const { clauses, params } = buildFilters(INV_COLS, INV_WRITABLE, 'caneca', '');
  assert.equal(clauses.length, 2);
  assert.match(clauses[1], /ILIKE/);
  assert.ok(clauses[1].includes('sku'), 'inclui sku');
  assert.ok(clauses[1].includes('product_name'), 'inclui product_name');
  assert.ok(clauses[1].includes('location'), 'inclui location');
  assert.ok(!clauses[1].includes('quantity'), 'não inclui coluna numérica');
  assert.equal(params.length, 1);
  assert.equal(params[0], '%caneca%');
});

test('buildFilters: status produz cláusula de igualdade exata', () => {
  const { clauses, params } = buildFilters(INV_COLS, INV_WRITABLE, '', 'baixo');
  assert.equal(clauses.length, 2);
  assert.ok(clauses[1].startsWith('status='));
  assert.equal(params.length, 1);
  assert.equal(params[0], 'baixo');
});

test('buildFilters: q + status geram cláusulas independentes sem colisão de $N', () => {
  const { clauses, params } = buildFilters(INV_COLS, INV_WRITABLE, 'tênis', 'esgotado');
  assert.equal(clauses.length, 3, 'tenant + q + status');
  assert.equal(params.length, 2);
  // q usa $2 (tenantId = $1, q = $2)
  assert.ok(clauses[1].includes('$2'), 'q usa $2');
  // status usa $3
  assert.ok(clauses[2].includes('$3'), 'status usa $3');
  assert.equal(params[0], '%tênis%');
  assert.equal(params[1], 'esgotado');
});

test('buildFilters: metacaracteres LIKE em q são escapados', () => {
  const { params } = buildFilters(INV_COLS, INV_WRITABLE, 'SKU_001', '');
  assert.equal(params[0], '%SKU\\_001%');
});

test('buildFilters: entidade sem coluna status ignora filtro de status', () => {
  const colsSemStatus = INV_COLS.filter((c) => c.name !== 'status');
  const wrSemStatus = INV_WRITABLE.filter((w) => w.field !== 'status');
  const { clauses, params } = buildFilters(colsSemStatus, wrSemStatus, '', 'baixo');
  assert.equal(clauses.length, 1, 'só tenant_id (status ignorado)');
  assert.deepEqual(params, []);
});
