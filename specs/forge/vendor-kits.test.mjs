// Testes do helper de vendoring de kits (node:test; funções puras — leem packages/, não empacotam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortName, resolveKitChain, kitDeps } from './vendor-kits.mjs';

test('shortName: normaliza packages/ e @flavioneto11/', () => {
  assert.equal(shortName('packages/ai-core'), 'ai-core');
  assert.equal(shortName('@flavioneto11/ai-kit'), 'ai-kit');
  assert.equal(shortName('payments-kit'), 'payments-kit');
});

test('resolveKitChain: inclui a cadeia transitiva (ai-core -> ai-kit via peerDeps)', () => {
  const chain = resolveKitChain(['packages/ai-core']);
  assert.ok(chain.includes('ai-core'), 'ai-core presente');
  assert.ok(chain.includes('ai-kit'), 'ai-kit (peerDep do ai-core) deve entrar na cadeia');
});

test('resolveKitChain: filtra kits frontend-only (design-tokens, platform-shell)', () => {
  const chain = resolveKitChain(['packages/design-tokens', 'packages/platform-shell', 'packages/payments-kit']);
  assert.ok(!chain.includes('design-tokens'), 'design-tokens não vai p/ o vendor da API');
  assert.ok(!chain.includes('platform-shell'), 'platform-shell não vai p/ o vendor da API');
  assert.ok(chain.includes('payments-kit'));
});

test('kitDeps: gera file:vendor/*.tgz por kit da cadeia', () => {
  const deps = kitDeps(['packages/payments-kit']);
  assert.match(deps['@flavioneto11/payments-kit'] || '', /^file:vendor\/flavioneto11-payments-kit-.+\.tgz$/);
});

test('resolveKitChain([]) = [] e ref inexistente é ignorada (sem throw)', () => {
  assert.deepEqual(resolveKitChain([]), []);
  assert.deepEqual(resolveKitChain(['packages/nao-existe']), []);
});
