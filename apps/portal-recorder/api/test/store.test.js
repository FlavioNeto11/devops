import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreatePortal, validateCreateSession, isValidSessionStatus, splitUrl, genId } from '../src/store.js';
import { evaluateWriteAuth } from '../src/auth.js';

test('genId: prefixo + hex', () => {
  const id = genId('cap');
  assert.match(id, /^cap_[0-9a-f]{18}$/);
  assert.notEqual(genId('cap'), genId('cap'));
});

test('validateCreatePortal: aceita válido e deriva base_origin/api_origins', () => {
  const r = validateCreatePortal({ slug: 'cetesb-mtr', name: 'CETESB MTR', entry_url: 'https://mtr.cetesb.sp.gov.br/#/inicio' });
  assert.equal(r.ok, true);
  assert.equal(r.value.base_origin, 'https://mtr.cetesb.sp.gov.br');
  assert.deepEqual(r.value.api_origins, ['https://mtr.cetesb.sp.gov.br']);
});

test('validateCreatePortal: api_origins explícitos preservados', () => {
  const r = validateCreatePortal({ slug: 'x', name: 'X', entry_url: 'https://a.com', api_origins: ['https://api.a.com'] });
  assert.deepEqual(r.value.api_origins, ['https://api.a.com']);
});

test('validateCreatePortal: rejeita slug inválido / url inválida / name vazio', () => {
  assert.equal(validateCreatePortal({ slug: 'Bad Slug', name: 'x', entry_url: 'https://a.com' }).ok, false);
  assert.equal(validateCreatePortal({ slug: 'ok', name: 'x', entry_url: 'not-a-url' }).ok, false);
  assert.equal(validateCreatePortal({ slug: 'ok', name: '', entry_url: 'https://a.com' }).ok, false);
  assert.equal(validateCreatePortal(null).ok, false);
});

test('validateCreateSession: title opcional', () => {
  assert.equal(validateCreateSession({}).value.title, null);
  assert.equal(validateCreateSession({ title: '  Captura 1 ' }).value.title, 'Captura 1');
});

test('isValidSessionStatus', () => {
  assert.ok(isValidSessionStatus('running'));
  assert.ok(!isValidSessionStatus('bogus'));
});

test('splitUrl: host/path/query', () => {
  const r = splitUrl('https://mtrr.cetesb.sp.gov.br/api/cidades/26?x=1');
  assert.equal(r.host, 'mtrr.cetesb.sp.gov.br');
  assert.equal(r.path, '/api/cidades/26');
  assert.deepEqual(r.query, { x: '1' });
});

test('splitUrl: url inválida degrada', () => {
  const r = splitUrl('::bad::');
  assert.equal(r.host, '');
  assert.equal(r.path, '::bad::');
});

test('evaluateWriteAuth: fail-closed sem token; ok com bearer correto', () => {
  assert.equal(evaluateWriteAuth('Bearer x', '').code, 'WRITES_DISABLED');
  assert.equal(evaluateWriteAuth(undefined, 'secret').code, 'UNAUTHORIZED');
  assert.equal(evaluateWriteAuth('Bearer wrong', 'secret').code, 'UNAUTHORIZED');
  assert.equal(evaluateWriteAuth('Bearer secret', 'secret').ok, true);
});
