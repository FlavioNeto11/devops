/**
 * API read-only do catálogo regulatório Transporte (PR-A2): GET /v1/transporte/regras,
 * /{code} e /{code}/historico contra o app REAL (createApp) e o Postgres local.
 *
 * Convenção de skip do PR-A1 (`tests/integration/transporte-regulatory-catalog.test.js`):
 * probe de conexão no `before` vira SKIP LIMPO por teste quando o banco está fora — a suíte
 * fica verde por skip, não vermelha por infraestrutura.
 *
 * As datas de fronteira (23/24-05-2026) são as do CIOT universal semeado no PR-A1 — dados
 * REAIS do catálogo, não fixture sintética.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createApp } from '../../src/app.js';
import { RULE_CODES } from '../../src/lib/transport/regulatory-types.js';
import { authHeaders } from '../helpers/sicat-token.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de API pulado (${dbUnavailableReason})`);
  return true;
}

async function getJson(path, headers = authHeaders()) {
  const response = await fetch(`${API_BASE}${path}`, { headers });
  const body = await response.json().catch(() => null);
  return { response, body };
}

before(async () => {
  try {
    await pool.connect().then((client) => client.release());
  } catch (error) {
    dbAvailable = false;
    dbUnavailableReason = (error && (error.message || error.code)) || String(error);
    return;
  }

  // Idempotentes: aplicam 021/022 e reconciliam as 26 regras TR-* se ainda não estiverem lá.
  await runMigrations();
  await ensureRegulatoryCatalogSeeded();

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

describe('GET /v1/transporte/regras — catálogo read-only', { concurrency: 1 }, () => {
  it('sem token responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;

    for (const path of [
      '/v1/transporte/regras',
      '/v1/transporte/regras/TR-CIOT-001',
      '/v1/transporte/regras/TR-CIOT-001/historico'
    ]) {
      const response = await fetch(`${API_BASE}${path}`);
      assert.equal(response.status, 401, `${path} deveria exigir Bearer`);
      await response.arrayBuffer().catch(() => {});
    }
  });

  it('lista as 26 regras SEMEADAS com a versão resolvida, sem vazar ids internos', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await getJson('/v1/transporte/regras?vigenteEm=2026-08-13');
    assert.equal(response.status, 200);
    assert.equal(body.referenceDate, '2026-08-13');
    // Banco de teste é COMPARTILHADO entre arquivos rodando em paralelo: outra suíte pode ter
    // uma regra transitória viva neste instante (ex.: TR-WATCHAPI-* de transporte-watch.test.js).
    // O invariante desta asserção é "as 26 regras do seed estão TODAS presentes, na ordem do
    // catálogo" — nunca "não existe mais nada no banco inteiro" (mesma lição do isolamento
    // piso × catálogo).
    assert.ok(body.totalItems >= RULE_CODES.length, `esperava >= ${RULE_CODES.length} regras, veio ${body.totalItems}`);
    const seededCodes = body.items
      .map((item) => item.code)
      .filter((code) => RULE_CODES.includes(code));
    assert.deepEqual(seededCodes, [...RULE_CODES]);

    const ciot = body.items.find((item) => item.code === 'TR-CIOT-001');
    assert.ok(ciot, 'TR-CIOT-001 ausente da lista');
    assert.equal(ciot.domain, 'CIOT');
    assert.equal(ciot.defaultGate, 'GATE_CIOT');
    assert.equal(ciot.currentVersion?.versionLabel, 'v2026-05-universal');
    assert.equal(ciot.currentVersion?.implementationState, 'ACTIVE');
    assert.equal(ciot.currentVersion?.blocking, false);
    // `version` (locking otimista) é parte do contrato: é o valor que o body de
    // POST .../versoes/{versionLabel}/promover exige — sem ele o frontend teria de adivinhar.
    assert.equal(typeof ciot.currentVersion?.version, 'number');
    assert.ok(ciot.currentVersion.version >= 1, 'version de locking otimista deve ser >= 1');

    // O contrato NÃO expõe ids internos randômicos nem source_hash — em nenhum nível.
    for (const forbidden of ['id', 'ruleId', 'sourceHash', 'createdAt', 'updatedAt']) {
      assert.ok(!(forbidden in ciot), `TransporteRegraResource não pode expor '${forbidden}'`);
      assert.ok(
        !(forbidden in ciot.currentVersion),
        `TransporteRegraVersaoResource não pode expor '${forbidden}'`
      );
    }
  });

  it('filtros domain/gate/implementationState restringem a lista', async (t) => {
    if (skipIfNoDb(t)) return;

    const byDomain = await getJson('/v1/transporte/regras?domain=CIOT&vigenteEm=2026-08-13');
    assert.equal(byDomain.response.status, 200);
    assert.equal(byDomain.body.totalItems, 5);
    assert.ok(byDomain.body.items.every((item) => item.domain === 'CIOT'));

    const byGate = await getJson('/v1/transporte/regras?gate=GATE_CIOT&vigenteEm=2026-08-13');
    assert.equal(byGate.response.status, 200);
    assert.ok(byGate.body.items.length > 0);
    assert.ok(byGate.body.items.every((item) => item.defaultGate === 'GATE_CIOT'));

    // `implementationState` filtra pela versão RESOLVIDA na data: em 2026-05-23 a versão vigente
    // do TR-CIOT-001 é a v2019-baseline (SUPERSEDED hoje, vigente então).
    const byState = await getJson(
      '/v1/transporte/regras?implementationState=SUPERSEDED&vigenteEm=2026-05-23'
    );
    assert.equal(byState.response.status, 200);
    assert.ok(
      byState.body.items.some((item) => item.code === 'TR-CIOT-001'),
      'TR-CIOT-001 deveria entrar no filtro SUPERSEDED em 2026-05-23'
    );
    assert.ok(byState.body.items.every(
      (item) => item.currentVersion?.implementationState === 'SUPERSEDED'
    ));
  });

  it('filtro fora do enum responde 400 problem+json com código estável', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await getJson('/v1/transporte/regras?domain=INVALIDO');
    assert.equal(response.status, 400);
    assert.match(String(response.headers.get('content-type')), /application\/problem\+json/);
    assert.equal(body.code, 'TRANSPORT_RULE_FILTER_INVALID');

    const badDate = await getJson('/v1/transporte/regras?vigenteEm=23-05-2026');
    assert.equal(badDate.response.status, 400);
    assert.equal(badDate.body.code, 'REGULATORY_REFERENCE_DATE_INVALID');
  });

  it('vigenteEm resolve a fronteira temporal do CIOT universal (23/24-05-2026)', async (t) => {
    if (skipIfNoDb(t)) return;

    const atBaseline = await getJson('/v1/transporte/regras/TR-CIOT-001?vigenteEm=2026-05-23');
    assert.equal(atBaseline.response.status, 200);
    assert.equal(atBaseline.body.code, 'TR-CIOT-001');
    assert.equal(atBaseline.body.currentVersion?.versionLabel, 'v2019-baseline');

    const atUniversal = await getJson('/v1/transporte/regras/TR-CIOT-001?vigenteEm=2026-05-24');
    assert.equal(atUniversal.response.status, 200);
    assert.equal(atUniversal.body.currentVersion?.versionLabel, 'v2026-05-universal');

    // Regra com vigência futura à data: a regra EXISTE (200), a versão resolvida é null.
    const future = await getJson('/v1/transporte/regras/TR-RNTRC-003?vigenteEm=2026-08-05');
    assert.equal(future.response.status, 200);
    assert.equal(future.body.currentVersion, null);
  });

  it('code inexistente responde 404 problem+json com TRANSPORT_RULE_NOT_FOUND', async (t) => {
    if (skipIfNoDb(t)) return;

    for (const path of [
      '/v1/transporte/regras/TR-NADA-999',
      '/v1/transporte/regras/TR-NADA-999/historico'
    ]) {
      const { response, body } = await getJson(path);
      assert.equal(response.status, 404, `${path} deveria responder 404`);
      assert.match(String(response.headers.get('content-type')), /application\/problem\+json/);
      assert.equal(body.code, 'TRANSPORT_RULE_NOT_FOUND');
    }
  });

  it('historico devolve TODAS as versões ordenadas por effectiveFrom crescente', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await getJson('/v1/transporte/regras/TR-CIOT-001/historico');
    assert.equal(response.status, 200);
    assert.equal(body.code, 'TR-CIOT-001');

    const labels = body.versions.map((version) => version.versionLabel);
    assert.ok(labels.includes('v2019-baseline') && labels.includes('v2026-05-universal'));

    const dates = body.versions.map((version) => version.effectiveFrom);
    assert.deepEqual(dates, [...dates].sort(), 'versões fora de ordem cronológica');

    const superseded = body.versions.find((version) => version.versionLabel === 'v2019-baseline');
    assert.equal(superseded.effectiveUntil, '2026-05-23');
    assert.equal(superseded.implementationState, 'SUPERSEDED');

    // Toda versão do histórico expõe `version` (locking otimista) — insumo do /promover.
    for (const version of body.versions) {
      assert.equal(
        typeof version.version,
        'number',
        `${version.versionLabel}: campo 'version' ausente no histórico`
      );
      assert.ok(version.version >= 1);
    }
  });
});
