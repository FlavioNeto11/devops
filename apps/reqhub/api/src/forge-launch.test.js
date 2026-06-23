import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLaunchInput, buildClientPayload, dispatchForgeLaunch } from './forge-launch.js';

test('validate: product slug', () => {
  assert.equal(validateLaunchInput({ product: 'Bad Slug', mode: 'pr', requirements: [{ title: 'x' }] }).ok, false);
  const ok = validateLaunchInput({ product: 'cadastro-de-pacientes', mode: 'pr', requirements: [{ title: 'x' }] });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.product, 'cadastro-de-pacientes');
});

test('validate: mode obrigatório pr|release', () => {
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'nope', requirements: [{ title: 'x' }] }).code, 'INVALID_MODE');
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'release', requirements: [{ title: 'x' }] }).value.mode, 'release');
});

test('validate: requirements não-vazio e limite', () => {
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [] }).code, 'NO_REQUIREMENTS');
  const many = Array.from({ length: 13 }, (_, i) => ({ title: 'r' + i }));
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: many }).code, 'TOO_MANY');
});

test('buildClientPayload: ok + cap', () => {
  const v = validateLaunchInput({ product: 'meuapp', mode: 'pr', displayName: 'P', requirements: [{ id: 'REQ-P-0001', title: 'a', statement: 'b' }] }).value;
  const r = buildClientPayload(v, 'admin@x');
  assert.equal(r.ok, true);
  assert.equal(r.payload.requested_by, 'admin@x');
  assert.equal(r.payload.product, 'meuapp');
  assert.equal(r.payload.requirements[0].id, 'REQ-P-0001');
  // payload gigante -> 413
  const big = validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [{ title: 'x', statement: 'a'.repeat(120000) }] }).value;
  const r2 = buildClientPayload(big, 'me');
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'PAYLOAD_TOO_LARGE');
});

test('dispatch: 204 sucesso (mock) com event_type correto', async () => {
  let captured;
  const fetchImpl = async (url, opts) => { captured = { url, opts }; return { status: 204 }; };
  const r = await dispatchForgeLaunch({ token: 't', repo: 'o/r', payload: { x: 1 }, fetchImpl });
  assert.equal(r.ok, true);
  assert.match(captured.url, /repos\/o\/r\/dispatches$/);
  assert.equal(captured.opts.headers.Authorization, 'Bearer t');
  assert.equal(JSON.parse(captured.opts.body).event_type, 'forge-launch');
});

test('dispatch: não-204 -> ok:false com status', async () => {
  const fetchImpl = async () => ({ status: 403, text: async () => 'Resource not accessible by integration' });
  const r = await dispatchForgeLaunch({ token: 't', repo: 'o/r', payload: {}, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.match(r.detail, /not accessible/);
});
