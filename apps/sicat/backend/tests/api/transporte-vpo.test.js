/**
 * API do domínio VPO (PR-D1): `avaliar-aplicabilidade`/`registrar-aquisicao` (200 síncronos),
 * `adquirir` (202) e `GET .../vpo` (allocation atual + eventos paginados) — contra o app REAL
 * (`createApp`) e o Postgres local. O worker NÃO roda neste arquivo (sem `processJob`) — o foco
 * aqui é a CAMADA HTTP (validação de estado, contrato do `CommandAccepted`, tenancy, idempotência);
 * o ciclo completo do job (`acquire`/`reconcile`, DL-102) é coberto em
 * `tests/worker/transporte-vpo.test.js`.
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
import { createPrefixedId } from '../../src/lib/ids.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_trvpo_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trvpo_b_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const ROUTE_TOLL_APPLICABLE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2,
  tollExpected: true
};

const ROUTE_NO_TOLL = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Campinas',
  destinationUf: 'SP',
  distanceKm: 99.5,
  tollExpected: false
};

let carrierPartyId = '';
let contractorPartyId = '';
let vehicleId = '';
let activeProviderId = '';
let inactiveProviderId = '';

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

async function createDraftOperation(route, overrides = {}) {
  const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
    body: {
      integrationAccountId: ACCOUNT_A,
      cargoRegime: 'lotacao',
      route,
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

/** draft → validating → ready_for_contract → contracted (molde `transporte-ciot.test.js`). */
async function createContractedOperation(route, overrides = {}) {
  const draft = await createDraftOperation(route, overrides);
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

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste VPO'), ($2, 'Conta B - teste VPO')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  activeProviderId = createPrefixedId('vpoprov');
  inactiveProviderId = createPrefixedId('vpoprov');
  await query(
    `insert into vpo_providers (id, name, is_active, version) values ($1, $2, true, 1), ($3, $4, false, 1)`,
    [activeProviderId, `Fornecedora API Teste Ativa ${RUN_ID}`, inactiveProviderId, `Fornecedora API Teste Inativa ${RUN_ID}`]
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
      legalName: 'Transportes VPO LTDA',
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
      legalName: 'Embarcadora VPO LTDA',
      roles: ['contractor']
    }
  });
  assert.equal(contractor.response.status, 201, JSON.stringify(contractor.body));
  contractorPartyId = contractor.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'VPO1O23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query(
      `delete from vpo_events where vpo_allocation_id in (
         select id from vpo_allocations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from vpo_allocations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from vpo_providers where id = any($1)', [[activeProviderId, inactiveProviderId]]);
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

describe('POST .../vpo/avaliar-aplicabilidade — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/operacoes/trop_qualquer/vpo/avaliar-aplicabilidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../vpo/avaliar-aplicabilidade — rota SEM pedágio esperado', () => {
  it('avalia not_applicable com applicabilityReasonCode obrigatório (justificativa evidenciada)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation(ROUTE_NO_TOLL);
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, {
      body: { integrationAccountId: ACCOUNT_A }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'not_applicable');
    assert.equal(body.applicable, false);
    assert.equal(body.applicabilityReasonCode, 'VPO_NO_TOLL_ON_ROUTE');
    assert.ok(body.applicabilityReasonCode, 'NOT_APPLICABLE sempre carrega justificativa');

    const dbRow = await query('select applicability_reason_code from vpo_allocations where operation_id = $1', [operation.id]);
    assert.equal(dbRow.rows[0].applicability_reason_code, 'VPO_NO_TOLL_ON_ROUTE', 'constraint de banco também exige o reason');
  });
});

describe('POST .../vpo/avaliar-aplicabilidade — rota COM pedágio esperado (lotação)', () => {
  it('avalia applicable, SEM tocar frete', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, {
      body: { integrationAccountId: ACCOUNT_A }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'applicable');
    assert.equal(body.applicable, true);
    assert.equal(body.applicabilityReasonCode, 'VPO_REQUIRED_TOLL_ROUTE');

    const opRes = await query('select freight_offered_amount, vpo_amount from transport_operations where id = $1', [operation.id]);
    assert.equal(Number(opRes.rows[0].freight_offered_amount), 4000, 'freight NUNCA tocado por avaliar-aplicabilidade');
    assert.equal(opRes.rows[0].vpo_amount, null, 'vpo_amount continua null — só aquisição preenche');
  });
});

describe('POST .../vpo/registrar-aquisicao — manual', () => {
  it('exige allocation applicable (409 sem avaliação prévia)', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/registrar-aquisicao`, {
      body: { integrationAccountId: ACCOUNT_A, version: operation.version, providerId: activeProviderId, amount: 350.5, evidence: { comprovante: 'x' } }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_VPO_NOT_APPLICABLE');
  });

  it('providerId inativo → 400 TRANSPORTE_VPO_PROVIDER_INACTIVE', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, { body: { integrationAccountId: ACCOUNT_A } });

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/registrar-aquisicao`, {
      body: { integrationAccountId: ACCOUNT_A, version: operation.version, providerId: inactiveProviderId, amount: 350.5, evidence: { comprovante: 'x' } }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_VPO_PROVIDER_INACTIVE');
  });

  it('sucesso: status acquired + evidenceSource manual + atualiza vpoAmount SEM tocar freightOfferedAmount', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const avaliar = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(avaliar.response.status, 200, JSON.stringify(avaliar.body));

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/registrar-aquisicao`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        version: operation.version,
        providerId: activeProviderId,
        providerReference: 'VPO-MANUAL-001',
        amount: 350.5,
        evidence: { comprovante: 'recibo-teste.pdf' }
      }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'acquired');
    assert.equal(body.evidenceSource, 'manual');
    assert.equal(body.amount, 350.5);
    assert.equal(body.providerId, activeProviderId);

    const opRes = await query('select freight_offered_amount, vpo_amount from transport_operations where id = $1', [operation.id]);
    assert.equal(Number(opRes.rows[0].freight_offered_amount), 4000, 'freight NUNCA tocado por registrar-aquisicao');
    assert.equal(Number(opRes.rows[0].vpo_amount), 350.5, 'vpo_amount refletido na operação, SEMPRE separado do frete');

    // Uma SEGUNDA tentativa (allocation já acquired) deve 409 — a checagem de status da alocação
    // acontece ANTES do CAS de version, então o valor de `version` aqui é irrelevante para o teste.
    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/registrar-aquisicao`, {
      body: { integrationAccountId: ACCOUNT_A, version: operation.version, providerId: activeProviderId, amount: 100, evidence: { x: 1 } }
    });
    assert.equal(second.response.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.code, 'TRANSPORTE_VPO_NOT_APPLICABLE');
  });
});

describe('POST .../vpo/adquirir — assíncrono (202, DL-102)', () => {
  it('exige allocation applicable', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/adquirir`, {
      body: { integrationAccountId: ACCOUNT_A, providerId: activeProviderId }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_VPO_NOT_APPLICABLE');
  });

  it('enfileira transporte.vpo.acquire, devolve CommandAccepted com entityType vpo_allocation', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, { body: { integrationAccountId: ACCOUNT_A } });

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/adquirir`, {
      body: { integrationAccountId: ACCOUNT_A, providerId: activeProviderId }
    });

    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.entityType, 'vpo_allocation');
    assert.equal(body.entityId, operation.id);
    assert.equal(body.operation, 'transporte.vpo.acquire');
    assert.equal(body.status, 'queued');
    assert.ok(body.jobId?.startsWith('job_'));
    assert.equal(body.links.entity, `/v1/transporte/operacoes/${operation.id}/vpo`);

    const jobRes = await query('select * from jobs where job_id = $1', [body.jobId]);
    assert.equal(jobRes.rows.length, 1);
    assert.equal(jobRes.rows[0].entity_type, 'vpo_allocation');
    assert.equal(jobRes.rows[0].entity_id, operation.id);

    const allocRes = await query('select status from vpo_allocations where operation_id = $1', [operation.id]);
    assert.equal(allocRes.rows[0].status, 'applicable', 'worker não rodou neste teste — status inalterado até o job processar');
  });

  it('idempotência via Idempotency-Key: 2º POST com a MESMA chave devolve o MESMO job', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, { body: { integrationAccountId: ACCOUNT_A } });

    const idempotencyKey = `idem-vpo-${randomBytes(8).toString('hex')}`;
    const headers = { ...authHeaders(), 'Idempotency-Key': idempotencyKey };

    const first = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/adquirir`, {
      body: { integrationAccountId: ACCOUNT_A, providerId: activeProviderId },
      headers
    });
    assert.equal(first.response.status, 202, JSON.stringify(first.body));

    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/adquirir`, {
      body: { integrationAccountId: ACCOUNT_A, providerId: activeProviderId },
      headers
    });
    assert.equal(second.response.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.jobId, first.body.jobId, 'mesma Idempotency-Key deve devolver a MESMA resposta');
    assert.equal(second.body.commandId, first.body.commandId);
  });
});

describe('GET .../vpo — allocation atual + eventos paginados', () => {
  it('sem nenhuma avaliação ainda → { allocation: null, events: [] }', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/vpo?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.allocation, null);
    assert.deepEqual(body.events.items, []);
    assert.equal(body.events.total, 0);
  });

  it('depois de avaliar-aplicabilidade → allocation atual + evento applicability_evaluated', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);
    const avaliar = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(avaliar.response.status, 200, JSON.stringify(avaliar.body));

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/vpo?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.allocation);
    assert.equal(body.allocation.operationId, operation.id);
    assert.equal(body.allocation.status, 'applicable');
    assert.ok(body.events.items.some((event) => event.eventType === 'applicability_evaluated'));
  });

  it('isolamento de tenancy: conta B não vê a operação nem a alocação da conta A', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_TOLL_APPLICABLE);

    const crossAvaliar = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/vpo/avaliar-aplicabilidade`, {
      body: { integrationAccountId: ACCOUNT_B }
    });
    assert.equal(crossAvaliar.response.status, 404);
    assert.equal(crossAvaliar.body.code, 'TRANSPORT_OPERATION_NOT_FOUND');

    const crossGet = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/vpo?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(crossGet.response.status, 404);
  });
});

describe('GET /v1/transporte/vpo/fornecedoras', () => {
  it('sem token → 401', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/vpo/fornecedoras`);
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('lista as fornecedoras cadastradas, incluindo as 16 reais carregadas via load:vpo-providers', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', '/v1/transporte/vpo/fornecedoras');
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.items));

    const names = body.items.map((item) => item.name);
    // Não afirmamos EXATAMENTE 16 (o loader pode não ter rodado neste ambiente de CI) — mas se
    // rodou (validação obrigatória do PR-D1), as fornecedoras reais da ANTT aparecem aqui.
    const knownRealProviders = ['Veloe', 'Sem Parar', 'ConectCar'];
    const foundKnown = knownRealProviders.filter((name) => names.includes(name));
    if (foundKnown.length > 0) {
      assert.ok(foundKnown.length === knownRealProviders.length, `esperava as 3 amostradas juntas se o loader rodou, achou: ${foundKnown.join(', ')}`);
    }

    // A fornecedora ATIVA de teste sempre aparece (cadastro NÃO tem tenancy).
    const testProvider = body.items.find((item) => item.id === activeProviderId);
    assert.ok(testProvider);
    assert.equal(testProvider.isActive, true);

    const inactiveTestProvider = body.items.find((item) => item.id === inactiveProviderId);
    assert.ok(inactiveTestProvider, 'lista TODAS (ativas e inativas), não só as habilitadas');
    assert.equal(inactiveTestProvider.isActive, false);
  });
});
