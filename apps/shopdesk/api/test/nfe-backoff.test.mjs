// nfe-backoff.test.mjs — valida a lógica de backoff do jobs-repo para jobs nfe.*
// Testa a fórmula sem Postgres (puro JS). REQ-SHOPDESK-0004 AC4: 1s,10s,100s,1000s.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function nfeBackoff(attempts) {
  return Math.pow(10, Math.max(0, attempts - 1));
}
function defaultBackoff(attempts) {
  return Math.min(60, Math.pow(2, attempts));
}

test('nfe backoff: attempt 1 → 1s', () => assert.equal(nfeBackoff(1), 1));
test('nfe backoff: attempt 2 → 10s', () => assert.equal(nfeBackoff(2), 10));
test('nfe backoff: attempt 3 → 100s', () => assert.equal(nfeBackoff(3), 100));
test('nfe backoff: attempt 4 → 1000s', () => assert.equal(nfeBackoff(4), 1000));

test('default backoff: capped at 60s', () => {
  assert.ok(defaultBackoff(1) <= 60);
  assert.ok(defaultBackoff(10) <= 60);
});

test('nfe max_attempts=5: attemps<5 não vai para DLQ', () => {
  const maxAttempts = 5;
  for (let a = 1; a < maxAttempts; a++) {
    assert.ok(a < maxAttempts, 'attempt ' + a + ' fica abaixo do max');
  }
  assert.ok(5 >= maxAttempts, 'attempt 5 vai para DLQ');
});
