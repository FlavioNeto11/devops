/**
 * API da averbação eletrônica por viagem (PR-I3, REQ-SICAT-0034): `POST/GET .../averbacoes` (202/
 * 200), `retificar`/`cancelar` (202) e `GET /v1/transporte/seguros/averbacoes` — contra o app REAL
 * (`createApp`) e o Postgres local. Molde: `tests/api/transporte-seguros.test.js` (skip limpo sem
 * banco, DUAS contas) + `tests/api/transporte-ciot.test.js` (setup carrier/contractor/veículo +
 * helper de `contratar`).
 *
 * DIFERENTE dos vizinhos de API: aqui o ciclo COMPLETO roda no mesmo arquivo — um drenador
 * in-process (equivalente do `worker:once`) reivindica e executa os jobs `transporte.averbacao.*`
 * via `processJob` REAL, aplicando o side-effect terminal DL-102 quando o job lança (exatamente o
 * que `workers/job-runner.ts` faria). Cobre: averbar → declared (caso de ouro R$ 24,25); resposta
 * perdida (centavos .98) → declare_unconfirmed → reconcile → declared; retificar; cancelar; e
 * TR-SEG-005 aparecendo na conformidade (GATE_PRE_BOARDING).
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
import { findJobById } from '../../src/repositories/job-repo.js';
import { processJob, applyTransporteAverbacaoTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { resetAverbacaoSandboxStoreForTests } from '../../src/gateways/averbacao-gateway.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_travb_a_${RUN_ID}`;
const ACCOUNT_B = `acc_travb_b_${RUN_ID}`;

// Default do arquivo: sandbox ligado (molde `transporte-emissoes.test.js`). O describe de flag
// desligada gerencia seu próprio override e restaura no finally.
setConfigOverride('averbacaoGatewayMode', 'sandbox');

// ===================================================================================================
// Gerador de CNPJ VÁLIDO — mesmo algoritmo/molde de `transporte-seguros.test.js`.
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

function nextValidCnpj() {
  cnpjSequence += 1;
  const base = `22${String(RUN_SEED).padStart(5, '0')}${String(cnpjSequence).padStart(5, '0')}`;
  const base12 = base.split('').map(Number);
  const d1 = cnpjCheckDigit(base12);
  const d2 = cnpjCheckDigit([...base12, d1]);
  return base12.join('') + String(d1) + String(d2);
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

/** Data ISO ('YYYY-MM-DD') a partir de HOJE + `days` — nunca literal absoluta. */
function isoDateOffset(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ===================================================================================================
// Setup de domínio — carrier com apólices+taxas, contractor, veículo, operação contratada
// ===================================================================================================

let contractorPartyId = '';
let vehicleId = '';

async function createParty(legalName, extra = {}) {
  const created = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: nextValidCnpj(),
      legalName,
      ...extra
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

async function createPolicyWithRate(partyId, policyType, ratePercent, monthlyMinimumAmount) {
  const policy = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices`, {
    body: {
      integrationAccountId: ACCOUNT_A,
      policyType,
      insurerName: 'Seguradora Exemplo S.A.',
      policyNumber: `POL-${policyType}-${randomBytes(3).toString('hex')}`,
      coverageAmount: 500000,
      validFrom: isoDateOffset(-30),
      validUntil: isoDateOffset(400)
    }
  });
  assert.equal(policy.response.status, 201, JSON.stringify(policy.body));

  if (ratePercent != null) {
    const rate = await callApi('POST', `/v1/transporte/transportadores/${partyId}/apolices/${policy.body.id}/taxas`, {
      body: {
        integrationAccountId: ACCOUNT_A,
        ratePercent,
        monthlyMinimumAmount,
        validFrom: isoDateOffset(-30)
      }
    });
    assert.equal(rate.response.status, 201, JSON.stringify(rate.body));
  }
  return policy.body;
}

async function createDraftOperation(carrierPartyId, overrides = {}) {
  const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
    body: {
      integrationAccountId: ACCOUNT_A,
      cargoRegime: 'lotacao',
      route: {
        originMunicipality: 'São Paulo',
        originUf: 'SP',
        destinationMunicipality: 'Belo Horizonte',
        destinationUf: 'MG',
        distanceKm: 586.2
      },
      parties: [
        { partyId: carrierPartyId, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      // Caso de ouro do circuito (doc Irmãos PADILHA): carga de R$ 25.000,00.
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000, declaredValue: 25000 }],
      freightOfferedAmount: 4000,
      paymentTermDays: 30,
      ...overrides
    }
  });
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

/** draft → validating → ready_for_contract → contracted (molde `transporte-ciot.test.js`). */
async function createContractedOperation(carrierPartyId, overrides = {}) {
  const draft = await createDraftOperation(carrierPartyId, overrides);
  const submitted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/submeter-validacao`, {
    body: { integrationAccountId: ACCOUNT_A, version: draft.version }
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));

  const contracted = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/contratar`, {
    body: { integrationAccountId: ACCOUNT_A, version: submitted.body.operation.version, contractedAmount: 4000 }
  });
  assert.equal(contracted.response.status, 200, JSON.stringify(contracted.body));
  assert.equal(contracted.body.operation.status, 'contracted');
  return contracted.body.operation;
}

// ===================================================================================================
// Drenador in-process — equivalente do `worker:once` para os jobs transporte.averbacao.*.
// ===================================================================================================

/**
 * Reivindica e executa O PRÓXIMO job `transporte.averbacao.*` em `queued` via `processJob` REAL.
 * Quando o job LANÇA, aplica o side-effect terminal (DL-102) exatamente como
 * `workers/job-runner.ts#handleFailedTransition` faria numa falha terminal — o TESTE decide o que
 * afirmar sobre o estado resultante. Devolve `{ job, error }` ou `null` quando a fila está vazia.
 */
async function runNextAverbacaoJob() {
  const next = await query(
    `select job_id from jobs
      where operation like 'transporte.averbacao.%' and status = 'queued'
      order by created_at asc
      limit 1`
  );
  if (next.rows.length === 0) return null;
  const jobId = next.rows[0].job_id;

  await query(
    `update jobs set status = 'running', attempts = attempts + 1, started_at = now(),
       claimed_at = now(), claim_heartbeat_at = now(), claimed_by = 'averbacao-api-test-worker'
     where job_id = $1`,
    [jobId]
  );
  const job = await findJobById(jobId);

  try {
    await processJob(job, {});
    return { job, error: null };
  } catch (error) {
    await applyTransporteAverbacaoTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: job.entityType, entityId: job.entityId, operation: job.operation, payload: job.payload, correlationId: job.correlationId, lastErrorCode: error.code ?? null },
      { action: 'failed', patch: { lastErrorCode: error.code ?? null, lastErrorMessage: error.message } },
      error
    );
    // `chk_job_finished_integrity`: terminal exige finished_at — mesmo shape que o job-runner grava.
    await query("update jobs set status = 'failed', finished_at = now(), last_error_code = $2 where job_id = $1", [jobId, error.code ?? null]);
    return { job, error };
  }
}

/** Drena a fila inteira (caminhos felizes) — falha terminal já aplicada pelo side-effect DL-102. */
async function drainAverbacaoJobs() {
  const results = [];
  for (;;) {
    const result = await runNextAverbacaoJob();
    if (!result) return results;
    results.push(result);
  }
}

async function getDeclarationRow(id) {
  const result = await query('select * from insurance_shipment_declarations where id = $1', [id]);
  return result.rows[0] || null;
}

async function listDeclarationEventTypes(id) {
  const result = await query(
    'select event_type from insurance_declaration_events where declaration_id = $1 order by created_at asc',
    [id]
  );
  return result.rows.map((row) => row.event_type);
}

// ===================================================================================================
// Setup/teardown
// ===================================================================================================

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
  resetAverbacaoSandboxStoreForTests();

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste Averbacoes'), ($2, 'Conta B - teste Averbacoes')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;

  contractorPartyId = await createParty('Embarcadora Averbacao LTDA');
  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'AVB1B23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    await query(
      `delete from insurance_declaration_events where declaration_id in (
         select id from insurance_shipment_declarations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query(
      `delete from jobs where entity_type = 'insurance_declaration' and entity_id in (
         select id from insurance_shipment_declarations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from insurance_shipment_declarations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query("delete from idempotency_registry where operation like 'transporte.averbacao.%'");
    await query("delete from idempotency_registry where operation = any($1)", [
      [`transporte.apolice.taxa.create:${ACCOUNT_A}`, `transporte.apolice.taxa.create:${ACCOUNT_B}`]
    ]);
    await query('delete from insurance_rate_schedules where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from insurance_verifications where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from insurance_policies where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query(
      `delete from audit_logs where entity_type = 'insurance_declaration'`
    );
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query(
      `delete from jobs where entity_id in (
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

// ===================================================================================================
// Superfície HTTP — auth, flag desligada, pré-condições
// ===================================================================================================

describe('POST .../averbacoes — sem token', () => {
  it('responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/operacoes/trop_qualquer/averbacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });
});

describe('POST .../averbacoes — AVERBACAO_GATEWAY_MODE=off', () => {
  it('recusa com 501 AVERBACAO_GATEWAY_DISABLED SEM criar declaração nenhuma', async (t) => {
    if (skipIfNoDb(t)) return;
    setConfigOverride('averbacaoGatewayMode', 'off');
    try {
      const { response, body } = await callApi('POST', '/v1/transporte/operacoes/trop_qualquer/averbacoes', {
        body: { integrationAccountId: ACCOUNT_A }
      });
      assert.equal(response.status, 501, JSON.stringify(body));
      assert.equal(body.code, 'AVERBACAO_GATEWAY_DISABLED');
    } finally {
      setConfigOverride('averbacaoGatewayMode', 'sandbox');
    }
  });
});

describe('POST .../averbacoes — pré-condições', () => {
  it('operação em draft → 409 TRANSPORTE_AVERBACAO_OPERATION_NOT_READY', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createParty('Transportes Averbacao Draft LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    const draft = await createDraftOperation(carrierId);

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${draft.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_OPERATION_NOT_READY');
  });

  it('carga sem valor declarado → 409 TRANSPORTE_AVERBACAO_CARGO_VALUE_MISSING', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createParty('Transportes Averbacao SemValor LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    const operation = await createContractedOperation(carrierId, {
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000 }]
    });

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_CARGO_VALUE_MISSING');
  });

  it('carrier sem apólice vigente → 409 TRANSPORTE_AVERBACAO_NO_APPLICABLE_POLICY', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createParty('Transportes Averbacao SemApolice LTDA');
    const operation = await createContractedOperation(carrierId);

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_NO_APPLICABLE_POLICY');
  });

  it('apólice vigente SEM taxa cadastrada → 409 TRANSPORTE_AVERBACAO_RATE_NOT_FOUND (nunca default silencioso)', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createParty('Transportes Averbacao SemTaxa LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', null);
    const operation = await createContractedOperation(carrierId);

    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_RATE_NOT_FOUND');
  });
});

// ===================================================================================================
// Ciclo completo — caso de ouro do circuito (R$ 25.000 → RCTR-C 0,072% + RC-DC 0,025% = R$ 24,25)
// ===================================================================================================

describe('averbar → declared (caso de ouro) + TR-SEG-005 na conformidade', () => {
  it('cria UMA declaração por apólice, prêmio no ato, worker confirma e o gate passa', async (t) => {
    if (skipIfNoDb(t)) return;

    const carrierId = await createParty('Irmaos Padilha Transportes LTDA', {
      roles: ['carrier'],
      rntrcNumber: '12345678',
      rntrcCategory: 'ETC',
      rntrcStatus: 'active'
    });
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    await createPolicyWithRate(carrierId, 'RC_DC', 0.025, 300);
    const operation = await createContractedOperation(carrierId);

    // ANTES de averbar: TR-SEG-005 aponta apólice vigente sem averbação — block bruto rebaixado
    // pelo clamp advisory (blocking=false no seed) para WARN RULE_NOT_ENFORCEABLE.
    const preGate = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PRE_BOARDING' }
    });
    assert.equal(preGate.response.status, 200, JSON.stringify(preGate.body));
    const preCheck = preGate.body.checks.find((check) => check.ruleCode === 'TR-SEG-005');
    assert.ok(preCheck, 'TR-SEG-005 precisa aparecer no GATE_PRE_BOARDING');
    assert.equal(preCheck.status, 'WARN', 'block bruto clampado (regra advisory)');
    assert.equal(preCheck.rawStatus, 'BLOCK');
    assert.equal(preCheck.reasonCode, 'RULE_NOT_ENFORCEABLE');

    // Averbar: 202 com UMA declaração por apólice vigente aplicável, prêmio calculado NO ATO.
    const averbado = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A },
      headers: { ...authHeaders(), 'Idempotency-Key': `averbar-${RUN_ID}-golden` }
    });
    assert.equal(averbado.response.status, 202, JSON.stringify(averbado.body));
    assert.equal(averbado.body.declaredCargoAmount, 25000);
    assert.equal(averbado.body.declarations.length, 2, 'RCTR-C + RC-DC (sem RC-V: apólice não registrada)');

    const rctrc = averbado.body.declarations.find((declaration) => declaration.policyType === 'RCTR_C');
    const rcdc = averbado.body.declarations.find((declaration) => declaration.policyType === 'RC_DC');
    assert.equal(rctrc.appliedRatePercent, 0.072);
    assert.equal(rctrc.premiumAmount, 18, 'R$ 25.000,00 × 0,072% = R$ 18,00');
    assert.equal(rcdc.appliedRatePercent, 0.025);
    assert.equal(rcdc.premiumAmount, 6.25, 'R$ 25.000,00 × 0,025% = R$ 6,25');
    // O caso de ouro completo: 0,097% somado → R$ 24,25.
    assert.equal(Math.round((rctrc.premiumAmount + rcdc.premiumAmount) * 100), 2425);
    assert.equal(rctrc.status, 'declaring');
    assert.equal(rctrc.routeScope, 'SP-MG');
    assert.equal(rctrc.providerDeclarationRef, null, 'DL-102: o ref só nasce na RESPOSTA');

    // Replay idempotente: mesma chave devolve a MESMA resposta, sem declarações novas.
    const replay = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A },
      headers: { ...authHeaders(), 'Idempotency-Key': `averbar-${RUN_ID}-golden` }
    });
    assert.deepEqual(
      replay.body.declarations.map((declaration) => declaration.id).sort(),
      averbado.body.declarations.map((declaration) => declaration.id).sort()
    );

    // Segunda averbação SEM idempotency → 409 ALREADY_LIVE (no máximo 1 viva por operação×apólice).
    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(second.response.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.code, 'TRANSPORTE_AVERBACAO_ALREADY_LIVE');

    // Drena os jobs (equivalente worker:once): as duas declarações confirmam.
    const drained = await drainAverbacaoJobs();
    assert.equal(drained.length, 2);
    assert.equal(drained.filter((entry) => entry.error === null).length, 2, 'nenhum job deveria falhar no caminho feliz');

    for (const declaration of averbado.body.declarations) {
      const row = await getDeclarationRow(declaration.id);
      assert.equal(row.status, 'declared');
      assert.match(row.provider_declaration_ref, /^AVB\d+$/);
      assert.deepEqual(await listDeclarationEventTypes(declaration.id), ['declare_requested', 'declared']);
    }

    // GET .../averbacoes: histórico + eventos.
    const listed = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/averbacoes?integrationAccountId=${ACCOUNT_A}`);
    assert.equal(listed.response.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.totalItems, 2);
    assert.ok(listed.body.items.every((item) => item.status === 'declared'));
    assert.ok(listed.body.items.every((item) => item.events.length === 2));

    // DEPOIS de averbar: TR-SEG-005 passa.
    const postGate = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PRE_BOARDING' }
    });
    assert.equal(postGate.response.status, 200, JSON.stringify(postGate.body));
    const postCheck = postGate.body.checks.find((check) => check.ruleCode === 'TR-SEG-005');
    assert.equal(postCheck.status, 'PASS', JSON.stringify(postCheck));

    // Extrato por conta/período inclui as duas declarações.
    const extrato = await callApi(
      'GET',
      `/v1/transporte/seguros/averbacoes?integrationAccountId=${ACCOUNT_A}&from=${isoDateOffset(-1)}&to=${isoDateOffset(1)}&status=declared`
    );
    assert.equal(extrato.response.status, 200, JSON.stringify(extrato.body));
    const extratoIds = extrato.body.items.map((item) => item.id);
    for (const declaration of averbado.body.declarations) {
      assert.ok(extratoIds.includes(declaration.id), `extrato deveria incluir ${declaration.id}`);
    }

    // Extrato da conta B nunca vê as declarações da conta A (tenancy).
    const extratoB = await callApi('GET', `/v1/transporte/seguros/averbacoes?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(extratoB.response.status, 200);
    assert.equal(extratoB.body.items.some((item) => extratoIds.includes(item.id)), false);
  });
});

// ===================================================================================================
// Resposta perdida (DL-102) — centavos .98 → declare_unconfirmed → reconcile → declared
// ===================================================================================================

describe('averbar com resposta perdida (.98) — declare_unconfirmed → reconcile → declared', () => {
  it('o dispatch acontece, a resposta se perde, e a reconciliação resolve pelo marcador', async (t) => {
    if (skipIfNoDb(t)) return;

    const carrierId = await createParty('Transportes Averbacao Lost LTDA');
    // UMA apólice com a taxa SOMADA do caso de ouro (0,097%) — carga .98 exercita o cenário DL-102.
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.097, 700);
    const operation = await createContractedOperation(carrierId, {
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000, declaredValue: 25000.98 }]
    });

    const averbado = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(averbado.response.status, 202, JSON.stringify(averbado.body));
    assert.equal(averbado.body.declarations.length, 1);
    const declarationId = averbado.body.declarations[0].id;
    // 2.500.098 centavos × 0,097% = 2.425,09506 → R$ 24,25 (half-up) — o caso de ouro sobrevive aos centavos do cenário.
    assert.equal(averbado.body.declarations[0].premiumAmount, 24.25);

    // 1º job: declare → a seguradora PROCESSA mas a resposta se perde; o side-effect terminal
    // (aplicado pelo drenador, como o job-runner faria) marca declare_unconfirmed e enfileira o
    // reconcile.
    const first = await runNextAverbacaoJob();
    assert.ok(first, 'deveria haver um job de declare na fila');
    assert.equal(first.job.operation, 'transporte.averbacao.declare');
    assert.equal(first.error?.code, 'AVERBACAO_LOST_RESPONSE_TEST');

    let row = await getDeclarationRow(declarationId);
    assert.equal(row.status, 'declare_unconfirmed', 'DL-102: resposta perdida NUNCA vira rejected');
    assert.equal(row.provider_declaration_ref, null);
    assert.deepEqual(await listDeclarationEventTypes(declarationId), ['declare_requested', 'declare_unconfirmed']);

    // 2º job: reconcile (enfileirado pelo side-effect) → encontra pelo marcador e completa.
    const second = await runNextAverbacaoJob();
    assert.ok(second, 'o side-effect terminal deveria ter enfileirado o reconcile');
    assert.equal(second.job.operation, 'transporte.averbacao.reconcile');
    assert.equal(second.error, null, JSON.stringify(second.error?.message ?? null));

    row = await getDeclarationRow(declarationId);
    assert.equal(row.status, 'declared', 'a reconciliação encontra o que o dispatch nunca viu');
    assert.match(row.provider_declaration_ref, /^AVB\d+$/);
    assert.deepEqual(
      await listDeclarationEventTypes(declarationId),
      ['declare_requested', 'declare_unconfirmed', 'reconciled']
    );
  });
});

// ===================================================================================================
// Retificar e cancelar
// ===================================================================================================

describe('retificar e cancelar', () => {
  it('retificar re-congela a carga ATUAL com a MESMA taxa; TR-SEG-005 aponta STALE antes e PASS depois', async (t) => {
    if (skipIfNoDb(t)) return;

    const carrierId = await createParty('Transportes Averbacao Retif LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    const operation = await createContractedOperation(carrierId);

    const averbado = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(averbado.response.status, 202, JSON.stringify(averbado.body));
    const declarationId = averbado.body.declarations[0].id;
    await drainAverbacaoJobs();

    // Retificar antes de declarado seria 409 — aqui já está declared. A carga da operação MUDOU
    // depois da averbação (25.000 → 30.000): TR-SEG-005 aponta a divergência pedindo retificação.
    await query('update transport_operation_cargo set declared_value = 30000 where operation_id = $1', [operation.id]);

    const staleGate = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PRE_BOARDING' }
    });
    const staleCheck = staleGate.body.checks.find((check) => check.ruleCode === 'TR-SEG-005');
    assert.equal(staleCheck.status, 'WARN');
    assert.equal(staleCheck.reasonCode, 'SHIPMENT_DECLARATION_STALE');

    const retificado = await callApi('POST', `/v1/transporte/averbacoes/${declarationId}/retificar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(retificado.response.status, 202, JSON.stringify(retificado.body));
    assert.equal(retificado.body.operation, 'transporte.averbacao.rectify');

    let row = await getDeclarationRow(declarationId);
    assert.equal(row.status, 'rectifying');
    assert.equal(Number(row.declared_cargo_amount), 30000, 'novo valor congelado NO ATO da retificação');
    assert.equal(Number(row.premium_amount), 21.6, 'R$ 30.000,00 × 0,072% = R$ 21,60 (mesma taxa)');

    const drained = await drainAverbacaoJobs();
    assert.equal(drained.length, 1);
    assert.equal(drained[0].error, null);

    row = await getDeclarationRow(declarationId);
    assert.equal(row.status, 'declared', 'retificação bem-sucedida VOLTA a declared');
    assert.deepEqual(
      await listDeclarationEventTypes(declarationId),
      ['declare_requested', 'declared', 'rectify_requested', 'rectified']
    );

    const postGate = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PRE_BOARDING' }
    });
    const postCheck = postGate.body.checks.find((check) => check.ruleCode === 'TR-SEG-005');
    assert.equal(postCheck.status, 'PASS', JSON.stringify(postCheck));
  });

  it('cancelar → cancelled (terminal) e a chave viva operação×apólice é LIBERADA para nova averbação', async (t) => {
    if (skipIfNoDb(t)) return;

    const carrierId = await createParty('Transportes Averbacao Cancel LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    const operation = await createContractedOperation(carrierId);

    const averbado = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    const declarationId = averbado.body.declarations[0].id;
    await drainAverbacaoJobs();

    // Mutação em estado não-declared → 409 (declarando de novo primeiro provaremos o guard).
    const cancelado = await callApi('POST', `/v1/transporte/averbacoes/${declarationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A, reason: 'Embarque renegociado.' }
    });
    assert.equal(cancelado.response.status, 202, JSON.stringify(cancelado.body));

    const repeat = await callApi('POST', `/v1/transporte/averbacoes/${declarationId}/cancelar`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(repeat.response.status, 409, 'cancelar de novo em cancelling → MUTATION_NOT_ALLOWED');
    assert.equal(repeat.body.code, 'TRANSPORTE_AVERBACAO_MUTATION_NOT_ALLOWED');

    await drainAverbacaoJobs();

    const row = await getDeclarationRow(declarationId);
    assert.equal(row.status, 'cancelled');
    assert.deepEqual(
      await listDeclarationEventTypes(declarationId),
      ['declare_requested', 'declared', 'cancel_requested', 'cancelled']
    );

    // Chave viva liberada: um novo averbar cria uma declaração NOVA para a mesma apólice.
    const again = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/averbacoes`, {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(again.response.status, 202, JSON.stringify(again.body));
    assert.notEqual(again.body.declarations[0].id, declarationId);
    await drainAverbacaoJobs();
  });

  it('retificar averbação inexistente/da outra conta → 404 TRANSPORTE_AVERBACAO_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', '/v1/transporte/averbacoes/insdecl_inexistente/retificar', {
      body: { integrationAccountId: ACCOUNT_A }
    });
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_NOT_FOUND');
  });
});

// ===================================================================================================
// Listagens — validação de filtros e tenancy
// ===================================================================================================

describe('GET /v1/transporte/seguros/averbacoes — filtros', () => {
  it('status inválido → 400 TRANSPORTE_AVERBACAO_STATUS_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', `/v1/transporte/seguros/averbacoes?integrationAccountId=${ACCOUNT_A}&status=invalido`);
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_STATUS_INVALID');
  });

  it('período invertido → 400 TRANSPORTE_AVERBACAO_PERIOD_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi(
      'GET',
      `/v1/transporte/seguros/averbacoes?integrationAccountId=${ACCOUNT_A}&from=${isoDateOffset(1)}&to=${isoDateOffset(-1)}`
    );
    assert.equal(response.status, 400);
    assert.equal(body.code, 'TRANSPORTE_AVERBACAO_PERIOD_INVALID');
  });

  it('GET .../averbacoes de operação da conta A com conta B → 404 (tenancy)', async (t) => {
    if (skipIfNoDb(t)) return;
    const carrierId = await createParty('Transportes Averbacao Tenancy LTDA');
    await createPolicyWithRate(carrierId, 'RCTR_C', 0.072, 700);
    const operation = await createContractedOperation(carrierId);

    const { response, body } = await callApi('GET', `/v1/transporte/operacoes/${operation.id}/averbacoes?integrationAccountId=${ACCOUNT_B}`);
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TRANSPORT_OPERATION_NOT_FOUND');
  });
});
