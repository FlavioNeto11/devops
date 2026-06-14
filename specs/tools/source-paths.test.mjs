import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSourcePathShape, validateSourcePath } from './source-paths.mjs';

test('forma: aceita relativo simples', () => {
  assert.equal(checkSourcePathShape('apps/sicat').ok, true);
  assert.equal(checkSourcePathShape('packages/ai-core/src').ok, true);
});

test('forma: rejeita absoluto, drive e vazio', () => {
  assert.equal(checkSourcePathShape('/etc/passwd').ok, false);
  assert.equal(checkSourcePathShape('C:\\Windows').ok, false);
  assert.equal(checkSourcePathShape('').ok, false);
  assert.equal(checkSourcePathShape('   ').ok, false);
});

test('forma: rejeita `..` no INICIO E no MEIO (traversal) — achado da auditoria', () => {
  assert.equal(checkSourcePathShape('../secret').ok, false);
  assert.equal(checkSourcePathShape('apps/sicat/../../../etc').ok, false);
  assert.equal(checkSourcePathShape('apps/../../x').ok, false);
});

test('FS: caminho inexistente reprova', () => {
  const fakeFs = { existsSync: () => false, realpathSync: (p) => p };
  const r = validateSourcePath('apps/INEXISTENTE', '/repo', fakeFs);
  assert.equal(r.ok, false);
  assert.match(r.reason, /inexistente/);
});

test('FS: caminho real DENTRO do repo passa', () => {
  const fakeFs = { existsSync: () => true, realpathSync: (p) => p };
  const r = validateSourcePath('apps/sicat', '/repo', fakeFs);
  assert.equal(r.ok, true);
});

test('FS: SYMLINK apontando p/ FORA do repo reprova (achado da auditoria)', () => {
  // o destino existe, mas realpath aponta p/ fora da raiz -> reprova
  const fakeFs = {
    existsSync: () => true,
    realpathSync: (p) => (String(p).endsWith('/repo') ? '/repo' : '/etc/passwd'),
  };
  const r = validateSourcePath('apps/sicat/link', '/repo', fakeFs);
  assert.equal(r.ok, false);
  assert.match(r.reason, /fora da raiz|symlink|escape/i);
});
