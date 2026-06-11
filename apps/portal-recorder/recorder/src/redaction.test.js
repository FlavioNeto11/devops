import test from 'node:test';
import assert from 'node:assert/strict';
import { redactObject, sanitizeHeaders, sanitizeCookies, redactBody } from './redaction.js';

test('redactObject: mascara segredos e guarda hash', () => {
  const acc = { keys: [], hashes: {} };
  const out = redactObject({ login: 'joao', senha: 'p@ss', token: 'abc', nested: { recaptcha: 'x', ok: 1 } }, acc);
  assert.equal(out.senha, '***');
  assert.equal(out.token, '***');
  assert.equal(out.nested.recaptcha, '***');
  assert.equal(out.nested.ok, 1);
  assert.equal(out.login, 'joao'); // 'login' não casa nenhum token sensível
  assert.ok(acc.keys.includes('senha') && acc.keys.includes('token'));
  assert.ok(acc.hashes.senha && acc.hashes.senha.length === 16);
});

test('redactObject: NÃO mascara chaves comuns', () => {
  const out = redactObject({ manCodigo: 123, status: 'ATIVO', items: [{ qty: 2 }] });
  assert.equal(out.manCodigo, 123);
  assert.equal(out.status, 'ATIVO');
  assert.equal(out.items[0].qty, 2);
});

test('sanitizeHeaders: authorization/cookie viram ***', () => {
  const acc = { keys: [], hashes: {} };
  const out = sanitizeHeaders({ Authorization: 'Bearer xyz', 'X-Access-Token': 't', 'Content-Type': 'application/json' }, acc);
  assert.equal(out.authorization, '***');
  assert.equal(out['x-access-token'], '***');
  assert.equal(out['content-type'], 'application/json');
  assert.ok(acc.hashes.authorization);
});

test('sanitizeCookies: valor mascarado, metadados preservados', () => {
  const out = sanitizeCookies([{ name: 'JSESSIONID', value: 'abc123', domain: '.cetesb', httpOnly: true }]);
  assert.equal(out[0].value, '***');
  assert.equal(out[0].name, 'JSESSIONID');
  assert.equal(out[0].httpOnly, true);
});

test('redactBody: JSON redigido; não-JSON resumido', () => {
  const acc = { keys: [], hashes: {} };
  const j = redactBody('{"senha":"x","a":1}', acc);
  assert.equal(j.body.senha, '***');
  assert.equal(j.body.a, 1);
  const t = redactBody('texto solto', acc);
  assert.equal(t.body._nonJson, true);
});

test('nunca vaza o valor cru de um segredo', () => {
  const acc = { keys: [], hashes: {} };
  const out = JSON.stringify(redactObject({ token: 'SUPERSECRET', cookie: 'c=SECRET2' }, acc));
  assert.ok(!out.includes('SUPERSECRET'));
  assert.ok(!out.includes('SECRET2'));
});
