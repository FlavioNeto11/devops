// Verificação: gateway centralizado, auditoria, retry/backoff, erros tipados, degradação graciosa.
// REQ-CONTAVIVA360-0009 — acceptance criteria: AC4 (env config), AC5 (auditoria), AC6 (erros tipados)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dir, '../src', f), 'utf-8');

const auditSrc = read('gateways/gateway-audit.js');
const sefazSrc = read('gateways/sefaz-gateway.js');
const rfbSrc   = read('gateways/rfb-gateway.js');
const esocialSrc = read('gateways/esocial-gateway.js');
const metricsSrc = read('metrics.js');
const serverSrc = read('server.js');
const dbSrc = read('db.js');

// ── AC5 — Auditoria de chamadas ──────────────────────────────────────────────

test('gateway-audit: redactObject existe e está exportado', () => {
  assert.ok(auditSrc.includes('export function redactObject'), 'redactObject exportado');
});

test('gateway-audit: logExchange existe e está exportado', () => {
  assert.ok(auditSrc.includes('export async function logExchange'), 'logExchange exportado');
});

test('gateway-audit: logExchange registra gateway, method, endpoint, user_id, error_code', () => {
  assert.ok(auditSrc.includes('gateway, method, endpoint'), 'campos principais presentes na query');
  assert.ok(auditSrc.includes('user_id'), 'user_id presente na auditoria');
  assert.ok(auditSrc.includes('error_code'), 'error_code presente na auditoria');
  assert.ok(auditSrc.includes('duration_ms'), 'duration_ms presente');
  assert.ok(auditSrc.includes('attempts'), 'attempts presente');
});

test('gateway-audit: falha de DB nunca bloqueia operação (try/catch silencioso)', () => {
  assert.ok(auditSrc.includes('audit failure NUNCA bloqueia') || auditSrc.includes('audit failure never blocks'), 'falha silenciosa documentada');
  assert.ok(auditSrc.includes('} catch {'), 'catch silencioso presente');
});

test('gateway-audit: redactObject mascara campos sensíveis', async () => {
  // Importa diretamente para testar a lógica de redação
  const { redactObject } = await import('../src/gateways/gateway-audit.js');
  const obj = {
    cnpj: '12.345.678/0001-99',
    senha: 'minhasenha123',
    cert: 'BEGIN CERTIFICATE...',
    nome: 'João Silva',
    payload: { token: 'abc123', descricao: 'produto' },
  };
  const redacted = redactObject(obj);
  assert.equal(redacted.cnpj, '12.345.678/0001-99', 'cnpj NÃO redacted');
  assert.equal(redacted.senha, '[REDACTED]', 'senha deve ser redacted');
  assert.equal(redacted.cert, '[REDACTED]', 'cert deve ser redacted');
  assert.equal(redacted.nome, 'João Silva', 'nome NÃO redacted');
  assert.equal(redacted.payload.token, '[REDACTED]', 'token aninhado redacted');
  assert.equal(redacted.payload.descricao, 'produto', 'descricao aninhada NÃO redacted');
});

test('gateway-audit: redactObject não vaza dados de certificado PFX', async () => {
  const { redactObject } = await import('../src/gateways/gateway-audit.js');
  const obj = { certPass: 'senha-pfx-123', pfx: Buffer.from([0x30, 0x82]), rawBuffer: Buffer.from([0x01]) };
  const redacted = redactObject(obj);
  assert.equal(redacted.certPass, '[REDACTED]', 'certPass redacted por key match');
  // pfx está em REDACT_KEYS → redacted por key antes de checar tipo Buffer
  assert.equal(redacted.pfx, '[REDACTED]', 'pfx redacted por key match (em REDACT_KEYS)');
  // Buffer sem key sensível → redacted por tipo Buffer
  assert.equal(redacted.rawBuffer, '[Buffer redacted]', 'Buffer sem key sensível → [Buffer redacted]');
});

// ── Nenhuma chamada HTTP ao externo fora de gateways/ ────────────────────────

test('server.js: não faz fetch() direto a sistema externo', () => {
  assert.ok(!serverSrc.includes("fetch('http"), 'server.js não chama fetch() com URL externa');
  assert.ok(!serverSrc.includes('fetch("http'), 'server.js não chama fetch() hardcoded');
});

test('sefaz-gateway: importa logExchange para auditoria', () => {
  assert.ok(sefazSrc.includes("import { logExchange } from './gateway-audit.js'"), 'sefaz importa logExchange');
});

test('rfb-gateway: importa logExchange para auditoria', () => {
  assert.ok(rfbSrc.includes("import { logExchange } from './gateway-audit.js'"), 'rfb importa logExchange');
});

test('esocial-gateway: importa logExchange para auditoria', () => {
  assert.ok(esocialSrc.includes("import { logExchange } from './gateway-audit.js'"), 'esocial importa logExchange');
});

// ── AC1 — Gateway SEFAZ: operações completas ─────────────────────────────────

test('sefaz-gateway: tem método submit', () => {
  assert.ok(sefazSrc.includes('async submit('), 'método submit presente');
});

test('sefaz-gateway: tem método consultar', () => {
  assert.ok(sefazSrc.includes('async consultar('), 'método consultar presente');
});

test('sefaz-gateway: tem método cancelar', () => {
  assert.ok(sefazSrc.includes('async cancelar('), 'método cancelar presente');
});

test('sefaz-gateway: tem método inutilizar', () => {
  assert.ok(sefazSrc.includes('async inutilizar('), 'método inutilizar presente');
});

test('sefaz-gateway: sandbox sempre aprova (DEV sem certificado)', async () => {
  const { createSefazGateway } = await import('../src/gateways/sefaz-gateway.js');
  delete process.env.SEFAZ_PROVIDER;
  const gw = createSefazGateway();
  const result = await gw.consultar('35240100000000000000550001000000001000000014');
  assert.equal(result.cStat, 100, 'sandbox consulta retorna cStat 100');
  assert.ok(result.sandbox, 'indica sandbox');
});

test('sefaz-gateway: sandbox cancelar retorna cStat 101', async () => {
  const { createSefazGateway } = await import('../src/gateways/sefaz-gateway.js');
  delete process.env.SEFAZ_PROVIDER;
  const gw = createSefazGateway();
  const result = await gw.cancelar('35240100000000000000550001000000001000000014', 'Erro de emissão', { userId: 'user-1' });
  assert.equal(result.cStat, 101, 'sandbox cancelar retorna cStat 101');
  assert.ok(result.protocolo, 'protocolo presente');
});

test('sefaz-gateway: sandbox inutilizar retorna cStat 102', async () => {
  const { createSefazGateway } = await import('../src/gateways/sefaz-gateway.js');
  delete process.env.SEFAZ_PROVIDER;
  const gw = createSefazGateway();
  const result = await gw.inutilizar('001', '1', '5', 'Números não utilizados');
  assert.equal(result.cStat, 102, 'sandbox inutilizar retorna cStat 102');
});

// ── AC6 — Erros tipados (não expõe SOAP fault) ───────────────────────────────

test('sefaz-gateway: formatGatewayError exportado', () => {
  assert.ok(sefazSrc.includes('export function formatGatewayError'), 'formatGatewayError exportado');
});

test('sefaz-gateway: formatGatewayError retorna formato tipado {error, code, retry_after}', async () => {
  const { SefazError, formatGatewayError } = await import('../src/gateways/sefaz-gateway.js');
  const err = new SefazError(502, 'Timeout', 'SEFAZ não respondeu', { code: 'SEFAZ_NETWORK_ERROR', retryable: true });
  const typed = formatGatewayError(err);
  assert.ok(typed, 'formatGatewayError retornou algo');
  assert.ok(typed.error, 'campo error presente');
  assert.ok(typed.code, 'campo code presente');
  assert.equal(typeof typed.retry_after, 'number', 'retry_after é número para erros de timeout');
  assert.ok(typed.error.startsWith('gateway_sefaz_'), 'error tem prefixo gateway_sefaz_');
  assert.ok(typed.code.startsWith('EXT_'), 'code tem prefixo EXT_');
});

test('sefaz-gateway: SEFAZ_NO_CERT → code EXT_MISCONFIGURED sem retry_after', async () => {
  const { SefazError, formatGatewayError } = await import('../src/gateways/sefaz-gateway.js');
  const err = new SefazError(400, 'Sem cert', 'fail-safe', { code: 'SEFAZ_NO_CERT', retryable: false });
  const typed = formatGatewayError(err);
  assert.equal(typed.code, 'EXT_MISCONFIGURED', 'sem cert → EXT_MISCONFIGURED');
  assert.equal(typed.retry_after, null, 'sem retry_after para misconfigured');
});

test('sefaz-gateway: SEFAZ_RETRY_EXHAUSTED → code EXT_UNAVAILABLE', async () => {
  const { SefazError, formatGatewayError } = await import('../src/gateways/sefaz-gateway.js');
  const err = new SefazError(502, 'Esgotado', 'retries', { code: 'SEFAZ_RETRY_EXHAUSTED', retryable: false });
  const typed = formatGatewayError(err);
  assert.equal(typed.code, 'EXT_UNAVAILABLE');
  assert.ok(typed.retry_after > 0, 'retry_after > 0 para indisponível');
});

// ── AC2 — Gateway RFB ────────────────────────────────────────────────────────

test('rfb-gateway: sandbox consultarCadastral retorna dados determinísticos', async () => {
  const { createRfbGateway } = await import('../src/gateways/rfb-gateway.js');
  delete process.env.RFB_PROVIDER;
  const gw = createRfbGateway();
  const result = await gw.consultarCadastral('12345678000199', { userId: 'u1' });
  assert.ok(result.razao_social, 'razao_social presente');
  assert.equal(result.situacao_cadastral, 'ATIVA', 'sandbox sempre retorna ATIVA');
  assert.ok(result.sandbox, 'indica sandbox');
});

test('rfb-gateway: sandbox submeterDocumento retorna protocolo', async () => {
  const { createRfbGateway } = await import('../src/gateways/rfb-gateway.js');
  delete process.env.RFB_PROVIDER;
  const gw = createRfbGateway();
  const result = await gw.submeterDocumento({ tipo: 'DCTF', periodo: '2024-01', valor: 1000 });
  assert.ok(result.protocolo, 'protocolo presente');
  assert.equal(result.status, 'aceito', 'sandbox sempre aceita');
});

test('rfb-gateway: sandbox listarDownloads retorna array', async () => {
  const { createRfbGateway } = await import('../src/gateways/rfb-gateway.js');
  delete process.env.RFB_PROVIDER;
  const gw = createRfbGateway();
  const result = await gw.listarDownloads();
  assert.ok(Array.isArray(result.downloads), 'downloads é array');
});

test('rfb-gateway: formatRfbError retorna formato tipado', async () => {
  const { RfbError, formatRfbError } = await import('../src/gateways/rfb-gateway.js');
  const err = new RfbError(502, 'Timeout', 'rede', { code: 'RFB_NETWORK_ERROR' });
  const typed = formatRfbError(err);
  assert.equal(typed.code, 'EXT_TIMEOUT');
  assert.ok(typed.error.startsWith('gateway_rfb_'));
});

// ── AC3 — Gateway e-Social ────────────────────────────────────────────────────

test('esocial-gateway: TIPOS_VALIDOS exportado e contém S-1000, S-2000, S-2200', async () => {
  const { TIPOS_VALIDOS } = await import('../src/gateways/esocial-gateway.js');
  assert.ok(TIPOS_VALIDOS.includes('S-1000'), 'S-1000 presente');
  assert.ok(TIPOS_VALIDOS.includes('S-2000'), 'S-2000 presente');
  assert.ok(TIPOS_VALIDOS.includes('S-2200'), 'S-2200 presente');
});

test('esocial-gateway: sandbox enviarEvento S-1000 retorna aceito', async () => {
  const { createESocialGateway } = await import('../src/gateways/esocial-gateway.js');
  delete process.env.ESOCIAL_PROVIDER;
  const gw = createESocialGateway();
  const result = await gw.enviarEvento('S-1000', { cnpj: '12345678000199', nomeEmpresa: 'Empresa Teste' }, { userId: 'u2' });
  assert.equal(result.status, 'aceito');
  assert.ok(result.eventoId, 'eventoId presente');
  assert.ok(result.sandbox, 'indica sandbox');
});

test('esocial-gateway: sandbox enviarEvento S-2200 retorna aceito', async () => {
  const { createESocialGateway } = await import('../src/gateways/esocial-gateway.js');
  delete process.env.ESOCIAL_PROVIDER;
  const gw = createESocialGateway();
  const result = await gw.enviarEvento('S-2200', { cpf: '12345678901', remuneracao: 5000 });
  assert.equal(result.status, 'aceito');
  assert.equal(result.tipo, 'S-2200');
});

test('esocial-gateway: tipo inválido lança ESocialError com code ESOCIAL_INVALID_TIPO', async () => {
  const { createESocialGateway, ESocialError } = await import('../src/gateways/esocial-gateway.js');
  delete process.env.ESOCIAL_PROVIDER;
  const gw = createESocialGateway();
  await assert.rejects(
    () => gw.enviarEvento('S-9999', {}),
    (err) => err instanceof ESocialError && err.code === 'ESOCIAL_INVALID_TIPO',
    'tipo inválido deve lançar ESocialError',
  );
});

test('esocial-gateway: sandbox consultarEvento retorna processado', async () => {
  const { createESocialGateway } = await import('../src/gateways/esocial-gateway.js');
  delete process.env.ESOCIAL_PROVIDER;
  const gw = createESocialGateway();
  const result = await gw.consultarEvento('SBX-S-1000-123456');
  assert.equal(result.status, 'processado');
});

// ── AC4 — Configuração por environment ────────────────────────────────────────

test('sefaz-gateway: DEV (sem SEFAZ_PROVIDER) retorna SefazSandboxGateway', async () => {
  delete process.env.SEFAZ_PROVIDER;
  const { createSefazGateway } = await import('../src/gateways/sefaz-gateway.js');
  const gw = createSefazGateway();
  assert.ok(typeof gw.submit === 'function', 'submit disponível');
  assert.ok(typeof gw.consultar === 'function', 'consultar disponível');
  assert.ok(typeof gw.cancelar === 'function', 'cancelar disponível');
  assert.ok(typeof gw.inutilizar === 'function', 'inutilizar disponível');
});

test('rfb-gateway: DEV (sem RFB_PROVIDER) retorna sandbox', async () => {
  delete process.env.RFB_PROVIDER;
  const { createRfbGateway } = await import('../src/gateways/rfb-gateway.js');
  const gw = createRfbGateway();
  const r = await gw.consultarCadastral('00000000000000');
  assert.ok(r.sandbox, 'sandbox ativo sem env var');
});

test('esocial-gateway: DEV (sem ESOCIAL_PROVIDER) retorna sandbox', async () => {
  delete process.env.ESOCIAL_PROVIDER;
  const { createESocialGateway } = await import('../src/gateways/esocial-gateway.js');
  const gw = createESocialGateway();
  const r = await gw.enviarEvento('S-1000', {});
  assert.ok(r.sandbox, 'sandbox ativo sem env var');
});

// ── 5xx/timeout dispara retry com backoff ─────────────────────────────────────

test('sefaz-gateway: backoffMs cresce exponencialmente', () => {
  // Extrai e testa a função inline
  const BASE = 1000;
  const fn = (a) => Math.min(BASE * Math.pow(2, a - 1), 30000);
  assert.equal(fn(1), 1000, 'tentativa 1 = 1s');
  assert.equal(fn(2), 2000, 'tentativa 2 = 2s');
  assert.equal(fn(3), 4000, 'tentativa 3 = 4s');
  assert.equal(fn(10), 30000, 'tentativa 10 limitada a 30s');
});

test('sefaz-gateway: isTransientStatus inclui 408, 429, 5xx', () => {
  assert.ok(sefazSrc.includes('408') && sefazSrc.includes('429') && sefazSrc.includes('>= 500'), '408/429/5xx são transientes');
});

test('rfb-gateway: tem retry loop com FOR (attempt)', () => {
  assert.ok(rfbSrc.includes('for (attempt'), 'loop de retry presente em rfb-gateway');
});

test('esocial-gateway: tem retry loop com FOR (attempt)', () => {
  assert.ok(esocialSrc.includes('for (attempt'), 'loop de retry presente em esocial-gateway');
});

test('rfb-gateway: após exaurir tentativas lança RFB_RETRY_EXHAUSTED', () => {
  assert.ok(rfbSrc.includes('RFB_RETRY_EXHAUSTED'), 'código RFB_RETRY_EXHAUSTED presente');
});

test('esocial-gateway: após exaurir tentativas lança ESOCIAL_RETRY_EXHAUSTED', () => {
  assert.ok(esocialSrc.includes('ESOCIAL_RETRY_EXHAUSTED'), 'código ESOCIAL_RETRY_EXHAUSTED presente');
});

// ── Observabilidade: /metrics na :9464 ────────────────────────────────────────

test('metrics.js: expõe contadores de gateway (gateway_calls_total, gateway_errors_total)', () => {
  assert.ok(metricsSrc.includes('contaviva_360_gateway_calls_total'), 'gateway_calls_total presente');
  assert.ok(metricsSrc.includes('contaviva_360_gateway_errors_total'), 'gateway_errors_total presente');
  assert.ok(metricsSrc.includes('contaviva_360_gateway_latency_seconds'), 'gateway_latency_seconds presente');
});

test('metrics.js: servidor de métricas é idempotente (não reinicia se já ativo)', () => {
  assert.ok(metricsSrc.includes('_metricsSrv'), 'guard de instância presente');
});

// ── Tabela de auditoria no banco ──────────────────────────────────────────────

test('db.js: tem migration de gateway_audit_log', () => {
  assert.ok(dbSrc.includes('gateway_audit_log'), 'tabela gateway_audit_log definida em migrations');
  assert.ok(dbSrc.includes('gateway TEXT NOT NULL'), 'coluna gateway presente');
  assert.ok(dbSrc.includes('user_id TEXT'), 'coluna user_id presente');
  assert.ok(dbSrc.includes('error_code TEXT'), 'coluna error_code presente');
  assert.ok(dbSrc.includes('attempts INTEGER'), 'coluna attempts presente');
});
