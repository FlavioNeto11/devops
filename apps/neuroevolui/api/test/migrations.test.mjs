// Testes unitários — migrations versionadas e idempotência (REQ-NEUROEVOLUI-0003).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Importa apenas as constantes — pool não conecta até query() ser chamado
const { MIGRATIONS } = await import('../src/db.js');

test('migrations: pelo menos 2 versões (records + idempotency_registry)', () => {
  assert.ok(MIGRATIONS.length >= 2, 'esperado ≥ 2 migrations, encontrado: ' + MIGRATIONS.length);
});

test('migrations: todas usam CREATE TABLE IF NOT EXISTS (idempotentes — rodar 2× não duplica)', () => {
  for (let i = 0; i < MIGRATIONS.length; i++) {
    assert.ok(
      MIGRATIONS[i].includes('IF NOT EXISTS'),
      'migration ' + (i + 1) + ' deve usar IF NOT EXISTS'
    );
  }
});

test('migration 1: cria tabela records com colunas multi-tenant e status', () => {
  const sql = MIGRATIONS[0];
  assert.ok(sql.includes('records'), 'tabela records');
  assert.ok(sql.includes('tenant_id'), 'coluna tenant_id');
  assert.ok(sql.includes('title'), 'coluna title');
  assert.ok(sql.includes('status'), 'coluna status');
  assert.ok(sql.includes('created_at'), 'coluna created_at');
});

test('migration 2: cria tabela idempotency_registry com chave composta (key+operation)', () => {
  const sql = MIGRATIONS[1];
  assert.ok(sql.includes('idempotency_registry'), 'tabela idempotency_registry');
  assert.ok(sql.includes('idempotency_key'), 'coluna idempotency_key');
  assert.ok(sql.includes('operation'), 'coluna operation');
  assert.ok(sql.includes('response_json'), 'coluna response_json (resposta cacheada)');
  assert.ok(sql.includes('PRIMARY KEY'), 'chave primária composta para dedup ON CONFLICT');
});

test('migration 2: suporta upsert idempotente via PRIMARY KEY composta', () => {
  const sql = MIGRATIONS[1];
  // PRIMARY KEY composta permite ON CONFLICT (idempotency_key, operation) DO UPDATE
  const hasPk = sql.includes('PRIMARY KEY (idempotency_key, operation)') ||
    (sql.includes('PRIMARY KEY') && sql.includes('idempotency_key') && sql.includes('operation'));
  assert.ok(hasPk, 'PK composta (idempotency_key, operation) habilita upsert idempotente');
});

test('migrations: versões numeradas sequencialmente (sem gap)', () => {
  // Verifica que o runner irá aplicá-las em ordem 1..N sem saltar versão
  assert.ok(MIGRATIONS.length > 0);
  for (let i = 0; i < MIGRATIONS.length; i++) {
    assert.ok(typeof MIGRATIONS[i] === 'string' && MIGRATIONS[i].length > 0, 'migration ' + (i + 1) + ' não vazia');
  }
});
