/**
 * API de seguros do transportador (RCTR-C/RC-DC/RC-V) e PGR (PR-F2): CRUD de apólices, PGR,
 * verificação via provider (mock) e alertas de vencimento — contra o app REAL (`createApp`) e o
 * Postgres local. Molde: `tests/api/transporte-rntrc.test.js` (skip limpo quando o banco está fora,
 * tenancy com DUAS contas criadas direto no banco).
 *
 * Datas são SEMPRE relativas a `new Date()` (nunca literais absolutas) — o teste roda em qualquer
 * data real da máquina, mesmo padrão de `todayIsoDate()` em `transport-insurance-service.ts`.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_trseg_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trseg_b_${RUN_ID}`;

// ===================================================================================================
// Gerador de CNPJ VÁLIDO (dígito verificador correto — `validatePartyDocument` rejeita qualquer
// CNPJ inventado sem os dois dígitos calculados certos). Mesmo algoritmo de
// `transport-party-validator.ts#cnpjCheckDigit`, replicado aqui (o validador não exporta um
// "gerador", só o "validador" — coerente com a fronteira de responsabilidade do módulo).
// ===================================================================================================

const RUN_SEED = parseInt(RUN_ID, 16) % 90000;
let cnpjSequence = 0;

function cnpjCheckDigit(digits) {
  const weights = digits.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) sum += digits[i] * weights[i];
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function buildValidCnpj(base12Digits) {
  const d1 = cnpjCheckDigit(base12Digits);
  const d2 = cnpjCheckDigit([...base12Digits, d1]);
  return base12Digits.join('') + String(d1) + String(d2);
}

/** CNPJ válido e único por execução; `evenLastDigit` controla a paridade do último dígito (o "documento" que o mock de `insurance-verification-provider.ts` usa para decidir found/not-found). */
function nextValidCnpj({ evenLastDigit } = {}) {
  cnpjSequence += 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const seq = cnpjSequence * 40 + attempt;
    const base = `11${String(RUN_SEED).padStart(5, '0')}${String(seq).padStart(5, '0')}`;
    const base12 = base.split('').map(Number);
    const cnpj = buildValidCnpj(base12);
    if (evenLastDigit === undefined) return cnpj;
    const isEven = Number(cnpj[cnpj.length - 1]) % 2 === 0;
    if (isEven === evenLastDigit) return cnpj;
  }
  throw new Error('não foi possível gerar CNPJ válido com a paridade pedida');
}

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de API pulado (${dbUnavailableReason})`);
  return true;
}

async function callApi(method, path, { body, headers = authHeaders() } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);
  return { response, body: json };
}

/** Data ISO ('YYYY-MM-DD') a partir de HOJE + `days` (pode ser negativo) — nunca literal absoluta. */
function isoDateOffset(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createParty(accountId, documentNumber, suffix) {
  const created = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: accountId,
      documentType: 'CNPJ',
      documentNumber,
      legalName: `Transportadora Seguros ${suffix}`
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

async function createOperationWithCarrier(accountId, partyId, suffix) {
  const created = await callApi('POST', '/v1/transporte/operacoes', {
    body: {
      integrationAccountId: accountId,
      cargoRegime: 'lotacao',
      referenceCode: `OP-SEG-${suffix}`,
      route: {
        originMunicipality: 'São Paulo',
        originUf: 'SP',
        destinationMunicipality: 'Campinas',
        destinationUf: 'SP'
      },
      parties: [{ partyId, role: 'carrier' }]
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

async function createPolicy(accountId, partyId, overrides = {}) {
  const body = {
    integrationAccountId: accountId,
    policyType: 'RCTR_C',
    insurerName: 'Seguradora Exemplo S.A.',
    policyNumber: `POL-${randomBytes(4).toString('hex')}`,
    coverageAmount: 500000,
    validFrom: isoDateOffset(-30),
    validUntil: isoDateOffset(400),
    ...overrides
  };
  const created = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices`, { body });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body;
}

before(async () => {
  try {
    await pool.connect().then((client) => client.release());
  } catch (error) {
    dbAvailable = false;
    dbUnavailableReason = (error && (error.message || error.code)) || String(error);
    return;
  }

  await runMigrations();

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste Seguros'), ($2, 'Conta B - teste Seguros')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query('delete from insurance_verifications where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from risk_management_plans where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from insurance_policies where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    // `transport_operation_parties`/`_routes`/`_vehicles`/`_cargo` são `on delete cascade` para
    // `transport_operations` (migration 024) — deletar o cabeçalho já limpa os sub-recursos.
    await query('delete from transport_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('POST .../apolices — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/transportadores/trparty_qualquer/apolices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../apolices — registro manual (201)', () => {
  it('cria a apólice + insurance_verifications strategy manual NUMA transação', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice1');
    const policy = await createPolicy(ACCOUNT_A, partyId, {
      validFrom: isoDateOffset(-10),
      validUntil: isoDateOffset(355),
      evidence: { notes: 'Apólice recebida por e-mail.', ignoredField: 'nunca persiste' }
    });

    assert.ok(policy.id?.startsWith('inspol_'));
    assert.equal(policy.partyId, partyId);
    assert.equal(policy.policyType, 'RCTR_C');
    assert.equal(policy.status, 'active');
    assert.equal(policy.evidenceSource, 'manual');
    assert.equal(policy.isCurrentlyValid, true);
    assert.equal(policy.version, 1);

    const verRes = await query(
      'select * from insurance_verifications where policy_id = $1',
      [policy.id]
    );
    assert.equal(verRes.rows.length, 1);
    assert.equal(verRes.rows[0].strategy, 'manual');
    assert.equal(verRes.rows[0].requested_status, 'succeeded');

    const policyRow = await query('select evidence from insurance_policies where id = $1', [policy.id]);
    assert.deepEqual(policyRow.rows[0].evidence, { notes: 'Apólice recebida por e-mail.' }, 'LGPD: só notes/documentRef sobrevivem');
  });

  it('sem policyType → 400 TRANSPORT_INSURANCE_POLICY_TYPE_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice2');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        insurerName: 'Seguradora X',
        policyNumber: 'POL-1',
        validFrom: isoDateOffset(-10),
        validUntil: isoDateOffset(300)
      }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_POLICY_TYPE_INVALID');
  });

  it('validUntil anterior a validFrom → 400 TRANSPORT_INSURANCE_POLICY_PERIOD_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice3');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        policyType: 'RCTR_C',
        insurerName: 'Seguradora X',
        policyNumber: 'POL-2',
        validFrom: isoDateOffset(10),
        validUntil: isoDateOffset(-10)
      }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_POLICY_PERIOD_INVALID');
  });

  it('mesmo policyType+policyNumber para o mesmo transportador → 409 TRANSPORT_INSURANCE_POLICY_DUPLICATE', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice4');
    const policyNumber = `DUP-${randomBytes(3).toString('hex')}`;
    await createPolicy(ACCOUNT_A, partyId, { policyNumber });

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        policyType: 'RCTR_C',
        insurerName: 'Seguradora X',
        policyNumber,
        validFrom: isoDateOffset(-1),
        validUntil: isoDateOffset(30)
      }
    });
    assert.equal(response.status, 409);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_POLICY_DUPLICATE');
  });

  it('party inexistente → 404 TRANSPORT_PARTY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/transportadores/trparty_inexistente/apolices', {
      body: {
        integrationAccountId: ACCOUNT_A,
        policyType: 'RCTR_C',
        insurerName: 'Seguradora X',
        policyNumber: 'POL-404',
        validFrom: isoDateOffset(-1),
        validUntil: isoDateOffset(30)
      }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_PARTY_NOT_FOUND');
  });
});

describe('GET .../apolices — listagem com vigência derivada', () => {
  it('isCurrentlyValid/daysToExpiry corretos para apólice vigente e apólice vencida', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice5');

    await createPolicy(ACCOUNT_A, partyId, { policyType: 'RC_DC', validFrom: isoDateOffset(-100), validUntil: isoDateOffset(100) });
    await createPolicy(ACCOUNT_A, partyId, { policyType: 'RC_V', validFrom: isoDateOffset(-400), validUntil: isoDateOffset(-10) });

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${partyId}/apolices?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.total, 2);

    const current = body.items.find((item) => item.policyType === 'RC_DC');
    assert.equal(current.isCurrentlyValid, true);
    assert.ok(current.daysToExpiry > 0);

    const expired = body.items.find((item) => item.policyType === 'RC_V');
    assert.equal(expired.isCurrentlyValid, false);
    assert.ok(expired.daysToExpiry < 0);
  });

  it('filtro por policyType', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Apolice6');
    await createPolicy(ACCOUNT_A, partyId, { policyType: 'RCTR_C' });
    await createPolicy(ACCOUNT_A, partyId, { policyType: 'RC_DC' });

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${partyId}/apolices?integrationAccountId=${ACCOUNT_A}&policyType=RC_DC`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.total, 1);
    assert.equal(body.items[0].policyType, 'RC_DC');
  });
});

describe('PATCH .../apolices/{policyId} — locking otimista e auditoria de vigência', () => {
  it('atualizar coverageAmount (sem tocar vigência) NÃO gera insurance_verifications nova', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Patch1');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const before = await query('select count(*)::int as count from insurance_verifications where policy_id = $1', [policy.id]);

    const { response, body } = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: policy.version, coverageAmount: 750000 }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.coverageAmount, 750000);
    assert.equal(body.version, 2);

    const after = await query('select count(*)::int as count from insurance_verifications where policy_id = $1', [policy.id]);
    assert.equal(after.rows[0].count, before.rows[0].count, 'sem mudança de vigência, sem verification nova');
  });

  it('atualizar validUntil GERA uma insurance_verifications nova com o resultado da alteração', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Patch2');
    const policy = await createPolicy(ACCOUNT_A, partyId);
    const newValidUntil = isoDateOffset(500);

    const { response, body } = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: policy.version, validUntil: newValidUntil }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.validUntil, newValidUntil);

    const verRes = await query(
      `select * from insurance_verifications where policy_id = $1 order by created_at desc`,
      [policy.id]
    );
    assert.equal(verRes.rows.length >= 2, true, 'a verification original + a nova de alteração');
    assert.equal(verRes.rows[0].result.change, 'validity_updated');
    assert.equal(verRes.rows[0].result.validUntil, newValidUntil);
  });

  it('version divergente → 409 TRANSPORT_INSURANCE_POLICY_VERSION_CONFLICT', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Patch3');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const { response, body } = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 999, coverageAmount: 1 }
    });
    assert.equal(response.status, 409);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_POLICY_VERSION_CONFLICT');
  });

  it('policyId de OUTRO transportador → 404 TRANSPORT_INSURANCE_POLICY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId1 = await createParty(ACCOUNT_A, nextValidCnpj(), 'Patch4a');
    const partyId2 = await createParty(ACCOUNT_A, nextValidCnpj(), 'Patch4b');
    const policy = await createPolicy(ACCOUNT_A, partyId1);

    const { response, body } = await callApi('PATCH', `/v1/transporte/transportadores/${partyId2}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: policy.version, coverageAmount: 1 }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_POLICY_NOT_FOUND');
  });
});

describe('POST .../apolices/verificar — provider mock', () => {
  it('documento terminado em dígito PAR → cria as 3 apólices via mock', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj({ evenLastDigit: true }), 'Verificar1');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/verificar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.source, 'mock');
    assert.equal(body.policies.length, 3);
    for (const policy of body.policies) {
      assert.equal(policy.evidenceSource, 'mock');
    }

    const dbPolicies = await query('select * from insurance_policies where party_id = $1', [partyId]);
    assert.equal(dbPolicies.rows.length, 3);
  });

  it('rodar verificar DUAS vezes para o MESMO documento é IDEMPOTENTE (atualiza, não duplica)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj({ evenLastDigit: true }), 'Verificar2');

    await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/verificar`, { body: { integrationAccountId: ACCOUNT_A } });
    await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/verificar`, { body: { integrationAccountId: ACCOUNT_A } });

    const dbPolicies = await query('select * from insurance_policies where party_id = $1', [partyId]);
    assert.equal(dbPolicies.rows.length, 3, 'segunda verificação atualiza as mesmas 3 apólices, não duplica');
  });

  it('documento terminado em dígito ÍMPAR → 0 apólices, grava insurance_verifications sem policy_id', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj({ evenLastDigit: false }), 'Verificar3');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/verificar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body.policies, []);

    const verRes = await query('select * from insurance_verifications where party_id = $1 and policy_id is null', [partyId]);
    assert.equal(verRes.rows.length, 1);
  });
});

describe('POST .../pgr — registro manual (201) e GET listagem', () => {
  it('cria o PGR e lista de volta', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Pgr1');

    const created = await callApi('POST', `/v1/transporte/transportadores/${partyId}/pgr`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        planReference: `PGR-${randomBytes(3).toString('hex')}`,
        versionLabel: 'v1',
        validFrom: isoDateOffset(-30),
        validUntil: isoDateOffset(700)
      }
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.ok(created.body.id?.startsWith('pgr_'));
    assert.deepEqual(created.body.relatedPolicyTypes.sort(), ['RCTR_C', 'RC_DC']);
    assert.equal(created.body.isCurrentlyValid, true);

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${partyId}/pgr?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.totalItems, 1);
    assert.equal(body.items[0].id, created.body.id);
  });

  it('planReference duplicado para o mesmo transportador → 409 TRANSPORT_PGR_DUPLICATE', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Pgr2');
    const planReference = `PGR-DUP-${randomBytes(3).toString('hex')}`;

    const first = await callApi('POST', `/v1/transporte/transportadores/${partyId}/pgr`, {
      body: { integrationAccountId: ACCOUNT_A, planReference, validFrom: isoDateOffset(-1) }
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const second = await callApi('POST', `/v1/transporte/transportadores/${partyId}/pgr`, {
      body: { integrationAccountId: ACCOUNT_A, planReference, validFrom: isoDateOffset(-1) }
    });
    assert.equal(second.response.status, 409);
    assert.equal(second.body.code, 'TRANSPORT_PGR_DUPLICATE');
  });
});

describe('GET /v1/transporte/seguros/vencimentos — alertas', () => {
  it('apólice vencendo dentro de windowDays → alertType expiring_soon', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Vencimento1');
    const policy = await createPolicy(ACCOUNT_A, partyId, { validFrom: isoDateOffset(-300), validUntil: isoDateOffset(10) });

    const { response, body } = await callApi('GET', `/v1/transporte/seguros/vencimentos?integrationAccountId=${ACCOUNT_A}&windowDays=30`);
    assert.equal(response.status, 200, JSON.stringify(body));
    const alert = body.items.find((item) => item.policyId === policy.id);
    assert.ok(alert, 'apólice deveria aparecer no alerta expiring_soon');
    assert.equal(alert.alertType, 'expiring_soon');
    assert.deepEqual(alert.openOperationIds, []);
  });

  it('apólice VENCIDA com operação NÃO-TERMINAL em aberto → alertType expired_with_open_operation', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Vencimento2');
    const policy = await createPolicy(ACCOUNT_A, partyId, { validFrom: isoDateOffset(-400), validUntil: isoDateOffset(-5) });
    const operationId = await createOperationWithCarrier(ACCOUNT_A, partyId, 'Vencimento2');

    const { response, body } = await callApi('GET', `/v1/transporte/seguros/vencimentos?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    const alert = body.items.find((item) => item.policyId === policy.id);
    assert.ok(alert, 'apólice vencida com operação em aberto deveria gerar alerta');
    assert.equal(alert.alertType, 'expired_with_open_operation');
    assert.deepEqual(alert.openOperationIds, [operationId]);
  });

  it('apólice VENCIDA SEM nenhuma operação em aberto → NÃO gera alerta (controle negativo)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Vencimento3');
    const policy = await createPolicy(ACCOUNT_A, partyId, { validFrom: isoDateOffset(-400), validUntil: isoDateOffset(-5) });

    const { response, body } = await callApi('GET', `/v1/transporte/seguros/vencimentos?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    const alert = body.items.find((item) => item.policyId === policy.id);
    assert.equal(alert, undefined, 'apólice vencida sem operação em aberto não deveria gerar ruído');
  });

  it('windowDays inválido → 400 TRANSPORT_INSURANCE_WINDOW_DAYS_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', `/v1/transporte/seguros/vencimentos?integrationAccountId=${ACCOUNT_A}&windowDays=0`);
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_WINDOW_DAYS_INVALID');
  });
});

describe('Tenancy — conta B não acessa apólices/PGR da conta A', () => {
  it('GET .../apolices com integrationAccountId da conta B → 404 TRANSPORT_PARTY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Tenancy1');
    await createPolicy(ACCOUNT_A, partyId);

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${partyId}/apolices?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_PARTY_NOT_FOUND');
  });

  it('POST .../pgr com integrationAccountId da conta B → 404 TRANSPORT_PARTY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Tenancy2');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/pgr`, {
      body: { integrationAccountId: ACCOUNT_B, planReference: 'PGR-CROSS', validFrom: isoDateOffset(-1) }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_PARTY_NOT_FOUND');
  });

  it('vencimentos da conta B nunca inclui apólices da conta A', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Tenancy3');
    const policy = await createPolicy(ACCOUNT_A, partyId, { validFrom: isoDateOffset(-300), validUntil: isoDateOffset(10) });

    const { response, body } = await callApi('GET', `/v1/transporte/seguros/vencimentos?integrationAccountId=${ACCOUNT_B}&windowDays=30`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.items.some((item) => item.policyId === policy.id), false);
  });
});
