// gateway.test.mjs — REQ-STOCKPILOT-0004: resiliência + auditoria do gateway externo.
// Testes PUROS (sem Postgres nem rede): redação de segredos, erro tipado (AppError), montagem do
// registro de auditoria e o laço de dispatch (timeout/retry/backoff) com fetch e auditStore fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactString, redactSecrets, LOG } from '../src/lib/redact.js';
import { AppError } from '../src/lib/app-error.js';
import { buildAuditEntry } from '../src/repositories/gateway-audit-repo.js';
import { dispatch } from '../src/gateways/gateway.js';

// --- redação de segredos -------------------------------------------------------------------------
test('redactSecrets: chaves sensíveis viram **** (por NOME da chave)', () => {
  const out = redactSecrets({ id: 1, token: 'abc123', apiKey: 'k-secret', Authorization: 'Bearer zzz', nested: { password: 'p' } });
  assert.equal(out.id, 1);
  assert.equal(out.token, '****');
  assert.equal(out.apiKey, '****');
  assert.equal(out.Authorization, '****');
  assert.equal(out.nested.password, '****');
});

test('redactString: segredo conhecido do ambiente é mascarado (por VALOR)', () => {
  const prev = process.env.EXTERNAL_API_KEY;
  process.env.EXTERNAL_API_KEY = 'super-secret-key-9999';
  try {
    assert.equal(redactString('chamando com key=super-secret-key-9999 ok'), 'chamando com key=**** ok');
  } finally {
    if (prev === undefined) delete process.env.EXTERNAL_API_KEY; else process.env.EXTERNAL_API_KEY = prev;
  }
});

test('redactString: padrão inline "Bearer <token>" é mascarado mesmo sem segredo conhecido', () => {
  assert.equal(redactString('header Authorization: Bearer eyJhbGciOiJ.xxx.yyy'), 'header Authorization: Bearer ****');
  assert.match(redactString('apiKey=tok_live_abcdef'), /apiKey=\*\*\*\*/);
});

test('LOG.info redige o token antes de imprimir (substitui por ****)', () => {
  const prev = process.env.EXTERNAL_TOKEN;
  process.env.EXTERNAL_TOKEN = 'tok-live-abcdef-12345';
  const captured = [];
  const orig = console.log;
  console.log = (...a) => captured.push(a.join(' '));
  try {
    LOG.info('enviando com Authorization Bearer tok-live-abcdef-12345', { token: 'tok-live-abcdef-12345', id: 7 });
  } finally {
    console.log = orig;
    if (prev === undefined) delete process.env.EXTERNAL_TOKEN; else process.env.EXTERNAL_TOKEN = prev;
  }
  const all = captured.join('\n');
  assert.ok(!all.includes('tok-live-abcdef-12345'), 'o token NÃO pode aparecer no log');
  assert.ok(all.includes('****'), 'o token deve ter sido mascarado');
});

// --- erro tipado ---------------------------------------------------------------------------------
test('AppError: forma { code, message, statusCode, originalError } e toJSON sem stack', () => {
  const err = new AppError('falhou', { code: 'EXTERNAL_HTTP_500', statusCode: 500, transient: true, originalError: new Error('socket hang up') });
  assert.equal(err.code, 'EXTERNAL_HTTP_500');
  assert.equal(err.statusCode, 500);
  assert.equal(err.transient, true);
  assert.equal(err.originalError.message, 'socket hang up');
  const json = err.toJSON();
  assert.deepEqual(Object.keys(json).sort(), ['code', 'message', 'originalError', 'statusCode']);
  assert.ok(!('stack' in json), 'toJSON NÃO expõe stack');
  assert.equal(json.originalError.stack, undefined);
});

test('AppError: a mensagem é redigida (segredo conhecido não vaza na message)', () => {
  const prev = process.env.EXTERNAL_TOKEN;
  process.env.EXTERNAL_TOKEN = 'leak-token-77';
  try {
    const err = new AppError('erro com leak-token-77 embutido', { code: 'X' });
    assert.ok(!err.message.includes('leak-token-77'));
    assert.ok(err.message.includes('****'));
  } finally {
    if (prev === undefined) delete process.env.EXTERNAL_TOKEN; else process.env.EXTERNAL_TOKEN = prev;
  }
});

// --- montagem do registro de auditoria -----------------------------------------------------------
test('buildAuditEntry: sucesso → registro com tenant/produto/pedido, status e payloads sanitizados', () => {
  const entry = buildAuditEntry({
    audit: { tenant: 'acme', productId: 5, orderId: 101 },
    attempt: 1, outcome: 'success', statusCode: 200,
    request: { id: 5, title: 'Álcool 70%' },
    response: { ref: 'EXT-5', token: 'should-be-masked' },
    durationMs: 42,
  });
  assert.equal(entry.tenant, 'acme');
  assert.equal(entry.operation, 'submeter_pedido');
  assert.equal(entry.productId, 5);
  assert.equal(entry.orderId, 101);
  assert.equal(entry.outcome, 'success');
  assert.equal(entry.statusCode, 200);
  assert.equal(entry.attempt, 1);
  assert.equal(entry.durationMs, 42);
  assert.equal(entry.responsePayload.ref, 'EXT-5');
  assert.equal(entry.responsePayload.token, '****', 'segredo na resposta é redigido na auditoria');
  assert.equal(entry.errorRedacted, null);
});

test('buildAuditEntry: falha → outcome failure + erro redigido + tenant default quando ausente', () => {
  const entry = buildAuditEntry({
    audit: {}, attempt: 3, outcome: 'failure', statusCode: 503,
    request: { id: 9, title: 'X' },
    error: new AppError('fornecedor respondeu 503', { code: 'EXTERNAL_HTTP_503', statusCode: 503 }),
    durationMs: 10,
  });
  assert.equal(entry.tenant, 'default');
  assert.equal(entry.productId, null);
  assert.equal(entry.orderId, null);
  assert.equal(entry.outcome, 'failure');
  assert.equal(entry.statusCode, 503);
  assert.equal(entry.errorRedacted, 'fornecedor respondeu 503');
  assert.equal(entry.responsePayload, null);
});

// --- dispatch: resiliência + auditoria por troca -------------------------------------------------
const okResp = (body) => ({ ok: true, status: 200, json: async () => body });
const errResp = (status, body = {}) => ({ ok: false, status, json: async () => body });
const memAuditStore = () => { const rows = []; return { rows, record: async (e) => { rows.push(e); return e; } }; };
const silentLog = { info() {}, warn() {}, error() {} };

test('dispatch: sucesso → externalRef + 1 auditoria success, sem retry', async () => {
  let calls = 0;
  const audit = memAuditStore();
  const res = await dispatch({ id: 5, title: 'Álcool 70%' }, {
    audit: { tenant: 'acme', productId: 5, orderId: 101 },
    fetchImpl: async () => { calls++; return okResp({ ref: 'EXT-5' }); },
    auditStore: audit, log: silentLog, sleepImpl: async () => {},
  });
  assert.equal(res.externalRef, 'EXT-5');
  assert.equal(calls, 1, 'sucesso na 1ª tentativa não faz retry');
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].outcome, 'success');
  assert.equal(audit.rows[0].tenant, 'acme');
});

test('dispatch: 5xx transitório → retry com backoff (1s,2s), N tentativas e erro tipado', async () => {
  let calls = 0; const backoffs = [];
  const audit = memAuditStore();
  await assert.rejects(
    () => dispatch({ id: 9, title: 'Avental' }, {
      audit: { tenant: 'acme', productId: 9, orderId: 200 },
      maxAttempts: 3,
      fetchImpl: async () => { calls++; return errResp(503, { error: 'indisponivel' }); },
      auditStore: audit, log: silentLog,
      sleepImpl: async (ms) => { backoffs.push(ms); },
    }),
    (e) => {
      assert.ok(e instanceof AppError);
      assert.equal(e.code, 'EXTERNAL_HTTP_503');
      assert.equal(e.statusCode, 503);
      assert.equal(e.transient, true);
      return true;
    }
  );
  assert.equal(calls, 3, 'esgota as 3 tentativas');
  assert.deepEqual(backoffs, [1000, 2000], 'backoff exponencial 1s, 2s entre as 3 tentativas');
  assert.equal(audit.rows.length, 3, 'uma auditoria por troca');
  assert.ok(audit.rows.every((r) => r.outcome === 'failure'));
});

test('dispatch: 4xx NÃO-transitório → falha imediata (sem retry), 1 auditoria failure', async () => {
  let calls = 0;
  const audit = memAuditStore();
  await assert.rejects(
    () => dispatch({ id: 1, title: 'X' }, {
      fetchImpl: async () => { calls++; return errResp(400, { error: 'payload inválido' }); },
      auditStore: audit, log: silentLog, sleepImpl: async () => {},
    }),
    (e) => { assert.equal(e.code, 'EXTERNAL_HTTP_400'); assert.equal(e.transient, false); return true; }
  );
  assert.equal(calls, 1, '4xx não-transitório não faz retry');
  assert.equal(audit.rows.length, 1);
});

test('dispatch: timeout/rede → erro tipado transitório com retry e auditoria', async () => {
  let calls = 0;
  const audit = memAuditStore();
  await assert.rejects(
    () => dispatch({ id: 2, title: 'Y' }, {
      maxAttempts: 2,
      fetchImpl: async () => { calls++; const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; },
      auditStore: audit, log: silentLog, sleepImpl: async () => {},
    }),
    (e) => { assert.equal(e.code, 'EXTERNAL_TIMEOUT'); assert.equal(e.statusCode, 504); assert.equal(e.transient, true); return true; }
  );
  assert.equal(calls, 2);
  assert.equal(audit.rows.length, 2);
  assert.ok(audit.rows.every((r) => r.outcome === 'failure' && r.statusCode === null));
});

test('dispatch: auditoria é fail-soft (falha ao gravar NÃO derruba a troca bem-sucedida)', async () => {
  const res = await dispatch({ id: 3, title: 'Z' }, {
    fetchImpl: async () => okResp({ ref: 'EXT-3' }),
    auditStore: { record: async () => { throw new Error('postgres fora'); } },
    log: silentLog, sleepImpl: async () => {},
  });
  assert.equal(res.externalRef, 'EXT-3', 'sucesso é preservado mesmo se a auditoria falhar');
});
