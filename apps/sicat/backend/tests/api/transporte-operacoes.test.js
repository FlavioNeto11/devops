/**
 * API do agregado `TransportOperation` (PR-A4): POST/GET/PATCH `/v1/transporte/operacoes` e as
 * transições sem gate (`submeter-validacao`/`cancelar`), contra o app REAL (createApp) e o
 * Postgres local.
 *
 * Molde: `tests/api/transporte-cadastros.test.js` (PR-A3) — mesma convenção de skip quando o
 * banco está indisponível, e mesma estratégia de tenancy (duas contas criadas DIRETO NO BANCO no
 * setup, sem middleware de "conta ativa da sessão").
 *
 * `parties`/`vehicles` do setup vêm de um transportador/veículo REAIS criados via API
 * (`/v1/transporte/transportadores`/`/v1/transporte/veiculos`) na conta A, para exercitar o
 * congelamento de `party_snapshot`/`vehicle_snapshot` na operação.
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
const ACCOUNT_A = `acc_tropoper_a_${RUN_ID}`;
const ACCOUNT_B = `acc_tropoper_b_${RUN_ID}`;
const CNPJ = '11.222.333/0001-81';

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Campinas',
  destinationUf: 'SP',
  distanceKm: 99.5
};

let setupPartyId = '';
let setupVehicleId = '';

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

before(async () => {
  try {
    await pool.connect().then((client) => client.release());
  } catch (error) {
    dbAvailable = false;
    dbUnavailableReason = (error && (error.message || error.code)) || String(error);
    return;
  }

  await runMigrations();
  // Idempotente: garante o catálogo TR-* independente da ordem de execução dos arquivos de teste —
  // `submeter-validacao`/`contratar` (PR-A5) avaliam gates de verdade contra ele.
  await ensureRegulatoryCatalogSeeded();

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste operações'), ($2, 'Conta B - teste operações')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;

  // Setup: um transportador (carrier) e um veículo REAIS na conta A, para congelar snapshot.
  const party = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ,
      legalName: 'Transportes Operação LTDA',
      roles: ['carrier']
    }
  });
  assert.equal(party.response.status, 201, JSON.stringify(party.body));
  setupPartyId = party.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'OPR1O23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  setupVehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    // compliance_evaluations (PR-A5) NÃO cascade-deleta com transport_operations (FK sem ON
    // DELETE CASCADE, de propósito — ver header da migration 025); apaga PRIMEIRO.
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    // Cascade (operation_parties/vehicles/cargo/routes) cuida do resto.
    await query('delete from transport_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_vehicles where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('Operações — POST/GET/PATCH + transições sem gate', { concurrency: 1 }, () => {
  let operationId = '';
  let version = 0;

  it('sem token responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;

    const response = await fetch(`${API_BASE}/v1/transporte/operacoes?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('rota ausente no create → 400 TRANSPORT_OPERATION_ROUTE_REQUIRED', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
      body: { integrationAccountId: ACCOUNT_A, cargoRegime: 'lotacao' }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_OPERATION_ROUTE_REQUIRED');
  });

  it('cria operação em draft com parties/vehicles do setup → 201', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
      body: {
        integrationAccountId: ACCOUNT_A,
        cargoRegime: 'lotacao',
        route: VALID_ROUTE,
        parties: [{ partyId: setupPartyId, role: 'carrier' }],
        vehicles: [{ vehicleId: setupVehicleId, position: 'traction' }],
        freightOfferedAmount: 3500.00
      }
    });

    assert.equal(response.status, 201, JSON.stringify(body));
    assert.ok(body.id?.startsWith('trop_'));
    assert.equal(body.version, 1);
    assert.equal(body.status, 'draft');
    assert.equal(body.integrationAccountId, ACCOUNT_A);
    assert.equal(body.freight.offeredAmount, 3500);
    assert.equal(body.freight.contractedAmount, null, 'demais componentes do frete começam null');
    assert.equal(body.route.originMunicipality, 'São Paulo');
    assert.equal(body.route.destinationMunicipality, 'Campinas');
    assert.equal(body.parties.length, 1);
    assert.equal(body.parties[0].partyId, setupPartyId);
    assert.equal(body.parties[0].partySnapshot.documentNumber, '11222333000181', 'snapshot congela o documento no vínculo');
    assert.equal(body.vehicles.length, 1);
    assert.equal(body.vehicles[0].vehicleId, setupVehicleId);
    assert.deepEqual([...body.availableCommands].sort(), ['cancel', 'submit_validation']);
    assert.ok(!('correlationId' in body), 'DTO não pode expor correlationId');

    operationId = body.id;
    version = body.version;
  });

  it('GET agregado retorna availableCommands [submit_validation, cancel] em draft', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'GET',
      `/v1/transporte/operacoes/${operationId}?integrationAccountId=${ACCOUNT_A}`
    );
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'draft');
    assert.deepEqual([...body.availableCommands].sort(), ['cancel', 'submit_validation']);
    assert.equal(body.cargo.length, 0);
  });

  it('GET lista (resumo) inclui a operação criada', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.total >= 1);
    assert.ok(body.items.some((item) => item.id === operationId));
  });

  it('PATCH com dados (freightOfferedAmount) → 200 e version incrementada', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('PATCH', `/v1/transporte/operacoes/${operationId}`, {
      body: { integrationAccountId: ACCOUNT_A, version, freightOfferedAmount: 3800.00, paymentTermDays: 30 }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.version, version + 1);
    assert.equal(body.freight.offeredAmount, 3800);
    assert.equal(body.paymentTermDays, 30);

    version = body.version;
  });

  it('PATCH com campo status no corpo → 422 TRANSPORT_STATUS_IS_COMMAND_DRIVEN', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('PATCH', `/v1/transporte/operacoes/${operationId}`, {
      body: { integrationAccountId: ACCOUNT_A, version, status: 'validating' }
    });
    assert.equal(response.status, 422, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_STATUS_IS_COMMAND_DRIVEN');
  });

  it('submeter-validacao → 200, ORQUESTRA até ready_for_contract (GATE_PROPOSAL sem block efetivo no seed real)', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operationId}/submeter-validacao`,
      { body: { integrationAccountId: ACCOUNT_A, version } }
    );
    assert.equal(response.status, 200, JSON.stringify(body));
    // Resposta agora é { operation, evaluation } (PR-A5) — não mais o agregado solto.
    assert.equal(body.operation.status, 'ready_for_contract');
    assert.equal(body.operation.version, version + 2, 'duas CAS: submit_validation + approve_validation');
    assert.deepEqual([...body.operation.availableCommands].sort(), ['cancel', 'contract']);
    assert.equal(body.evaluation.gate, 'GATE_PROPOSAL');
    assert.equal(body.evaluation.operationId, operationId);
    assert.ok(['PASS', 'WARN'].includes(body.evaluation.overallStatus), 'seed 100% blocking=false — nunca BLOCK aqui');
    assert.ok(Array.isArray(body.evaluation.checks) && body.evaluation.checks.length > 0);

    version = body.operation.version;
  });

  it('PATCH em ready_for_contract → 409 TRANSPORT_OPERATION_NOT_EDITABLE', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('PATCH', `/v1/transporte/operacoes/${operationId}`, {
      body: { integrationAccountId: ACCOUNT_A, version, paymentMethod: 'pix' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATION_NOT_EDITABLE');
  });

  it('submeter-validacao de novo (já não está em draft) → 409 TRANSPORT_INVALID_TRANSITION', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operationId}/submeter-validacao`,
      { body: { integrationAccountId: ACCOUNT_A, version } }
    );
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_INVALID_TRANSITION');
  });

  it('cancelar sem reason → 400 TRANSPORT_CANCEL_REASON_REQUIRED', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, version }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_CANCEL_REASON_REQUIRED');
  });

  it('cancelar com version defasada → 409', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, version: version - 1, reason: 'motivo qualquer' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATION_VERSION_CONFLICT');
  });

  it('cancelar com reason e version corretos → 200, status cancelled', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, version, reason: 'Cliente desistiu do frete.' }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'cancelled');
    assert.equal(body.cancelledReason, 'Cliente desistiu do frete.');
    assert.deepEqual(body.availableCommands, [], 'estado terminal não tem comando disponível');

    version = body.version;
  });

  it('cancelar de novo (já terminal) → 409 TRANSPORT_INVALID_TRANSITION', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, version, reason: 'motivo qualquer' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_INVALID_TRANSITION');
  });
});

describe('Operações — tenancy A×B', { concurrency: 1 }, () => {
  it('registro da conta A não é acessível pela conta B (GET/PATCH/transições)', async (t) => {
    if (skipIfNoDb(t)) return;

    const created = await callApi('POST', '/v1/transporte/operacoes', {
      body: { integrationAccountId: ACCOUNT_A, cargoRegime: 'unknown', route: VALID_ROUTE }
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const operationId = created.body.id;

    const getFromB = await callApi(
      'GET',
      `/v1/transporte/operacoes/${operationId}?integrationAccountId=${ACCOUNT_B}`
    );
    assert.equal(getFromB.response.status, 404, 'conta B não pode ver a operação da conta A');
    assert.equal(getFromB.body.code, 'TRANSPORT_OPERATION_NOT_FOUND');

    const patchFromB = await callApi('PATCH', `/v1/transporte/operacoes/${operationId}`, {
      body: { integrationAccountId: ACCOUNT_B, version: 1, paymentMethod: 'pix' }
    });
    assert.equal(patchFromB.response.status, 404, 'conta B não pode atualizar a operação da conta A');
    assert.equal(patchFromB.body.code, 'TRANSPORT_OPERATION_NOT_FOUND');

    const submitFromB = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operationId}/submeter-validacao`,
      { body: { integrationAccountId: ACCOUNT_B, version: 1 } }
    );
    assert.equal(submitFromB.response.status, 404, 'conta B não pode transicionar a operação da conta A');
    assert.equal(submitFromB.body.code, 'TRANSPORT_OPERATION_NOT_FOUND');

    const getFromA = await callApi(
      'GET',
      `/v1/transporte/operacoes/${operationId}?integrationAccountId=${ACCOUNT_A}`
    );
    assert.equal(getFromA.response.status, 200, 'conta A (dona) continua acessando normalmente');
  });

  it('parties/vehicles de outra conta não podem ser vinculados na criação → 400', async (t) => {
    if (skipIfNoDb(t)) return;

    const otherParty = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_B,
        documentType: 'CNPJ',
        documentNumber: '11.222.333/0001-81',
        legalName: 'Transportes Conta B LTDA'
      }
    });
    assert.equal(otherParty.response.status, 201, JSON.stringify(otherParty.body));

    const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
      body: {
        integrationAccountId: ACCOUNT_A,
        cargoRegime: 'unknown',
        route: VALID_ROUTE,
        parties: [{ partyId: otherParty.body.id, role: 'carrier' }]
      }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATION_PARTY_INVALID');
  });
});
