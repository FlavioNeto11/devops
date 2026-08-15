/**
 * API do ciclo do CIOT (PR-C2): `pre-validar` (200 síncrono), `solicitar`/`retificar`/`cancelar`/
 * `encerrar` (202) e `GET .../ciot` (ciot atual + eventos paginados) — contra o app REAL
 * (`createApp`) e o Postgres local. O worker NÃO roda neste arquivo (sem `processJob`) — o foco
 * aqui é a CAMADA HTTP (validação de estado, contrato do `CommandAccepted`, tenancy, idempotência);
 * o ciclo completo do job (`register`/`rectify`/`cancel`/`close`/`reconcile`, DL-102) é coberto em
 * `tests/worker/transporte-ciot.test.js`.
 *
 * Molde: `tests/api/transporte-conformidade.test.js` (setup de carrier/contractor/veículo + helper
 * de `contratar`, mesma convenção de skip/tenancy).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_trciot_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trciot_b_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2
};

let carrierPartyId = '';
let contractorPartyId = '';
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
        { partyId: contractorPartyId, role: 'contractor' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000 }],
      freightOfferedAmount: 4000,
      paymentTermDays: 30,
      ...overrides
    }
  });
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

/** draft → validating → ready_for_contract → contracted (molde `transporte-conformidade.test.js`). */
async function createContractedOperation(overrides = {}) {
  const draft = await createDraftOperation(overrides);
  const submitted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/submeter-validacao`, {
    body: { integrationAccountId: ACCOUNT_A, version: draft.version }
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.operation.status, 'ready_for_contract');

  const contracted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/contratar`, {
    body: { integrationAccountId: ACCOUNT_A, version: submitted.body.operation.version, contractedAmount: 4000 }
  });
  assert.equal(contracted.response.status, 200, JSON.stringify(contracted.body));
  assert.equal(contracted.body.operation.status, 'contracted');
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

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste CIOT'), ($2, 'Conta B - teste CIOT')
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
      legalName: 'Transportes CIOT LTDA',
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
      legalName: 'Embarcadora CIOT LTDA',
      roles: ['contractor']
    }
  });
  assert.equal(contractor.response.status, 201, JSON.stringify(contractor.body));
  contractorPartyId = contractor.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'CIT1O23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query(
      `delete from ciot_events where ciot_operation_id in (
         select id from ciot_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from ciot_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
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

describe('POST .../ciot/solicitar — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/operacoes/trop_qualquer/ciot/solicitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../ciot/pre-validar — síncrono, sem transição nem ciot_operations', () => {
  it('avalia GATE_CIOT (200) sem criar ciot_operations', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/pre-validar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.gate, 'GATE_CIOT');
    assert.equal(body.operationId, operation.id);
    const ciot001 = body.checks.find((check) => check.ruleCode === 'TR-CIOT-001');
    assert.equal(ciot001?.status, 'WARN');
    assert.equal(ciot001?.reasonCode, 'CIOT_NOT_REGISTERED');

    const count = await query('select count(*)::int as count from ciot_operations where operation_id = $1', [operation.id]);
    assert.equal(count.rows[0].count, 0, 'pre-validar NÃO cria ciot_operations');
  });
});

describe('POST .../ciot/solicitar — exige status contracted', () => {
  it('operação em draft → 409 TRANSPORTE_CIOT_OPERATION_NOT_READY', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_CIOT_OPERATION_NOT_READY');
  });
});

describe('POST .../ciot/solicitar — contracted (202, CAS para ciot_pending)', () => {
  it('enfileira transporte.ciot.register, devolve CommandAccepted com entityType ciot_operation', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });

    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.entityType, 'ciot_operation');
    assert.equal(body.entityId, operation.id);
    assert.equal(body.operation, 'transporte.ciot.register');
    assert.equal(body.status, 'queued');
    assert.ok(body.jobId?.startsWith('job_'));
    assert.equal(body.links.entity, `/v1/transporte/operacoes/${operation.id}/ciot`);

    const jobRes = await query('select * from jobs where job_id = $1', [body.jobId]);
    assert.equal(jobRes.rows.length, 1);
    assert.equal(jobRes.rows[0].entity_type, 'ciot_operation');
    assert.equal(jobRes.rows[0].entity_id, operation.id);

    const opRes = await query('select status, version from transport_operations where id = $1', [operation.id]);
    assert.equal(opRes.rows[0].status, 'ciot_pending', 'request_ciot deve CAS a operação');

    const ciotRes = await query('select status, correlation_marker from ciot_operations where operation_id = $1', [operation.id]);
    assert.equal(ciotRes.rows.length, 1);
    assert.equal(ciotRes.rows[0].status, 'pre_validation', 'worker não rodou neste teste — status inicial');
    assert.match(ciotRes.rows[0].correlation_marker, /^\[sicat:ciot_/);
  });

  it('idempotência via Idempotency-Key: 2º POST com a MESMA chave devolve o MESMO job (sem criar 2ª ciot_operations)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation();
    const idempotencyKey = `idem-${randomBytes(8).toString('hex')}`;
    const headers = { ...authHeaders(), 'Idempotency-Key': idempotencyKey };

    const first = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_A },
      headers
    });
    assert.equal(first.response.status, 202, JSON.stringify(first.body));

    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_A },
      headers
    });
    assert.equal(second.response.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.jobId, first.body.jobId, 'mesma Idempotency-Key deve devolver a MESMA resposta');
    assert.equal(second.body.commandId, first.body.commandId);

    const count = await query('select count(*)::int as count from ciot_operations where operation_id = $1', [operation.id]);
    assert.equal(count.rows[0].count, 1, 'a chave repetida não pode criar uma segunda ciot_operations');
  });
});

describe('POST .../ciot/retificar | cancelar | encerrar — sem ciot registered', () => {
  it('retificar sem ciot registered → 409 TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/retificar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED');
  });

  it('cancelar sem ciot registered → 409 TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, reason: 'teste' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED');
  });

  it('encerrar sem ciot registered → 409 TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/encerrar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED');
  });
});

describe('GET .../ciot — ciot atual + eventos paginados', () => {
  it('sem nenhum solicitar ainda → { ciot: null, events: [] }', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/ciot?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ciot, null);
    assert.deepEqual(body.events.items, []);
    assert.equal(body.events.total, 0);
  });

  it('depois de solicitar → ciot atual (pre_validation) + evento pre_validated', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();
    const requested = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(requested.response.status, 202, JSON.stringify(requested.body));

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/ciot?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.ciot);
    assert.equal(body.ciot.operationId, operation.id);
    assert.equal(body.ciot.status, 'pre_validation');
    assert.equal(body.ciot.ciotNumber, null);
    assert.ok(body.events.items.some((event) => event.eventType === 'pre_validated'));
  });

  it('isolamento de tenancy: conta B não vê a operação nem o ciclo da conta A', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation();

    const crossSolicitar = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/ciot/solicitar`, {
      body: { integrationAccountId: ACCOUNT_B }
    });
    assert.equal(crossSolicitar.response.status, 404);
    assert.equal(crossSolicitar.body.code, 'TRANSPORT_OPERATION_NOT_FOUND');

    const crossGet = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/ciot?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(crossGet.response.status, 404);
  });
});
