/**
 * Emissão de DF-e SANDBOX-READY (PR-G) — worker `transporte.dfe.issue|.cancel|.reconcile`,
 * `processJob` REAL contra o Postgres local, gateway `mode: 'sandbox'` (via
 * `@flavioneto11/fiscal-kit` REAL, determinístico, sem rede).
 *
 * O TESTE DL-102 do domínio: uma resposta PERDIDA depois do dispatch (`submitting`) NUNCA vira
 * `failed_validation` — vira `submit_unconfirmed`, resolvido só quando o reconciliador pergunta ao
 * gateway (`transporte.dfe.issue.reconcile`). Uma falha ANTES do dispatch (tipo não suportado, dados
 * incompletos) SEMPRE vira `failed_validation` diretamente — nunca passa por `submit_unconfirmed`.
 *
 * DB montado por SQL direto (molde `tests/worker/transporte-ciot.test.js`): este arquivo testa o
 * WORKER, não a rota HTTP (isso é `tests/api/transporte-emissoes.test.js`).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { query, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { resolveStoragePath } from '../../src/lib/files.js';
import { createPrefixedId } from '../../src/lib/ids.js';
import { processJob, applyTransporteDfeIssuanceTerminalFailureSideEffect } from '../../src/workers/operation-handlers.js';
import { runDfeIssuanceJob, runDfeIssuanceReconcileJob } from '../../src/services/transport-dfe-issuance-service.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { buildDfeIssuanceCorrelationMarker } from '../../src/lib/transport/dfe-issuance-correlation.js';
import { createDfeIssuanceGateway, resetDfeIssuanceSandboxStoreForTests } from '../../src/gateways/dfe-issuance-gateway.js';
import { parseDfeXml } from '../../src/lib/transport/dfe-parser.js';

const ACCOUNT_ID = 'acc_dfeisswrk_001';
const CONTRACTOR_PARTY_ID = 'trp_dfeisswrk_contractor';
const CONSIGNEE_PARTY_ID = 'trp_dfeisswrk_consignee';

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste pulado (${dbUnavailableReason})`);
  return true;
}

async function insertParty({ id, documentNumber, legalName }) {
  await query(
    `insert into transport_parties (
       id, integration_account_id, document_type, document_number, legal_name, correlation_id, version
     ) values ($1, $2, 'CNPJ', $3, $4, $5, 1)
     on conflict (id) do nothing`,
    [id, ACCOUNT_ID, documentNumber, legalName, `corr_${id}`]
  );
}

async function insertTransportOperation({ id, freightOfferedAmount = 4000 }) {
  await query(
    `insert into transport_operations (
       id, integration_account_id, status, cargo_regime, freight_offered_amount,
       freight_contracted_amount, correlation_id, version
     ) values ($1, $2, 'contracted', 'lotacao', $3, $3, $4, 1)`,
    [id, ACCOUNT_ID, freightOfferedAmount, `corr_${id}`]
  );

  await query(
    `insert into transport_operation_parties (id, operation_id, party_id, role, party_snapshot)
     values
       ($1, $2, $3, 'contractor', $4::jsonb),
       ($5, $2, $6, 'consignee', $7::jsonb)`,
    [
      createPrefixedId('troppart'), id, CONTRACTOR_PARTY_ID,
      JSON.stringify({ documentType: 'CNPJ', documentNumber: '11222333000181', legalName: 'Transportadora Exemplo LTDA' }),
      createPrefixedId('troppart'), CONSIGNEE_PARTY_ID,
      JSON.stringify({ documentType: 'CNPJ', documentNumber: '99888777000166', legalName: 'Destinatario Exemplo LTDA' })
    ]
  );

  await query(
    `insert into transport_operation_cargo (id, operation_id, cargo_type, description, declared_value, weight_kg)
     values ($1, $2, 'granel', 'Soja em grãos', 15000, 28000)`,
    [createPrefixedId('tropcargo'), id]
  );
}

async function insertDfeIssuanceRow({ id, operationId, documentType = 'NFE', status = 'draft' }) {
  const correlationMarker = buildDfeIssuanceCorrelationMarker(id);
  await query(
    `insert into dfe_issuances (
       id, integration_account_id, operation_id, document_type, status, environment,
       correlation_marker, correlation_id, version
     ) values ($1, $2, $3, $4, $5, 'sandbox', $6, $7, 1)`,
    [id, ACCOUNT_ID, operationId, documentType, status, correlationMarker, `corr_${id}`]
  );
  return correlationMarker;
}

async function insertJobRow({ jobId, entityId, operation, payload }) {
  await query(
    `insert into jobs(
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
     ) values ($1,$2,'dfe_issuance',$3,$4,$5::jsonb,'running',4,1,$6,now(),now(),now(),'worker-test')`,
    [jobId, `cmd_${jobId}`, entityId, operation, JSON.stringify(payload), `corr_${jobId}`]
  );
}

async function getIssuance(id) {
  const result = await query('select * from dfe_issuances where id = $1', [id]);
  return result.rows[0] || null;
}

async function listIssuanceEvents(issuanceId) {
  const result = await query('select * from dfe_issuance_events where issuance_id = $1 order by created_at asc', [issuanceId]);
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
  setConfigOverride('dfeIssuanceMode', 'sandbox');
  await query(
    `insert into integration_accounts (id, account_name) values ($1, 'Conta worker emissao DF-e')
     on conflict (id) do nothing`,
    [ACCOUNT_ID]
  );
  await insertParty({ id: CONTRACTOR_PARTY_ID, documentNumber: '11222333000181', legalName: 'Transportadora Exemplo LTDA' });
  await insertParty({ id: CONSIGNEE_PARTY_ID, documentNumber: '99888777000166', legalName: 'Destinatario Exemplo LTDA' });
});

/** `dfe_issuances.fiscal_document_id` referencia `fiscal_documents` — SEMPRE apagar `dfe_issuances` ANTES de `fiscal_documents`. */
async function cleanupTestRows() {
  await query('delete from audit_logs where entity_type = $1', ['dfe_issuance']);
  await query('delete from dfe_issuance_events where issuance_id like $1', ['dfeiss_dfeisswrk_%']);
  await query('delete from dfe_issuances where id like $1', ['dfeiss_dfeisswrk_%']);
  await query('delete from fiscal_document_events where document_id in (select id from fiscal_documents where integration_account_id = $1)', [ACCOUNT_ID]);
  await query('delete from fiscal_documents where integration_account_id = $1', [ACCOUNT_ID]);
  await query('delete from jobs where entity_id like $1', ['trop_dfeisswrk_%']);
  await query('delete from transport_operation_cargo where operation_id like $1', ['trop_dfeisswrk_%']);
  await query('delete from transport_operation_parties where operation_id like $1', ['trop_dfeisswrk_%']);
  await query('delete from transport_operations where id like $1', ['trop_dfeisswrk_%']);
}

beforeEach(async () => {
  if (!dbAvailable) return;
  resetDfeIssuanceSandboxStoreForTests();
  await cleanupTestRows();
});

after(async () => {
  if (dbAvailable) {
    await cleanupTestRows();
    await query('delete from transport_parties where id in ($1, $2)', [CONTRACTOR_PARTY_ID, CONSIGNEE_PARTY_ID]);
    await query('delete from integration_accounts where id = $1', [ACCOUNT_ID]);
  }
  await pool.end();
});

describe('worker transporte.dfe.issue — pipeline completo sandbox: authorized', () => {
  it('grava XML no STORAGE_DIR, importa automaticamente ao acervo da Fase E e linka fiscal_document_id', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_authorized';
    const issuanceId = 'dfeiss_dfeisswrk_authorized';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId });
    await insertJobRow({
      jobId: 'job_dfeisswrk_authorized',
      entityId: operationId,
      operation: 'transporte.dfe.issue',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });

    const job = await findJobById('job_dfeisswrk_authorized');
    await processJob(job, {});

    const updatedJob = await findJobById('job_dfeisswrk_authorized');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'transporte_dfe_issue_authorized');
    assert.ok(updatedJob.payload.fiscalDocumentId);

    const issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'authorized');
    assert.match(issuance.access_key, /^\d{44}$/);
    assert.ok(issuance.protocol);
    assert.ok(issuance.xml_storage_ref);
    assert.ok(issuance.xml_hash);
    assert.ok(issuance.fiscal_document_id, 'reimportada automaticamente ao acervo da Fase E');

    // O XML realmente foi escrito no STORAGE_DIR (não só o storage_ref gravado).
    const xmlOnDisk = await fs.readFile(resolveStoragePath('transporte-dfe-issuance', `${issuance.xml_hash}.xml`), 'utf8');
    assert.ok(xmlOnDisk.startsWith('<?xml'));
    const parsed = parseDfeXml(xmlOnDisk);
    assert.equal(parsed.authorizationStatus, 'authorized');
    assert.equal(parsed.accessKey, issuance.access_key);

    const fiscalDocumentRes = await query('select * from fiscal_documents where id = $1', [issuance.fiscal_document_id]);
    assert.equal(fiscalDocumentRes.rows.length, 1);
    assert.equal(fiscalDocumentRes.rows[0].document_type, 'NFE');
    assert.equal(fiscalDocumentRes.rows[0].access_key, issuance.access_key);
    assert.equal(fiscalDocumentRes.rows[0].operation_id, operationId);
    assert.equal(fiscalDocumentRes.rows[0].validation_status, 'valid');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), ['built', 'signed', 'submitted', 'authorized', 'imported_to_registry']);

    const auditRows = await query(
      `select * from audit_logs where entity_type = 'dfe_issuance' and entity_id = $1 and component = 'dfe-issuance-gateway' order by occurred_at asc, id asc`,
      [operationId]
    );
    assert.equal(auditRows.rows.length, 2, 'submitDocument deve gravar outbound+inbound');
    assert.deepEqual(auditRows.rows.map((row) => row.direction), ['outbound', 'inbound']);
  });

  it('retry tardio depois de já autorizado+importado é NOOP total (idempotente)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_idempotent';
    const issuanceId = 'dfeiss_dfeisswrk_idempotent';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId });
    await insertJobRow({
      jobId: 'job_dfeisswrk_idempotent',
      entityId: operationId,
      operation: 'transporte.dfe.issue',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });

    const job = await findJobById('job_dfeisswrk_idempotent');
    await processJob(job, {});
    const firstIssuance = await getIssuance(issuanceId);

    // Simula um SEGUNDO job (mesma emissão) chegando depois — mesmo molde de um retry tardio.
    await insertJobRow({
      jobId: 'job_dfeisswrk_idempotent_2',
      entityId: operationId,
      operation: 'transporte.dfe.issue',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });
    const secondJob = await findJobById('job_dfeisswrk_idempotent_2');
    await processJob(secondJob, {});
    const updatedSecondJob = await findJobById('job_dfeisswrk_idempotent_2');
    assert.equal(updatedSecondJob.payload.outcome, 'transporte_dfe_issue_noop');

    const secondIssuance = await getIssuance(issuanceId);
    assert.equal(secondIssuance.fiscal_document_id, firstIssuance.fiscal_document_id, 'não duplica o import');
    assert.equal(secondIssuance.version, firstIssuance.version, 'linha não foi tocada de novo');

    const fiscalDocsRes = await query('select count(*)::int as count from fiscal_documents where operation_id = $1', [operationId]);
    assert.equal(fiscalDocsRes.rows[0].count, 1, 'só UM fiscal_documents, nunca duplicado');
  });
});

describe('worker transporte.dfe.issue — falha LOCAL antes do dispatch (documentType não suportado)', () => {
  it('CTE → failed_validation diretamente (NUNCA submit_unconfirmed — falhou antes de "submitting")', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_unsupported';
    const issuanceId = 'dfeiss_dfeisswrk_unsupported';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId, documentType: 'CTE' });
    await insertJobRow({
      jobId: 'job_dfeisswrk_unsupported',
      entityId: operationId,
      operation: 'transporte.dfe.issue',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'CTE', correlationMarker }
    });

    const job = await findJobById('job_dfeisswrk_unsupported');
    let caughtError = null;
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'DFE_ISSUANCE_TYPE_NOT_SUPPORTED');
        return true;
      }
    );

    let issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'building', 'antes do side-effect terminal, a linha só chegou a "building"');

    // Simula o job-runner declarando falha definitiva (1ª tentativa já terminal — código não retryable).
    await applyTransporteDfeIssuanceTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'dfe_issuance', entityId: operationId, operation: 'transporte.dfe.issue', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code, lastErrorMessage: caughtError.message },
      { action: 'failed', patch: { lastErrorCode: caughtError.code, lastErrorMessage: caughtError.message } },
      caughtError
    );

    issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'failed_validation');
    assert.equal(issuance.last_error_code, 'DFE_ISSUANCE_TYPE_NOT_SUPPORTED');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), ['failed']);

    // Nenhum job de reconciliação foi enfileirado — falha LOCAL nunca é DL-102.
    const reconcileJobRes = await query(
      `select * from jobs where entity_type = 'dfe_issuance' and entity_id = $1 and operation = 'transporte.dfe.issue.reconcile'`,
      [operationId]
    );
    assert.equal(reconcileJobRes.rows.length, 0);
  });
});

describe('worker transporte.dfe.issue — RESPOSTA PERDIDA depois do dispatch (DL-102)', () => {
  it('submit_unconfirmed (NUNCA failed_validation); reconcile ENCONTRA e completa autorização + import', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_lost';
    const issuanceId = 'dfeiss_dfeisswrk_lost';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId });
    await insertJobRow({
      jobId: 'job_dfeisswrk_lost',
      entityId: operationId,
      operation: 'transporte.dfe.issue',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });

    // Gateway "resposta perdida": o kit sandbox PROCESSA de verdade (o mesmo Map/módulo grava
    // receipt+protocol), mas esta chamada nunca vê a confirmação — molde do
    // `testFlags.simulateLostResponse` do CIOT, construído por composição em vez de flag na gateway
    // de produção (o `@flavioneto11/fiscal-kit` sandbox real nunca falha sozinho — ver header do
    // gateway).
    const realGateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const lostResponseGateway = {
      ...realGateway,
      submitDocument: async (args) => {
        await realGateway.submitDocument(args);
        const error = new Error('Simulação de resposta perdida — o gateway processou, mas esta chamada nunca vê a confirmação.');
        error.code = 'TEMPORARILY_UNAVAILABLE';
        throw error;
      }
    };

    const job = await findJobById('job_dfeisswrk_lost');
    let caughtError = null;
    await assert.rejects(
      () => runDfeIssuanceJob(
        { jobId: job.jobId, entityId: job.entityId, correlationId: job.correlationId, payload: job.payload },
        { gateway: lostResponseGateway }
      ),
      (error) => {
        caughtError = error;
        assert.equal(error.code, 'TEMPORARILY_UNAVAILABLE');
        return true;
      }
    );

    let issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'submitting', 'dispatchado, ainda não confirmado nem marcado unconfirmed — o job-runner decide isso, não o handler por tentativa');

    // Simula o job-runner esgotando as tentativas e movendo para DLQ.
    await applyTransporteDfeIssuanceTerminalFailureSideEffect(
      { jobId: job.jobId, entityType: 'dfe_issuance', entityId: operationId, operation: 'transporte.dfe.issue', payload: job.payload, correlationId: job.correlationId, lastErrorCode: caughtError.code },
      { action: 'dlq', dlqReason: 'Max attempts exceeded' },
      caughtError
    );

    issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'submit_unconfirmed', 'NUNCA failed_validation — DL-102');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), ['built', 'signed', 'submit_unconfirmed']);

    const reconcileJobRes = await query(
      `select * from jobs where entity_type = 'dfe_issuance' and entity_id = $1 and operation = 'transporte.dfe.issue.reconcile'`,
      [operationId]
    );
    assert.equal(reconcileJobRes.rows.length, 1);
    assert.equal(reconcileJobRes.rows[0].status, 'queued');

    // O reconciliador ENCONTRA (o "provedor" processou de verdade — só a resposta se perdeu) e
    // completa o mesmo caminho do sucesso direto, incluindo o import automático ao acervo.
    const reconcileResult = await runDfeIssuanceReconcileJob(
      { jobId: 'job_dfeisswrk_lost_reconcile', entityId: operationId, correlationId: 'corr_reconcile', payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker } },
      { gateway: realGateway }
    );
    assert.equal(reconcileResult.outcome, 'transporte_dfe_issue_reconcile_found');
    assert.ok(reconcileResult.patch.fiscalDocumentId);

    issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'authorized');
    assert.ok(issuance.protocol);
    assert.ok(issuance.fiscal_document_id);

    const eventsAfterReconcile = await listIssuanceEvents(issuanceId);
    assert.deepEqual(eventsAfterReconcile.map((event) => event.event_type), ['built', 'signed', 'submit_unconfirmed', 'reconciled', 'imported_to_registry']);
  });
});

describe('worker transporte.dfe.issue.reconcile — not-found-after-polling', () => {
  it('marcador NUNCA chegou ao "provedor" → rejected DFE_ISSUANCE_REQUEST_NOT_FOUND_REMOTE', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_notfound';
    const issuanceId = 'dfeiss_dfeisswrk_notfound';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId, status: 'submit_unconfirmed' });

    // Orçamento de polling RÁPIDO injetado diretamente (a fábrica padrão do gateway não teria
    // delays reais aqui porque o marcador nunca foi submetido de verdade — mas o polling em si
    // ainda roda o orçamento completo antes de declarar ausência).
    const result = await runDfeIssuanceReconcileJob(
      { jobId: 'job_dfeisswrk_notfound', entityId: operationId, correlationId: 'corr_notfound', payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker } },
      { delaysMs: [0, 0], sleep: async () => {} }
    );
    assert.equal(result.outcome, 'transporte_dfe_issue_reconcile_not_found');

    const issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'rejected');
    assert.equal(issuance.rejection_reason, 'DFE_ISSUANCE_REQUEST_NOT_FOUND_REMOTE');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), ['reconciled']);
  });
});

describe('worker transporte.dfe.issue.cancel', () => {
  it('cancela uma emissão em qualquer estado não-terminal (sandbox only — sem chamada remota)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_cancel';
    const issuanceId = 'dfeiss_dfeisswrk_cancel';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId, status: 'draft' });
    await insertJobRow({
      jobId: 'job_dfeisswrk_cancel',
      entityId: operationId,
      operation: 'transporte.dfe.issue.cancel',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });

    const job = await findJobById('job_dfeisswrk_cancel');
    await processJob(job, {});

    const updatedJob = await findJobById('job_dfeisswrk_cancel');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'transporte_dfe_issue_cancel_succeeded');

    const issuance = await getIssuance(issuanceId);
    assert.equal(issuance.status, 'cancelled');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), ['cancelled']);
  });

  it('cancelar uma emissão JÁ cancelada é NOOP idempotente', async (t) => {
    if (skipIfNoDb(t)) return;

    const operationId = 'trop_dfeisswrk_cancel2';
    const issuanceId = 'dfeiss_dfeisswrk_cancel2';
    await insertTransportOperation({ id: operationId });
    const correlationMarker = await insertDfeIssuanceRow({ id: issuanceId, operationId, status: 'cancelled' });
    await insertJobRow({
      jobId: 'job_dfeisswrk_cancel2',
      entityId: operationId,
      operation: 'transporte.dfe.issue.cancel',
      payload: { issuanceId, operationId, integrationAccountId: ACCOUNT_ID, documentType: 'NFE', correlationMarker }
    });

    const job = await findJobById('job_dfeisswrk_cancel2');
    await processJob(job, {});

    const updatedJob = await findJobById('job_dfeisswrk_cancel2');
    assert.equal(updatedJob.payload.outcome, 'transporte_dfe_issue_cancel_noop');

    const events = await listIssuanceEvents(issuanceId);
    assert.deepEqual(events.map((event) => event.event_type), [], 'nenhum evento novo — já estava cancelada');
  });
});
