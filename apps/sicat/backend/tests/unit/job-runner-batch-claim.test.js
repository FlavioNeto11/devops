import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { config, setConfigOverride } from '../../src/lib/config.js';
import {
  processWorkerIteration,
  setJobRunnerDependenciesForTests,
  warnIfClaimHeartbeatCannotHoldTheBatch
} from '../../src/workers/job-runner.js';

/**
 * DEFEITO COBERTO — execução dupla de operações CETESB por claim de LOTE com heartbeat por JOB.
 *
 * `claimJobs` reivindica `WORKER_BATCH_SIZE` jobs de uma vez: todos viram `running` com
 * `claim_heartbeat_at` carimbado no MESMO instante. O consumo é SERIAL. Antes da correção, o
 * heartbeat de claim nascia dentro de `processClaimedJob` — ou seja, o lease de um job só começava a
 * ser renovado quando chegava a vez dele. Enquanto o job 1 rodava, os jobs 2..N ficavam `running`
 * com o carimbo congelado; passado `WORKER_CLAIM_STALE_TIMEOUT_MS`, `requeueStaleRunningJobs` os
 * devolvia para `retry_wait` e eles eram executados DE NOVO. `manifest.submit`, `manifest.cancel` e
 * `cdf.generate` não são idempotentes: o MTR sai duas vezes.
 *
 * A varredura de stale roda no LAÇO DO WORKER e não conhece raia nem dono — qualquer réplica varre a
 * tabela inteira, inclusive os jobs do lote de outra. Por isso o teste tem um ATOR SEPARADO chamando
 * `requeueStaleRunningJobs` enquanto o lote está em voo: é assim que o defeito acontece em produção.
 *
 * REGRA DE ESCRITA: o caso positivo sozinho seria vácuo — um duplo que nunca reenfileira nada passa
 * com ou sem correção. Por isso existe o CONTROLE NEGATIVO: mesma fila, mesmo relógio, mesma
 * varredura, mudando UMA coisa — o heartbeat volta a cobrir só o job da vez (o comportamento
 * antigo). Ele PRECISA falhar em reenfileirar/duplicar, senão o harness não enxerga o defeito.
 */

const WORKER = 'worker-lote-teste';
const HEARTBEAT_MS = 1_000;
const STALE_MS = 10_000;
const BATCH_SIZE = 3;
const JOB_IDS = ['job-1', 'job-2', 'job-3'];

/* -------------------------------------------------------------------------------------------- */
/* Harness                                                                                       */
/* -------------------------------------------------------------------------------------------- */

/** Relógio virtual da fila. Separado do `Date` global de propósito: quem precisa de tempo aqui é o
 *  SQL simulado (claim/heartbeat/stale), não o job-runner. */
function createClock(startMs = 1_700_000_000_000) {
  return { nowMs: startMs, now() { return this.nowMs; } };
}

/**
 * Fila em memória com as MESMAS regras do SQL de `job-repo.ts`. A fidelidade é o ponto: se o duplo
 * fosse permissivo (por exemplo ignorando `claimed_by` no update), o teste passaria por engano.
 *
 *  · `claimJobs`                → `status in ('queued','retry_wait') and coalesce(next_retry_at, now()) <= now()`,
 *                                 ordena por chegada, marca `running` e carimba claim + heartbeat.
 *  · `requeueStaleRunningJobs`  → `coalesce(claim_heartbeat_at, claimed_at) <= now() - timeout`.
 *  · `heartbeatJobClaim`        → só renova com `status = 'running'` E `claimed_by` batendo.
 *  · `updateJobIfOwned`         → só grava com `claimed_by` batendo E status na lista permitida.
 */
function createFakeJobQueue(clock) {
  const rows = new Map();
  const heartbeatCalls = [];
  let sequence = 0;

  function clone(row) {
    return { ...row, payload: { ...row.payload }, retryDelays: [...row.retryDelays] };
  }

  function seed(jobIds) {
    for (const jobId of jobIds) {
      rows.set(jobId, {
        jobId,
        commandId: null,
        entityType: 'manifest',
        entityId: `manifest-${jobId}`,
        operation: 'manifest.submit',
        status: 'queued',
        attempts: 0,
        maxAttempts: 5,
        retryStrategy: 'exponential',
        baseDelayMs: 100,
        maxDelayMs: 5_000,
        payload: {},
        retryDelays: [],
        correlationId: null,
        claimedBy: null,
        claimedAt: null,
        claimHeartbeatAt: null,
        nextRetryAt: null,
        queuedAt: sequence++,
        lastErrorCode: null,
        lastErrorMessage: null,
        dlqReason: null
      });
    }
  }

  async function claimJobs(batchSize, claimedBy = WORKER) {
    const claimable = [...rows.values()]
      .filter((row) => (row.status === 'queued' || row.status === 'retry_wait')
        && (row.nextRetryAt == null || row.nextRetryAt <= clock.now()))
      .sort((a, b) => a.queuedAt - b.queuedAt)
      .slice(0, batchSize);

    for (const row of claimable) {
      row.status = 'running';
      row.attempts += 1;
      row.claimedBy = claimedBy;
      row.claimedAt = clock.now();
      row.claimHeartbeatAt = clock.now();
      row.nextRetryAt = null;
    }

    return claimable.map(clone);
  }

  async function requeueStaleRunningJobs(claimStaleTimeoutMs, batchSize = 100) {
    const cutoff = clock.now() - claimStaleTimeoutMs;
    const stale = [...rows.values()]
      .filter((row) => row.status === 'running'
        && row.claimedAt != null
        && (row.claimHeartbeatAt ?? row.claimedAt) <= cutoff)
      .sort((a, b) => a.claimedAt - b.claimedAt)
      .slice(0, batchSize);

    for (const row of stale) {
      row.status = 'retry_wait';
      row.nextRetryAt = clock.now();
      row.claimedAt = null;
      row.claimHeartbeatAt = null;
      row.claimedBy = null;
      row.lastErrorCode = 'WORKER_CLAIM_STALE';
      row.lastErrorMessage = 'Claim timeout exceeded; requeued for retry';
    }

    return stale.map(clone);
  }

  async function heartbeatJobClaim(jobId, claimedBy) {
    heartbeatCalls.push({ jobId, claimedBy, at: clock.now() });
    const row = rows.get(jobId);
    if (!row || row.status !== 'running' || row.claimedBy !== claimedBy) return null;
    row.claimHeartbeatAt = clock.now();
    return clone(row);
  }

  async function updateJobIfOwned(jobId, claimedBy, patch, allowedStatuses = ['running']) {
    const row = rows.get(jobId);
    if (!row || row.claimedBy !== claimedBy || !allowedStatuses.includes(row.status)) return null;
    if (patch.status) row.status = patch.status;
    if (patch.attempts != null) row.attempts = patch.attempts;
    if (patch.lastErrorCode) row.lastErrorCode = patch.lastErrorCode;
    return clone(row);
  }

  return {
    seed,
    claimJobs,
    requeueStaleRunningJobs,
    heartbeatJobClaim,
    updateJobIfOwned,
    peek: (jobId) => clone(rows.get(jobId)),
    statuses: () => JOB_IDS.map((jobId) => rows.get(jobId).status),
    heartbeatCalls
  };
}

/** Portão de um job: o teste sabe quando o handler ENTROU e decide quando ele SAI. */
function createGate() {
  let markEntered;
  let release;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  return { entered, released, markEntered: () => markEntered(), release: () => release() };
}

/** Drena as microtasks pendentes. `setImmediate` NÃO está entre as APIs mockadas — de propósito. */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

/* -------------------------------------------------------------------------------------------- */
/* Casos                                                                                         */
/* -------------------------------------------------------------------------------------------- */

describe('job-runner — lease do lote reivindicado', () => {
  let clock;
  let queue;
  let gates;
  let processed;
  let originalConfig;

  /** Avança o relógio da fila e o dos timers JUNTOS, em passos de um heartbeat. */
  async function advance(totalMs) {
    const steps = Math.ceil(totalMs / HEARTBEAT_MS);
    for (let step = 0; step < steps; step += 1) {
      clock.nowMs += HEARTBEAT_MS;
      mock.timers.tick(HEARTBEAT_MS);
      await flush();
    }
  }

  function runIteration() {
    return processWorkerIteration({ once: true, shutdownRequested: () => false, workerName: WORKER });
  }

  beforeEach(() => {
    originalConfig = {
      workerBatchSize: config.workerBatchSize,
      workerClaimHeartbeatMs: config.workerClaimHeartbeatMs,
      workerClaimStaleTimeoutMs: config.workerClaimStaleTimeoutMs
    };
    setConfigOverride('workerBatchSize', BATCH_SIZE);
    setConfigOverride('workerClaimHeartbeatMs', HEARTBEAT_MS);
    setConfigOverride('workerClaimStaleTimeoutMs', STALE_MS);

    clock = createClock();
    queue = createFakeJobQueue(clock);
    queue.seed(JOB_IDS);
    gates = new Map();
    processed = [];

    mock.timers.enable({ apis: ['setInterval'] });
  });

  afterEach(() => {
    mock.timers.reset();
    setJobRunnerDependenciesForTests(null);
    for (const [key, value] of Object.entries(originalConfig)) {
      setConfigOverride(key, value);
    }
  });

  function installDependencies({ heartbeatJobClaim } = {}) {
    setJobRunnerDependenciesForTests({
      claimJobs: (batchSize) => queue.claimJobs(batchSize),
      requeueStaleRunningJobs: (timeoutMs, batchSize) => queue.requeueStaleRunningJobs(timeoutMs, batchSize),
      heartbeatJobClaim: heartbeatJobClaim || ((jobId, claimedBy) => queue.heartbeatJobClaim(jobId, claimedBy)),
      updateJobIfOwned: (jobId, claimedBy, patch, allowedStatuses) => queue.updateJobIfOwned(jobId, claimedBy, patch, allowedStatuses),
      moveJobToDLQ: async () => { throw new Error('nenhum caso deste arquivo deveria chegar à DLQ'); },
      logSystemEvent: async () => {},
      processJob: async (job) => {
        processed.push(job.jobId);
        const gate = gates.get(job.jobId);
        if (!gate) return;
        gate.markEntered();
        await gate.released;
      }
    });
  }

  it('mantém o lease de TODOS os jobs do lote enquanto o primeiro demora mais que o stale timeout', async () => {
    for (const jobId of JOB_IDS) gates.set(jobId, createGate());
    installDependencies();

    const iteration = runIteration();
    const sweeps = [];

    for (const jobId of JOB_IDS) {
      await gates.get(jobId).entered;

      // Uma vez e meia a janela de stale — cada job do lote passa MUITO do prazo enquanto espera.
      await advance(STALE_MS * 1.5);

      // O varredor da outra réplica passa exatamente aqui, com o lote em voo.
      const requeued = await queue.requeueStaleRunningJobs(STALE_MS, 100);
      sweeps.push({ jobId, requeued: requeued.map((row) => row.jobId) });

      const pendentes = JOB_IDS.slice(JOB_IDS.indexOf(jobId));
      for (const pendente of pendentes) {
        const row = queue.peek(pendente);
        assert.equal(row.status, 'running', `${pendente} deixou de estar running enquanto ${jobId} rodava`);
        assert.equal(row.claimedBy, WORKER, `${pendente} perdeu o dono enquanto ${jobId} rodava`);
        assert.equal(row.attempts, 1, `${pendente} foi reivindicado mais de uma vez`);
        assert.ok(
          clock.now() - row.claimHeartbeatAt <= HEARTBEAT_MS,
          `lease de ${pendente} envelheceu ${clock.now() - row.claimHeartbeatAt}ms — o heartbeat não o cobria`
        );
      }

      gates.get(jobId).release();
    }

    await iteration;

    for (const sweep of sweeps) {
      assert.deepEqual(sweep.requeued, [], `varredura reenfileirou ${sweep.requeued} enquanto ${sweep.jobId} rodava`);
    }
    assert.deepEqual(processed, JOB_IDS, 'a ordem/quantidade de execuções mudou');
    assert.deepEqual(queue.statuses(), ['succeeded', 'succeeded', 'succeeded']);
  });

  it('para de renovar o lease de um job assim que ele termina', async () => {
    // Só o segundo job segura o lote: quando o teste avança o relógio, o job 1 JÁ terminou e o 3
    // ainda não começou. O heartbeat tem de cobrir o 3 (não começou) e largar o 1 (terminou).
    gates.set('job-2', createGate());
    installDependencies();

    const iteration = runIteration();
    await gates.get('job-2').entered;

    const marcoDeCorte = clock.now();
    await advance(STALE_MS * 1.5);

    const alvosDepoisDoCorte = new Set(
      queue.heartbeatCalls.filter((call) => call.at > marcoDeCorte).map((call) => call.jobId)
    );

    assert.ok(alvosDepoisDoCorte.has('job-3'), 'job-3 (ainda não iniciado) ficou fora do heartbeat');
    assert.ok(!alvosDepoisDoCorte.has('job-1'), 'job-1 já terminou e continuou recebendo heartbeat');
    assert.equal(queue.peek('job-1').status, 'succeeded');

    gates.get('job-2').release();
    await iteration;

    assert.deepEqual(processed, JOB_IDS);
  });

  it('CONTROLE NEGATIVO: com o heartbeat cobrindo só o job da vez, os demais são reenfileirados e EXECUTAM DUAS VEZES', async () => {
    gates.set('job-1', createGate());

    // Reproduz o comportamento antigo — `startClaimHeartbeat` dentro de `processClaimedJob` — sem
    // reintroduzir o código antigo: o duplo simplesmente ignora quem ainda não chegou na vez.
    let jobDaVez = null;
    installDependencies({
      heartbeatJobClaim: (jobId, claimedBy) => (jobId === jobDaVez
        ? queue.heartbeatJobClaim(jobId, claimedBy)
        : Promise.resolve(null))
    });
    jobDaVez = 'job-1';

    const iteration = runIteration();
    await gates.get('job-1').entered;
    await advance(STALE_MS * 1.5);

    const requeued = await queue.requeueStaleRunningJobs(STALE_MS, 100);
    assert.deepEqual(
      requeued.map((row) => row.jobId),
      ['job-2', 'job-3'],
      'o harness não reproduziu o defeito: sem lease de lote, os jobs 2..N TÊM de ficar stale'
    );

    gates.get('job-1').release();
    await iteration;

    // O worker processou 2 e 3 mesmo depois de perdê-los. `updateJobIfOwned` recusou o DESFECHO
    // (`claimed_by` já era null) — mas a chamada externa do handler já tinha saído.
    assert.deepEqual(processed, JOB_IDS, 'os jobs perdidos deveriam ter sido processados assim mesmo');
    assert.deepEqual(queue.statuses(), ['succeeded', 'retry_wait', 'retry_wait']);

    // ...e por continuarem em retry_wait, a rodada seguinte os executa OUTRA VEZ.
    jobDaVez = null;
    await runIteration();

    assert.deepEqual(processed, [...JOB_IDS, 'job-2', 'job-3'], 'a execução dupla não se materializou');
    assert.equal(queue.peek('job-2').attempts, 2, 'job-2 deveria ter sido reivindicado duas vezes');
  });
});

/**
 * A correção acima só vale enquanto o heartbeat couber várias vezes na janela de stale. Configuração
 * fora dessa faixa reabre a execução dupla — e o único sintoma em produção seria um MTR repetido na
 * CETESB. O worker avisa no boot em vez de morrer: derrubá-lo pararia a emissão.
 */
describe('job-runner — guarda de configuração do lease', () => {
  let warnings;
  let originalWarn;
  let originalConfig;

  beforeEach(() => {
    warnings = [];
    originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    originalConfig = {
      workerBatchSize: config.workerBatchSize,
      workerClaimHeartbeatMs: config.workerClaimHeartbeatMs,
      workerClaimStaleTimeoutMs: config.workerClaimStaleTimeoutMs
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
    for (const [key, value] of Object.entries(originalConfig)) {
      setConfigOverride(key, value);
    }
  });

  it('cala com lote 1 — sem jobs 2..N não há o que expirar', () => {
    setConfigOverride('workerBatchSize', 1);
    setConfigOverride('workerClaimHeartbeatMs', 0);
    setConfigOverride('workerClaimStaleTimeoutMs', STALE_MS);

    warnIfClaimHeartbeatCannotHoldTheBatch();

    assert.deepEqual(warnings, []);
  });

  it('avisa quando o heartbeat está desligado com lote > 1', () => {
    setConfigOverride('workerBatchSize', 10);
    setConfigOverride('workerClaimHeartbeatMs', 0);
    setConfigOverride('workerClaimStaleTimeoutMs', STALE_MS);

    warnIfClaimHeartbeatCannotHoldTheBatch();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /EXECUTADOS DUAS VEZES/);
  });

  it('avisa quando o heartbeat é largo demais para a janela de stale', () => {
    setConfigOverride('workerBatchSize', 10);
    setConfigOverride('workerClaimHeartbeatMs', STALE_MS / 2);
    setConfigOverride('workerClaimStaleTimeoutMs', STALE_MS);

    warnIfClaimHeartbeatCannotHoldTheBatch();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /alto demais/);
  });

  it('cala na configuração de produção (15s de heartbeat para 300s de stale)', () => {
    setConfigOverride('workerBatchSize', 10);
    setConfigOverride('workerClaimHeartbeatMs', 15_000);
    setConfigOverride('workerClaimStaleTimeoutMs', 300_000);

    warnIfClaimHeartbeatCannotHoldTheBatch();

    assert.deepEqual(warnings, []);
  });
});
