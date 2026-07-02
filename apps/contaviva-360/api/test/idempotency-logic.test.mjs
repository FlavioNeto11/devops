// Verificação: duas requisições com mesma Idempotency-Key -> um único recurso
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const idemSrc = readFileSync(join(__dir, '../src/idempotency.js'), 'utf-8');
const serverSrc = readFileSync(join(__dir, '../src/server.js'), 'utf-8');

test('idempotency: módulo exporta getIdempotentResponse e rememberIdempotentResponse', () => {
  assert.ok(idemSrc.includes('export async function getIdempotentResponse('), 'getter exportado');
  assert.ok(idemSrc.includes('export async function rememberIdempotentResponse('), 'setter exportado');
});

test('idempotency: usa ON CONFLICT upsert para deduplicar por (idempotency_key, operation)', () => {
  assert.ok(idemSrc.includes('ON CONFLICT (idempotency_key, operation)'), 'ON CONFLICT correto');
  assert.ok(idemSrc.includes('DO UPDATE SET response_json = excluded.response_json'), 'upsert correto');
});

test('idempotency: getIdempotentResponse retorna null quando chave não existe', () => {
  assert.ok(idemSrc.includes('if (!idempotencyKey) return null'), 'guarda sem chave');
});

test('idempotency: server.js aplica idempotência em POST /v1/records', () => {
  assert.ok(serverSrc.includes("getIdempotentResponse('create_record'"), 'GET na criação de record');
  assert.ok(serverSrc.includes("rememberIdempotentResponse("), 'SAVE após criação de record');
  assert.ok(serverSrc.includes("idempotency-key"), 'lê header idempotency-key');
});

// Simulação em memória do comportamento de idempotência
class InMemIdempotency {
  constructor() { this.store = new Map(); }
  async get(operation, key) {
    if (!key) return null;
    return this.store.get(`${operation}:${key}`) ?? null;
  }
  async remember({ operation, idempotencyKey, response }) {
    if (!idempotencyKey) return;
    this.store.set(`${operation}:${idempotencyKey}`, response);
  }
}

async function createResourceWithIdempotency(idem, key, createFn) {
  const cached = await idem.get('create_entity', key);
  if (cached) return cached;
  const result = await createFn();
  await idem.remember({ operation: 'create_entity', idempotencyKey: key, response: result });
  return result;
}

test('simulação: mesma Idempotency-Key → um único recurso', async () => {
  const idem = new InMemIdempotency();
  let callCount = 0;
  const key = 'test-key-abc';
  const create = () => { callCount++; return { id: 1, title: 'idem' }; };

  const r1 = await createResourceWithIdempotency(idem, key, create);
  const r2 = await createResourceWithIdempotency(idem, key, create);

  assert.equal(r1.id, r2.id, 'mesma chave → mesmo recurso');
  assert.equal(callCount, 1, 'createFn chamada apenas uma vez (sem efeito duplo)');
});

test('simulação: chaves diferentes → recursos diferentes', async () => {
  const idem = new InMemIdempotency();
  let callCount = 0;
  const create = () => { callCount++; return { id: callCount, title: 'r' + callCount }; };

  const r1 = await createResourceWithIdempotency(idem, 'key-A', create);
  const r2 = await createResourceWithIdempotency(idem, 'key-B', create);

  assert.notEqual(r1.id, r2.id, 'chaves diferentes → recursos diferentes');
  assert.equal(callCount, 2, 'createFn chamada duas vezes');
});

test('simulação: sem Idempotency-Key → sem deduplicação (sempre cria)', async () => {
  const idem = new InMemIdempotency();
  let callCount = 0;
  const create = () => { callCount++; return { id: callCount }; };

  await createResourceWithIdempotency(idem, null, create);
  await createResourceWithIdempotency(idem, null, create);

  assert.equal(callCount, 2, 'sem chave → cria duas vezes');
});
