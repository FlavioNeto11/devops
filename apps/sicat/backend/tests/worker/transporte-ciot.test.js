/**
 * Ciclo do CIOT com provedor ABSTRAÍDO (PR-C2) — worker `transporte.ciot.register|rectify|cancel|
 * close|reconcile`, `processJob` REAL contra o Postgres local, provedor `mode: 'mock'`
 * (determinístico, sem rede).
 *
 * O TESTE DL-102 do domínio: RESPOSTA PERDIDA depois do dispatch NUNCA vira `failed` — vira
 * `request_unconfirmed`, resolvido só quando o reconciliador pergunta ao provedor
 * (`transporte.ciot.reconcile`).
 *
 * DB montado por SQL direto (molde `tests/worker/transporte-rntrc-verify.test.js`): este arquivo
 * testa o WORKER, não a rota HTTP — `ciot_operations`/`jobs`/`transport_operations` nascem prontos
 * no estado que o service (`requestCiot` etc.) produziria, sem depender do catálogo regulatório
 * estar semeado (isso é coberto por `tests/api/transporte-ciot.test.js`).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { query, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { processJob, applyTransporteCiotTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { runCiotReconcileJob } from '../../src/services/transport-ciot-service.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { buildCiotCorrelationMarker } from '../../src/lib/transport/ciot-correlation.js';
import { createCiotProviderGateway, resetCiotProviderMockStoreForTests } from '../../src/gateways/ciot-provider-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

const ACCOUNT_ID = 'acc_ciotwrk_001';

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste pulado (${dbUnavailableReason})`);
  return true;
}

function buildRequestPayloadSnapshot(overrides = {}) {
  return {
    responsibleParty: 'contractor',
    parties: [
      { role: 'carrier', document: '11222333000181' },
      { role: 'contractor', document: '99888777000166' }
    ],
    cargo: [{ cargoType: 'granel', weightKg: 30000 }],
    route: { originUf: 'SP', destinationUf: 'MG' },
    freight: { offeredAmount: 3800, contractedAmount: 3800 },
    payment: { method: 'boleto', termDays: 30 },
    ...overrides
  };
}

async function insertTransportOperation({ id, status = 'ciot_pending', freightOfferedAmount = 3800 }) {
  await query(
    `insert into transport_operations (
       id, integration_account_id, status, cargo_regime, freight_offered_amount,
       freight_contracted_amount, correlation_id, version
     ) values ($1, $2, $3, 'lotacao', $4, $4, $5, 1)`,
    [id, ACCOUNT_ID, status, freightOfferedAmount, `corr_${id}`]
  );
}

async function insertCiotOperationRow({ id, operationId, status = 'pre_validation', ciotNumber = null, requestPayloadSnapshot }) {
  const correlationMarker = buildCiotCorrelationMarker(id);
  await query(
    `insert into ciot_operations (
       id, integration_account_id, operation_id, provider, status, ciot_number, correlation_marker,
       request_payload_snapshot, correlation_id, version
     ) values ($1, $2, $3, 'mock', $4, $5, $6, $7::jsonb, $8, 1)`,
    [id, ACCOUNT_ID, operationId, status, ciotNumber, correlationMarker, JSON.stringify(requestPayloadSnapshot ?? buildRequestPayloadSnapshot()), `corr_${id}`]
  );
  return correlationMarker;
}

async function insertJobRow({ jobId, entityId, operation, payload }) {
  await query(
    `insert into jobs(
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
     ) values ($1,$2,'ciot_operation',$3,$4,$5::jsonb,'running',4,1,$6,now(),now(),now(),'worker-test')`,
    [jobId, `cmd_${jobId}`, entityId, operation, JSON.stringify(payload), `corr_${jobId}`]
  );
}

async function getCiotOperation(id) {
  const result = await query('select * from ciot_operations where id = $1', [id]);
  return result.rows[0] || null;
}

async function getTransportOperation(id) {
  const result = await query('select * from transport_operations where id = $1', [id]);
  return result.rows[0] || null;
}

async function listCiotEvents(ciotOperationId) {
  const result = await query('select * from ciot_events where ciot_operation_id = $1 order by created_at asc', [ciotOperationId]);
  return result.rows;
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
    `insert into integration_accounts (id, account_name) values ($1, 'Conta worker CIOT')
     on conflict (id) do nothing`,
    [ACCOUNT_ID]
  );
});

beforeEach(async () => {
  if (!dbAvailable) return;
  resetCiotProviderMockStoreForTests();
  await query('delete from audit_logs where entity_id like $1', ['trop_ciotwrk_%']);
  await query('delete from ciot_events where ciot_operation_id like $1', ['ciot_ciotwrk_%']);
  await query('delete from ciot_operations where id like $1', ['ciot_ciotwrk_%']);
  await query('delete from jobs where entity_id like $1', ['trop_ciotwrk_%']);
  await query('delete from transport_operations where id like $1', ['trop_ciotwrk_%']);
});

after(async () => {
  if (dbAvailable) {
    await query('delete from audit_logs where entity_id like $1', ['trop_ciotwrk_%']);
    await query('delete from ciot_events where ciot_operation_id like $1', ['ciot_ciotwrk_%']);
    await query('delete from ciot_operations where id like $1', ['ciot_ciotwrk_%']);
    await query('delete from jobs where entity_id like $1', ['trop_ciotwrk_%']);
    await query('delete from transport_operations where id like $1', ['trop_ciotwrk_%']);
    await query('delete from integration_accounts where id = $1', [ACCOUNT_ID]);
  }
  await pool.end();
});

describe('worker transporte.ciot.register — sucesso', () => {
  it('registra o CIOT, confirma ciot_registered na operação, grava eventos e auditoria', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_ciotwrk_success';
    const ciotId = 'ciot_ciotwrk_success';
    await insertTransportOperation({ id: operationId, status: 'ciot_pending', freightOfferedAmount: 3800 });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId });
    await insertJobRow({
      jobId: 'job_ciotwrk_success',
      entityId: operationId,
      operation: 'transporte.ciot.register',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker }
    });

    const job = await findJobById('job_ciotwrk_success');
    await processJob(job, {});

    const updatedJob = await findJobById('job_ciotwrk_success');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'transporte_ciot_register_succeeded');
    assert.ok(updatedJob.payload.ciotNumber);

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'registered');
    assert.ok(ciotOperation.ciot_number);
    assert.equal(ciotOperation.external_status, 'REGISTERED');
    assert.ok(ciotOperation.registered_at);

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.status, 'ciot_registered', 'confirm_ciot deve CAS a operação para ciot_registered');
    assert.equal(transportOperation.version, 2, 'version deve incrementar (locking otimista)');

    const events = await listCiotEvents(ciotId);
    assert.deepEqual(events.map((event) => event.event_type), ['request_dispatched', 'registered']);

    const auditRows = await query(
      `select * from audit_logs where entity_type = 'ciot_operation' and entity_id = $1 and component = 'ciot-provider-gateway' order by occurred_at asc, id asc`,
      [operationId]
    );
    assert.equal(auditRows.rows.length, 2, 'registerCiot deve gravar outbound+inbound');
    assert.deepEqual(auditRows.rows.map((row) => row.direction), ['outbound', 'inbound']);
  });
});

describe('worker transporte.ciot.register — rejeição do provedor (freight abaixo do mínimo)', () => {
  it('provedor rejeita (não-retentável); side-effect terminal marca ciot_operations rejected sem tocar a operação', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_ciotwrk_rejected';
    const ciotId = 'ciot_ciotwrk_rejected';
    await insertTransportOperation({ id: operationId, status: 'ciot_pending', freightOfferedAmount: 50 });
    const correlationMarker = await insertCiotOperationRow({
      id: ciotId,
      operationId,
      requestPayloadSnapshot: buildRequestPayloadSnapshot({ freight: { offeredAmount: 50, contractedAmount: null } })
    });
    await insertJobRow({
      jobId: 'job_ciotwrk_rejected',
      entityId: operationId,
      operation: 'transporte.ciot.register',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker }
    });

    const job = await findJobById('job_ciotwrk_rejected');
    let caughtError = null;
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'CIOT_PROVIDER_REJECTED_TEST');
        assert.equal(isRetryableJobError(error), false);
        return true;
      }
    );

    // Simula o que `workers/job-runner.ts#handleFailedTransition` faz numa falha NÃO retentável
    // (1ª tentativa já é terminal — `resolveFailureTransition` decide `action: 'failed'`).
    await applyTransporteCiotTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'ciot_operation', entityId: operationId, operation: 'transporte.ciot.register', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code },
      { action: 'failed', patch: { lastErrorCode: caughtError.code, lastErrorMessage: caughtError.message } },
      caughtError
    );

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'rejected');
    assert.equal(ciotOperation.rejection_reason_code, 'CIOT_PROVIDER_REJECTED_TEST');

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.status, 'ciot_pending', 'rejeição de UMA tentativa NÃO cancela/transiciona a operação');
    assert.equal(transportOperation.version, 1, 'operação não foi tocada');

    const events = await listCiotEvents(ciotId);
    assert.deepEqual(events.map((event) => event.event_type), ['request_dispatched', 'rejected']);

    // "um novo solicitar cria NOVA ciot_operation": nada no schema impede uma segunda tentativa
    // para a MESMA operação — o histórico da primeira (rejeitada) permanece intacto.
    const secondAttemptId = 'ciot_ciotwrk_rejected_retry';
    await insertCiotOperationRow({ id: secondAttemptId, operationId, requestPayloadSnapshot: buildRequestPayloadSnapshot({ freight: { offeredAmount: 3800, contractedAmount: 3800 } }) });
    const attemptsRes = await query('select id, status from ciot_operations where operation_id = $1 order by created_at asc', [operationId]);
    assert.equal(attemptsRes.rows.length, 2);
    assert.equal(attemptsRes.rows[0].status, 'rejected');
    assert.equal(attemptsRes.rows[1].status, 'pre_validation');
  });
});

describe('worker transporte.ciot.register — RESPOSTA PERDIDA (DL-102)', () => {
  it('request_unconfirmed (NUNCA failed); reconcile ENCONTRA e completa o registro', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_ciotwrk_lost';
    const ciotId = 'ciot_ciotwrk_lost';
    await insertTransportOperation({ id: operationId, status: 'ciot_pending', freightOfferedAmount: 3800 });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId });
    await insertJobRow({
      jobId: 'job_ciotwrk_lost',
      entityId: operationId,
      operation: 'transporte.ciot.register',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker, testFlags: { simulateLostResponse: true } }
    });

    const job = await findJobById('job_ciotwrk_lost');
    let caughtError = null;
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'CIOT_PROVIDER_LOST_RESPONSE_TEST');
        assert.equal(isRetryableJobError(error), true);
        return true;
      }
    );

    // Antes do side-effect terminal: dispatchado, mas ainda "requested" (nem confirmado, nem
    // marcado unconfirmed) — o job-runner é quem decide isso, não o handler por tentativa.
    let ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'requested');

    // Simula o job-runner esgotando as tentativas e movendo para DLQ.
    await applyTransporteCiotTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'ciot_operation', entityId: operationId, operation: 'transporte.ciot.register', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code },
      { action: 'dlq', dlqReason: 'Max attempts exceeded' },
      caughtError
    );

    ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'request_unconfirmed', 'NUNCA failed — DL-102');

    const events = await listCiotEvents(ciotId);
    assert.deepEqual(events.map((event) => event.event_type), ['request_dispatched', 'request_unconfirmed']);

    // O side-effect tenta enfileirar `transporte.ciot.reconcile` — confirma que ele existe.
    const reconcileJobRes = await query(
      `select * from jobs where entity_type = 'ciot_operation' and entity_id = $1 and operation = 'transporte.ciot.reconcile'`,
      [operationId]
    );
    assert.equal(reconcileJobRes.rows.length, 1);
    assert.equal(reconcileJobRes.rows[0].status, 'queued');

    // O reconciliador ENCONTRA (o "provedor" registrou de verdade — só a resposta se perdeu) e
    // completa o mesmo caminho do sucesso direto.
    const reconcileResult = await runCiotReconcileJob(
      { jobId: 'job_ciotwrk_lost_reconcile', entityId: operationId, correlationId: 'corr_reconcile', payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker } },
      {}
    );
    assert.equal(reconcileResult.outcome, 'transporte_ciot_reconcile_found');

    ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'registered');
    assert.ok(ciotOperation.ciot_number);

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.status, 'ciot_registered');

    const eventsAfterReconcile = await listCiotEvents(ciotId);
    assert.deepEqual(eventsAfterReconcile.map((event) => event.event_type), ['request_dispatched', 'request_unconfirmed', 'reconciled']);
  });
});

describe('worker transporte.ciot.reconcile — not-found-after-polling', () => {
  it('marcador NUNCA chegou ao provedor → rejected CIOT_REQUEST_NOT_FOUND_REMOTE (operação segue ciot_pending)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_ciotwrk_notfound';
    const ciotId = 'ciot_ciotwrk_notfound';
    await insertTransportOperation({ id: operationId, status: 'ciot_pending', freightOfferedAmount: 3800 });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId, status: 'request_unconfirmed' });

    // Orçamento de polling RÁPIDO injetado diretamente (a fábrica padrão do gateway usa delays
    // reais de até 20s por tentativa — inaceitável num teste). `handleTransporteCiotReconcile`
    // (via `processJob`) não expõe injeção de dependência por desenho (molde `transporte.rntrc.
    // verify`); chamar `runCiotReconcileJob` diretamente é o mesmo corpo que o handler chama.
    const result = await runCiotReconcileJob(
      { jobId: 'job_ciotwrk_notfound', entityId: operationId, correlationId: 'corr_notfound', payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker } },
      { delaysMs: [0, 0], sleep: async () => {} }
    );
    assert.equal(result.outcome, 'transporte_ciot_reconcile_not_found');

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'rejected');
    assert.equal(ciotOperation.rejection_reason_code, 'CIOT_REQUEST_NOT_FOUND_REMOTE');

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.status, 'ciot_pending', 'not-found confirmado permite um NOVO solicitar — operação não é cancelada');

    const events = await listCiotEvents(ciotId);
    assert.deepEqual(events.map((event) => event.event_type), ['reconciled']);
  });
});

describe('worker transporte.ciot.rectify / cancel / close — ciclos', () => {
  async function registerInMockStore(correlationMarker) {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    return gateway.registerCiot({
      correlationMarker,
      operationId: 'trop_ciotwrk_mutations',
      parties: [],
      cargo: [],
      route: null,
      freight: { offeredAmount: 3800, contractedAmount: 3800 },
      payment: { method: null, termDays: null }
    });
  }

  it('retificar: registered → rectified', async (t) => {
    if (skipIfNoDb(t)) return;
    const operationId = 'trop_ciotwrk_rectify';
    const ciotId = 'ciot_ciotwrk_rectify';
    await insertTransportOperation({ id: operationId, status: 'ciot_registered' });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId, status: 'registered', ciotNumber: '999' });
    await registerInMockStore(correlationMarker);

    await insertJobRow({
      jobId: 'job_ciotwrk_rectify',
      entityId: operationId,
      operation: 'transporte.ciot.rectify',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker }
    });
    const job = await findJobById('job_ciotwrk_rectify');
    await processJob(job, {});

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'rectified');
    assert.equal(ciotOperation.external_status, 'RECTIFIED');

    const events = await listCiotEvents(ciotId);
    assert.deepEqual(events.map((event) => event.event_type), ['rectify_requested', 'rectified']);
  });

  it('cancelar: registered → cancelled (operação de transporte NÃO é tocada)', async (t) => {
    if (skipIfNoDb(t)) return;
    const operationId = 'trop_ciotwrk_cancel';
    const ciotId = 'ciot_ciotwrk_cancel';
    await insertTransportOperation({ id: operationId, status: 'ciot_registered' });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId, status: 'registered', ciotNumber: '888' });
    await registerInMockStore(correlationMarker);

    await insertJobRow({
      jobId: 'job_ciotwrk_cancel',
      entityId: operationId,
      operation: 'transporte.ciot.cancel',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker, reason: 'teste' }
    });
    const job = await findJobById('job_ciotwrk_cancel');
    await processJob(job, {});

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'cancelled');
    assert.ok(ciotOperation.cancelled_at);

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.status, 'ciot_registered', 'cancelar o CIOT é um ciclo DISTINTO de cancelar a operação');
  });

  it('encerrar: registered → closed', async (t) => {
    if (skipIfNoDb(t)) return;
    const operationId = 'trop_ciotwrk_close';
    const ciotId = 'ciot_ciotwrk_close';
    await insertTransportOperation({ id: operationId, status: 'ciot_registered' });
    const correlationMarker = await insertCiotOperationRow({ id: ciotId, operationId, status: 'registered', ciotNumber: '777' });
    await registerInMockStore(correlationMarker);

    await insertJobRow({
      jobId: 'job_ciotwrk_close',
      entityId: operationId,
      operation: 'transporte.ciot.close',
      payload: { ciotOperationId: ciotId, operationId, integrationAccountId: ACCOUNT_ID, correlationMarker }
    });
    const job = await findJobById('job_ciotwrk_close');
    await processJob(job, {});

    const ciotOperation = await getCiotOperation(ciotId);
    assert.equal(ciotOperation.status, 'closed');
    assert.ok(ciotOperation.closed_at);
  });
});
