import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRegulatoryCatalogSeed } from '../../src/bootstrap/regulatory-rules-seed.js';
import {
  normalizeReferenceDate,
  resolveVersionFromList
} from '../../src/lib/transport/regulatory-temporal.js';
import {
  buildFutureRuleVersion,
  buildRevokedRuleVersion,
  buildSupersededPair
} from '../fixtures/regulatory/rule-version-fixtures.js';

/**
 * Testes REGULATÓRIOS de fronteira temporal (PR-A1 — a pasta `tests/regulatory/` nasce aqui e
 * consolida no PR-A6). Tudo PURO, sem banco: a resolução exercitada é `resolveVersionFromList`
 * (lib/transport/regulatory-temporal.ts), o MESMO sítio para onde o repositório delega — o teste
 * de integração (`tests/integration/transporte-regulatory-catalog.test.js`) repete as mesmas
 * fronteiras via banco para provar que a delegação não diverge.
 *
 * A fronteira canônica do catálogo é a virada do CIOT universal: 23/05/2026 (último dia da
 * baseline 2019) → 24/05/2026 (primeiro dia da Res. ANTT 6.078/2026).
 */

const seed = buildRegulatoryCatalogSeed();

function versionsOf(code) {
  const rule = seed.rules.find((entry) => entry.code === code);
  assert.ok(rule, `regra ${code} não existe no seed`);
  return rule.versions;
}

describe('tests/regulatory — resolução temporal de TR-CIOT-001 (virada do CIOT universal)', () => {
  const versions = versionsOf('TR-CIOT-001');

  it('2026-05-23 (véspera da virada) → v2019-baseline', () => {
    const resolved = resolveVersionFromList(versions, '2026-05-23');
    assert.equal(resolved?.versionLabel, 'v2019-baseline');
    assert.equal(resolved?.severity, 'warning');
  });

  it('2026-05-24 (dia da virada, inclusivo) → v2026-05-universal', () => {
    const resolved = resolveVersionFromList(versions, '2026-05-24');
    assert.equal(resolved?.versionLabel, 'v2026-05-universal');
    assert.equal(resolved?.severity, 'critical');
  });

  it('2026-05-25 (dia seguinte) → v2026-05-universal', () => {
    assert.equal(resolveVersionFromList(versions, '2026-05-25')?.versionLabel, 'v2026-05-universal');
  });

  it('fronteiras internas: effective_from e effective_until são INCLUSIVOS', () => {
    // Espelha o daterange '[]' da exclusion constraint da migration 021.
    assert.equal(resolveVersionFromList(versions, '2019-01-28')?.versionLabel, 'v2019-baseline');
    assert.equal(resolveVersionFromList(versions, '2019-01-27'), null, 'antes da primeira vigência não há regra');
  });
});

describe('tests/regulatory — regra com vigência futura não vale antes da data', () => {
  it('TR-RNTRC-003 (effective_from 2026-08-06) não resolve em 2026-08-05', () => {
    const versions = versionsOf('TR-RNTRC-003');
    assert.equal(resolveVersionFromList(versions, '2026-08-05'), null);
    assert.equal(resolveVersionFromList(versions, '2026-08-06')?.versionLabel, 'v2026-08-baseline');
  });

  it('TR-CIOT-002 (effective_from 2026-05-24) não resolve em 2026-05-23', () => {
    const versions = versionsOf('TR-CIOT-002');
    assert.equal(resolveVersionFromList(versions, '2026-05-23'), null);
    assert.equal(resolveVersionFromList(versions, '2026-05-24')?.versionLabel, 'v2026-08-baseline');
  });
});

describe('tests/regulatory — propriedades do catálogo inteiro', () => {
  it('na data da baseline (2026-08-13) TODA regra resolve exatamente uma versão', () => {
    for (const rule of seed.rules) {
      const resolved = resolveVersionFromList(rule.versions, '2026-08-13');
      assert.ok(resolved, `${rule.code} sem versão vigente na data da baseline`);
    }
  });

  it('nenhuma data de fronteira resolve para DUAS versões da mesma regra (anti-sobreposição pura)', () => {
    for (const rule of seed.rules) {
      for (const version of rule.versions) {
        const others = rule.versions.filter((candidate) => candidate !== version);
        for (const boundary of [version.effectiveFrom, version.effectiveUntil]) {
          if (boundary == null) continue;
          assert.equal(
            resolveVersionFromList(others, boundary),
            null,
            `${rule.code}: ${boundary} pertence a mais de uma janela de vigência`
          );
        }
      }
    }
  });
});

describe('tests/regulatory — fronteira 05/06/07-08-2026 (Lei 15.485/2026 — conversão da MP 1.343/2026)', () => {
  // As 4 regras que a Lei 15.485/2026 introduz com effective_from=2026-08-06 diretamente (fora da
  // baseline anterior): TR-CIOT-003 (responsável pelo CIOT), TR-CIOT-004 (dados obrigatórios do
  // CIOT), TR-PAY-001 (prazo de pagamento) e TR-COMP-001 (conjunto mínimo para liberação).
  const RULES_FROM_LEI_15485 = ['TR-CIOT-003', 'TR-CIOT-004', 'TR-PAY-001', 'TR-COMP-001'];

  for (const code of RULES_FROM_LEI_15485) {
    it(`${code}: nada resolve em 2026-08-05 (véspera); resolve em 2026-08-06 e permanece em 2026-08-07`, () => {
      const versions = versionsOf(code);
      assert.equal(resolveVersionFromList(versions, '2026-08-05'), null);
      assert.equal(resolveVersionFromList(versions, '2026-08-06')?.versionLabel, 'v2026-08-baseline');
      assert.equal(resolveVersionFromList(versions, '2026-08-07')?.versionLabel, 'v2026-08-baseline');
    });
  }
});

describe('tests/regulatory — regra com vigência futura (fixture) não vale antes do effectiveFrom', () => {
  it('buildFutureRuleVersion() não resolve hoje (2026-08-13), resolve a partir do próprio effectiveFrom', () => {
    const future = buildFutureRuleVersion();
    assert.equal(resolveVersionFromList([future], '2026-08-13'), null);
    assert.equal(resolveVersionFromList([future], future.effectiveFrom)?.versionLabel, future.versionLabel);
  });
});

describe('tests/regulatory — regra revogada/superseded (fixture) fora de vigência após effectiveUntil', () => {
  it('buildRevokedRuleVersion(): resolve dentro da janela (inclusive no effectiveUntil), nada depois', () => {
    const revoked = buildRevokedRuleVersion();
    assert.equal(resolveVersionFromList([revoked], revoked.effectiveFrom)?.versionLabel, revoked.versionLabel);
    assert.equal(
      resolveVersionFromList([revoked], revoked.effectiveUntil)?.versionLabel,
      revoked.versionLabel,
      'effectiveUntil é INCLUSIVO'
    );
    assert.equal(resolveVersionFromList([revoked], '2016-01-01'), null, 'depois de effectiveUntil não há mais versão');
  });

  it('buildSupersededPair(): before some exatamente quando after nasce — sem sobreposição, sem buraco', () => {
    const { before, after } = buildSupersededPair();
    assert.equal(resolveVersionFromList([before, after], before.effectiveUntil)?.versionLabel, before.versionLabel);
    assert.equal(resolveVersionFromList([before, after], after.effectiveFrom)?.versionLabel, after.versionLabel);
    assert.notEqual(before.effectiveUntil, after.effectiveFrom, 'janelas adjacentes, nunca a MESMA data');
  });
});

describe('tests/regulatory — validação da data de referência', () => {
  it('aceita timestamp ISO usando só a parte de data', () => {
    assert.equal(normalizeReferenceDate('2026-05-24T13:45:00Z'), '2026-05-24');
  });

  it('rejeita data inválida com AppError 400 REGULATORY_REFERENCE_DATE_INVALID', () => {
    for (const invalid of ['', '24/05/2026', 'hoje', '2026-5-4']) {
      assert.throws(
        () => resolveVersionFromList(versionsOf('TR-CIOT-001'), invalid),
        (error) => error.status === 400 && error.code === 'REGULATORY_REFERENCE_DATE_INVALID'
      );
    }
  });
});
