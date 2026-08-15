/**
 * API de verificação de regularidade RNTRC (PR-C1): POST
 * `/v1/transporte/transportadores/{partyId}/verificar-rntrc` (202 `open_data` / 200 `manual`) e GET
 * `.../verificacoes-rntrc` (histórico paginado), contra o app REAL (`createApp`) e o Postgres
 * local. Molde: `tests/api/transporte-cadastros.test.js` (skip limpo quando o banco está fora,
 * tenancy com DUAS contas criadas direto no banco).
 *
 * `open_data` só ENFILEIRA aqui — não roda o worker/gateway real (sem rede nestes testes).
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
const ACCOUNT_A = `acc_trrntrc_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trrntrc_b_${RUN_ID}`;

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

async function createParty(accountId, documentNumber, suffix) {
  const created = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: accountId,
      documentType: 'CNPJ',
      documentNumber,
      legalName: `Transportadora RNTRC ${suffix}`
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
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
     values ($1, 'Conta A - teste RNTRC'), ($2, 'Conta B - teste RNTRC')
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
    await query('delete from rntrc_verifications where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query(
      `delete from jobs where entity_id in (select id from transport_parties where integration_account_id = any($1))`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('POST .../verificar-rntrc — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/transportadores/trparty_qualquer/verificar-rntrc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A, strategy: 'manual', manualEvidence: { resultStatus: 'active' } })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../verificar-rntrc — strategy open_data (202, enfileira)', () => {
  it('enfileira, devolve CommandAccepted com entityType transport_party e link correto', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11222333000181', 'OpenData1');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'open_data' }
    });

    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.entityType, 'transport_party');
    assert.equal(body.entityId, partyId);
    assert.equal(body.operation, 'transporte.rntrc.verify');
    assert.equal(body.status, 'queued');
    assert.ok(body.jobId?.startsWith('job_'));
    assert.equal(body.links.entity, `/v1/transporte/transportadores/${partyId}`);

    const jobRes = await query('select * from jobs where job_id = $1', [body.jobId]);
    assert.equal(jobRes.rows.length, 1);
    assert.equal(jobRes.rows[0].entity_type, 'transport_party');
    assert.equal(jobRes.rows[0].operation, 'transporte.rntrc.verify');
    assert.equal(jobRes.rows[0].status, 'queued');
  });

  it('idempotência: 2º POST em voo devolve o MESMO job (dedupe ativo)', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11444777000161', 'OpenData2');

    const first = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'open_data' }
    });
    assert.equal(first.response.status, 202, JSON.stringify(first.body));

    const second = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'open_data' }
    });
    assert.equal(second.response.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.jobId, first.body.jobId, '2º POST enquanto o 1º job está queued deve devolver o MESMO job');

    const jobsRes = await query(
      `select count(*)::int as count from jobs where entity_type = 'transport_party' and entity_id = $1`,
      [partyId]
    );
    assert.equal(jobsRes.rows[0].count, 1, 'não pode existir um 2º job ativo para o mesmo party');
  });
});

describe('POST .../verificar-rntrc — strategy manual (200, síncrono)', () => {
  it('grava verificação succeeded e atualiza o transportador no mesmo request', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11777777000183', 'Manual1');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        strategy: 'manual',
        manualEvidence: { resultStatus: 'active', resultCategory: 'TAC', notes: 'Consulta manual de teste.' }
      }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.id?.startsWith('rntrcver_'));
    assert.equal(body.partyId, partyId);
    assert.equal(body.strategy, 'manual');
    assert.equal(body.requestedStatus, 'succeeded');
    assert.equal(body.resultStatus, 'active');
    assert.equal(body.resultCategory, 'TAC');
    assert.equal(body.dataReferenceDate, null, 'manual não tem data-base de dado aberto');
    assert.equal(body.evidenceSource, 'manual_declaration');
    assert.ok(body.completedAt);

    const party = await callApi('GET', `/v1/transporte/transportadores/${partyId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(party.response.status, 200);
    assert.equal(party.body.rntrcStatus, 'active');
    assert.equal(party.body.rntrcCategory, 'TAC');
    assert.equal(party.body.rntrcVerificationSource, 'manual');
    assert.ok(party.body.rntrcVerifiedAt);
    assert.equal(party.body.version, 2, 'PATCH interno bumpou a version');
  });

  it('sem manualEvidence.resultStatus → 400 com código estável', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11888888000167', 'Manual2');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'manual', manualEvidence: {} }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'RNTRC_VERIFICATION_RESULT_STATUS_INVALID');
  });
});

describe('POST .../verificar-rntrc — strategy antt (reservada) e strategy inválida', () => {
  it('"antt" → 400 RNTRC_VERIFICATION_STRATEGY_NOT_IMPLEMENTED', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, '12345678000195', 'Antt1');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'antt' }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'RNTRC_VERIFICATION_STRATEGY_NOT_IMPLEMENTED');
  });

  it('strategy desconhecida → 400 RNTRC_VERIFICATION_STRATEGY_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createParty(ACCOUNT_A, '11000222000120', 'Invalid1');

    const { response, body } = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'carrier_pigeon' }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'RNTRC_VERIFICATION_STRATEGY_INVALID');
  });
});

describe('GET .../verificacoes-rntrc — histórico paginado e tenancy', () => {
  it('lista o histórico mais recente primeiro', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11333444000165', 'Historico1');

    await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'manual', manualEvidence: { resultStatus: 'unknown' } }
    });
    await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'manual', manualEvidence: { resultStatus: 'active', resultCategory: 'CTC' } }
    });

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${partyId}/verificacoes-rntrc?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.total, 2);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].resultStatus, 'active', 'mais recente primeiro');
    assert.equal(body.items[1].resultStatus, 'unknown');
  });

  it('isolamento de tenancy: conta B não vê party nem histórico da conta A', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = await createParty(ACCOUNT_A, '11555666000122', 'Tenancy1');
    await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_A, strategy: 'manual', manualEvidence: { resultStatus: 'active' } }
    });

    const crossVerify = await callApi('POST', `/v1/transporte/transportadores/${partyId}/verificar-rntrc`, {
      body: { integrationAccountId: ACCOUNT_B, strategy: 'manual', manualEvidence: { resultStatus: 'active' } }
    });
    assert.equal(crossVerify.response.status, 404, 'conta B não pode verificar party da conta A');
    assert.equal(crossVerify.body.code, 'TRANSPORT_PARTY_NOT_FOUND');

    const crossHistory = await callApi('GET', `/v1/transporte/transportadores/${partyId}/verificacoes-rntrc?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(crossHistory.response.status, 404, 'conta B não pode ler o histórico da conta A');
  });
});
