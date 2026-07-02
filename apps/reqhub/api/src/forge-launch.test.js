import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLaunchInput, buildClientPayload, dispatchForgeLaunch, validateDeleteInput, dispatchForgeDelete } from './forge-launch.js';

test('validate: product slug', () => {
  assert.equal(validateLaunchInput({ product: 'Bad Slug', mode: 'pr', requirements: [{ title: 'x' }] }).ok, false);
  const ok = validateLaunchInput({ product: 'cadastro-de-pacientes', mode: 'pr', requirements: [{ title: 'x' }] });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.product, 'cadastro-de-pacientes');
});

test('validate: launch PROTEGE apps vivos/plataforma (mesma denylist do delete)', () => {
  // sem o guard, "lançar" um protegido dispararia scaffold de apps/<p> + Application do Argo
  // por cima de recurso vivo sob selfHeal (pré-requisito da adoção brownfield no Studio).
  for (const p of ['sicat', 'gymops', 'reqhub', 'keycloak']) {
    const r = validateLaunchInput({ product: p, mode: 'pr', requirements: [{ title: 'x' }] });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'PROTECTED');
  }
  // o slug é normalizado (lowercase) antes do guard — maiúsculas não escapam
  assert.equal(validateLaunchInput({ product: 'SICAT', mode: 'pr', requirements: [{ title: 'x' }] }).code, 'PROTECTED');
  // produto comum segue passando
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [{ title: 'x' }] }).ok, true);
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

test('validate: skipPreviewGate (gate de preview) default false; só true se explícito', () => {
  // default: gate ATIVO (skipPreviewGate=false) — o caminho greenfield exige preview ready.
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [{ title: 'x' }] }).value.skipPreviewGate, false);
  // só desliga com a flag booleana explícita (fluxos legados sem preview).
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [{ title: 'x' }], skipPreviewGate: true }).value.skipPreviewGate, true);
  // valores truthy não-booleanos NÃO desligam o gate (evita bypass acidental).
  assert.equal(validateLaunchInput({ product: 'meuapp', mode: 'pr', requirements: [{ title: 'x' }], skipPreviewGate: 'yes' }).value.skipPreviewGate, false);
});

test('validate: creation_mode (C2) opcional — enum simples|guiado|profissional; fora disso vira ausente', () => {
  const base = { product: 'meuapp', mode: 'pr', requirements: [{ title: 'x' }] };
  for (const m of ['simples', 'guiado', 'profissional']) {
    assert.equal(validateLaunchInput({ ...base, creation_mode: m }).value.creation_mode, m);
  }
  // ausente/inválido -> '' (retrocompat: clientes antigos não mandam o campo)
  assert.equal(validateLaunchInput(base).value.creation_mode, '');
  assert.equal(validateLaunchInput({ ...base, creation_mode: 'hacker' }).value.creation_mode, '');
  assert.equal(validateLaunchInput({ ...base, creation_mode: 42 }).value.creation_mode, '');
});

test('GATE C2: client_payload IDÊNTICO nos 3 modos, exceto creation_mode (informativo)', () => {
  const base = {
    product: 'meuapp', mode: 'release', displayName: 'Meu App', blueprint: 'node-api-vue-spa', brief: 'um app',
    requirements: [{ id: 'REQ-MEUAPP-0001', title: 'a', statement: 'O sistema DEVE a.' }],
    architecture: { stack: 'sicat', selected_blocks: [{ id: 'oidc-sessao' }], waves: [{ id: 'w0', work_orders: ['REQ-MEUAPP-0001'] }] },
  };
  const payloads = ['simples', 'guiado', 'profissional'].map((m) =>
    buildClientPayload(validateLaunchInput({ ...base, creation_mode: m }).value, 'op@x').payload);
  payloads.forEach((p, i) => assert.equal(p.creation_mode, ['simples', 'guiado', 'profissional'][i]));
  const strip = (p) => { const { creation_mode, ...rest } = p; return rest; };
  assert.deepEqual(strip(payloads[0]), strip(payloads[1]));
  assert.deepEqual(strip(payloads[1]), strip(payloads[2]));
  // sem creation_mode o payload NÃO ganha a chave — byte-idêntico ao pré-C2 (retrocompat)
  const legacy = buildClientPayload(validateLaunchInput(base).value, 'op@x').payload;
  assert.ok(!('creation_mode' in legacy));
  assert.deepEqual(legacy, strip(payloads[0]));
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

test('delete: valida slug + PROTEGE produtos reais/plataforma', () => {
  assert.equal(validateDeleteInput({ product: 'Bad Slug' }).code, 'INVALID_PRODUCT');
  assert.equal(validateDeleteInput({ product: 'sicat' }).code, 'PROTECTED');
  assert.equal(validateDeleteInput({ product: 'reqhub' }).code, 'PROTECTED');
  const ok = validateDeleteInput({ product: 'crm' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.product, 'crm');
});

test('delete dispatch: 204 com event_type forge-delete', async () => {
  let captured;
  const fetchImpl = async (url, opts) => { captured = { url, opts }; return { status: 204 }; };
  const r = await dispatchForgeDelete({ token: 't', repo: 'o/r', product: 'crm', identity: 'admin@x', fetchImpl });
  assert.equal(r.ok, true);
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.event_type, 'forge-delete');
  assert.equal(body.client_payload.product, 'crm');
  assert.equal(body.client_payload.requested_by, 'admin@x');
});
