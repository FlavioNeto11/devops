/**
 * API do cadastro-base de transportadores/veículos (PR-A3): POST/GET/PATCH
 * `/v1/transporte/transportadores` e `/v1/transporte/veiculos`, contra o app REAL (createApp) e
 * o Postgres local.
 *
 * Molde: `tests/api/transporte-regras.test.js` (PR-A2) — mesma convenção de skip quando o banco
 * está indisponível (probe de conexão no `before` vira SKIP LIMPO por teste, não vermelho por
 * infraestrutura).
 *
 * Tenancy: como esta base NÃO tem middleware de "conta ativa da sessão" (ver
 * `transport-party-service.ts`), o teste de isolamento usa DUAS contas criadas DIRETO NO BANCO no
 * setup — padrão dos testes de integração (`tests/integration/manifest-create.test.js`).
 *
 * CNPJs usados (`11222333000181`, `11444777000161`) têm dígito verificador VÁLIDO e são
 * fictícios — mesmos números de exemplo do contrato (`examples/post_v1_transporte_*`).
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
const ACCOUNT_A = `acc_trcad_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trcad_b_${RUN_ID}`;
const CNPJ_1 = '11.222.333/0001-81';
const CNPJ_2 = '11.444.777/0001-61';

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

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste cadastros'), ($2, 'Conta B - teste cadastros')
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
    // Cascade (party_roles/vehicle_links) cuida do resto.
    await query('delete from transport_vehicles where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('Transportadores — POST/GET/PATCH', { concurrency: 1 }, () => {
  it('sem token responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;

    const response = await fetch(`${API_BASE}/v1/transporte/transportadores?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('cria transportador → 201', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CNPJ',
        documentNumber: CNPJ_1,
        legalName: 'Transportes Um LTDA',
        uf: 'sp',
        roles: ['carrier', 'shipper']
      }
    });

    assert.equal(response.status, 201, JSON.stringify(body));
    assert.ok(body.id?.startsWith('trparty_'));
    assert.equal(body.version, 1);
    assert.equal(body.integrationAccountId, ACCOUNT_A);
    assert.equal(body.documentNumber, '11222333000181', 'documentNumber deve ser normalizado só dígitos');
    assert.equal(body.uf, 'SP', 'uf deve ser normalizada em maiúsculas');
    assert.equal(body.rntrcStatus, 'unknown');
    assert.deepEqual([...body.roles].sort(), ['carrier', 'shipper']);
    assert.ok(!('correlationId' in body), 'DTO não pode expor correlationId');
  });

  it('documento inválido responde 400 com código estável', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CNPJ',
        documentNumber: '11.222.333/0001-80',
        legalName: 'Transportadora Inválida'
      }
    });

    assert.equal(response.status, 400);
    assert.match(String(response.headers.get('content-type')), /application\/problem\+json/);
    assert.equal(body.code, 'TRANSPORT_PARTY_DOCUMENT_INVALID');
  });

  it('duplicado (mesmo documento, mesma conta) → 409', async (t) => {
    if (skipIfNoDb(t)) return;

    const payload = {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_2,
      legalName: 'Transportes Dois LTDA'
    };

    const first = await callApi('POST', '/v1/transporte/transportadores', { body: payload });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const second = await callApi('POST', '/v1/transporte/transportadores', { body: payload });
    assert.equal(second.response.status, 409);
    assert.equal(second.body.code, 'TRANSPORT_PARTY_DUPLICATE');
  });

  it('GET sem integrationAccountId responde 400', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('GET', '/v1/transporte/transportadores');
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_PARTY_FIELD_REQUIRED');
  });

  it('GET lista filtra por rntrcStatus e role', async (t) => {
    if (skipIfNoDb(t)) return;

    const list = await callApi('GET', `/v1/transporte/transportadores?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(list.response.status, 200);
    assert.ok(list.body.total >= 2, 'esperava ao menos os 2 transportadores já criados nesta conta');
    assert.equal(list.body.page, 1);
    assert.equal(list.body.pageSize, 20);

    const byRole = await callApi('GET', `/v1/transporte/transportadores?integrationAccountId=${ACCOUNT_A}&role=shipper`);
    assert.equal(byRole.response.status, 200);
    assert.ok(byRole.body.items.length >= 1);
    assert.ok(byRole.body.items.every((item) => item.roles.includes('shipper')));

    const byStatus = await callApi('GET', `/v1/transporte/transportadores?integrationAccountId=${ACCOUNT_A}&rntrcStatus=unknown`);
    assert.equal(byStatus.response.status, 200);
    assert.ok(byStatus.body.items.every((item) => item.rntrcStatus === 'unknown'));
  });

  it('PATCH com version correta → 200 e version incrementada; version velha → 409', async (t) => {
    if (skipIfNoDb(t)) return;

    const created = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CPF',
        documentNumber: '529.982.247-25',
        legalName: 'Motorista Autônomo Exemplo'
      }
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const partyId = created.body.id;

    const patched = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        version: 1,
        rntrcNumber: '87654321',
        rntrcCategory: 'TAC',
        rntrcStatus: 'active'
      }
    });
    assert.equal(patched.response.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.version, 2);
    assert.equal(patched.body.rntrcStatus, 'active');
    assert.equal(patched.body.rntrcNumber, '87654321');

    const staleConflict = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 1, rntrcStatus: 'suspended' }
    });
    assert.equal(staleConflict.response.status, 409);
    assert.equal(staleConflict.body.code, 'TRANSPORT_PARTY_VERSION_CONFLICT');
  });

  it('isolamento de tenancy: registro da conta A não é acessível pela conta B', async (t) => {
    if (skipIfNoDb(t)) return;

    const isolationParty = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CNPJ',
        documentNumber: '11.888.888/0001-67',
        legalName: 'Transportes Isolamento LTDA'
      }
    });
    assert.equal(isolationParty.response.status, 201, JSON.stringify(isolationParty.body));
    const partyId = isolationParty.body.id;

    const getFromB = await callApi('GET', `/v1/transporte/transportadores/${partyId}?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(getFromB.response.status, 404, 'conta B não pode ver registro da conta A');
    assert.equal(getFromB.body.code, 'TRANSPORT_PARTY_NOT_FOUND');

    const patchFromB = await callApi('PATCH', `/v1/transporte/transportadores/${partyId}`, {
      body: { integrationAccountId: ACCOUNT_B, version: 1, legalName: 'Sequestro de registro' }
    });
    assert.equal(patchFromB.response.status, 404, 'conta B não pode atualizar registro da conta A');
    assert.equal(patchFromB.body.code, 'TRANSPORT_PARTY_NOT_FOUND');

    const getFromA = await callApi('GET', `/v1/transporte/transportadores/${partyId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(getFromA.response.status, 200, 'conta A (dona) continua acessando normalmente');
  });
});

describe('Veículos — POST/GET/PATCH + vínculo com transportador', { concurrency: 1 }, () => {
  it('cria veículo → 201', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('POST', '/v1/transporte/veiculos', {
      body: {
        integrationAccountId: ACCOUNT_A,
        plate: 'abc-1d23',
        vehicleType: 'truck',
        axlesCount: 3
      }
    });

    assert.equal(response.status, 201, JSON.stringify(body));
    assert.ok(body.id?.startsWith('trveh_'));
    assert.equal(body.plate, 'ABC1D23', 'placa deve ser normalizada maiúscula sem hífen');
    assert.equal(body.version, 1);
  });

  it('placa duplicada na mesma conta → 409', async (t) => {
    if (skipIfNoDb(t)) return;

    const payload = { integrationAccountId: ACCOUNT_A, plate: 'XYZ9Y88', vehicleType: 'tractor' };
    const first = await callApi('POST', '/v1/transporte/veiculos', { body: payload });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const second = await callApi('POST', '/v1/transporte/veiculos', { body: payload });
    assert.equal(second.response.status, 409);
    assert.equal(second.body.code, 'TRANSPORT_VEHICLE_DUPLICATE');
  });

  it('PATCH com version correta incrementa; version velha → 409', async (t) => {
    if (skipIfNoDb(t)) return;

    const created = await callApi('POST', '/v1/transporte/veiculos', {
      body: { integrationAccountId: ACCOUNT_A, plate: 'JJJ1J11', vehicleType: 'trailer' }
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const vehicleId = created.body.id;

    const patched = await callApi('PATCH', `/v1/transporte/veiculos/${vehicleId}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 1, axlesCount: 4 }
    });
    assert.equal(patched.response.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.version, 2);
    assert.equal(patched.body.axlesCount, 4);

    const stale = await callApi('PATCH', `/v1/transporte/veiculos/${vehicleId}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 1, axlesCount: 5 }
    });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, 'TRANSPORT_VEHICLE_VERSION_CONFLICT');
  });

  it('cria veículo + vincula a um transportador → 201, e a listagem do transportador reflete o vínculo', async (t) => {
    if (skipIfNoDb(t)) return;

    const party = await callApi('POST', '/v1/transporte/transportadores', {
      body: {
        integrationAccountId: ACCOUNT_A,
        documentType: 'CNPJ',
        documentNumber: '11.777.777/0001-83',
        legalName: 'Transportes Vínculo LTDA'
      }
    });
    assert.equal(party.response.status, 201, JSON.stringify(party.body));

    const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
      body: { integrationAccountId: ACCOUNT_A, plate: 'LNK1K23', vehicleType: 'truck' }
    });
    assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));

    const link = await callApi('POST', `/v1/transporte/transportadores/${party.body.id}/veiculos`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        vehicleId: vehicle.body.id,
        linkType: 'owned',
        validFrom: '2026-01-01'
      }
    });
    assert.equal(link.response.status, 201, JSON.stringify(link.body));
    assert.equal(link.body.vehiclePlate, 'LNK1K23');
    assert.equal(link.body.linkType, 'owned');

    const listLinks = await callApi('GET', `/v1/transporte/transportadores/${party.body.id}/veiculos?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(listLinks.response.status, 200);
    assert.equal(listLinks.body.totalItems, 1);
    assert.equal(listLinks.body.items[0].vehicleId, vehicle.body.id);

    // Vínculo duplicado (mesmo veículo, mesma parte, mesmo tipo) → 409.
    const duplicateLink = await callApi('POST', `/v1/transporte/transportadores/${party.body.id}/veiculos`, {
      body: { integrationAccountId: ACCOUNT_A, vehicleId: vehicle.body.id, linkType: 'owned' }
    });
    assert.equal(duplicateLink.response.status, 409);
    assert.equal(duplicateLink.body.code, 'TRANSPORT_VEHICLE_LINK_DUPLICATE');

    // Veículo de outra conta não pode ser vinculado.
    const otherVehicle = await callApi('POST', '/v1/transporte/veiculos', {
      body: { integrationAccountId: ACCOUNT_B, plate: 'OTB1B23', vehicleType: 'truck' }
    });
    assert.equal(otherVehicle.response.status, 201, JSON.stringify(otherVehicle.body));

    const crossAccountLink = await callApi('POST', `/v1/transporte/transportadores/${party.body.id}/veiculos`, {
      body: { integrationAccountId: ACCOUNT_A, vehicleId: otherVehicle.body.id, linkType: 'leased' }
    });
    assert.equal(crossAccountLink.response.status, 400);
    assert.equal(crossAccountLink.body.code, 'TRANSPORT_VEHICLE_LINK_INVALID');
  });
});
