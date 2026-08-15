/**
 * Worker `transporte.regulatory.watch_check` (PR-H1) — `processJob` REAL contra o Postgres local,
 * com `globalThis.fetch` monkeypatchado (molde `tests/worker/transporte-rntrc-verify.test.js`) —
 * NUNCA a rede real (`REGULATORY_WATCH_MODE` e o fetch são ambos controlados pelo teste).
 *
 * Handler SEM parâmetro `gateway` (molde `handleTransporteRntrcVerify`): `processJob(job, {})`.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { query, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { processJob } from '../../src/workers/operation-handlers.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { setConfigOverride } from '../../src/lib/config.js';

const originalFetch = globalThis.fetch;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function textResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => Buffer.from(body, 'utf8')
  };
}

function installFetchOnce(response) {
  globalThis.fetch = async () => {
    if (response instanceof Error) throw response;
    return response;
  };
}

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste pulado (${dbUnavailableReason})`);
  return true;
}

async function insertSource({ id, reference, sourceUrl, sourceHash = null, monitoringStatus = 'monitored' }) {
  await query(
    `insert into regulatory_sources (id, source_type, reference, title, source_url, source_hash, monitoring_status)
     values ($1, 'other', $2, $3, $4, $5, $6)`,
    [id, reference, `Título de teste ${reference}`, sourceUrl, sourceHash, monitoringStatus]
  );
}

/**
 * `entity_id` é ÚNICO POR JOB DE TESTE (não o literal `'global'` de produção) — o handler
 * `handleTransporteRegulatoryWatchCheck` nem lê `entityId`/`entityType` (só `correlationId`), e
 * usar um valor por teste evita colidir com o índice parcial `ux_jobs_active_entity_operation`
 * (entity_type, entity_id, operation) contra o job REAL de `entity_id='global'` que outra suíte
 * (`tests/api/transporte-watch.test.js`, disparo manual) possa ter em voo ao mesmo tempo.
 */
async function insertJobRow({ jobId, payload = {} }) {
  await query(
    `insert into jobs(
       job_id, command_id, entity_type, entity_id, operation, payload,
       status, max_attempts, attempts, correlation_id, started_at, claimed_at, claim_heartbeat_at, claimed_by
     ) values ($1,$2,'regulatory_watch_sweep',$3,'transporte.regulatory.watch_check',$4::jsonb,'running',3,1,$5,now(),now(),now(),'worker-test')`,
    [jobId, `cmd_${jobId}`, jobId, JSON.stringify(payload), `corr_${jobId}`]
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
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await query('delete from regulatory_watch_events where source_id like $1', ['regsrc_watchwrk_%']);
  await query('delete from regulatory_watch_items where source_id like $1', ['regsrc_watchwrk_%']);
  await query('delete from jobs where job_id like $1', ['job_watchwrk_%']);
  await query('delete from regulatory_sources where id like $1', ['regsrc_watchwrk_%']);
  setConfigOverride('regulatoryWatchMode', 'live');
  setConfigOverride('regulatoryWatchGatewayTimeoutMs', 2000);
  // Determinístico: o passo de IA SEMPRE cai em ai_skipped/ai_unavailable neste arquivo — a chamada
  // real de IA (com chave) é testada à parte, fora desta suíte (nunca toca a rede/OpenAI aqui).
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setConfigOverride('regulatoryWatchMode', undefined);
  setConfigOverride('regulatoryWatchGatewayTimeoutMs', undefined);
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

after(async () => {
  if (dbAvailable) {
    await query('delete from regulatory_watch_events where source_id like $1', ['regsrc_watchwrk_%']);
    await query('delete from regulatory_watch_items where source_id like $1', ['regsrc_watchwrk_%']);
    await query('delete from jobs where job_id like $1', ['job_watchwrk_%']);
    await query('delete from regulatory_sources where id like $1', ['regsrc_watchwrk_%']);
  }
  await pool.end();
});

describe('worker transporte.regulatory.watch_check — mudança detectada', () => {
  it('cria item detected→ingested→ai_skipped→human_review + eventos, na ordem certa', async (t) => {
    if (skipIfNoDb(t)) return;

    const sourceId = 'regsrc_watchwrk_changed';
    const body = '<html>Resolução ANTT de teste — versão nova</html>';
    await insertSource({ id: sourceId, reference: 'REGSRC-WATCHWRK-CHANGED', sourceUrl: 'https://fixture.invalid/norma-changed' });
    await insertJobRow({ jobId: 'job_watchwrk_changed' });
    installFetchOnce(textResponse(body));

    const job = await findJobById('job_watchwrk_changed');
    await processJob(job, {});

    const updatedJob = await findJobById('job_watchwrk_changed');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'regulatory_watch_check_completed');
    assert.equal(updatedJob.payload.changesDetected, 1);
    assert.equal(updatedJob.payload.errors, 0);

    const itemsRes = await query('select * from regulatory_watch_items where source_id = $1', [sourceId]);
    assert.equal(itemsRes.rows.length, 1, 'exatamente UM item criado para a mudança');
    const item = itemsRes.rows[0];
    assert.equal(item.status, 'human_review');
    assert.equal(item.detected_change.previousHash, null);
    assert.equal(item.detected_change.newHash, sha256(body));
    assert.equal(item.detected_change.httpStatus, 200);
    assert.ok(item.ingested_content_ref, 'ingested_content_ref deveria apontar para o storage');
    assert.deepEqual(item.ai_analysis, {});
    assert.equal(item.reviewed_by, null, 'nenhuma decisão humana ainda — reviewed_by continua null');

    const eventsRes = await query(
      'select event_type from regulatory_watch_events where watch_item_id = $1 order by created_at asc, id asc',
      [item.id]
    );
    assert.deepEqual(
      eventsRes.rows.map((row) => row.event_type),
      ['detected', 'ingested', 'ai_skipped', 'human_review']
    );

    // source_hash NÃO muda na detecção — só em `aplicar` (senão perderíamos a capacidade de
    // detectar a MESMA mudança de novo caso o item seja rejeitado).
    const sourceRes = await query('select source_hash from regulatory_sources where id = $1', [sourceId]);
    assert.equal(sourceRes.rows[0].source_hash, null);
  });

  it('retry do job (mesma mudança, source_hash ainda não aplicado) NÃO duplica o item — já_tracked', async (t) => {
    if (skipIfNoDb(t)) return;

    const sourceId = 'regsrc_watchwrk_retry';
    const body = '<html>norma que será verificada duas vezes</html>';
    await insertSource({ id: sourceId, reference: 'REGSRC-WATCHWRK-RETRY', sourceUrl: 'https://fixture.invalid/norma-retry' });

    await insertJobRow({ jobId: 'job_watchwrk_retry1' });
    installFetchOnce(textResponse(body));
    await processJob(await findJobById('job_watchwrk_retry1'), {});

    await insertJobRow({ jobId: 'job_watchwrk_retry2' });
    installFetchOnce(textResponse(body));
    const secondRun = await findJobById('job_watchwrk_retry2');
    await processJob(secondRun, {});

    const updatedSecond = await findJobById('job_watchwrk_retry2');
    assert.equal(updatedSecond.payload.changesDetected, 0);
    assert.equal(updatedSecond.payload.alreadyTracked, 1);

    const itemsRes = await query('select count(*)::int as count from regulatory_watch_items where source_id = $1', [sourceId]);
    assert.equal(itemsRes.rows[0].count, 1, 'a segunda varredura não deveria criar um SEGUNDO item para a mesma mudança pendente');
  });
});

describe('worker transporte.regulatory.watch_check — sem mudança', () => {
  it('hash igual ao source_hash conhecido → SÓ o evento check_run_no_change, sem item novo', async (t) => {
    if (skipIfNoDb(t)) return;

    const sourceId = 'regsrc_watchwrk_nochange';
    const body = '<html>norma estável</html>';
    const knownHash = sha256(body);
    await insertSource({ id: sourceId, reference: 'REGSRC-WATCHWRK-NOCHANGE', sourceUrl: 'https://fixture.invalid/norma-estavel', sourceHash: knownHash });
    await insertJobRow({ jobId: 'job_watchwrk_nochange' });
    installFetchOnce(textResponse(body));

    const job = await findJobById('job_watchwrk_nochange');
    await processJob(job, {});

    const updatedJob = await findJobById('job_watchwrk_nochange');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.noChange, 1);
    assert.equal(updatedJob.payload.changesDetected, 0);

    const itemsRes = await query('select count(*)::int as count from regulatory_watch_items where source_id = $1', [sourceId]);
    assert.equal(itemsRes.rows[0].count, 0, 'sem mudança, NENHUM item deveria ser criado');

    const eventsRes = await query(
      'select watch_item_id, event_type, detail from regulatory_watch_events where source_id = $1',
      [sourceId]
    );
    assert.equal(eventsRes.rows.length, 1);
    assert.equal(eventsRes.rows[0].watch_item_id, null);
    assert.equal(eventsRes.rows[0].event_type, 'check_run_no_change');
    assert.equal(eventsRes.rows[0].detail.contentHash, knownHash);
  });
});

describe('worker transporte.regulatory.watch_check — REGULATORY_WATCH_MODE=off', () => {
  it('termina como NO-OP limpo, sem consultar fontes nem tocar a rede', async (t) => {
    if (skipIfNoDb(t)) return;

    setConfigOverride('regulatoryWatchMode', 'off');
    const sourceId = 'regsrc_watchwrk_off';
    await insertSource({ id: sourceId, reference: 'REGSRC-WATCHWRK-OFF', sourceUrl: 'https://fixture.invalid/norma-off' });
    await insertJobRow({ jobId: 'job_watchwrk_off' });
    globalThis.fetch = async () => {
      throw new Error('fetch NÃO deveria ser chamado com REGULATORY_WATCH_MODE=off');
    };

    const job = await findJobById('job_watchwrk_off');
    await processJob(job, {});

    const updatedJob = await findJobById('job_watchwrk_off');
    assert.equal(updatedJob.status, 'succeeded');
    assert.equal(updatedJob.payload.outcome, 'regulatory_watch_skipped_mode_off');
    assert.equal(updatedJob.payload.sourcesChecked, 0);
  });
});

describe('worker transporte.regulatory.watch_check — múltiplas fontes, uma fonte fora do ar', () => {
  it('uma fonte com erro de rede NÃO derruba a varredura das demais nem o job', async (t) => {
    if (skipIfNoDb(t)) return;

    const okSourceId = 'regsrc_watchwrk_multi_ok';
    const brokenSourceId = 'regsrc_watchwrk_multi_broken';
    await insertSource({ id: okSourceId, reference: 'REGSRC-WATCHWRK-MULTI-A', sourceUrl: 'https://fixture.invalid/multi-ok' });
    await insertSource({ id: brokenSourceId, reference: 'REGSRC-WATCHWRK-MULTI-B', sourceUrl: 'https://fixture.invalid/multi-broken' });
    await insertJobRow({ jobId: 'job_watchwrk_multi' });

    const body = '<html>fonte saudável</html>';
    let call = 0;
    globalThis.fetch = async () => {
      call += 1;
      if (call === 1) return textResponse(body);
      throw new TypeError('fetch failed');
    };

    const job = await findJobById('job_watchwrk_multi');
    await processJob(job, {});

    const updatedJob = await findJobById('job_watchwrk_multi');
    assert.equal(updatedJob.status, 'succeeded', 'o job inteiro NÃO deveria falhar por causa de uma fonte');
    assert.equal(updatedJob.payload.sourcesChecked, 2);
    assert.equal(updatedJob.payload.errors, 1);
    assert.equal(updatedJob.payload.changesDetected, 1);
  });
});
