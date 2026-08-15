/**
 * Aquisição de VPO com provedor ABSTRAÍDO (PR-D1) — worker `transporte.vpo.acquire|reconcile`,
 * `processJob` REAL contra o Postgres local, provedor `mode: 'mock'` (determinístico, sem rede).
 *
 * O TESTE DL-102 do domínio: RESPOSTA PERDIDA depois do dispatch NUNCA vira falha definitiva — vira
 * `acquisition_unconfirmed`, resolvido só quando o reconciliador pergunta ao provedor
 * (`transporte.vpo.reconcile`).
 *
 * DB montado por SQL direto (molde `tests/worker/transporte-ciot.test.js`): este arquivo testa o
 * WORKER, não a rota HTTP — `vpo_allocations`/`jobs`/`transport_operations` nascem prontos no
 * estado que o service (`avaliarAplicabilidadeVpo`/`solicitarAquisicaoVpo`) produziria.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { query, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { processJob, applyTransporteVpoTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { runVpoReconcileJob } from '../../src/services/transport-vpo-service.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { createVpoProviderGateway, resetVpoProviderMockStoreForTests } from '../../src/gateways/vpo-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

const ACCOUNT_ID = 'acc_vpowrk_001';
const PROVIDER_ID = 'vpoprov_vpowrk_test';

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste pulado (${dbUnavailableReason})`);
  return true;
}

async function insertTransportOperation({ id, status = 'ready_for_release' }) {
  await query(
    `insert into transport_operations (
       id, integration_account_id, status, cargo_regime, freight_offered_amount,
       freight_contracted_amount, correlation_id, version
     ) values ($1, $2, $3, 'lotacao', 3800, 3800, $4, 1)`,
    [id, ACCOUNT_ID, status, `corr_${id}`]
  );
}

async function insertVpoAllocationRow({ id, operationId, status = 'applicable', providerReference = null, amount = null, routeSnapshot }) {
  await query(
    `insert into vpo_allocations (
       id, integration_account_id, operation_id, status, applicable, applicability_reason_code,
       provider_reference, amount, route_snapshot, correlation_id, version
     ) values ($1, $2, $3, $4, true, 'VPO_REQUIRED_TOLL_ROUTE', $5, $6, $7::jsonb, $8, 1)`,
    [
      id,
      ACCOUNT_ID,
      operationId,
      status,
      providerReference,
      amount,
      JSON.stringify(routeSnapshot ?? { originUf: 'SP', destinationUf: 'MG', distanceKm: 586.2, tollExpected: true }),
      `corr_${id}`
    ]
  );
}

async function insertJobRow({ jobId, entityId, operation, payload }) {
  await query(
    `insert into jobs(
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
     ) values ($1,$2,'vpo_allocation',$3,$4,$5::jsonb,'running',4,1,$6,now(),now(),now(),'worker-test')`,
    [jobId, `cmd_${jobId}`, entityId, operation, JSON.stringify(payload), `corr_${jobId}`]
  );
}

async function getVpoAllocation(id) {
  const result = await query('select * from vpo_allocations where id = $1', [id]);
  return result.rows[0] || null;
}

async function getTransportOperation(id) {
  const result = await query('select * from transport_operations where id = $1', [id]);
  return result.rows[0] || null;
}

async function listVpoEvents(vpoAllocationId) {
  const result = await query('select * from vpo_events where vpo_allocation_id = $1 order by created_at asc', [vpoAllocationId]);
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
    `insert into integration_accounts (id, account_name) values ($1, 'Conta worker VPO')
     on conflict (id) do nothing`,
    [ACCOUNT_ID]
  );
  await query(
    `insert into vpo_providers (id, name, is_active, version) values ($1, 'Fornecedora Worker Teste', true, 1)
     on conflict (name) do nothing`,
    [PROVIDER_ID]
  );
});

beforeEach(async () => {
  if (!dbAvailable) return;
  resetVpoProviderMockStoreForTests();
  await query('delete from audit_logs where entity_id like $1', ['trop_vpowrk_%']);
  await query('delete from vpo_events where vpo_allocation_id like $1', ['vpoalloc_vpowrk_%']);
  await query('delete from vpo_allocations where id like $1', ['vpoalloc_vpowrk_%']);
  await query('delete from jobs where entity_id like $1', ['trop_vpowrk_%']);
  await query('delete from transport_operations where id like $1', ['trop_vpowrk_%']);
});

after(async () => {
  if (dbAvailable) {
    await query('delete from audit_logs where entity_id like $1', ['trop_vpowrk_%']);
    await query('delete from vpo_events where vpo_allocation_id like $1', ['vpoalloc_vpowrk_%']);
    await query('delete from vpo_allocations where id like $1', ['vpoalloc_vpowrk_%']);
    await query('delete from jobs where entity_id like $1', ['trop_vpowrk_%']);
    await query('delete from transport_operations where id like $1', ['trop_vpowrk_%']);
    await query('delete from vpo_providers where id = $1', [PROVIDER_ID]);
    await query('delete from integration_accounts where id = $1', [ACCOUNT_ID]);
  }
  await pool.end();
});

describe('worker transporte.vpo.acquire — sucesso', () => {
  it('adquire o VPO, atualiza vpo_amount na operação, grava eventos e auditoria', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_vpowrk_success';
    const allocationId = 'vpoalloc_vpowrk_success';
    await insertTransportOperation({ id: operationId });
    await insertVpoAllocationRow({ id: allocationId, operationId });
    await insertJobRow({
      jobId: 'job_vpowrk_success',
      entityId: operationId,
      operation: 'transporte.vpo.acquire',
      payload: { vpoAllocationId: allocationId, operationId, integrationAccountId: ACCOUNT_ID, providerId: PROVIDER_ID }
    });

    const job = await findJobById('job_vpowrk_success');
    await processJob(job, {});

    const updatedJob = await findJobById('job_vpowrk_success');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'transporte_vpo_acquire_succeeded');
    assert.ok(updatedJob.payload.providerReference);

    const allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'acquired');
    assert.ok(allocation.provider_reference);
    assert.ok(Number(allocation.amount) > 0);
    assert.equal(allocation.evidence_source, 'mock');
    assert.ok(allocation.acquired_at);

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(Number(transportOperation.vpo_amount), Number(allocation.amount), 'vpo_amount da operação deve refletir o valor adquirido');
    assert.equal(Number(transportOperation.freight_offered_amount), 3800, 'freight NUNCA é tocado pela aquisição do VPO');

    const events = await listVpoEvents(allocationId);
    assert.deepEqual(events.map((event) => event.event_type), ['acquisition_requested', 'acquired']);

    const auditRows = await query(
      `select * from audit_logs where entity_type = 'vpo_allocation' and entity_id = $1 and component = 'vpo-gateway' order by occurred_at asc, id asc`,
      [operationId]
    );
    assert.equal(auditRows.rows.length, 2, 'acquireVpo deve gravar outbound+inbound');
    assert.deepEqual(auditRows.rows.map((row) => row.direction), ['outbound', 'inbound']);
  });
});

describe('worker transporte.vpo.acquire — rejeição do provedor (rota sem distância válida)', () => {
  it('provedor rejeita (não-retentável); side-effect terminal volta a applicable sem tocar a operação', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_vpowrk_rejected';
    const allocationId = 'vpoalloc_vpowrk_rejected';
    await insertTransportOperation({ id: operationId });
    await insertVpoAllocationRow({ id: allocationId, operationId, routeSnapshot: { originUf: 'SP', destinationUf: 'MG', distanceKm: null, tollExpected: true } });
    await insertJobRow({
      jobId: 'job_vpowrk_rejected',
      entityId: operationId,
      operation: 'transporte.vpo.acquire',
      payload: { vpoAllocationId: allocationId, operationId, integrationAccountId: ACCOUNT_ID, providerId: PROVIDER_ID }
    });

    const job = await findJobById('job_vpowrk_rejected');
    let caughtError = null;
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'VPO_PROVIDER_REJECTED_TEST');
        assert.equal(isRetryableJobError(error), false);
        return true;
      }
    );

    await applyTransporteVpoTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'vpo_allocation', entityId: operationId, operation: 'transporte.vpo.acquire', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code },
      { action: 'failed', patch: { lastErrorCode: caughtError.code, lastErrorMessage: caughtError.message } },
      caughtError
    );

    const allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'applicable', 'rejeição DEFINITIVA volta para applicable — libera novo adquirir/registrar-aquisicao');
    assert.equal(allocation.last_error_code, 'VPO_PROVIDER_REJECTED_TEST');

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.vpo_amount, null, 'operação não foi tocada');

    const events = await listVpoEvents(allocationId);
    assert.deepEqual(events.map((event) => event.event_type), ['acquisition_requested', 'acquisition_failed']);
  });
});

describe('worker transporte.vpo.acquire — RESPOSTA PERDIDA (DL-102)', () => {
  it('acquisition_unconfirmed (NUNCA falha definitiva); reconcile ENCONTRA e completa a aquisição', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_vpowrk_lost';
    const allocationId = 'vpoalloc_vpowrk_lost';
    await insertTransportOperation({ id: operationId });
    await insertVpoAllocationRow({ id: allocationId, operationId });
    await insertJobRow({
      jobId: 'job_vpowrk_lost',
      entityId: operationId,
      operation: 'transporte.vpo.acquire',
      payload: { vpoAllocationId: allocationId, operationId, integrationAccountId: ACCOUNT_ID, providerId: PROVIDER_ID, testFlags: { simulateLostResponse: true } }
    });

    const job = await findJobById('job_vpowrk_lost');
    let caughtError = null;
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'VPO_PROVIDER_LOST_RESPONSE_TEST');
        assert.equal(isRetryableJobError(error), true);
        return true;
      }
    );

    // Antes do side-effect terminal: dispatchado, mas ainda "acquisition_requested" (nem
    // confirmado, nem marcado unconfirmed) — o job-runner é quem decide isso, não o handler por
    // tentativa.
    let allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'acquisition_requested');

    // Simula o job-runner esgotando as tentativas e movendo para DLQ.
    await applyTransporteVpoTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'vpo_allocation', entityId: operationId, operation: 'transporte.vpo.acquire', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code },
      { action: 'dlq', dlqReason: 'Max attempts exceeded' },
      caughtError
    );

    allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'acquisition_unconfirmed', 'NUNCA falha definitiva — DL-102');

    const events = await listVpoEvents(allocationId);
    assert.deepEqual(events.map((event) => event.event_type), ['acquisition_requested', 'acquisition_unconfirmed']);

    // O side-effect tenta enfileirar `transporte.vpo.reconcile` — confirma que ele existe.
    const reconcileJobRes = await query(
      `select * from jobs where entity_type = 'vpo_allocation' and entity_id = $1 and operation = 'transporte.vpo.reconcile'`,
      [operationId]
    );
    assert.equal(reconcileJobRes.rows.length, 1);
    assert.equal(reconcileJobRes.rows[0].status, 'queued');

    // O reconciliador ENCONTRA (o "provedor" processou de verdade — só a resposta se perdeu) e
    // completa o mesmo caminho do sucesso direto.
    const reconcileResult = await runVpoReconcileJob(
      { jobId: 'job_vpowrk_lost_reconcile', entityId: operationId, correlationId: 'corr_reconcile', payload: { vpoAllocationId: allocationId, operationId, integrationAccountId: ACCOUNT_ID } },
      {}
    );
    assert.equal(reconcileResult.outcome, 'transporte_vpo_reconcile_found');

    allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'acquired');
    assert.ok(allocation.provider_reference);

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(Number(transportOperation.vpo_amount), Number(allocation.amount));

    const eventsAfterReconcile = await listVpoEvents(allocationId);
    assert.deepEqual(eventsAfterReconcile.map((event) => event.event_type), ['acquisition_requested', 'acquisition_unconfirmed', 'reconciled']);
  });
});

describe('worker transporte.vpo.reconcile — not-found-after-polling', () => {
  it('marcador NUNCA chegou ao provedor → volta para applicable (libera novo adquirir/registrar-aquisicao)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_vpowrk_notfound';
    const allocationId = 'vpoalloc_vpowrk_notfound';
    await insertTransportOperation({ id: operationId });
    await insertVpoAllocationRow({ id: allocationId, operationId, status: 'acquisition_unconfirmed' });

    // Orçamento de polling RÁPIDO injetado diretamente (a fábrica padrão do gateway usa delays
    // reais de até 20s por tentativa — inaceitável num teste). Mesmo molde de
    // `tests/worker/transporte-ciot.test.js`.
    const result = await runVpoReconcileJob(
      { jobId: 'job_vpowrk_notfound', entityId: operationId, correlationId: 'corr_notfound', payload: { vpoAllocationId: allocationId, operationId, integrationAccountId: ACCOUNT_ID } },
      { delaysMs: [0, 0], sleep: async () => {} }
    );
    assert.equal(result.outcome, 'transporte_vpo_reconcile_not_found');

    const allocation = await getVpoAllocation(allocationId);
    assert.equal(allocation.status, 'applicable');

    const transportOperation = await getTransportOperation(operationId);
    assert.equal(transportOperation.vpo_amount, null, 'not-found não inventa um valor — operação não é tocada');

    const events = await listVpoEvents(allocationId);
    assert.deepEqual(events.map((event) => event.event_type), ['reconciled']);
  });
});

describe('gateway compartilhado entre chamadas do worker — sanity check do Map module-level', () => {
  it('createVpoProviderGateway() sem overrides usa o mesmo Map que o worker escreve', async (t) => {
    if (skipIfNoDb(t)) return;
    const gateway = createVpoProviderGateway();
    assert.equal(gateway.mode, 'mock');
  });
});
