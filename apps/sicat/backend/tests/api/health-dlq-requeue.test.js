/**
 * `POST /v1/health/jobs/dlq/:jobId/requeue` — AUSÊNCIA é 404, CONFLITO não é.
 *
 * A rota sempre teve a tradução certa escrita (`if (!job) → 404`), mas ela era código MORTO:
 * `requeueFromDLQ` sinalizava "não encontrado" com `throw new Error(...)` puro, e o
 * `errorHandlerMiddleware` só honra `.status`/`.statusCode` — sem isso, cai no default 500. O
 * operador pedindo requeue de um id inexistente recebia "Internal Server Error", indistinguível de
 * uma falha real do servidor.
 *
 * Este teste prende as DUAS metades da distinção, e só o par tem valor:
 *  - AUSÊNCIA (id inexistente, e linha órfã na DLQ sem job correspondente) → 404;
 *  - CONFLITO (o job existe, mas não está em status `dlq`) → continua sendo erro NÃO-404.
 *
 * CONTROLE NEGATIVO: sem o caso de conflito, "trocar todo throw por 404" passaria neste arquivo — e
 * teria transformado um conflito legítimo em 404 silencioso, que é a mentira oposta.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { ensureStartup } from '../../src/bootstrap/startup.js';
import { createApp } from '../../src/app.js';
import { createTestAccessToken } from '../helpers/sicat-token.js';
import { createPrefixedId } from '../../src/lib/ids.js';

const ENTITY_MARKER = 'man_dlq_requeue_test';

let server;
let API_BASE = '';
let token = '';
const createdJobIds = [];

async function insertJobRow(status) {
  const jobId = createPrefixedId('job');
  await query(
    `insert into jobs (
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, attempts, max_attempts, correlation_id, created_at
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10, now())`,
    [
      jobId,
      createPrefixedId('cmd'),
      'manifest',
      `${ENTITY_MARKER}_${jobId}`,
      'manifest.submit',
      JSON.stringify({ test: true }),
      status,
      1,
      3,
      createPrefixedId('corr')
    ]
  );
  createdJobIds.push(jobId);
  return jobId;
}

async function insertDlqRow(jobId) {
  await query(
    `insert into job_dead_letter_queue (
       job_id, command_id, entity_type, entity_id, operation, payload,
       attempts, max_attempts, correlation_id, reason, original_queued_at
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10, now())`,
    [
      jobId,
      createPrefixedId('cmd'),
      'manifest',
      `${ENTITY_MARKER}_${jobId}`,
      'manifest.submit',
      JSON.stringify({ test: true }),
      1,
      3,
      createPrefixedId('corr'),
      'teste de requeue'
    ]
  );
  createdJobIds.push(jobId);
}

async function requeue(jobId) {
  const response = await fetch(`${API_BASE}/v1/health/jobs/dlq/${encodeURIComponent(jobId)}/requeue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await response.text();
  return { status: response.status, body };
}

describe('DLQ requeue — ausência vira 404, conflito não', { concurrency: 1 }, () => {
  before(async () => {
    await ensureStartup();
    token = createTestAccessToken();
    const app = createApp();
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    API_BASE = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const jobId of createdJobIds) {
      await query('delete from job_dead_letter_queue where job_id = $1', [jobId]);
      await query('delete from jobs where job_id = $1', [jobId]);
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it('CONTROLE DO MEDIDOR: um requeue legítimo responde 200', async () => {
    // Sem esta metade, todas as asserções abaixo poderiam passar por a rota estar simplesmente
    // quebrada (respondendo erro para tudo).
    const jobId = await insertJobRow('dlq');
    await insertDlqRow(jobId);

    const { status, body } = await requeue(jobId);
    assert.strictEqual(status, 200, `requeue legítimo deveria responder 200, veio ${status}: ${body}`);

    const remaining = await query('select 1 from job_dead_letter_queue where job_id = $1', [jobId]);
    assert.strictEqual(remaining.rowCount, 0, 'o job deveria ter saído da DLQ');
  });

  it('id inexistente responde 404, não 500', async () => {
    const { status, body } = await requeue(createPrefixedId('job'));
    assert.strictEqual(status, 404, `esperava 404 para job inexistente, veio ${status}: ${body}`);
  });

  it('linha órfã na DLQ (sem job correspondente) também responde 404', async () => {
    // Cobre o SEGUNDO ponto de ausência dentro de `requeueFromDLQ`: achou na DLQ, não achou em `jobs`.
    const jobId = createPrefixedId('job');
    await insertDlqRow(jobId);

    const { status, body } = await requeue(jobId);
    assert.strictEqual(status, 404, `esperava 404 para linha órfã na DLQ, veio ${status}: ${body}`);
  });

  it('CONTROLE NEGATIVO: job fora do status dlq NÃO vira 404', async () => {
    // Conflito de estado é outra coisa que ausência. Se esta asserção cair, a correção do 404 foi
    // aplicada larga demais e passou a mentir sobre jobs que EXISTEM.
    const jobId = await insertJobRow('queued');
    await insertDlqRow(jobId);

    const { status, body } = await requeue(jobId);
    assert.notStrictEqual(status, 404, `conflito de status virou 404 (${body})`);
    assert.ok(status >= 400, `conflito de status deveria ser erro, veio ${status}: ${body}`);

    // O job continua onde estava — nada foi reenfileirado às escondidas.
    const row = await query('select status from jobs where job_id = $1', [jobId]);
    assert.strictEqual(row.rows[0]?.status, 'queued', 'o job não deveria ter mudado de status');
  });
});
