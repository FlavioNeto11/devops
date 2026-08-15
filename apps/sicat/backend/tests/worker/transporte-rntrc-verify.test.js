/**
 * Worker `transporte.rntrc.verify` (estratégia `open_data`, PR-C1) — `processJob` REAL contra o
 * Postgres local, com `globalThis.fetch` monkeypatchado (molde
 * `tests/unit/whatsapp-worker-hardening.test.js`) servindo as fixtures REAIS de shape capturadas
 * na sondagem (`tests/fixtures/regulatory/antt-open-data-sample.json`) — NUNCA a rede real
 * (`RNTRC_GATEWAY_MODE` e o fetch são ambos controlados pelo teste).
 *
 * Handler SEM parâmetro `gateway` (molde `handleWhatsAppInboundMessage`): `processJob(job, {})`
 * — o segundo argumento nunca é lido para esta operação.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { query, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { processJob } from '../../src/workers/operation-handlers.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/regulatory/antt-open-data-sample.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const ACCOUNT_ID = 'acc_rntrcwrk_001';
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } };
}

function installFetchQueue(responses) {
  const queue = [...responses];
  globalThis.fetch = async () => {
    const next = queue.shift();
    if (!next) throw new Error('fetch chamado além do esperado');
    if (next instanceof Error) throw next;
    return next;
  };
}

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste pulado (${dbUnavailableReason})`);
  return true;
}

async function insertParty({ id, documentNumber, rntrcNumber = null }) {
  await query(
    `insert into transport_parties (
       id, integration_account_id, document_type, document_number, legal_name, rntrc_number,
       correlation_id, version
     ) values ($1, $2, 'CNPJ', $3, $4, $5, $6, 1)`,
    [id, ACCOUNT_ID, documentNumber, `Transportadora ${id}`, rntrcNumber, `corr_${id}`]
  );
}

async function insertJobRow({ jobId, entityId, payload }) {
  await query(
    `insert into jobs(
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
     ) values ($1,$2,'transport_party',$3,'transporte.rntrc.verify',$4::jsonb,'running',4,1,$5,now(),now(),now(),'worker-test')`,
    [jobId, `cmd_${jobId}`, entityId, JSON.stringify(payload), `corr_${jobId}`]
  );
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
    `insert into integration_accounts (id, account_name) values ($1, 'Conta worker RNTRC')
     on conflict (id) do nothing`,
    [ACCOUNT_ID]
  );
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await query('delete from audit_logs where entity_id like $1', ['trparty_rntrcwrk_%']);
  await query('delete from rntrc_verifications where party_id like $1', ['trparty_rntrcwrk_%']);
  await query('delete from jobs where entity_id like $1', ['trparty_rntrcwrk_%']);
  await query('delete from transport_parties where id like $1', ['trparty_rntrcwrk_%']);
  setConfigOverride('rntrcGatewayMode', 'open_data');
  setConfigOverride('rntrcGatewayBaseUrl', 'https://fixture.invalid');
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setConfigOverride('rntrcGatewayMode', undefined);
  setConfigOverride('rntrcGatewayBaseUrl', undefined);
});

after(async () => {
  if (dbAvailable) {
    await query('delete from audit_logs where entity_id like $1', ['trparty_rntrcwrk_%']);
    await query('delete from rntrc_verifications where party_id like $1', ['trparty_rntrcwrk_%']);
    await query('delete from jobs where entity_id like $1', ['trparty_rntrcwrk_%']);
    await query('delete from transport_parties where id like $1', ['trparty_rntrcwrk_%']);
    await query('delete from integration_accounts where id = $1', [ACCOUNT_ID]);
  }
  await pool.end();
});

describe('worker transporte.rntrc.verify — sucesso (encontrado, ATIVO)', () => {
  it('cria verificação succeeded, atualiza o party e grava auditoria (outbound+inbound × 2 exchanges)', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = 'trparty_rntrcwrk_found';
    await insertParty({ id: partyId, documentNumber: '11222333000181' });
    await insertJobRow({
      jobId: 'job_rntrcwrk_found',
      entityId: partyId,
      payload: { partyId, integrationAccountId: ACCOUNT_ID, strategy: 'open_data' }
    });

    installFetchQueue([jsonResponse(fixture.packageShow), jsonResponse(fixture.datastoreSearchFound)]);

    const job = await findJobById('job_rntrcwrk_found');
    await processJob(job, {});

    const updatedJob = await findJobById('job_rntrcwrk_found');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'rntrc_verification_succeeded');
    assert.ok(updatedJob.payload.verificationId?.startsWith('rntrcver_'));

    const verificationRes = await query('select * from rntrc_verifications where party_id = $1', [partyId]);
    assert.equal(verificationRes.rows.length, 1);
    const verification = verificationRes.rows[0];
    assert.equal(verification.requested_status, 'succeeded');
    assert.equal(verification.result_status, 'active');
    assert.equal(verification.result_category, 'ETC');
    assert.equal(verification.strategy, 'open_data');
    assert.equal(verification.data_reference_date.toISOString().slice(0, 10), '2026-02-10');
    assert.ok(verification.completed_at);

    const partyRes = await query('select * from transport_parties where id = $1', [partyId]);
    const party = partyRes.rows[0];
    assert.equal(party.rntrc_status, 'active');
    assert.equal(party.rntrc_category, 'ETC');
    assert.equal(party.rntrc_verification_source, 'open_data');
    assert.ok(party.rntrc_verified_at);
    assert.equal(party.version, 2, 'version deve incrementar (locking otimista)');

    const auditRes = await query(
      `select * from audit_logs where entity_type = 'transport_party' and entity_id = $1 and component = 'antt-rntrc-gateway' order by occurred_at asc, id asc`,
      [partyId]
    );
    assert.equal(auditRes.rows.length, 4, 'package_show + datastore_search, cada um outbound+inbound');
    assert.deepEqual(auditRes.rows.map((row) => row.direction), ['outbound', 'inbound', 'outbound', 'inbound']);
    assert.equal(auditRes.rows[1].http_status, 200);
  });
});

describe('worker transporte.rntrc.verify — not_found (dado aberto não prova irregularidade)', () => {
  it('verificação succeeded com result not_found; party rntrc_status vira "unknown" (mantido, não "irregular")', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = 'trparty_rntrcwrk_notfound';
    await insertParty({ id: partyId, documentNumber: '11999999000199' });
    await insertJobRow({
      jobId: 'job_rntrcwrk_notfound',
      entityId: partyId,
      payload: { partyId, integrationAccountId: ACCOUNT_ID, strategy: 'open_data' }
    });

    installFetchQueue([jsonResponse(fixture.packageShow), jsonResponse(fixture.datastoreSearchNotFound)]);

    const job = await findJobById('job_rntrcwrk_notfound');
    await processJob(job, {});

    const updatedJob = await findJobById('job_rntrcwrk_notfound');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'rntrc_verification_not_found');

    const verificationRes = await query('select * from rntrc_verifications where party_id = $1', [partyId]);
    assert.equal(verificationRes.rows[0].requested_status, 'succeeded');
    assert.equal(verificationRes.rows[0].result_status, 'not_found');

    const partyRes = await query('select rntrc_status from transport_parties where id = $1', [partyId]);
    assert.equal(partyRes.rows[0].rntrc_status, 'unknown');
  });
});

describe('worker transporte.rntrc.verify — falha de rede', () => {
  it('erro de rede propaga como erro retentável (isRetryableJobError)', async (t) => {
    if (skipIfNoDb(t)) return;

    const partyId = 'trparty_rntrcwrk_neterr';
    await insertParty({ id: partyId, documentNumber: '11222333000181' });
    await insertJobRow({
      jobId: 'job_rntrcwrk_neterr',
      entityId: partyId,
      payload: { partyId, integrationAccountId: ACCOUNT_ID, strategy: 'open_data' }
    });

    installFetchQueue([new Error('ECONNRESET simulado')]);

    const job = await findJobById('job_rntrcwrk_neterr');
    await assert.rejects(
      () => processJob(job, {}),
      (error) => {
        assert.equal(error.code, 'RNTRC_GATEWAY_NETWORK_ERROR');
        assert.equal(isRetryableJobError(error), true, 'falha de rede deve ser retentável');
        return true;
      }
    );

    // A linha `pending` foi criada ANTES da chamada ao gateway — continua pending até o terminal
    // (DLQ/failed) do job-runner reconciliar via `applyTransporteRntrcVerifyTerminalFailureSideEffect`.
    const verificationRes = await query('select requested_status from rntrc_verifications where party_id = $1', [partyId]);
    assert.equal(verificationRes.rows.length, 1);
    assert.equal(verificationRes.rows[0].requested_status, 'pending');

    const partyRes = await query('select rntrc_status, version from transport_parties where id = $1', [partyId]);
    assert.equal(partyRes.rows[0].rntrc_status, 'unknown', 'party não tocado numa falha não-terminal');
    assert.equal(partyRes.rows[0].version, 1);
  });
});
