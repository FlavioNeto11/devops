/**
 * API da emissão de DF-e SANDBOX-READY (PR-G): `solicitar` (202)/`cancelar` (202)/`GET .../emissoes`
 * (200, lista + eventos) — contra o app REAL (`createApp`) e o Postgres local. O worker NÃO roda
 * neste arquivo (sem `processJob`) — o foco aqui é a CAMADA HTTP (flag `DFE_ISSUANCE_MODE`,
 * validação de estado, contrato do `CommandAccepted`, tenancy, 401); o pipeline completo do job
 * (`build→sign→submit`, DL-102, import automático) é coberto em
 * `tests/worker/transporte-dfe-issuance.test.js`.
 *
 * Molde: `tests/api/transporte-ciot.test.js` (setup de carrier/contractor/veículo + helper de
 * `contratar`, mesma convenção de skip/tenancy).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';
import { setConfigOverride } from '../../src/lib/config.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_tremis_a_${RUN_ID}`;
const ACCOUNT_B = `acc_tremis_b_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';
const CNPJ_CONSIGNEE = '11.444.777/0001-61';

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2
};

let carrierPartyId = '';
let contractorPartyId = '';
let consigneePartyId = '';
let vehicleId = '';

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

async function createDraftOperation(overrides = {}) {
  const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
    body: {
      integrationAccountId: ACCOUNT_A,
      cargoRegime: 'lotacao',
      route: VALID_ROUTE,
      parties: [
        { partyId: carrierPartyId, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' },
        { partyId: consigneePartyId, role: 'consignee' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000, declaredValue: 15000 }],
      freightOfferedAmount: 4000,
      paymentTermDays: 30,
      ...overrides
    }
  });
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

/** draft → validating → ready_for_contract → contracted (molde `transporte-ciot.test.js`). */
async function createContractedOperation(overrides = {}) {
  const draft = await createDraftOperation(overrides);
  const submitted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/submeter-validacao`, {
    body: { integrationAccountId: ACCOUNT_A, version: draft.version }
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));

  const contracted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/contratar`, {
    body: { integrationAccountId: ACCOUNT_A, version: submitted.body.operation.version, contractedAmount: 4000 }
  });
  assert.equal(contracted.response.status, 200, JSON.stringify(contracted.body));
  return contracted.body.operation;
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
  await ensureRegulatoryCatalogSeeded();
  // Default do arquivo: sandbox ligado. O describe de flag desligada gerencia seu próprio
  // override+restore local (try/finally) para não vazar estado entre testes.
  setConfigOverride('dfeIssuanceMode', 'sandbox');

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste emissões'), ($2, 'Conta B - teste emissões')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;

  const carrier = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CARRIER,
      legalName: 'Transportes Emissão LTDA',
      roles: ['carrier'],
      rntrcNumber: '12345678',
      rntrcCategory: 'TAC',
      rntrcStatus: 'active'
    }
  });
  assert.equal(carrier.response.status, 201, JSON.stringify(carrier.body));
  carrierPartyId = carrier.body.id;

  const contractor = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CONTRACTOR,
      legalName: 'Embarcadora Emissão LTDA',
      roles: ['contractor']
    }
  });
  assert.equal(contractor.response.status, 201, JSON.stringify(contractor.body));
  contractorPartyId = contractor.body.id;

  const consignee = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CONSIGNEE,
      legalName: 'Destinatária Emissão LTDA',
      roles: ['consignee']
    }
  });
  assert.equal(consignee.response.status, 201, JSON.stringify(consignee.body));
  consigneePartyId = consignee.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'EMI1S23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query(
      `delete from dfe_issuance_events where issuance_id in (
         select id from dfe_issuances where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from dfe_issuances where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query(
      `delete from jobs where entity_id in (
         select id from transport_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from transport_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_vehicles where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('POST .../emissoes — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/operacoes/trop_qualquer/emissoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A, documentType: 'NFE' })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../emissoes — DFE_ISSUANCE_MODE=off', () => {
  it('recusa com 409 DFE_ISSUANCE_FEATURE_DISABLED — NÃO cria dfe_issuances', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();

    setConfigOverride('dfeIssuanceMode', 'off');
    try {
      const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
        body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
      });
      assert.equal(response.status, 409, JSON.stringify(body));
      assert.equal(body.code, 'DFE_ISSUANCE_FEATURE_DISABLED');
    } finally {
      setConfigOverride('dfeIssuanceMode', 'sandbox');
    }

    const countRes = await query('select count(*)::int as count from dfe_issuances where operation_id = $1', [operation.id]);
    assert.equal(countRes.rows[0].count, 0, 'nenhuma linha dfe_issuances deve nascer quando a flag está off');
  });
});

describe('POST .../emissoes — operação inexistente', () => {
  it('404 TRANSPORT_OPERATION_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/operacoes/trop_never_existed/emissoes', {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
  });
});

describe('POST .../emissoes — operação cancelada', () => {
  it('409 TRANSPORTE_DFE_ISSUANCE_OPERATION_CANCELLED', async (t) => {
    if (skipIfNoDb(t)) return;
    const draft = await createDraftOperation();
    const cancelled = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, version: draft.version, reason: 'teste' }
    });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_DFE_ISSUANCE_OPERATION_CANCELLED');
  });
});

describe('POST .../emissoes — sandbox ligado (202, CommandAccepted)', () => {
  it('enfileira transporte.dfe.issue, devolve CommandAccepted com entityType dfe_issuance', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.entityType, 'dfe_issuance');
    assert.equal(body.entityId, operation.id);
    assert.equal(body.operation, 'transporte.dfe.issue');
    assert.equal(body.status, 'queued');
    assert.ok(body.commandId);
    assert.ok(body.jobId);
    assert.equal(body.links.entity, `/v1/transporte/operacoes/${operation.id}/emissoes`);

    const jobRes = await query('select * from jobs where job_id = $1', [body.jobId]);
    assert.equal(jobRes.rows.length, 1);
    assert.equal(jobRes.rows[0].operation, 'transporte.dfe.issue');
    assert.equal(jobRes.rows[0].payload.documentType, 'NFE');

    const issuanceRes = await query('select * from dfe_issuances where operation_id = $1', [operation.id]);
    assert.equal(issuanceRes.rows.length, 1);
    assert.equal(issuanceRes.rows[0].status, 'draft');
    assert.ok(issuanceRes.rows[0].correlation_marker);
  });

  it('idempotência via Idempotency-Key: 2º POST com a MESMA chave devolve o MESMO job (sem criar 2ª dfe_issuances)', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const idempotencyKey = `idem-emissao-${randomBytes(6).toString('hex')}`;

    const first = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' },
      headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey }
    });
    assert.equal(first.response.status, 202, JSON.stringify(first.body));

    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' },
      headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey }
    });
    assert.equal(second.response.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.jobId, first.body.jobId);
    assert.equal(second.body.commandId, first.body.commandId);

    const countRes = await query('select count(*)::int as count from dfe_issuances where operation_id = $1', [operation.id]);
    assert.equal(countRes.rows[0].count, 1);
  });

  it('documentType ausente → 400 TRANSPORTE_DFE_ISSUANCE_DOCUMENT_TYPE_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_DFE_ISSUANCE_DOCUMENT_TYPE_INVALID');
  });
});

describe('GET .../emissoes — lista + eventos', () => {
  it('sem nenhum solicitar ainda → { items: [] }', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/emissoes?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body.items, []);
  });

  it('depois de solicitar → item em draft com evento created', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const posted = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    assert.equal(posted.response.status, 202, JSON.stringify(posted.body));

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/emissoes?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].documentType, 'NFE');
    assert.equal(body.items[0].status, 'draft');
    assert.equal(body.items[0].environment, 'sandbox');
    assert.deepEqual(body.items[0].events.map((e) => e.eventType), ['created']);
  });

  it('isolamento de tenancy: conta B não vê a operação nem as emissões da conta A', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/emissoes?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(response.status, 404, JSON.stringify(body));
  });
});

describe('POST .../emissoes/{issuanceId}/cancelar', () => {
  it('202 CommandAccepted, enfileira transporte.dfe.issue.cancel', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const posted = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    const listed = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/emissoes?integrationAccountId=${ACCOUNT_A}`);
    const issuanceId = listed.body.items[0].id;

    const { response, body } = await callApi('POST', `/v1/transporte/emissoes/${issuanceId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.entityType, 'dfe_issuance');
    assert.equal(body.operation, 'transporte.dfe.issue.cancel');

    const jobRes = await query('select * from jobs where job_id = $1', [body.jobId]);
    assert.equal(jobRes.rows[0].operation, 'transporte.dfe.issue.cancel');
    assert.equal(jobRes.rows[0].payload.issuanceId, issuanceId);
    void posted;
  });

  it('emissão inexistente → 404 TRANSPORTE_DFE_ISSUANCE_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/emissoes/dfeiss_never_existed/cancelar', {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_DFE_ISSUANCE_NOT_FOUND');
  });

  it('conta B não pode cancelar emissão da conta A (404, sem vazar existência)', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    await callApi('POST', `/v1/transporte/operacoes/${operation.id}/emissoes`, {
      body: { integrationAccountId: ACCOUNT_A, documentType: 'NFE' }
    });
    const listed = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/emissoes?integrationAccountId=${ACCOUNT_A}`);
    const issuanceId = listed.body.items[0].id;

    const { response, body } = await callApi('POST', `/v1/transporte/emissoes/${issuanceId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_B }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
  });
});
