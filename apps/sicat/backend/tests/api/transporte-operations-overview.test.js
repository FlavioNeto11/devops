/**
 * API do Centro Operacional da vertical Transporte (PR-H1): `GET /v1/transporte/operations/overview`
 * — contra o app REAL (`createApp`) e o Postgres local, com dados SEMEADOS diretamente no banco
 * (molde `tests/api/transporte-conformidade.test.js`) para cada agregado.
 *
 * `watch.pendingHumanReviewGlobal` é GLOBAL (sem tenancy) — a asserção usa `>=` em vez de igualdade
 * exata, porque outras suítes rodando em paralelo também podem ter itens em `human_review`.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createPrefixedId } from '../../src/lib/ids.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_ID = `acc_tropoverview_${RUN_ID}`;
const SOURCE_ID = `regsrc_overviewapi_${RUN_ID}`;

let operationId = '';
let carrierPartyId = '';

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
    `insert into integration_accounts (id, account_name) values ($1, 'Conta Centro Operacional')
     on conflict (id) do nothing`,
    [ACCOUNT_ID]
  );

  // ── transport_operations: 2 em 'blocked', 1 em 'draft' ──────────────────────────────────────
  operationId = createPrefixedId('trop');
  await query(
    `insert into transport_operations (id, integration_account_id, status, cargo_regime, correlation_id)
     values ($1, $2, 'blocked', 'lotacao', $3)`,
    [operationId, ACCOUNT_ID, `corr_${operationId}`]
  );
  const secondBlockedOpId = createPrefixedId('trop');
  await query(
    `insert into transport_operations (id, integration_account_id, status, cargo_regime, correlation_id)
     values ($1, $2, 'blocked', 'lotacao', $3)`,
    [secondBlockedOpId, ACCOUNT_ID, `corr_${secondBlockedOpId}`]
  );
  const draftOpId = createPrefixedId('trop');
  await query(
    `insert into transport_operations (id, integration_account_id, status, cargo_regime, correlation_id)
     values ($1, $2, 'draft', 'lotacao', $3)`,
    [draftOpId, ACCOUNT_ID, `corr_${draftOpId}`]
  );

  // ── compliance_evaluations/checks: uma avaliação GATE_PROPOSAL com TR-PMF-002 em block ──────
  const evaluationId = createPrefixedId('cmpeval');
  await query(
    `insert into compliance_evaluations (
       id, integration_account_id, operation_id, gate, overall_status, reference_date,
       triggered_by, engine_version, operation_snapshot, correlation_id
     ) values ($1, $2, $3, 'GATE_PROPOSAL', 'block', current_date, 'system', 'test-1', '{}'::jsonb, $4)`,
    [evaluationId, ACCOUNT_ID, operationId, `corr_${evaluationId}`]
  );
  await query(
    `insert into compliance_checks (id, evaluation_id, rule_code, status, raw_status)
     values ($1, $2, 'TR-PMF-002', 'block', null)`,
    [createPrefixedId('cmpchk'), evaluationId]
  );

  // ── freight_floor_calculations: uma oferta abaixo do piso ────────────────────────────────────
  await query(
    `insert into freight_floor_calculations (
       id, integration_account_id, operation_id, reference_date, cargo_type, axles_count,
       distance_km, compliant, outcome, engine_version, correlation_id
     ) values ($1, $2, $3, current_date, 'granel', 5, 500, false, 'calculated', 'test-1', $4)`,
    [createPrefixedId('ffcalc'), ACCOUNT_ID, operationId, `corr_ffcalc_${RUN_ID}`]
  );

  // ── ciot_operations: 1 registered, 1 request_unconfirmed ─────────────────────────────────────
  await query(
    `insert into ciot_operations (id, integration_account_id, operation_id, status, correlation_marker, correlation_id)
     values ($1, $2, $3, 'registered', $4, $5)`,
    [createPrefixedId('ciotop'), ACCOUNT_ID, operationId, `ciotmark_${RUN_ID}_a`, `corr_ciot_${RUN_ID}_a`]
  );
  await query(
    `insert into ciot_operations (id, integration_account_id, operation_id, status, correlation_marker, correlation_id)
     values ($1, $2, $3, 'request_unconfirmed', $4, $5)`,
    [createPrefixedId('ciotop'), ACCOUNT_ID, operationId, `ciotmark_${RUN_ID}_b`, `corr_ciot_${RUN_ID}_b`]
  );

  // ── vpo_allocations: 1 applicable (não adquirida) ────────────────────────────────────────────
  await query(
    `insert into vpo_allocations (id, integration_account_id, operation_id, status, applicable, correlation_id)
     values ($1, $2, $3, 'applicable', true, $4)`,
    [createPrefixedId('vpoalloc'), ACCOUNT_ID, operationId, `corr_vpo_${RUN_ID}`]
  );

  // ── fiscal_documents: 1 invalid, 1 warnings ──────────────────────────────────────────────────
  await query(
    `insert into fiscal_documents (
       id, integration_account_id, operation_id, document_type, access_key, xml_storage_ref, xml_hash,
       validation_status, correlation_id
     ) values ($1, $2, $3, 'NFE', $4, '/tmp/fake.xml', $5, 'invalid', $6)`,
    [createPrefixedId('dfe'), ACCOUNT_ID, operationId, '1'.repeat(44), `hash_${RUN_ID}_a`, `corr_dfe_${RUN_ID}_a`]
  );
  await query(
    `insert into fiscal_documents (
       id, integration_account_id, operation_id, document_type, access_key, xml_storage_ref, xml_hash,
       validation_status, correlation_id
     ) values ($1, $2, $3, 'NFE', $4, '/tmp/fake2.xml', $5, 'warnings', $6)`,
    [createPrefixedId('dfe'), ACCOUNT_ID, operationId, '2'.repeat(44), `hash_${RUN_ID}_b`, `corr_dfe_${RUN_ID}_b`]
  );

  // ── insurance_policies: 1 vencendo em 10 dias ────────────────────────────────────────────────
  carrierPartyId = createPrefixedId('trparty');
  await query(
    `insert into transport_parties (id, integration_account_id, document_type, document_number, legal_name, correlation_id, version)
     values ($1, $2, 'CNPJ', $3, 'Transportadora Overview LTDA', $4, 1)`,
    [carrierPartyId, ACCOUNT_ID, `11222333000${RUN_ID.slice(0, 2)}`, `corr_party_${RUN_ID}`]
  );
  await query(
    `insert into insurance_policies (
       id, integration_account_id, party_id, policy_type, insurer_name, policy_number,
       valid_from, valid_until, correlation_id
     ) values ($1, $2, $3, 'RCTR_C', 'Seguradora Teste', $4, current_date - 100, current_date + 10, $5)`,
    [createPrefixedId('inspol'), ACCOUNT_ID, carrierPartyId, `POL-${RUN_ID}`, `corr_ins_${RUN_ID}`]
  );

  // ── transport_operation_parties: carrier vinculado à operação 'blocked' (não-terminal) SEM
  // nenhuma rntrc_verifications — conta como stale (nunca verificado). ────────────────────────
  await query(
    `insert into transport_operation_parties (id, operation_id, party_id, role)
     values ($1, $2, $3, 'carrier')`,
    [createPrefixedId('troppart'), operationId, carrierPartyId]
  );

  // ── jobs transporte.*: 1 retry_wait, 1 dlq ───────────────────────────────────────────────────
  await query(
    `insert into jobs (job_id, command_id, entity_type, entity_id, operation, payload, status, max_attempts, correlation_id, next_retry_at)
     values ($1, $2, 'transport_party', $3, 'transporte.rntrc.verify', $4::jsonb, 'retry_wait', 4, $5, now() + interval '1 hour')`,
    [createPrefixedId('job'), createPrefixedId('cmd'), carrierPartyId, JSON.stringify({ integrationAccountId: ACCOUNT_ID }), `corr_job_${RUN_ID}_a`]
  );
  await query(
    `insert into jobs (job_id, command_id, entity_type, entity_id, operation, payload, status, max_attempts, correlation_id)
     values ($1, $2, 'transport_party', $3, 'transporte.rntrc.verify', $4::jsonb, 'dlq', 4, $5)`,
    [createPrefixedId('job'), createPrefixedId('cmd'), carrierPartyId, JSON.stringify({ integrationAccountId: ACCOUNT_ID }), `corr_job_${RUN_ID}_b`]
  );

  // ── regulatory_watch_items: 1 em human_review (GLOBAL) ───────────────────────────────────────
  await query(
    `insert into regulatory_sources (id, source_type, reference, title, source_url, monitoring_status)
     values ($1, 'other', $2, 'Fonte de teste — overview', 'https://fixture.invalid/overview', 'monitored')`,
    [SOURCE_ID, `REGSRC-OVERVIEWAPI-${RUN_ID}`]
  );
  await query(
    `insert into regulatory_watch_items (id, source_id, status, detected_change, correlation_id)
     values ($1, $2, 'human_review', '{"newHash":"h1","httpStatus":200}'::jsonb, $3)`,
    [createPrefixedId('regwatch'), SOURCE_ID, `corr_watch_${RUN_ID}`]
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
    await query('delete from regulatory_watch_events where source_id = $1', [SOURCE_ID]);
    await query('delete from regulatory_watch_items where source_id = $1', [SOURCE_ID]);
    await query('delete from regulatory_sources where id = $1', [SOURCE_ID]);
    await query('delete from jobs where payload ->> \'integrationAccountId\' = $1', [ACCOUNT_ID]);
    await query('delete from insurance_policies where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from transport_operation_parties where party_id = $1', [carrierPartyId]);
    await query('delete from fiscal_documents where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from vpo_allocations where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from ciot_operations where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from freight_floor_calculations where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from compliance_evidence where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from compliance_checks where evaluation_id in (select id from compliance_evaluations where integration_account_id = $1)', [ACCOUNT_ID]);
    await query('delete from compliance_evaluations where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from transport_parties where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from transport_operations where integration_account_id = $1', [ACCOUNT_ID]);
    await query('delete from integration_accounts where id = $1', [ACCOUNT_ID]);
  }
  await pool.end();
});

describe('GET /v1/transporte/operations/overview', () => {
  it('sem token responde 401', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/operations/overview?integrationAccountId=${ACCOUNT_ID}`);
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('sem integrationAccountId → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', '/v1/transporte/operations/overview');
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATIONS_OVERVIEW_FIELD_REQUIRED');
  });

  it('agrega compliance/CIOT/VPO/fiscal/seguro/RNTRC/jobs para a conta, e o watch GLOBAL', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi('GET', `/v1/transporte/operations/overview?integrationAccountId=${ACCOUNT_ID}`);
    assert.equal(response.status, 200, JSON.stringify(body));

    assert.equal(body.operationsByStatus.blocked, 2);
    assert.equal(body.operationsByStatus.draft, 1);

    const pmf002 = body.compliance.topBlockedRules.find((row) => row.ruleCode === 'TR-PMF-002');
    assert.ok(pmf002, 'TR-PMF-002 deveria aparecer no top de regras que mais bloqueiam');
    assert.equal(pmf002.blockCount, 1);

    assert.equal(body.compliance.belowFloorOffers, 1);

    assert.equal(body.ciot.byStatus.registered, 1);
    assert.equal(body.ciot.byStatus.request_unconfirmed, 1);
    assert.equal(body.ciot.unconfirmedPending, 1);

    assert.equal(body.vpo.applicableNotAcquired, 1);

    assert.equal(body.fiscalDocuments.invalid, 1);
    assert.equal(body.fiscalDocuments.warnings, 1);

    assert.equal(body.insurance.expiringOrExpiredCount, 1);
    assert.equal(body.insurance.windowDays, 30);

    assert.equal(body.rntrc.staleCarriers, 1);
    assert.equal(body.rntrc.freshnessDays, 90);

    assert.equal(body.jobs.retryWait, 1);
    assert.equal(body.jobs.dlq, 1);

    assert.ok(body.watch.pendingHumanReviewGlobal >= 1);
    assert.ok(body.generatedAt);
  });

  it('conta sem nenhum dado devolve agregados zerados (não erro)', async (t) => {
    if (skipIfNoDb(t)) return;
    const emptyAccountId = `acc_tropoverview_empty_${RUN_ID}`;
    await query(
      `insert into integration_accounts (id, account_name) values ($1, 'Conta vazia') on conflict (id) do nothing`,
      [emptyAccountId]
    );

    const { response, body } = await callApi('GET', `/v1/transporte/operations/overview?integrationAccountId=${emptyAccountId}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body.operationsByStatus, {});
    assert.deepEqual(body.compliance.topBlockedRules, []);
    assert.equal(body.compliance.belowFloorOffers, 0);
    assert.equal(body.ciot.unconfirmedPending, 0);
    assert.equal(body.vpo.applicableNotAcquired, 0);
    assert.equal(body.fiscalDocuments.invalid, 0);
    assert.equal(body.rntrc.staleCarriers, 0);
    assert.equal(body.jobs.retryWait, 0);

    await query('delete from integration_accounts where id = $1', [emptyAccountId]);
  });
});
