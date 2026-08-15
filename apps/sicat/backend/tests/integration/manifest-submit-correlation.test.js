import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { processJob } from '../../src/workers/operation-handlers.js';
import { findManifestById } from '../../src/repositories/manifest-repo.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { validSessionContext } from '../fixtures/session-contexts.js';

/**
 * C1 — janela cega do submit (integração, double do gateway; CETESB nunca é chamada).
 *
 * O que se prova aqui:
 * 1. A intenção (marcador determinístico derivado do id local) é persistida na
 *    linha do manifesto ANTES do PUT — o double lê o banco no momento exato da
 *    chamada ao gateway. Remover a persistência pré-PUT mata este teste.
 * 2. A intenção sobrevive ao commit pós-resposta (merge não a apaga).
 * 3. No cenário de resposta perdida (gateway lança), a linha local fica em
 *    'submitting' COM o marcador gravado — é ele que permite perguntar depois
 *    "esse envio foi processado?" via searchManifests/manObservacao.
 */

describe('manifest.submit — correlação pré-PUT (C1)', () => {
  const accountId = 'acc_corr_int_001';
  const sessionContextId = 'scx_corr_int_001';
  const manifestId = 'man_corr_int_001';
  const jobId = 'job_corr_int_001';
  const commandId = 'cmd_corr_int_001';
  const correlationId = 'corr_corr_int_001';
  const expectedMarker = `[sicat:${manifestId}]`;

  function buildJobEntity() {
    return {
      jobId,
      commandId,
      entityType: 'manifest',
      entityId: manifestId,
      operation: 'manifest.submit',
      status: 'running',
      attempts: 1,
      maxAttempts: 5,
      payload: {
        sessionContextId,
        requestedBy: 'test.user',
        validateOnly: false,
        printAfterSubmit: false
      },
      correlationId,
      claimedBy: null
    };
  }

  async function readManifestRow() {
    const result = await query('SELECT status, payload FROM manifests WHERE id = $1', [manifestId]);
    return result.rows[0] || null;
  }

  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM jobs WHERE entity_id = $1', [manifestId]);
    await query('DELETE FROM manifests WHERE id = $1', [manifestId]);
    await query('DELETE FROM session_contexts WHERE id = $1', [sessionContextId]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [accountId]);

    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [accountId, 'Conta correlação C1', true]
    );

    await query(
      `INSERT INTO session_contexts(
        id, integration_account_id, status, partner_document, partner_type,
        partner_code, user_access_code, user_name, email, jwt_token_ref,
        expires_at, last_validated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        sessionContextId,
        accountId,
        validSessionContext.status,
        validSessionContext.partnerDocument,
        validSessionContext.partnerType,
        validSessionContext.partnerCode,
        validSessionContext.userAccessCode,
        validSessionContext.userName,
        validSessionContext.email,
        validSessionContext.jwtTokenRef,
        validSessionContext.expiresAt,
        validSessionContext.lastValidatedAt,
        JSON.stringify(validSessionContext.metadata)
      ]
    );

    await query(
      `INSERT INTO manifests(
        id, integration_account_id, session_context_id, status,
        external_status, external_reference, external_hash_code, payload, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        manifestId,
        accountId,
        sessionContextId,
        'queued_submit',
        null,
        null,
        null,
        JSON.stringify({ responsibleName: 'Operador C1', notes: 'Obs original do usuário' }),
        correlationId
      ]
    );

    // Job já claimado (constraint chk_job_running_integrity exige claimed_*,
    // started_at e claim_heartbeat_at quando status = 'running').
    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, attempts, max_attempts, correlation_id, priority, retry_strategy,
        base_delay_ms, max_delay_ms, tags,
        claimed_by, claimed_at, started_at, claim_heartbeat_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,now(),now(),now())`,
      [
        jobId,
        commandId,
        'manifest',
        manifestId,
        'manifest.submit',
        JSON.stringify({ sessionContextId, requestedBy: 'test.user', validateOnly: false, printAfterSubmit: false }),
        'running',
        1,
        5,
        correlationId,
        8,
        'exponential',
        2000,
        300000,
        JSON.stringify(['category:manifest', 'entity:manifest', 'status:running']),
        'worker-test-corr'
      ]
    );
  });

  after(async () => {
    await query('DELETE FROM jobs WHERE entity_id = $1', [manifestId]);
    await query('DELETE FROM manifests WHERE id = $1', [manifestId]);
    await query('DELETE FROM session_contexts WHERE id = $1', [sessionContextId]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [accountId]);
    await pool.end();
  });

  it('persiste a intenção (marcador + submitting) na linha local ANTES do PUT no gateway', async () => {
    let rowAtPutTime = null;

    const gatewayDouble = {
      submitManifest: async () => {
        // Lê o banco NO MOMENTO da chamada ao gateway: é aqui que o processo
        // pode morrer — a linha local já precisa saber qual marcador procurar.
        rowAtPutTime = await readManifestRow();
        return {
          response: {
            data: {
              manHashCode: 'HASH-CORR-INT-001',
              manCodigo: 987654,
              manNumero: '260000987654',
              simDescricao: 'Salvo'
            }
          }
        };
      }
    };

    await processJob(buildJobEntity(), gatewayDouble);

    assert.ok(rowAtPutTime, 'gateway double não foi chamado');
    assert.strictEqual(rowAtPutTime.status, 'submitting');
    assert.ok(rowAtPutTime.payload.submitCorrelation, 'intenção ausente no payload antes do PUT');
    // Formato literal fixado: determinístico e derivado do id local.
    assert.strictEqual(rowAtPutTime.payload.submitCorrelation.marker, expectedMarker);
    assert.strictEqual(rowAtPutTime.payload.submitCorrelation.jobId, jobId);
    assert.ok(rowAtPutTime.payload.submitCorrelation.dispatchedAt);
    // O payload de negócio não foi sobrescrito pela intenção.
    assert.strictEqual(rowAtPutTime.payload.notes, 'Obs original do usuário');
    assert.strictEqual(rowAtPutTime.payload.responsibleName, 'Operador C1');
  });

  it('mantém a intenção após o commit da resposta (merge pós-submit não a apaga)', async () => {
    const gatewayDouble = {
      submitManifest: async () => ({
        response: {
          data: {
            manHashCode: 'HASH-CORR-INT-002',
            manCodigo: 987655,
            manNumero: '260000987655',
            simDescricao: 'Salvo'
          }
        }
      })
    };

    await processJob(buildJobEntity(), gatewayDouble);

    const manifest = await findManifestById(manifestId);
    assert.strictEqual(manifest.status, 'submitted');
    assert.strictEqual(manifest.externalHashCode, 'HASH-CORR-INT-002');
    assert.strictEqual(manifest.payload.submitCorrelation.marker, expectedMarker);
    assert.strictEqual(manifest.payload.jobResults['manifest.submit'].outcome, 'manifest_submitted');

    const job = await findJobById(jobId);
    assert.strictEqual(job.status, 'succeeded');
  });

  it('resposta perdida: a linha fica em submitting COM o marcador gravado para busca posterior', async () => {
    const gatewayDouble = {
      submitManifest: async () => {
        // Simula a janela cega real: o PUT saiu (ou pode ter saído) e a
        // resposta nunca chegou — timeout/pod morto.
        throw new Error('socket hang up antes da resposta da CETESB');
      }
    };

    await assert.rejects(async () => processJob(buildJobEntity(), gatewayDouble), /socket hang up/);

    const row = await readManifestRow();
    assert.strictEqual(row.status, 'submitting');
    assert.strictEqual(row.payload.submitCorrelation.marker, expectedMarker);
    assert.strictEqual(row.payload.submitCorrelation.jobId, jobId);
  });
});
