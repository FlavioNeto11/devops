/**
 * API de motoristas (PR I1, REQ-SICAT-0033): CRUD do motorista (extensão 1:1 de parte PF com
 * papel driver, CNH declarada), vínculo motorista↔transportador (fleet × aggregated, no máximo 1
 * vigente por par+tipo, encerramento por PATCH) e tipologia derivada exposta no GET de
 * transportadores (`fleetSize`/`derivedTypology`/`typologyWarning`) — contra o app REAL
 * (`createApp`) e o Postgres local. Molde: `tests/api/transporte-seguros.test.js` (skip limpo
 * quando o banco está fora, tenancy com DUAS contas criadas direto no banco).
 *
 * Datas são SEMPRE relativas a `new Date()` (nunca literais absolutas) — o teste roda em qualquer
 * data real da máquina. CPFs/CNPJs são SINTÉTICOS com dígito verificador VÁLIDO (o validador
 * rejeita documento inventado sem DV correto).
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
const ACCOUNT_A = `acc_trdrv_a_${RUN_ID}`;
const ACCOUNT_B = `acc_trdrv_b_${RUN_ID}`;

// ===================================================================================================
// Geradores de CPF/CNPJ VÁLIDOS (dígito verificador correto — `validatePartyDocument` rejeita
// documento inventado). Mesmos algoritmos de `transport-party-validator.ts`, replicados aqui (o
// validador não exporta "gerador", só "validador" — coerente com a fronteira do módulo; mesmo
// racional do gerador de CNPJ em `transporte-seguros.test.js`).
// ===================================================================================================

const RUN_SEED = parseInt(RUN_ID, 16) % 9000;
let documentSequence = 0;

function cpfCheckDigit(digits) {
  // Pesos decrescentes a partir de (len+1) — mesmo cálculo de `isValidCpf` no validador.
  const factor = digits.length + 1;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) sum += digits[i] * (factor - i);
  const check = (sum * 10) % 11;
  return check === 10 ? 0 : check;
}

function nextValidCpf() {
  documentSequence += 1;
  const base = `9${String(RUN_SEED).padStart(4, '0')}${String(documentSequence).padStart(4, '0')}`;
  const nums = base.split('').map(Number);
  const d1 = cpfCheckDigit(nums);
  const d2 = cpfCheckDigit([...nums, d1]);
  return base + String(d1) + String(d2);
}

function cnpjCheckDigit(digits) {
  const weights = digits.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) sum += digits[i] * weights[i];
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function nextValidCnpj() {
  documentSequence += 1;
  const base = `22${String(RUN_SEED).padStart(5, '0')}${String(documentSequence).padStart(5, '0')}`;
  const base12 = base.split('').map(Number);
  const d1 = cnpjCheckDigit(base12);
  const d2 = cnpjCheckDigit([...base12, d1]);
  return base + String(d1) + String(d2);
}

let plateSequence = 0;

/** Placa única por execução no formato antigo AAA9999 (a conta é única por run — sem colisão). */
function nextPlate() {
  plateSequence += 1;
  return `TDR${String(1000 + plateSequence)}`;
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

async function createPfParty(accountId, suffix, extra = {}) {
  const created = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: accountId,
      documentType: 'CPF',
      documentNumber: nextValidCpf(),
      legalName: `Motorista Teste ${suffix}`,
      ...extra
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

async function createPjParty(accountId, suffix, extra = {}) {
  const created = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: accountId,
      documentType: 'CNPJ',
      documentNumber: nextValidCnpj(),
      legalName: `Transportadora Teste ${suffix}`,
      roles: ['carrier'],
      ...extra
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

async function createDriver(accountId, partyId, overrides = {}) {
  const created = await callApi('POST', '/v1/transporte/motoristas', {
    body: {
      integrationAccountId: accountId,
      partyId,
      cnhNumber: `999${String(Date.now()).slice(-6)}${String(documentSequence).padStart(2, '0')}`,
      cnhCategory: 'E',
      cnhValidUntil: isoDateOffset(365),
      ...overrides
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body;
}

/** Veículo + vínculo com o transportador num passo só (para montar frota nos testes de tipologia). */
async function createVehicleWithLink(accountId, partyId, linkType) {
  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: accountId, plate: nextPlate(), vehicleType: 'truck' }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));

  const link = await callApi('POST', `/v1/transporte/transportadores/${partyId}/veiculos`, {
    body: { integrationAccountId: accountId, vehicleId: vehicle.body.id, linkType }
  });
  assert.equal(link.response.status, 201, JSON.stringify(link.body));
  return vehicle.body.id;
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
     values ($1, 'Conta A - teste Motoristas'), ($2, 'Conta B - teste Motoristas')
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
    // `transport_driver_carrier_links`/`transport_drivers` são `on delete cascade` para as partes
    // (migration 034), mas a limpeza explícita documenta a ordem de dependência.
    await query('delete from transport_driver_carrier_links where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_drivers where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_vehicle_links where vehicle_id in (select id from transport_vehicles where integration_account_id = any($1))', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_vehicles where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    // Respostas idempotentes lembradas têm a conta no escopo da operation — limpa pelos dois padrões.
    await query(
      `delete from idempotency_registry where operation like 'transporte.motorista%' and (operation like $1 or operation like $2)`,
      [`%:${ACCOUNT_A}`, `%:${ACCOUNT_B}`]
    );
  }
  await pool.end();
});

describe('POST /v1/transporte/motoristas — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/motoristas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST /v1/transporte/motoristas — criação (201)', () => {
  it('cria o motorista sobre parte PF, ADICIONA o papel driver que faltava e filtra evidence (LGPD)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Create1');

    const driver = await createDriver(ACCOUNT_A, partyId, {
      cnhNumber: ' 123 456 789-09 ',
      cnhUf: 'SP',
      evidence: { notes: 'CNH conferida presencialmente.', endereco: 'nunca persiste' }
    });

    assert.ok(driver.id?.startsWith('trdrv_'));
    assert.equal(driver.partyId, partyId);
    assert.equal(driver.cnhNumber, '12345678909', 'número normalizado para só dígitos');
    assert.equal(driver.cnhCategory, 'E');
    assert.equal(driver.cnhUf, 'SP');
    assert.equal(driver.status, 'active');
    assert.equal(driver.evidenceSource, 'manual');
    assert.equal(driver.version, 1);
    assert.ok(driver.partyName.includes('Motorista Teste'), 'resumo da parte no payload');
    assert.deepEqual(driver.evidence, { notes: 'CNH conferida presencialmente.' }, 'LGPD: só notes/documentRef sobrevivem');

    // A parte foi criada SEM roles — o cadastro do motorista deve ter adicionado `driver`.
    const party = await callApi('GET', `/v1/transporte/transportadores/${partyId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(party.response.status, 200);
    assert.ok(party.body.roles.includes('driver'), 'papel driver adicionado via mecanismo existente');
  });

  it('parte PJ → 400 TRANSPORT_DRIVER_PARTY_NOT_PF', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPjParty(ACCOUNT_A, 'CreatePj');

    const { response, body } = await callApi('POST', '/v1/transporte/motoristas', {
      body: {
        integrationAccountId: ACCOUNT_A,
        partyId,
        cnhNumber: '11144477735',
        cnhCategory: 'E',
        cnhValidUntil: isoDateOffset(365)
      }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_DRIVER_PARTY_NOT_PF');
  });

  it('segunda ficha para a MESMA parte → 409 TRANSPORT_DRIVER_DUPLICATE (1:1)', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Create2');
    await createDriver(ACCOUNT_A, partyId);

    const { response, body } = await callApi('POST', '/v1/transporte/motoristas', {
      body: {
        integrationAccountId: ACCOUNT_A,
        partyId,
        cnhNumber: '11144477735',
        cnhCategory: 'D',
        cnhValidUntil: isoDateOffset(200)
      }
    });
    assert.equal(response.status, 409);
    assert.equal(body.code, 'TRANSPORT_DRIVER_DUPLICATE');
  });

  it('categoria fora do enum → 400 TRANSPORT_DRIVER_CNH_CATEGORY_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Create3');

    const { response, body } = await callApi('POST', '/v1/transporte/motoristas', {
      body: {
        integrationAccountId: ACCOUNT_A,
        partyId,
        cnhNumber: '11144477735',
        cnhCategory: 'F',
        cnhValidUntil: isoDateOffset(365)
      }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_DRIVER_CNH_CATEGORY_INVALID');
  });

  it('parte inexistente na conta → 404 TRANSPORT_PARTY_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/motoristas', {
      body: {
        integrationAccountId: ACCOUNT_A,
        partyId: 'trparty_inexistente',
        cnhNumber: '11144477735',
        cnhCategory: 'E',
        cnhValidUntil: isoDateOffset(365)
      }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_PARTY_NOT_FOUND');
  });

  it('Idempotency-Key repetida devolve o MESMO motorista, sem criar registro novo', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Idem1');
    const idempotencyKey = `idem-trdrv-${RUN_ID}`;
    const body = {
      integrationAccountId: ACCOUNT_A,
      partyId,
      cnhNumber: '11144477735',
      cnhCategory: 'E',
      cnhValidUntil: isoDateOffset(365)
    };
    const headers = authHeaders({ 'Idempotency-Key': idempotencyKey });

    const first = await callApi('POST', '/v1/transporte/motoristas', { body, headers });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));

    const replay = await callApi('POST', '/v1/transporte/motoristas', { body, headers });
    assert.equal(replay.response.status, 201);
    assert.equal(replay.body.id, first.body.id, 'replay devolve a MESMA resposta');

    const dbDrivers = await query('select id from transport_drivers where party_id = $1', [partyId]);
    assert.equal(dbDrivers.rows.length, 1, 'nenhum registro duplicado');
  });
});

describe('GET /v1/transporte/motoristas — listagem e filtros', () => {
  it('lista com paginação, filtro por status e busca por CNH', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId1 = await createPfParty(ACCOUNT_A, 'List1');
    const partyId2 = await createPfParty(ACCOUNT_A, 'List2');
    const active = await createDriver(ACCOUNT_A, partyId1);
    const inactive = await createDriver(ACCOUNT_A, partyId2, { status: 'inactive' });

    const all = await callApi('GET', `/v1/transporte/motoristas?integrationAccountId=${ACCOUNT_A}&pageSize=100`);
    assert.equal(all.response.status, 200, JSON.stringify(all.body));
    assert.ok(all.body.total >= 2);
    assert.equal(all.body.page, 1);

    const inactiveOnly = await callApi('GET', `/v1/transporte/motoristas?integrationAccountId=${ACCOUNT_A}&status=inactive&pageSize=100`);
    assert.equal(inactiveOnly.response.status, 200);
    assert.ok(inactiveOnly.body.items.some((item) => item.id === inactive.id));
    assert.ok(!inactiveOnly.body.items.some((item) => item.id === active.id));

    const byCnh = await callApi('GET', `/v1/transporte/motoristas?integrationAccountId=${ACCOUNT_A}&search=${active.cnhNumber}`);
    assert.equal(byCnh.response.status, 200);
    assert.equal(byCnh.body.items.length, 1);
    assert.equal(byCnh.body.items[0].id, active.id);
  });
});

describe('GET/PATCH /v1/transporte/motoristas/{driverId}', () => {
  it('GET devolve o motorista; PATCH com version correta atualiza; version velha → 409', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Patch1');
    const driver = await createDriver(ACCOUNT_A, partyId);

    const fetched = await callApi('GET', `/v1/transporte/motoristas/${driver.id}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(fetched.response.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.id, driver.id);

    const newValidUntil = isoDateOffset(720);
    const patched = await callApi('PATCH', `/v1/transporte/motoristas/${driver.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 1, cnhValidUntil: newValidUntil, cnhCategory: 'AE' }
    });
    assert.equal(patched.response.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.version, 2);
    assert.equal(patched.body.cnhValidUntil, newValidUntil);
    assert.equal(patched.body.cnhCategory, 'AE');

    const stale = await callApi('PATCH', `/v1/transporte/motoristas/${driver.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: 1, status: 'inactive' }
    });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, 'TRANSPORT_DRIVER_VERSION_CONFLICT');
  });

  it('tenancy: conta B não enxerga motorista da conta A → 404 TRANSPORT_DRIVER_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Tenancy1');
    const driver = await createDriver(ACCOUNT_A, partyId);

    const { response, body } = await callApi('GET', `/v1/transporte/motoristas/${driver.id}?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_DRIVER_NOT_FOUND');
  });
});

describe('Vínculos motorista↔transportador — no máximo 1 vigente por par+tipo', () => {
  it('cria fleet e aggregated para o mesmo par; segundo vigente do MESMO tipo → 409; após encerrar, novo vínculo é aceito', async (t) => {
    if (skipIfNoDb(t)) return;
    const driverPartyId = await createPfParty(ACCOUNT_A, 'Vinculo1');
    const driver = await createDriver(ACCOUNT_A, driverPartyId);
    const carrierId = await createPjParty(ACCOUNT_A, 'Vinculo1');

    const fleet = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_A, carrierPartyId: carrierId, linkType: 'fleet', validFrom: isoDateOffset(-30) }
    });
    assert.equal(fleet.response.status, 201, JSON.stringify(fleet.body));
    assert.ok(fleet.body.id?.startsWith('trdrvlink_'));
    assert.equal(fleet.body.status, 'active');
    assert.ok(fleet.body.carrierName.includes('Transportadora Teste'), 'resumo do transportador no payload');

    // Tipo DIFERENTE para o mesmo par é permitido (fleet e aggregated coexistem).
    const aggregated = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_A, carrierPartyId: carrierId, linkType: 'aggregated', validFrom: isoDateOffset(-10) }
    });
    assert.equal(aggregated.response.status, 201, JSON.stringify(aggregated.body));

    // Mesmo tipo com vínculo vigente → 409, mesmo com validFrom diferente.
    const duplicate = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_A, carrierPartyId: carrierId, linkType: 'fleet', validFrom: isoDateOffset(-1) }
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.code, 'TRANSPORT_DRIVER_LINK_ACTIVE_EXISTS');

    const list = await callApi('GET', `/v1/transporte/motoristas/${driver.id}/vinculos?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(list.response.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.totalItems, 2);

    // Encerrar o fleet (PATCH) libera o par+tipo para um novo vínculo.
    const ended = await callApi('PATCH', `/v1/transporte/motoristas/${driver.id}/vinculos/${fleet.body.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: fleet.body.version, validUntil: isoDateOffset(-1) }
    });
    assert.equal(ended.response.status, 200, JSON.stringify(ended.body));
    assert.equal(ended.body.status, 'ended');
    assert.equal(ended.body.validUntil, isoDateOffset(-1));

    const again = await callApi('PATCH', `/v1/transporte/motoristas/${driver.id}/vinculos/${fleet.body.id}`, {
      body: { integrationAccountId: ACCOUNT_A, version: ended.body.version }
    });
    assert.equal(again.response.status, 409);
    assert.equal(again.body.code, 'TRANSPORT_DRIVER_LINK_ALREADY_ENDED');

    const renewed = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_A, carrierPartyId: carrierId, linkType: 'fleet', validFrom: isoDateOffset(0) }
    });
    assert.equal(renewed.response.status, 201, JSON.stringify(renewed.body));
  });

  it('carrier inexistente na conta → 400 TRANSPORT_DRIVER_LINK_CARRIER_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const driverPartyId = await createPfParty(ACCOUNT_A, 'Vinculo2');
    const driver = await createDriver(ACCOUNT_A, driverPartyId);

    const { response, body } = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_A, carrierPartyId: 'trparty_inexistente', linkType: 'fleet', validFrom: isoDateOffset(0) }
    });
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORT_DRIVER_LINK_CARRIER_INVALID');
  });

  it('tenancy: conta B não cria vínculo para motorista da conta A → 404 TRANSPORT_DRIVER_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const driverPartyId = await createPfParty(ACCOUNT_A, 'Vinculo3');
    const driver = await createDriver(ACCOUNT_A, driverPartyId);
    const carrierB = await createPjParty(ACCOUNT_B, 'Vinculo3B');

    const { response, body } = await callApi('POST', `/v1/transporte/motoristas/${driver.id}/vinculos`, {
      body: { integrationAccountId: ACCOUNT_B, carrierPartyId: carrierB, linkType: 'fleet', validFrom: isoDateOffset(0) }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_DRIVER_NOT_FOUND');
  });
});

describe('Tipologia derivada no GET de transportadores (REQ-SICAT-0033)', () => {
  it('PJ com 2 owned/leased + 1 aggregated → fleetSize 2, tac; ETC declarada → typologyWarning', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createPjParty(ACCOUNT_A, 'Tipologia1', { rntrcNumber: `77${RUN_ID}1`, rntrcCategory: 'ETC' });
    await createVehicleWithLink(ACCOUNT_A, carrierId, 'owned');
    await createVehicleWithLink(ACCOUNT_A, carrierId, 'leased');
    await createVehicleWithLink(ACCOUNT_A, carrierId, 'aggregated'); // NÃO conta na frota própria

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${carrierId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.fleetSize, 2, 'aggregated fica fora da frota própria');
    assert.equal(body.derivedTypology, 'tac');
    assert.ok(body.typologyWarning, 'ETC declarada × tac derivada deveria gerar aviso');
    assert.match(body.typologyWarning, /ETC/);
  });

  it('PJ com 4 owned e ETC declarada → etc, SEM aviso (controle negativo do warning)', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createPjParty(ACCOUNT_A, 'Tipologia2', { rntrcNumber: `77${RUN_ID}2`, rntrcCategory: 'ETC' });
    for (let i = 0; i < 4; i += 1) {
      await createVehicleWithLink(ACCOUNT_A, carrierId, 'owned');
    }

    const { response, body } = await callApi('GET', `/v1/transporte/transportadores/${carrierId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.fleetSize, 4);
    assert.equal(body.derivedTypology, 'etc');
    assert.equal(body.typologyWarning, null);
  });

  it('PF sem frota → driver_pf com fleetSize 0; a LISTAGEM também expõe os campos derivados', async (t) => {
    if (skipIfNoDb(t)) return;
    const partyId = await createPfParty(ACCOUNT_A, 'Tipologia3');

    const detail = await callApi('GET', `/v1/transporte/transportadores/${partyId}?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.fleetSize, 0);
    assert.equal(detail.body.derivedTypology, 'driver_pf');
    assert.equal(detail.body.typologyWarning, null);

    const list = await callApi('GET', `/v1/transporte/transportadores?integrationAccountId=${ACCOUNT_A}&pageSize=200`);
    assert.equal(list.response.status, 200);
    const inList = list.body.items.find((item) => item.id === partyId);
    assert.ok(inList, 'parte deveria aparecer na listagem');
    assert.equal(inList.fleetSize, 0);
    assert.equal(inList.derivedTypology, 'driver_pf');
  });
});
