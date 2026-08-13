import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRegulatoryCatalogSeed } from '../../src/bootstrap/regulatory-rules-seed.js';
import {
  normalizeReferenceDate,
  resolveVersionFromList
} from '../../src/lib/transport/regulatory-temporal.js';

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
