/**
 * API do Regulatory Watch (PR-H1): `GET /v1/transporte/watch`, `GET .../watch/{itemId}`,
 * `POST .../watch/{itemId}/revisar`, `POST .../watch/{itemId}/aplicar`,
 * `POST .../watch/verificar-agora` — contra o app REAL (`createApp`) e o Postgres local.
 *
 * Foco na CAMADA HTTP (validação, estado, 401/400/409, contrato) — o pipeline de DETECÇÃO do
 * worker (fetch → hash → detected/ingested/ai_analyzed ou ai_skipped/human_review) é coberto em
 * `tests/worker/transporte-regulatory-watch.test.js`; aqui os itens em `human_review`/`approved`
 * são semeados DIRETO no banco (molde `tests/api/transporte-conformidade.test.js`), sem depender
 * do worker rodar.
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
const SOURCE_ID = `regsrc_watchapi_${RUN_ID}`;
const RULE_ID = `regrule_watchapi_${RUN_ID}`;
const RULE_CODE = `TR-WATCHAPI-${RUN_ID}`;
const PROMOTABLE_VERSION_ID = createPrefixedId('regrulev');
const DRAFT_VERSION_ID = createPrefixedId('regrulev');

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

/** Insere um item DIRETO no banco, no status pedido — molde `tests/api/transporte-conformidade.test.js` (força estado no banco de teste). */
async function insertWatchItem({ status, newHash, reviewedBy = null, reviewedAt = null }) {
  const id = createPrefixedId('regwatch');
  await query(
    `insert into regulatory_watch_items (
       id, source_id, status, detected_change, ingested_content_ref, correlation_id, reviewed_by, reviewed_at
     ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
    [
      id,
      SOURCE_ID,
      status,
      JSON.stringify({ previousHash: null, newHash, httpStatus: 200 }),
      `/tmp/fake-content-${id}`,
      `corr_${id}`,
      reviewedBy,
      reviewedAt
    ]
  );
  return id;
}

async function insertWatchEvent(itemId, eventType) {
  await query(
    `insert into regulatory_watch_events (id, watch_item_id, source_id, event_type, correlation_id)
     values ($1, $2, $3, $4, $5)`,
    [createPrefixedId('regwev'), itemId, SOURCE_ID, eventType, `corr_${itemId}`]
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
    `insert into regulatory_sources (id, source_type, reference, title, source_url, monitoring_status)
     values ($1, 'other', $2, 'Fonte de teste — API Watch', 'https://fixture.invalid/watchapi', 'monitored')`,
    [SOURCE_ID, `REGSRC-WATCHAPI-${RUN_ID}`]
  );
  await query(
    `insert into regulatory_rules (id, code, domain, title, description, default_gate, display_order)
     values ($1, $2, 'COMP', 'Regra de teste — API Watch', '', 'GATE_COMPLETION', 999)`,
    [RULE_ID, RULE_CODE]
  );

  // Duas versões da regra de teste — janelas DISJUNTAS (não violam
  // `excl_regrulev_no_temporal_overlap`): uma ACTIVE (fechada em 2020) para o caminho feliz da
  // promoção, outra DRAFT (aberta a partir de 2021) para provar o 409 REGULATORY_RULE_VERSION_NOT_ACTIVE.
  await query(
    `insert into regulatory_rule_versions (id, rule_id, version_label, summary, effective_from, effective_until, implementation_state, blocking, severity)
     values ($1, $2, 'v-test-promote-active', 'versão de teste — promoção', '2020-01-01', '2020-12-31', 'ACTIVE', false, 'warning')`,
    [PROMOTABLE_VERSION_ID, RULE_ID]
  );
  await query(
    `insert into regulatory_rule_versions (id, rule_id, version_label, summary, effective_from, effective_until, implementation_state, blocking, severity)
     values ($1, $2, 'v-test-promote-draft', 'versão de teste — não-ACTIVE', '2021-01-01', '2021-12-31', 'DRAFT', false, 'warning')`,
    [DRAFT_VERSION_ID, RULE_ID]
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
    await query('delete from jobs where entity_id = $1 and entity_type = $2', ['global', 'regulatory_watch_sweep']);
    await query('delete from regulatory_rule_versions where rule_id = $1', [RULE_ID]);
    await query('delete from regulatory_rules where id = $1', [RULE_ID]);
    await query('delete from regulatory_sources where id = $1', [SOURCE_ID]);
  }
  await pool.end();
});

describe('GET /v1/transporte/watch', () => {
  it('sem token responde 401', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/watch`);
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('filtra por status e devolve os itens semeados', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'human_review', newHash: 'hash-list-1' });

    const { response, body } = await callApi('GET', '/v1/transporte/watch?status=human_review&pageSize=200');
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.items.some((item) => item.id === itemId));
    assert.ok(body.items.every((item) => item.status === 'human_review'));
  });

  it('status inválido → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', '/v1/transporte/watch?status=nao_existe');
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_STATUS_INVALID');
  });
});

describe('GET /v1/transporte/watch/{itemId}', () => {
  it('devolve o item com a trilha de eventos em ordem cronológica', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'ingested', newHash: 'hash-detail-1' });
    await insertWatchEvent(itemId, 'detected');
    await insertWatchEvent(itemId, 'ingested');

    const { response, body } = await callApi('GET', `/v1/transporte/watch/${itemId}`);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.id, itemId);
    assert.deepEqual(body.events.map((event) => event.eventType), ['detected', 'ingested']);
  });

  it('item inexistente → 404', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('GET', '/v1/transporte/watch/regwatch_inexistente');
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_ITEM_NOT_FOUND');
  });
});

describe('POST /v1/transporte/watch/{itemId}/revisar', () => {
  it('decision inválida → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'human_review', newHash: 'hash-revisar-invalid' });
    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/revisar`, {
      body: { decision: 'talvez', version: 1 }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_DECISION_INVALID');
  });

  it('item fora de human_review → 409', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'detected', newHash: 'hash-revisar-wrongstate' });
    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/revisar`, {
      body: { decision: 'approved', version: 1 }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_ITEM_NOT_REVIEWABLE');
  });

  it('approved: grava reviewedBy/reviewedAt e transiciona status; version divergente → 409 na 2ª chamada', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'human_review', newHash: 'hash-revisar-ok' });

    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/revisar`, {
      body: { decision: 'approved', notes: 'Confirmado contra o DOU.', version: 1 }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'approved');
    assert.equal(body.reviewedBy, 'usr_test_route_guard');
    assert.ok(body.reviewedAt);
    assert.equal(body.humanReviewNotes, 'Confirmado contra o DOU.');

    const retry = await callApi('POST', `/v1/transporte/watch/${itemId}/revisar`, {
      body: { decision: 'approved', version: 1 }
    });
    assert.equal(retry.response.status, 409, JSON.stringify(retry.body));
  });

  it('rejected: item some do fluxo (nunca gera versão de regra)', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'human_review', newHash: 'hash-revisar-rejected' });
    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/revisar`, {
      body: { decision: 'rejected', notes: 'Falso positivo.', version: 1 }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'rejected');

    const applyAttempt = await callApi('POST', `/v1/transporte/watch/${itemId}/aplicar`, {
      body: {
        ruleCode: RULE_CODE,
        versionLabel: 'v-nao-deveria-existir',
        effectiveFrom: '2030-01-01',
        implementationState: 'ACTIVE',
        summary: 'não deveria aplicar'
      }
    });
    assert.equal(applyAttempt.response.status, 409);
    assert.equal(applyAttempt.body.code, 'REGULATORY_WATCH_ITEM_NOT_APPLICABLE');
  });
});

describe('POST /v1/transporte/watch/{itemId}/aplicar', () => {
  it('item não-approved → 409', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({ status: 'human_review', newHash: 'hash-aplicar-wrongstate' });
    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/aplicar`, {
      body: { ruleCode: RULE_CODE, versionLabel: 'v1', effectiveFrom: '2030-01-01', implementationState: 'ACTIVE', summary: 'x' }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_ITEM_NOT_APPLICABLE');
  });

  it('campos obrigatórios ausentes → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({
      status: 'approved',
      newHash: 'hash-aplicar-missingfields',
      reviewedBy: 'usr_test_route_guard',
      reviewedAt: new Date().toISOString()
    });
    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/aplicar`, { body: {} });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_WATCH_FIELD_REQUIRED');
  });

  it('sucesso: cria versão SEMPRE blocking=false (mesmo mandando blocking:true no body), aplica o item e atualiza source_hash', async (t) => {
    if (skipIfNoDb(t)) return;
    const itemId = await insertWatchItem({
      status: 'approved',
      newHash: 'hash-aplicar-success',
      reviewedBy: 'usr_test_route_guard',
      reviewedAt: new Date().toISOString()
    });

    const { response, body } = await callApi('POST', `/v1/transporte/watch/${itemId}/aplicar`, {
      body: {
        ruleCode: RULE_CODE,
        versionLabel: 'v-aplicar-teste',
        effectiveFrom: '2030-01-01',
        implementationState: 'ACTIVE',
        summary: 'Versão criada pelo teste de API do Regulatory Watch.',
        legalBasisAdditions: [{ reference: 'Res. ANTT de teste 0001/2030' }],
        // `blocking` é ignorado pelo service — a asserção abaixo prova isso.
        blocking: true
      }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ruleVersion.blocking, false, 'a versão criada NUNCA nasce blocking, mesmo se o body pedir');
    assert.equal(body.ruleVersion.ruleCode, RULE_CODE);
    assert.equal(body.watchItem.status, 'active_applied');
    assert.equal(body.watchItem.appliedRuleVersionId, body.ruleVersion.id);

    const versionRes = await query('select blocking, reviewed_by, reviewed_at from regulatory_rule_versions where id = $1', [body.ruleVersion.id]);
    assert.equal(versionRes.rows[0].blocking, false);
    assert.equal(versionRes.rows[0].reviewed_by, null, 'reviewed_by só é preenchido pela PROMOÇÃO administrativa, nunca por aplicar');

    const sourceRes = await query('select source_hash from regulatory_sources where id = $1', [SOURCE_ID]);
    assert.equal(sourceRes.rows[0].source_hash, 'hash-aplicar-success');
  });
});

describe('POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover', () => {
  it('sem token responde 401', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-active/promover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocking: true, reviewNotes: 'x', version: 1 })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('sem reviewNotes → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-active/promover`, {
      body: { blocking: true, version: 1 }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_RULE_PROMOTION_REVIEW_NOTES_REQUIRED');
  });

  it('blocking ausente/não-boolean → 400', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-active/promover`, {
      body: { reviewNotes: 'x', version: 1 }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_RULE_PROMOTION_BLOCKING_REQUIRED');
  });

  it('code/versionLabel inexistente → 404', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-nao-existe/promover`, {
      body: { blocking: true, reviewNotes: 'x', version: 1 }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_RULE_VERSION_NOT_FOUND');
  });

  it('versão não-ACTIVE (DRAFT) → 409 REGULATORY_RULE_VERSION_NOT_ACTIVE', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-draft/promover`, {
      body: { blocking: true, reviewNotes: 'x', version: 1 }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_RULE_VERSION_NOT_ACTIVE');
  });

  it('version divergente → 409 REGULATORY_RULE_VERSION_CONFLICT', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-active/promover`, {
      body: { blocking: true, reviewNotes: 'x', version: 999 }
    });
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'REGULATORY_RULE_VERSION_CONFLICT');
  });

  it('sucesso: promove a bloqueante com reviewedBy/reviewedAt preenchidos (fluxo completo)', async (t) => {
    if (skipIfNoDb(t)) return;
    const { response, body } = await callApi('POST', `/v1/transporte/regras/${RULE_CODE}/versoes/v-test-promote-active/promover`, {
      body: { blocking: true, reviewNotes: 'Confirmado com jurídico — teste automatizado.', version: 1 }
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ruleCode, RULE_CODE);
    assert.equal(body.versionLabel, 'v-test-promote-active');
    assert.equal(body.blocking, true);
    assert.equal(body.reviewedBy, 'usr_test_route_guard');
    assert.ok(body.reviewedAt);
    assert.equal(body.version, 2, 'version deve incrementar (trigger increment_version)');

    const versionRes = await query(
      'select blocking, reviewed_by, reviewed_at, implementation_state from regulatory_rule_versions where id = $1',
      [PROMOTABLE_VERSION_ID]
    );
    assert.equal(versionRes.rows[0].blocking, true);
    assert.ok(versionRes.rows[0].reviewed_by);
    assert.ok(versionRes.rows[0].reviewed_at);
    assert.equal(versionRes.rows[0].implementation_state, 'ACTIVE');
  });
});

describe('POST /v1/transporte/watch/verificar-agora', () => {
  it('sem token responde 401', async (t) => {
    if (skipIfNoDb(t)) return;
    const response = await fetch(`${API_BASE}/v1/transporte/watch/verificar-agora`, { method: 'POST' });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('202 CommandAccepted; idempotência via Idempotency-Key devolve o MESMO job', async (t) => {
    if (skipIfNoDb(t)) return;
    const idempotencyKey = `idem-watch-${randomBytes(6).toString('hex')}`;

    const first = await callApi('POST', '/v1/transporte/watch/verificar-agora', {
      headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey }
    });
    assert.equal(first.response.status, 202, JSON.stringify(first.body));
    assert.equal(first.body.operation, 'transporte.regulatory.watch_check');
    assert.equal(first.body.status, 'queued');
    assert.ok(first.body.jobId?.startsWith('job_'));

    const second = await callApi('POST', '/v1/transporte/watch/verificar-agora', {
      headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey }
    });
    assert.equal(second.response.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.jobId, first.body.jobId, 'mesma Idempotency-Key deve devolver o MESMO job');
  });
});
