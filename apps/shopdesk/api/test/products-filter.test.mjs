// products-filter.test.mjs — testa definições de entidade e helpers p/ filtro de produtos.
// Sem DB: só imports puros de entities.js e helpers locais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTITIES, colName } from '../src/repositories/entities.js';

const products = ENTITIES.find((e) => e.route === 'products');

test('colName converte camelCase para snake_case', () => {
  assert.equal(colName('stockQty'), 'stock_qty');
  assert.equal(colName('createdAt'), 'created_at');
  assert.equal(colName('active'), 'active');
  assert.equal(colName('status'), 'status');
  assert.equal(colName('category'), 'category');
});

test('entidade products existe', () => {
  assert.ok(products, 'products deve estar em ENTITIES');
  assert.equal(products.table, 'products');
});

test('entidade products tem colunas filtráveis por /products (q, status, active, category)', () => {
  const colNames = products.columns.map((c) => c.name);
  assert.ok(colNames.includes('name'), 'name (busca q)');
  assert.ok(colNames.includes('sku'), 'sku (busca q)');
  assert.ok(colNames.includes('status'), 'status (filtro exato)');
  assert.ok(colNames.includes('active'), 'active (filtro boolean)');
  assert.ok(colNames.includes('category'), 'category (filtro exato)');
});

test('colunas de texto para busca q são do tipo text/longtext', () => {
  const textCols = products.columns.filter((c) => c.type === 'text' || c.type === 'longtext');
  const names = textCols.map((c) => c.name);
  assert.ok(names.includes('name'), 'name é text');
  assert.ok(names.includes('sku'), 'sku é text');
});

test('coluna active é boolean (coerção true/false no filtro)', () => {
  const activeCol = products.columns.find((c) => c.name === 'active');
  assert.ok(activeCol, 'active existe');
  assert.equal(activeCol.type, 'boolean');
});

test('seed de produtos tem os três estados esperados (publicado, arquivado)', () => {
  const statuses = products.seed.map((r) => r.status);
  assert.ok(statuses.includes('publicado'), 'produto publicado no seed');
  assert.ok(statuses.includes('arquivado'), 'produto arquivado no seed');
});
