import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { resolveRuleVersionAt, getRuleByCode, listRuleVersions } from '../../src/repositories/regulatory-repo.js';
import { RULE_CODES } from '../../src/lib/transport/regulatory-types.js';
import { createPrefixedId } from '../../src/lib/ids.js';

/**
 * Integração do catálogo regulatório Transporte (PR-A1): migrations 021/022 + seed idempotente +
 * constraints de banco (exclusion temporal e blocking×reviewed) + resolução temporal via banco.
 *
 * Banco: o mesmo Postgres local da suíte (docker compose, serviço `postgres`;
 * `DATABASE_URL` default `postgres://postgres:postgres@localhost:5432/mtr_automation`).
 * A suíte de integração existente NÃO tem convenção de skip (o probe `pool.connect()` no
 * `before` derruba o arquivo inteiro quando o banco está fora); aqui o probe vira SKIP LIMPO
 * por teste — sem banco, a suíte continua verde em vez de vermelha por infraestrutura.
 */

const TEST_LABEL_PREFIX = 'v-test-';

let dbAvailable = true;
let dbUnavailableReason = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de integração pulado (${dbUnavailableReason})`);
  return true;
}

before(async () => {
  try {
    await pool.connect().then((client) => client.release());
  } catch (error) {
    dbAvailable = false;
    // ECONNREFUSED chega como AggregateError com message vazia — o code é mais informativo.
    dbUnavailableReason = (error && (error.message || error.code)) || String(error);
    return;
  }
  // Idempotente via schema_migrations: aplica 021/022 se (e só se) ainda não aplicadas.
  await runMigrations();
});

after(async () => {
  if (dbAvailable) {
    await query('delete from regulatory_rule_versions where version_label like $1', [`${TEST_LABEL_PREFIX}%`]);
  }
  await pool.end();
});

describe('Transporte — catálogo regulatório (integração)', () => {
  it('migrations 021/022 aplicam: tabelas e extensão btree_gist presentes', async (t) => {
    if (skipIfNoDb(t)) return;

    const tables = await query(
      `select
         to_regclass('regulatory_sources') as regulatory_sources,
         to_regclass('regulatory_rules') as regulatory_rules,
         to_regclass('regulatory_rule_versions') as regulatory_rule_versions,
         to_regclass('freight_floor_versions') as freight_floor_versions,
         to_regclass('freight_floor_coefficients') as freight_floor_coefficients`
    );
    for (const [table, regclass] of Object.entries(tables.rows[0])) {
      assert.ok(regclass, `tabela ${table} não existe — migration não aplicou`);
    }

    const extension = await query("select 1 from pg_extension where extname = 'btree_gist'");
    assert.equal(extension.rowCount, 1, 'extensão btree_gist ausente — exclusion constraint não sustenta');

    // O invariante "piso nasce VAZIO" (pendência P3: coeficiente só com revisão humana) é sobre o
    // SEED, não sobre o estado global da tabela: num banco de teste persistente, outra suíte pode
    // ter rodado o loader MANUAL legitimamente (tests/regulatory/freight-floor-engine.test.js).
    // Cobertura do invariante: meta-guarda 4 em tests/regulatory/rule-catalog-invariants.test.js
    // (statements do seed) + o delta em torno do seed no teste de idempotência abaixo.
  });

  it('seed roda 2x e é idempotente (contagens iguais, nenhuma duplicata, 26 códigos)', async (t) => {
    if (skipIfNoDb(t)) return;

    // Delta do piso em torno do seed: o seed não pode criar NEM remover linhas de piso,
    // independentemente de quantas existam no banco compartilhado (forma estado-independente
    // do antigo assert `count = 0`, que quebrava por ordem de execução dos arquivos de teste).
    const floorBefore = await query(
      `select
         (select count(*)::int from freight_floor_versions) as versions,
         (select count(*)::int from freight_floor_coefficients) as coefficients`
    );

    await ensureRegulatoryCatalogSeeded();
    const first = await query(
      `select
         (select count(*)::int from regulatory_sources) as sources,
         (select count(*)::int from regulatory_rules) as rules,
         (select count(*)::int from regulatory_rule_versions) as versions`
    );

    await ensureRegulatoryCatalogSeeded();
    const second = await query(
      `select
         (select count(*)::int from regulatory_sources) as sources,
         (select count(*)::int from regulatory_rules) as rules,
         (select count(*)::int from regulatory_rule_versions) as versions`
    );

    assert.deepEqual(second.rows[0], first.rows[0], 'segunda execução do seed alterou contagens');

    const floorAfter = await query(
      `select
         (select count(*)::int from freight_floor_versions) as versions,
         (select count(*)::int from freight_floor_coefficients) as coefficients`
    );
    assert.deepEqual(
      floorAfter.rows[0],
      floorBefore.rows[0],
      'o seed regulatório tocou tabelas de piso — coeficiente só entra com revisão humana (P3), nunca via seed'
    );

    const duplicates = await query(
      `select 'source' as kind, reference as key from regulatory_sources group by reference having count(*) > 1
       union all
       select 'rule', code from regulatory_rules group by code having count(*) > 1
       union all
       select 'version', rule_id || ':' || version_label from regulatory_rule_versions
        group by rule_id, version_label having count(*) > 1`
    );
    assert.equal(duplicates.rowCount, 0, `duplicatas após reseed: ${JSON.stringify(duplicates.rows)}`);

    const codes = await query('select code from regulatory_rules order by display_order asc, code asc');
    assert.deepEqual(codes.rows.map((row) => row.code), [...RULE_CODES]);

    const blocking = await query('select count(*)::int as count from regulatory_rule_versions where blocking = true');
    assert.equal(blocking.rows[0].count, 0, 'nenhuma versão pode nascer bloqueante (regra de ouro)');
  });

  it('exclusion constraint rejeita versão com vigência sobreposta da mesma regra (23P01)', async (t) => {
    if (skipIfNoDb(t)) return;

    const rule = await getRuleByCode('TR-CIOT-001');
    assert.ok(rule, 'TR-CIOT-001 não semeada');

    // Janela 2026-01-01..aberta cruza as DUAS versões existentes (…2026-05-23 e 2026-05-24…).
    await assert.rejects(
      query(
        `insert into regulatory_rule_versions (
           id, rule_id, version_label, summary, effective_from, implementation_state, blocking, severity
         ) values ($1, $2, $3, 'sobreposição proposital de teste', '2026-01-01'::date, 'DRAFT', false, 'info')`,
        [createPrefixedId('regrulev'), rule.id, `${TEST_LABEL_PREFIX}overlap`]
      ),
      (error) => error.code === '23P01',
      'esperava exclusion_violation (23P01) para janela sobreposta'
    );

    // Janela DISJUNTA (anterior a 2019-01-28) é aceita — a constraint barra sobreposição, não versão nova.
    const disjointId = createPrefixedId('regrulev');
    await query(
      `insert into regulatory_rule_versions (
         id, rule_id, version_label, summary, effective_from, effective_until, implementation_state, blocking, severity
       ) values ($1, $2, $3, 'janela disjunta de teste', '2018-01-01'::date, '2019-01-27'::date, 'DRAFT', false, 'info')`,
      [disjointId, rule.id, `${TEST_LABEL_PREFIX}disjoint`]
    );
    await query('delete from regulatory_rule_versions where id = $1', [disjointId]);
  });

  it('chk_regrulev_blocking_reviewed rejeita ACTIVE+blocking sem revisão humana (23514)', async (t) => {
    if (skipIfNoDb(t)) return;

    const rule = await getRuleByCode('TR-CIOT-001');
    assert.ok(rule);

    await assert.rejects(
      query(
        `update regulatory_rule_versions
            set blocking = true
          where rule_id = $1 and version_label = 'v2026-05-universal'`,
        [rule.id]
      ),
      (error) => error.code === '23514',
      'esperava check_violation (23514): ACTIVE+blocking exige reviewed_by/reviewed_at'
    );

    // Controle: COM revisão humana o mesmo update passa — dentro de transação com ROLLBACK para
    // não deixar decisão de operador fabricada no catálogo semeado.
    const client = await pool.connect();
    try {
      await client.query('begin');
      const reviewed = await client.query(
        `update regulatory_rule_versions
            set blocking = true, reviewed_by = 'integration-test', reviewed_at = now()
          where rule_id = $1 and version_label = 'v2026-05-universal'`,
        [rule.id]
      );
      assert.equal(reviewed.rowCount, 1);
      await client.query('rollback');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  it('resolveRuleVersionAt via banco nas 3 datas de fronteira do CIOT universal', async (t) => {
    if (skipIfNoDb(t)) return;

    assert.equal((await resolveRuleVersionAt('TR-CIOT-001', '2026-05-23'))?.versionLabel, 'v2019-baseline');
    assert.equal((await resolveRuleVersionAt('TR-CIOT-001', '2026-05-24'))?.versionLabel, 'v2026-05-universal');
    assert.equal((await resolveRuleVersionAt('TR-CIOT-001', '2026-05-25'))?.versionLabel, 'v2026-05-universal');

    // Regra com vigência futura não vale antes da data (mesma fronteira do teste puro).
    assert.equal(await resolveRuleVersionAt('TR-RNTRC-003', '2026-08-05'), null);

    // E as versões vêm ordenadas por vigência crescente (contrato do repositório).
    const versions = await listRuleVersions({ code: 'TR-CIOT-001' });
    assert.deepEqual(versions.map((version) => version.versionLabel), ['v2019-baseline', 'v2026-05-universal']);
  });
});
