import process from 'node:process';
import { query } from '../src/db/pool.ts';
import { runWorkerLoop } from '../src/workers/job-runner.ts';
import { createPrefixedId } from '../src/lib/ids.ts';

async function cleanup(jobId) {
  await query('delete from jobs where job_id = $1', [jobId]);
  await query('delete from job_dead_letter_queue where job_id = $1', [jobId]);
}

async function main() {
  const jobId = createPrefixedId('job_smoke');
  const commandId = createPrefixedId('cmd_smoke');
  const correlationId = createPrefixedId('corr_smoke');

  try {
    await query(
      `insert into jobs(
        job_id, command_id, entity_type, entity_id, operation, payload, status,
        attempts, max_attempts, correlation_id, retry_strategy, base_delay_ms, max_delay_ms
      ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13)`,
      [
        jobId,
        commandId,
        'manifest',
        'man_smoke_retry_dlq',
        'operation.unsupported',
        JSON.stringify({ smoke: true }),
        'queued',
        0,
        2,
        correlationId,
        'fixed',
        500,
        1000
      ]
    );

    await runWorkerLoop({ once: true });

    const retryResult = await query('select * from jobs where job_id = $1', [jobId]);
    const first = retryResult.rows[0];
    if (!first || first.status !== 'retry_wait' || !first.next_retry_at) {
      throw new Error(`Esperado retry_wait com next_retry_at após 1ª execução. Status atual: ${first?.status}`);
    }

    await query('update jobs set status = $2, next_retry_at = now() - interval \'1 second\' where job_id = $1', [jobId, 'retry_wait']);
    await runWorkerLoop({ once: true });

    const dlqResult = await query('select * from jobs where job_id = $1', [jobId]);
    const second = dlqResult.rows[0];
    if (!second || second.status !== 'dlq') {
      throw new Error(`Esperado status dlq após 2ª execução. Status atual: ${second?.status}`);
    }

    const dlqTable = await query('select * from job_dead_letter_queue where job_id = $1', [jobId]);
    if (dlqTable.rows.length !== 1) {
      throw new Error('Esperado 1 registro correspondente na job_dead_letter_queue');
    }

    console.log(JSON.stringify({
      ok: true,
      jobId,
      firstStatus: first.status,
      secondStatus: second.status,
      attempts: second.attempts,
      dlqReason: second.dlq_reason
    }, null, 2));
  } finally {
    await cleanup(jobId);
  }
}

main().catch((error) => {
  console.error('Erro no smoke de retry/DLQ:', error);
  process.exit(1);
});
