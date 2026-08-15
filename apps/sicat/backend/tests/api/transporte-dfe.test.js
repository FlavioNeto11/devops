/**
 * API da camada fiscal do Transporte (PR-E1): `importar` (201 + dedupe 409), `vincular`/
 * `desvincular`, `revalidar` (200 síncronos), `GET` (lista por operação + detalhe com issues/links)
 * — contra o app REAL (`createApp`) e o Postgres local. TUDO síncrono (sem job/worker nesta
 * camada) — molde `tests/api/transporte-vpo.test.js`/`tests/api/transporte-ciot.test.js`.
 *
 * O ciclo assíncrono do CIOT (`solicitar` → `registered`) NÃO roda aqui (exigiria o worker) — os
 * cenários de cross-check CIOT↔MDF-e (`MDFE_CIOT_MISMATCH`) montam `ciot_operations` já
 * `registered` via SQL direto, molde `tests/worker/transporte-ciot.test.js`. VPO usa o caminho
 * SÍNCRONO real (`avaliar-aplicabilidade` + `registrar-aquisicao`), sem precisar de atalho.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { ensureDfeSchemaRegistrySeeded } from '../../src/bootstrap/dfe-schema-seed.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';
import { createPrefixedId } from '../../src/lib/ids.js';
import { buildCiotCorrelationMarker } from '../../src/lib/transport/ciot-correlation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/regulatory/dfe');

function readDfeFixture(name) {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_trdfe_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trdfe_b_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81'; // mesmo CNPJ (com máscara) do emit das fixtures XML
const CNPJ_CONTRACTOR = '11.888.888/0001-67';
const CNPJ_UNRELATED = '33.444.555/0001-81'; // nunca aparece nas fixtures — usado no cenário DFE_PARTY_MISMATCH

/** Chaves de acesso EXTRA (mesmo gerador de mod-11 usado nas fixtures estáticas), só para clonar um documento com conteúdo idêntico mas chave DIFERENTE — evita colisão de dedupe entre describes que precisam de um import "fresco" do mesmo tipo de documento. */
const EXTRA_ACCESS_KEYS = {
  'mdfe-with-ciot.xml': '35260811222333000181580010000000041000000079',
  'mdfe-without-ciot.xml': '35260811222333000181580010000000051000000084',
  'cte-authorized.xml': '35260811222333000181570010000000021000000097'
};

const ORIGINAL_ACCESS_KEYS = {
  'mdfe-with-ciot.xml': '35260811222333000181580010000000011000000042',
  'mdfe-without-ciot.xml': '35260811222333000181580010000000021000000058',
  'cte-authorized.xml': '35260811222333000181570010000000011000000030'
};

/** Devolve uma CÓPIA do XML da fixture com uma chave de acesso diferente (Id + chNFe/chCTe/chMDFe) — mesmo conteúdo, documento novo. */
function readDfeFixtureWithFreshAccessKey(name) {
  const original = readDfeFixture(name);
  const oldKey = ORIGINAL_ACCESS_KEYS[name];
  const newKey = EXTRA_ACCESS_KEYS[name];
  if (!oldKey || !newKey) throw new Error(`sem chave extra cadastrada para ${name}`);
  return original.split(oldKey).join(newKey);
}

const ROUTE_SP_SP = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Campinas',
  destinationUf: 'SP',
  distanceKm: 99.5,
  tollExpected: false
};

const ROUTE_SP_MG_TOLL = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2,
  tollExpected: true
};

let carrierPartyId = '';
let contractorPartyId = '';
let vehicleId = '';
let vpoProviderId = '';

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

/** draft → validating → ready_for_contract → contracted (molde `transporte-vpo.test.js`). */
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

/** `ciot_operations` já `registered` — SQL direto (molde `tests/worker/transporte-ciot.test.js`); o ciclo assíncrono real não roda neste arquivo. */
async function insertRegisteredCiotOperation(operationId, ciotNumber) {
  const id = createPrefixedId('ciot');
  const correlationMarker = buildCiotCorrelationMarker(id);
  await query(
    `insert into ciot_operations (
       id, integration_account_id, operation_id, provider, status, ciot_number, correlation_marker,
       request_payload_snapshot, correlation_id, version, registered_at
     ) values ($1, $2, $3, 'mock', 'registered', $4, $5, '{}'::jsonb, $6, 1, now())`,
    [id, ACCOUNT_A, operationId, ciotNumber, correlationMarker, `corr_${id}`]
  );
  return id;
}

async function acquireVpoManually(operationId, currentVersion) {
  const avaliar = await callApi('POST', `/v1/transporte/operacoes/${operationId}/vpo/avaliar-aplicabilidade`, {
    body: { integrationAccountId: ACCOUNT_A }
  });
  assert.equal(avaliar.response.status, 200, JSON.stringify(avaliar.body));
  assert.equal(avaliar.body.status, 'applicable', 'rota precisa exigir VPO para este cenário');

  const registrar = await callApi('POST', `/v1/transporte/operacoes/${operationId}/vpo/registrar-aquisicao`, {
    body: {
      integrationAccountId: ACCOUNT_A,
      version: currentVersion,
      providerId: vpoProviderId,
      amount: 250.75,
      evidence: { comprovante: 'recibo-teste-dfe.pdf' }
    }
  });
  assert.equal(registrar.response.status, 200, JSON.stringify(registrar.body));
  return registrar.body;
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
  await ensureDfeSchemaRegistrySeeded();

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste DF-e'), ($2, 'Conta B - teste DF-e')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  vpoProviderId = createPrefixedId('vpoprov');
  await query(
    `insert into vpo_providers (id, name, is_active, version) values ($1, $2, true, 1)`,
    [vpoProviderId, `Fornecedora DF-e Teste ${RUN_ID}`]
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
      legalName: 'Transportes Fixture LTDA',
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
      legalName: 'Embarcadora DF-e LTDA',
      roles: ['contractor']
    }
  });
  assert.equal(contractor.response.status, 201, JSON.stringify(contractor.body));
  contractorPartyId = contractor.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'DFE1O23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query(
      `delete from fiscal_document_events where document_id in (
         select id from fiscal_documents where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query(
      `delete from fiscal_document_links where document_id in (
         select id from fiscal_documents where integration_account_id = any($1)
       ) or linked_document_id in (
         select id from fiscal_documents where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from fiscal_documents where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query(
      `delete from vpo_events where vpo_allocation_id in (
         select id from vpo_allocations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from vpo_allocations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from vpo_providers where id = $1', [vpoProviderId]);
    await query(
      `delete from ciot_events where ciot_operation_id in (
         select id from ciot_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from ciot_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
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

describe('POST /v1/transporte/documentos-fiscais/importar — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/documentos-fiscais/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A, xmlContent: '<x/>' })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../importar — XML malformado', () => {
  it('400 DFE_XML_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('malformed.xml') }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'DFE_XML_INVALID');
  });
});

describe('POST .../importar — NF-e autorizada, sem operationId', () => {
  it('201, campos extraídos corretos, SEM xmlContent no corpo da resposta', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('nfe-authorized.xml') }
    });
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.documentType, 'NFE');
    assert.equal(body.accessKey, '35260811222333000181550010000000011000000017');
    assert.equal(body.operationId, null);
    assert.equal(body.authorizationStatus, 'authorized');
    assert.equal(body.validationStatus, 'valid');
    assert.deepEqual(body.validationIssues, []);
    assert.ok(body.xmlHash);
    assert.ok(body.xmlStorageRef);
    assert.ok(!('xmlContent' in body), 'a resposta NUNCA devolve o XML inteiro');
  });

  it('reimportar o MESMO XML → 409 DFE_ALREADY_IMPORTED com o id existente', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('nfe-authorized.xml') }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'DFE_ALREADY_IMPORTED');
    assert.ok(body.errors?.existingId);
  });

  it('a mesma chave em OUTRA conta é permitida (tenancy — dedupe é por conta)', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_B, xmlContent: readDfeFixture('nfe-authorized.xml') }
    });
    assert.equal(response.status, 201, JSON.stringify(body));

    // limpa a linha da conta B para não vazar entre describes deste arquivo.
    await query('delete from fiscal_documents where id = $1', [body.id]);
  });
});

describe('POST .../importar — CT-e referenciando a NF-e já importada (fiscal_document_links)', () => {
  it('201 e o link nfe_in_cte aparece no GET de detalhe', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('cte-authorized.xml') }
    });
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.documentType, 'CTE');

    const detail = await callApi('GET', `/v1/transporte/documentos-fiscais/${body.id}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.links.length, 1);
    assert.equal(detail.body.links[0].linkType, 'nfe_in_cte');
  });
});

describe('POST .../importar — MDF-e vinculado a uma operação no MESMO request', () => {
  it('201, operationId preenchido e evento linked_to_operation gravado', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_SP_SP);

    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: {
        integrationAccountId: ACCOUNT_A,
        xmlContent: readDfeFixture('mdfe-with-ciot.xml'),
        operationId: operation.id
      }
    });
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.documentType, 'MDFE');
    assert.equal(body.operationId, operation.id);
    assert.deepEqual(body.ciotNumbers, ['2026081500000001']);
    // Carrier tem o MESMO CNPJ do emit da fixture — sem DFE_PARTY_MISMATCH.
    assert.ok(!body.validationIssues.some((issue) => issue.code === 'DFE_PARTY_MISMATCH'), JSON.stringify(body.validationIssues));

    const eventsRes = await query(
      `select event_type from fiscal_document_events where document_id = $1 order by created_at asc`,
      [body.id]
    );
    assert.deepEqual(eventsRes.rows.map((row) => row.event_type), ['imported', 'validated', 'linked_to_operation']);

    const listing = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/documentos-fiscais?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(listing.response.status, 200, JSON.stringify(listing.body));
    assert.equal(listing.body.items.length, 1);
    assert.equal(listing.body.items[0].id, body.id);
  });

  it('operationId inexistente → 404 TRANSPORT_OPERATION_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: {
        integrationAccountId: ACCOUNT_A,
        xmlContent: readDfeFixture('mdfe-without-ciot.xml'),
        operationId: 'trop_inexistente'
      }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATION_NOT_FOUND');
  });
});

describe('POST .../{documentId}/vincular e desvincular', () => {
  it('importa SEM operação, vincula depois, desvincula em seguida', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_SP_SP);

    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('mdfe-without-ciot.xml') }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));
    assert.equal(imported.body.operationId, null);

    const vinculado = await callApi('POST', `/v1/transporte/documentos-fiscais/${imported.body.id}/vincular`, {
      body: { integrationAccountId: ACCOUNT_A, operationId: operation.id }
    });
    assert.equal(vinculado.response.status, 200, JSON.stringify(vinculado.body));
    assert.equal(vinculado.body.operationId, operation.id);

    const desvinculado = await callApi('POST', `/v1/transporte/documentos-fiscais/${imported.body.id}/desvincular`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(desvinculado.response.status, 200, JSON.stringify(desvinculado.body));
    assert.equal(desvinculado.body.operationId, null);

    const eventsRes = await query(
      `select event_type from fiscal_document_events where document_id = $1 order by created_at asc`,
      [imported.body.id]
    );
    assert.deepEqual(eventsRes.rows.map((row) => row.event_type), ['imported', 'validated', 'linked_to_operation', 'unlinked']);
  });

  it('documentId inexistente → 404 TRANSPORTE_DFE_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/dfe_inexistente/vincular', {
      body: { integrationAccountId: ACCOUNT_A, operationId: 'trop_qualquer' }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_DFE_NOT_FOUND');
  });

  it('vincular dispara o cross-check CIOT↔MDF-e (MDFE_CIOT_MISMATCH) quando a operação já tem CIOT registrado divergente', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_SP_SP);
    await insertRegisteredCiotOperation(operation.id, '00000000000000000000'); // diverge do CIOT do fixture

    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixtureWithFreshAccessKey('mdfe-with-ciot.xml') }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));
    assert.equal(imported.body.validationStatus, 'valid', 'sem operação vinculada ainda — sem cross-check');

    const vinculado = await callApi('POST', `/v1/transporte/documentos-fiscais/${imported.body.id}/vincular`, {
      body: { integrationAccountId: ACCOUNT_A, operationId: operation.id }
    });
    assert.equal(vinculado.response.status, 200, JSON.stringify(vinculado.body));
    assert.equal(vinculado.body.validationStatus, 'invalid');
    assert.ok(vinculado.body.validationIssues.some((issue) => issue.code === 'MDFE_CIOT_MISMATCH'), JSON.stringify(vinculado.body.validationIssues));
  });
});

describe('POST .../{documentId}/revalidar', () => {
  it('reprocessa a validação com o contexto ATUAL da operação (DFE_PARTY_MISMATCH só aparece depois de vincular + revalidar)', async (t) => {
    if (skipIfNoDb(t)) return;
    // Operação com PARTES DIFERENTES do emitente/destinatário das fixtures (CNPJ não relacionado).
    const unrelatedCarrier = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CNPJ',
        documentNumber: CNPJ_UNRELATED,
        legalName: 'Transportadora Sem Relação LTDA',
        roles: ['carrier']
      }
    });
    assert.equal(unrelatedCarrier.response.status, 201, JSON.stringify(unrelatedCarrier.body));

    const operation = await createContractedOperation(ROUTE_SP_SP, {
      parties: [
        { partyId: unrelatedCarrier.body.id, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' }
      ]
    });

    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixture('nfe-cancelled.xml') }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));
    // NF-e cancelada: authorizationStatus=cancelled não gera DFE_NOT_AUTHORIZED (não é "unknown") — sem operação, sem outro issue.
    assert.deepEqual(imported.body.validationIssues, []);

    const vinculado = await callApi('POST', `/v1/transporte/documentos-fiscais/${imported.body.id}/vincular`, {
      body: { integrationAccountId: ACCOUNT_A, operationId: operation.id }
    });
    assert.equal(vinculado.response.status, 200, JSON.stringify(vinculado.body));
    // vincular NÃO reprocessa PARTY/ROUTE (só o cross-check CIOT↔MDF-e, e este é NF-e) — issues intactas aqui.
    assert.deepEqual(vinculado.body.validationIssues, []);

    const revalidado = await callApi('POST', `/v1/transporte/documentos-fiscais/${imported.body.id}/revalidar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(revalidado.response.status, 200, JSON.stringify(revalidado.body));
    assert.ok(
      revalidado.body.validationIssues.some((issue) => issue.code === 'DFE_PARTY_MISMATCH'),
      JSON.stringify(revalidado.body.validationIssues)
    );
    assert.equal(revalidado.body.validationStatus, 'warnings');

    const eventsRes = await query(
      `select event_type from fiscal_document_events where document_id = $1 order by created_at asc`,
      [imported.body.id]
    );
    assert.deepEqual(eventsRes.rows.map((row) => row.event_type), ['imported', 'validated', 'linked_to_operation', 'revalidated']);
  });

  it('documentId inexistente → 404', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/documentos-fiscais/dfe_inexistente/revalidar', {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
  });
});

describe('MDF-e com vale-pedágio atualiza vpo_allocations.mdfe_reference (TR-VPO-004)', () => {
  it('VPO adquirido + MDF-e com valePed importado vinculado → mdfeReference preenchida', async (t) => {
    if (skipIfNoDb(t)) return;
    const operation = await createContractedOperation(ROUTE_SP_MG_TOLL);
    const allocation = await acquireVpoManually(operation.id, operation.version);
    assert.equal(allocation.status, 'acquired');
    assert.equal(allocation.mdfeReference, null);

    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: {
        integrationAccountId: ACCOUNT_A,
        xmlContent: readDfeFixture('mdfe-with-valeped.xml'),
        operationId: operation.id
      }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));

    const vpoAfter = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/vpo?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(vpoAfter.response.status, 200, JSON.stringify(vpoAfter.body));
    assert.equal(vpoAfter.body.allocation.mdfeReference, imported.body.accessKey);
    assert.ok(
      vpoAfter.body.events.items.some((event) => event.eventType === 'evidence_attached'),
      JSON.stringify(vpoAfter.body.events.items)
    );
  });
});

describe('GET .../documentos-fiscais/{documentId} — tenancy e ausência de XML', () => {
  it('conta B não enxerga documento importado pela conta A (404)', async (t) => {
    if (skipIfNoDb(t)) return;
    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixtureWithFreshAccessKey('mdfe-without-ciot.xml') }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));

    const crossGet = await callApi('GET', `/v1/transporte/documentos-fiscais/${imported.body.id}?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(crossGet.response.status, 404);
    assert.equal(crossGet.body.code, 'TRANSPORTE_DFE_NOT_FOUND');
  });

  it('resposta NUNCA inclui o XML inteiro — só storage_ref/hash internos', async (t) => {
    if (skipIfNoDb(t)) return;
    const imported = await callApi('POST', '/v1/transporte/documentos-fiscais/importar', {
      body: { integrationAccountId: ACCOUNT_A, xmlContent: readDfeFixtureWithFreshAccessKey('cte-authorized.xml') }
    });
    assert.equal(imported.response.status, 201, JSON.stringify(imported.body));
    const detail = await callApi('GET', `/v1/transporte/documentos-fiscais/${imported.body.id}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
    assert.ok(!('xmlContent' in detail.body));
    assert.ok(!JSON.stringify(detail.body).includes('<infCte'));
  });
});
