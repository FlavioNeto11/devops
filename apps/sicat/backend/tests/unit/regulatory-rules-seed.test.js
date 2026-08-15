import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATOR_OWNED_COLUMNS,
  RULE_UPDATE_COLUMNS,
  RULE_VERSION_UPDATE_COLUMNS,
  SOURCE_UPDATE_COLUMNS,
  buildRegulatoryCatalogSeed,
  buildRegulatoryCatalogSeedStatements
} from '../../src/bootstrap/regulatory-rules-seed.js';
import { RULE_CODES } from '../../src/lib/transport/regulatory-types.js';

/**
 * Invariantes do seed do catálogo regulatório Transporte (PR-A1) — todas PURAS, sem banco.
 *
 * O que se afirma aqui é sobre o SQL que REALMENTE vai ao banco (molde:
 * `access-control-invariants.test.js` / `access-control-seed.ts`): nenhum `delete`, todo insert
 * com `on conflict` em chave natural, campos de decisão do operador (`implementation_state`,
 * `blocking`, `reviewed_by`, `reviewed_at`, ...) FORA de todo `do update`, e toda versão
 * nascendo com o literal `blocking = false`.
 */

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Colunas atribuídas no `do update set` (assignments são `col = excluded.col`, sem vírgula interna). */
function updatedColumnsOf(sql) {
  const normalized = normalizeSql(sql);
  const at = normalized.indexOf('do update set ');
  if (at < 0) return [];
  return normalized
    .slice(at + 'do update set '.length)
    .split(',')
    .map((assignment) => assignment.split('=')[0].trim());
}

/** Mapa coluna → expressão do `insert ... select` de versão (listas planas, sem parêntese aninhado). */
function versionInsertBindings(sql) {
  const normalized = normalizeSql(sql);
  const columnsMatch = normalized.match(/insert into regulatory_rule_versions \( (.+?) \) select /);
  assert.ok(columnsMatch, `insert de versão mudou de forma: ${normalized}`);

  const columns = columnsMatch[1].split(',').map((column) => column.trim());
  const selectStart = normalized.indexOf(' select ') + ' select '.length;
  const selectEnd = normalized.indexOf(' from regulatory_rules');
  assert.ok(selectEnd > selectStart, `select de versão mudou de forma: ${normalized}`);

  const values = normalized.slice(selectStart, selectEnd).split(',').map((value) => value.trim());
  assert.equal(columns.length, values.length, 'insert de versão desalinhado (colunas × valores)');

  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
}

describe('regulatory-rules-seed — estrutura declarativa', () => {
  const seed = buildRegulatoryCatalogSeed();

  it('tem exatamente as 26 regras TR-*, únicas e na ordem de RULE_CODES', () => {
    const codes = seed.rules.map((rule) => rule.code);
    assert.equal(codes.length, 26);
    assert.equal(new Set(codes).size, 26, 'há code duplicado no seed');
    assert.deepEqual(codes, [...RULE_CODES]);
  });

  it('TR-CIOT-001 tem 2 versões com vigências que NÃO se sobrepõem (fronteira 23/24-05-2026)', () => {
    const rule = seed.rules.find((entry) => entry.code === 'TR-CIOT-001');
    assert.ok(rule, 'TR-CIOT-001 sumiu do seed');
    assert.equal(rule.versions.length, 2);

    const v2019 = rule.versions.find((version) => version.versionLabel === 'v2019-baseline');
    const v2026 = rule.versions.find((version) => version.versionLabel === 'v2026-05-universal');
    assert.ok(v2019 && v2026, 'os rótulos das versões de TR-CIOT-001 mudaram');

    assert.equal(v2019.effectiveFrom, '2019-01-28');
    assert.equal(v2019.effectiveUntil, '2026-05-23');
    assert.equal(v2019.implementationState, 'SUPERSEDED');
    assert.equal(v2026.effectiveFrom, '2026-05-24');
    assert.equal(v2026.effectiveUntil ?? null, null);
    assert.equal(v2026.implementationState, 'ACTIVE');
    assert.equal(v2026.severity, 'critical');
  });

  it('as demais 25 regras têm exatamente 1 versão (v2026-08-baseline)', () => {
    for (const rule of seed.rules) {
      if (rule.code === 'TR-CIOT-001') continue;
      assert.equal(rule.versions.length, 1, `${rule.code} deveria ter 1 versão`);
      assert.equal(rule.versions[0].versionLabel, 'v2026-08-baseline', rule.code);
    }
  });

  it('NENHUMA versão declara blocking — a estrutura nem carrega o campo (nasce false no SQL)', () => {
    for (const rule of seed.rules) {
      for (const version of rule.versions) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(version, 'blocking'),
          false,
          `${rule.code}/${version.versionLabel}: o seed declarativo não pode carregar 'blocking' — `
            + 'promoção a bloqueante é decisão do operador, nunca do seed'
        );
      }
    }
  });
});

describe('regulatory-rules-seed — SQL gerado', () => {
  const statements = buildRegulatoryCatalogSeedStatements();

  it('gera 13 fontes + 26 regras + 27 versões, todas insert com on conflict, nenhum delete', () => {
    const sources = statements.filter((statement) => statement.name.startsWith('source:'));
    const rules = statements.filter((statement) => statement.name.startsWith('rule:'));
    const versions = statements.filter((statement) => statement.name.startsWith('rule-version:'));

    assert.equal(sources.length, 13);
    assert.equal(rules.length, 26);
    assert.equal(versions.length, 27, '26 baselines + a segunda versão de TR-CIOT-001');
    assert.equal(statements.length, sources.length + rules.length + versions.length);

    for (const statement of statements) {
      const sql = normalizeSql(statement.sql);
      assert.ok(sql.startsWith('insert into'), `${statement.name}: statement que não é insert`);
      assert.ok(sql.includes('on conflict'), `${statement.name}: insert sem on conflict duplica a cada boot`);
      assert.ok(!sql.includes('delete'), `${statement.name}: o seed JAMAIS apaga (piso, nunca teto)`);
    }
  });

  it('nenhum campo de decisão do operador aparece em NENHUM do update', () => {
    // Primeiro nas listas exportadas (que geram o SQL)...
    for (const columns of [SOURCE_UPDATE_COLUMNS, RULE_UPDATE_COLUMNS, RULE_VERSION_UPDATE_COLUMNS]) {
      for (const operatorColumn of OPERATOR_OWNED_COLUMNS) {
        assert.ok(
          !columns.includes(operatorColumn),
          `coluna de operador '${operatorColumn}' entrou numa lista de update do seed`
        );
      }
    }

    // ...e no SQL efetivamente gerado (fecha a mutação "coluna escrita à mão fora da lista").
    for (const statement of statements) {
      const updated = updatedColumnsOf(statement.sql);
      assert.ok(updated.length > 0, `${statement.name}: do update sumiu — 'do nothing' congela typo para sempre`);
      for (const operatorColumn of OPERATOR_OWNED_COLUMNS) {
        assert.ok(
          !updated.includes(operatorColumn),
          `${statement.name}: '${operatorColumn}' no do update — o boot passaria a desfazer decisão do operador`
        );
      }
    }
  });

  it('vigência (effective_from/effective_until) fica fora do do update de versões', () => {
    // Mudança de vigência é VERSÃO NOVA — reescrever a janela de uma versão existente
    // reescreveria história regulatória.
    for (const statement of statements) {
      if (!statement.name.startsWith('rule-version:')) continue;
      const updated = updatedColumnsOf(statement.sql);
      assert.ok(!updated.includes('effective_from'), statement.name);
      assert.ok(!updated.includes('effective_until'), statement.name);
      assert.deepEqual(updated.sort(), [...RULE_VERSION_UPDATE_COLUMNS].sort());
    }
  });

  it('toda versão nasce com o LITERAL blocking=false e sem reviewed_* no insert', () => {
    const seed = buildRegulatoryCatalogSeed();

    for (const statement of statements) {
      if (!statement.name.startsWith('rule-version:')) continue;
      const bindings = versionInsertBindings(statement.sql);

      assert.equal(
        bindings.blocking,
        'false',
        `${statement.name}: blocking deixou de ser literal false no insert`
      );
      assert.ok(
        !('reviewed_by' in bindings) && !('reviewed_at' in bindings),
        `${statement.name}: reviewed_* não pode nem aparecer no insert do seed`
      );

      // Amarração do implementation_state ($n) ao valor declarado no seed — inclusive para as
      // versões ACTIVE, que continuam nascendo blocking=false (o check da migration 021 exige
      // revisão humana para ACTIVE+blocking).
      const [, code, versionLabel] = statement.name.split(':');
      const rule = seed.rules.find((entry) => entry.code === code);
      const version = rule?.versions.find((entry) => entry.versionLabel === versionLabel);
      assert.ok(version, `${statement.name}: statement sem versão correspondente no seed`);

      const placeholder = Number(String(bindings.implementation_state).replace('$', ''));
      assert.equal(statement.params[placeholder - 1], version.implementationState, statement.name);
    }
  });

  it('a ordem dos statements é estável entre execuções (params comparados sem o id randômico)', () => {
    const again = buildRegulatoryCatalogSeedStatements();
    assert.deepEqual(
      again.map((statement) => statement.name),
      statements.map((statement) => statement.name)
    );
    for (let index = 0; index < statements.length; index += 1) {
      assert.equal(again[index].sql, statements[index].sql);
      // params[0] é o id gerado por createPrefixedId (randômico por construção) — o resto é fixo.
      assert.deepEqual(again[index].params.slice(1), statements[index].params.slice(1));
    }
  });

  it('upsert usa CHAVE NATURAL, jamais a PK randômica', () => {
    for (const statement of statements) {
      const sql = normalizeSql(statement.sql);
      assert.ok(!sql.includes('on conflict (id)'), `${statement.name}: on conflict na PK duplica a cada boot`);
      if (statement.name.startsWith('source:')) assert.ok(sql.includes('on conflict (reference)'));
      if (statement.name.startsWith('rule:')) assert.ok(sql.includes('on conflict (code)'));
      if (statement.name.startsWith('rule-version:')) {
        assert.ok(sql.includes('on conflict (rule_id, version_label)'));
      }
    }
  });
});
