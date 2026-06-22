import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify, sha256 } from './verify-test-locks.mjs';

const manifest = {
  app: 'foo',
  minCount: 2,
  files: [
    { path: 'apps/foo/tests/locked/functional/REQ-FOO-0001.ac1.test.mjs', sha256: 'aaa' },
    { path: 'apps/foo/tests/locked/nfr/REQ-FOO-0001.qs1.test.mjs', sha256: 'bbb' },
  ],
};

test('íntegro: todos existem, hash bate, contagem ok → ok', () => {
  const shaOf = (p) => (p.endsWith('ac1.test.mjs') ? 'aaa' : 'bbb');
  const lockedOnDisk = manifest.files.map((f) => f.path);
  const out = verify(manifest, { shaOf, lockedOnDisk });
  assert.equal(out.ok, true);
});

test('teste locked apagado → ausente', () => {
  const shaOf = (p) => (p.endsWith('ac1.test.mjs') ? null : 'bbb');
  const out = verify(manifest, { shaOf, lockedOnDisk: [manifest.files[1].path] });
  assert.equal(out.ok, false);
  assert.match(out.problems.find((p) => /ausente/.test(p.reason)).reason, /apagado/);
});

test('teste locked enfraquecido (hash divergente) → reprova', () => {
  const shaOf = (p) => (p.endsWith('ac1.test.mjs') ? 'ZZZ' : 'bbb');
  const lockedOnDisk = manifest.files.map((f) => f.path);
  const out = verify(manifest, { shaOf, lockedOnDisk });
  assert.equal(out.ok, false);
  assert.match(out.problems[0].reason, /hash divergente/);
});

test('sneak-add: arquivo no diretório locked fora do manifesto → reprova', () => {
  const shaOf = (p) => (p.endsWith('ac1.test.mjs') ? 'aaa' : 'bbb');
  const lockedOnDisk = [...manifest.files.map((f) => f.path), 'apps/foo/tests/locked/sneaky.test.mjs'];
  const out = verify(manifest, { shaOf, lockedOnDisk });
  assert.equal(out.ok, false);
  assert.match(out.problems.find((p) => /sneak-add/.test(p.reason)).reason, /ausente do manifesto/);
});

test('contagem caiu abaixo do minCount → reprova', () => {
  const shaOf = () => 'aaa';
  const out = verify({ ...manifest, files: [manifest.files[0]] }, { shaOf, lockedOnDisk: [manifest.files[0].path] });
  // minCount=2 mas só 1 no disco
  assert.equal(out.ok, false);
  assert.ok(out.problems.some((p) => /mínimo 2/.test(p.reason)));
});

test('sha256 é determinístico', () => {
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(sha256('abc'), sha256('abd'));
});
