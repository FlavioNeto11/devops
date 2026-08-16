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
    // Taxas ANTES das apólices (FK insurance_rate_schedules.policy_id, migration 035); o registro
    // de idempotência do POST de taxa é por escopo `transporte.apolice.taxa.create:<conta>`.
    await query('delete from insurance_rate_schedules where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query("delete from idempotency_registry where operation = any($1)", [
      [`transporte.apolice.taxa.create:${ACCOUNT_A}`, `transporte.apolice.taxa.create:${ACCOUNT_B}`]
    ]);
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

describe('PATCH .../apolices/{policyId} — limite de garantia por viagem (PR-I2, REQ-SICAT-0028 rev.2)', () => {
  it('define perTripLimitAmount + limitConditions (sanitizado: só escalares de primeiro nível)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Limite1');
    const policy = await createPolicy(ACCOUNT_A, partyId);
    assert.equal(policy.perTripLimitAmount, null, 'apólice nasce sem limite configurado');

    const { response, body } = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        version: policy.version,
        perTripLimitAmount: 25000, // caso de ouro: teto de R$ 25.000,00 por viagem
        limitConditions: {
          notes: 'Limite por embarque conforme apólice.',
          exigeEndosso: true,
          clausulas: { texto: 'objeto aninhado NUNCA persiste (LGPD)' }
        }
      }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.perTripLimitAmount, 25000);
    assert.equal(body.limitConditions.notes, 'Limite por embarque conforme apólice.');
    assert.equal(body.limitConditions.exigeEndosso, true);
    assert.equal(body.limitConditions.clausulas, undefined, 'aninhado (formato natural de cláusula colada) é descartado');
    assert.equal(body.version, 2);
  });

  it('perTripLimitAmount null LIMPA o limite; negativo → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Limite2');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const set = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: policy.version, perTripLimitAmount: 25000 }
    });
    assert.equal(set.response.status, 200, JSON.stringify(set.body));

    const cleared = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: set.body.version, perTripLimitAmount: null }
    });
    assert.equal(cleared.response.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.perTripLimitAmount, null);

    const invalid = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: cleared.body.version, perTripLimitAmount: -1 }
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.code, 'TRANSPORT_INSURANCE_POLICY_PER_TRIP_LIMIT_INVALID');
  });
});

describe('Taxas de averbação — POST/GET .../apolices/{policyId}/taxas (PR-I2, migration 035)', () => {
  async function createRate(partyId, policyId, overrides = {}, headers = undefined) {
    return callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/${policyId}/taxas`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        ratePercent: 0.072, // percentual LITERAL do caso de ouro (0,072% RCTR-C)
        monthlyMinimumAmount: 700,
        validFrom: isoDateOffset(-30),
        ...overrides
      },
      ...(headers ? { headers } : {})
    });
  }

  it('cria a taxa (201) com percentual literal e mínimo mensal', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa1');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const { response, body } = await createRate(partyId, policy.id);
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.ok(body.id?.startsWith('insrate_'));
    assert.equal(body.policyId, policy.id);
    assert.equal(body.ratePercent, 0.072, '0,072% grava 0.072 — nunca a fração dividida');
    assert.equal(body.monthlyMinimumAmount, 700);
    assert.equal(body.routeScope, null);
    assert.equal(body.status, 'active');
    assert.deepEqual(body.supersededScheduleIds, []);
  });

  it('create supersede: taxa nova com a MESMA chave lógica marca a anterior superseded', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa2');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const first = await createRate(partyId, policy.id, { validFrom: isoDateOffset(-60) });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const second = await createRate(partyId, policy.id, { ratePercent: 0.08, validFrom: isoDateOffset(-1) });
    assert.equal(second.response.status, 201, JSON.stringify(second.body));
    assert.deepEqual(second.body.supersededScheduleIds, [first.body.id]);

    const firstRow = await query('select status from insurance_rate_schedules where id = $1', [first.body.id]);
    assert.equal(firstRow.rows[0].status, 'superseded');

    const { response, body } = await callApi(
      'GET',
      `/v1/transporte/transportadores/${partyId}/apolices/${policy.id}/taxas?integrationAccountId=${ACCOUNT_A}`
    );
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.totalItems, 2, 'o histórico fica — superseded não some da listagem');
  });

  it('routeScope distinto NÃO supersede a default (chaves lógicas diferentes convivem active)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa3');
    const policy = await createPolicy(ACCOUNT_A, partyId, { policyType: 'RC_V' });

    const base = await createRate(partyId, policy.id);
    assert.equal(base.response.status, 201, JSON.stringify(base.body));

    const scoped = await createRate(partyId, policy.id, { routeScope: 'SP-PR', ratePercent: 0.1 });
    assert.equal(scoped.response.status, 201, JSON.stringify(scoped.body));
    assert.deepEqual(scoped.body.supersededScheduleIds, [], 'percurso não disputa a chave da default');

    const active = await query(
      "select count(*)::int as count from insurance_rate_schedules where policy_id = $1 and status = 'active'",
      [policy.id]
    );
    assert.equal(active.rows[0].count, 2);
  });

  it('mesma validFrom para a mesma chave lógica → 409 TRANSPORT_INSURANCE_RATE_DUPLICATE', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa4');
    const policy = await createPolicy(ACCOUNT_A, partyId);
    const validFrom = isoDateOffset(-10);

    const first = await createRate(partyId, policy.id, { validFrom });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const dup = await createRate(partyId, policy.id, { ratePercent: 0.09, validFrom });
    assert.equal(dup.response.status, 409);
    assert.equal(dup.body.code, 'TRANSPORT_INSURANCE_RATE_DUPLICATE');
  });

  it('ratePercent ausente/zero → 400 TRANSPORT_INSURANCE_RATE_PERCENT_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa5');
    const policy = await createPolicy(ACCOUNT_A, partyId);

    const { response, body } = await createRate(partyId, policy.id, { ratePercent: 0 });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_INSURANCE_RATE_PERCENT_INVALID');
  });

  it('Idempotency-Key: repetir o POST com a mesma chave devolve a MESMA taxa, sem linha nova', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa6');
    const policy = await createPolicy(ACCOUNT_A, partyId);
    const headers = { ...authHeaders(), 'Idempotency-Key': `taxa-${RUN_ID}-idem` };

    const first = await createRate(partyId, policy.id, {}, headers);
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const replay = await createRate(partyId, policy.id, {}, headers);
    assert.equal(replay.body.id, first.body.id, 'replay idempotente devolve o mesmo recurso');

    const rows = await query('select count(*)::int as count from insurance_rate_schedules where policy_id = $1', [policy.id]);
    assert.equal(rows.rows[0].count, 1);
  });

  it('apólice de OUTRO transportador → 404; tenancy conta B → 404 TRANSPORT_PARTY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId1 = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa7a');
    const partyId2 = await createParty(ACCOUNT_A, nextValidCnpj(), 'Taxa7b');
    const policy = await createPolicy(ACCOUNT_A, partyId1);

    const wrongParty = await createRate(partyId2, policy.id);
    assert.equal(wrongParty.response.status, 404);
    assert.equal(wrongParty.body.code, 'TRANSPORT_INSURANCE_POLICY_NOT_FOUND');

    const crossTenant = await createRate(partyId1, policy.id, { integrationAccountId: ACCOUNT_B });
    assert.equal(crossTenant.response.status, 404);
    assert.equal(crossTenant.body.code, 'TRANSPORT_PARTY_NOT_FOUND');
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
