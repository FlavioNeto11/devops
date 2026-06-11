import test from 'node:test';
import assert from 'node:assert/strict';
import { diffContractAgainstConsumer, hasFindingAtLeast, severityAtLeast } from './contract-diff.mjs';

const ep = (over = {}) => ({
  id: 'p-login', method: 'POST', path_template: '/api/login',
  auth: { token_header_mode: 'authorization' },
  request: { schema: { type: 'object', required: ['user', 'pass'], properties: { user: {}, pass: {}, otp: { optional: true } } } },
  observability: { sample_count: 5 },
  ...over,
});
const mp = (over = {}) => ({
  contract_id: 'p-login', gateway_method: 'login', method: 'POST', path_template: '/api/login',
  auth: { token_header_mode: 'authorization' }, request_fields: ['user', 'pass', 'otp'], anchors: [],
  ...over,
});

test('alinhado: nenhum achado de severidade alta', () => {
  const { findings, summary } = diffContractAgainstConsumer([ep()], [mp()]);
  assert.equal(summary.critical, 0);
  assert.equal(summary.high, 0);
  assert.ok(!hasFindingAtLeast(findings, 'high'));
});

test('METHOD_MISMATCH = critical', () => {
  const { findings } = diffContractAgainstConsumer([ep()], [mp({ method: 'GET' })]);
  assert.ok(findings.some((f) => f.code === 'METHOD_MISMATCH' && f.severity === 'critical'));
  assert.ok(hasFindingAtLeast(findings, 'critical'));
});

test('PATH_MISMATCH = critical', () => {
  const { findings } = diffContractAgainstConsumer([ep()], [mp({ path_template: '/api/signin' })]);
  assert.ok(findings.some((f) => f.code === 'PATH_MISMATCH' && f.severity === 'critical'));
});

test('TOKEN_HEADER_MODE_MISMATCH = high', () => {
  const { findings } = diffContractAgainstConsumer([ep()], [mp({ auth: { token_header_mode: 'both' } })]);
  const f = findings.find((x) => x.code === 'TOKEN_HEADER_MODE_MISMATCH');
  assert.ok(f && f.severity === 'high');
});

test('REQUIRED_FIELD_MISSING_IN_CONSUMER = high', () => {
  const { findings } = diffContractAgainstConsumer([ep()], [mp({ request_fields: ['user'] })]); // falta "pass"
  const f = findings.find((x) => x.code === 'REQUIRED_FIELD_MISSING_IN_CONSUMER');
  assert.ok(f && f.severity === 'high' && f.message.includes('pass'));
});

test('EXTRA_FIELD_IN_CONSUMER = warning', () => {
  const { findings } = diffContractAgainstConsumer([ep()], [mp({ request_fields: ['user', 'pass', 'otp', 'captcha'] })]);
  const f = findings.find((x) => x.code === 'EXTRA_FIELD_IN_CONSUMER');
  assert.ok(f && f.severity === 'warning' && f.message.includes('captcha'));
});

test('CONSUMER_ENDPOINT_NOT_IN_CONTRACT = error', () => {
  const { findings } = diffContractAgainstConsumer([], [mp()]);
  assert.ok(findings.some((f) => f.code === 'CONSUMER_ENDPOINT_NOT_IN_CONTRACT' && f.severity === 'error'));
});

test('CONTRACT_ENDPOINT_NOT_USED = info', () => {
  const { findings } = diffContractAgainstConsumer([ep()], []);
  assert.ok(findings.some((f) => f.code === 'CONTRACT_ENDPOINT_NOT_USED' && f.severity === 'info'));
});

test('baixa confiança rebaixa high → warning', () => {
  const { findings } = diffContractAgainstConsumer([ep({ observability: { sample_count: 1 } })], [mp({ auth: { token_header_mode: 'both' } })]);
  const f = findings.find((x) => x.code === 'TOKEN_HEADER_MODE_MISMATCH');
  assert.equal(f.severity, 'warning');
  assert.ok(findings.some((x) => x.code === 'LOW_CONFIDENCE_BASELINE'));
});

test('baixa confiança NÃO rebaixa critical', () => {
  const { findings } = diffContractAgainstConsumer([ep({ observability: { sample_count: 1 } })], [mp({ method: 'GET' })]);
  const f = findings.find((x) => x.code === 'METHOD_MISMATCH');
  assert.equal(f.severity, 'critical');
});

test('severityAtLeast ordena corretamente', () => {
  assert.ok(severityAtLeast('critical', 'high'));
  assert.ok(severityAtLeast('high', 'high'));
  assert.ok(!severityAtLeast('warning', 'high'));
});
