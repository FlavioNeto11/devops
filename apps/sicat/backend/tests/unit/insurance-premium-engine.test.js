/**
 * Testes do motor PURO de prêmio de averbação (`insurance-premium-engine.ts`, PR-I2 do Módulo
 * Transportadora — REQ-SICAT-0028 rev.2 / REQ-SICAT-0034).
 *
 * SEM banco, SEM service — molde `freight-floor-engine.test.js`. Três frentes:
 *   1. o CASO DE OURO do circuito real (doc Irmãos PADILHA): R$ 25.000,00 × 0,025% / 0,072% /
 *      0,097% = R$ 6,25 / R$ 18,00 / R$ 24,25 — o mesmo número que a UI e o Playwright de
 *      fechamento validam;
 *   2. arredondamento HALF-UP em fronteira de meio centavo (onde `Math.round` sem o epsilon
 *      erraria por causa de representação float);
 *   3. seleção da taxa aplicável por vigência/percurso/empate (`selectApplicableRate`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDeclarationPremiumCents,
  roundHalfUpCents,
  selectApplicableRate
} from '../../src/lib/transport/insurance-premium-engine.js';

// ===================================================================================================
// computeDeclarationPremiumCents — caso de ouro (centavos inteiros, half-up)
// ===================================================================================================

describe('computeDeclarationPremiumCents — caso de ouro R$ 25.000,00', () => {
  const CARGO_25K_CENTS = 2_500_000;

  it('× 0,025% (RC-DC) = R$ 6,25 (625 centavos)', () => {
    assert.strictEqual(
      computeDeclarationPremiumCents({ cargoAmountCents: CARGO_25K_CENTS, ratePercent: 0.025 }),
      625
    );
  });

  it('× 0,072% (RCTR-C) = R$ 18,00 (1.800 centavos)', () => {
    assert.strictEqual(
      computeDeclarationPremiumCents({ cargoAmountCents: CARGO_25K_CENTS, ratePercent: 0.072 }),
      1_800
    );
  });

  it('× 0,097% (taxa somada 0,025 + 0,072) = R$ 24,25 (2.425 centavos)', () => {
    assert.strictEqual(
      computeDeclarationPremiumCents({ cargoAmountCents: CARGO_25K_CENTS, ratePercent: 0.097 }),
      2_425
    );
  });

  it('carga zero → prêmio zero (sem taxa mínima aqui — mínimo mensal é assunto da apuração)', () => {
    assert.strictEqual(computeDeclarationPremiumCents({ cargoAmountCents: 0, ratePercent: 0.097 }), 0);
  });
});

describe('computeDeclarationPremiumCents — half-up em fronteira de meio centavo', () => {
  it('meio centavo exato sobe (12.500 × 0,004% = 0,5 centavo → 1 centavo)', () => {
    // 12500 * 0.004 / 100 = 0.5 — half-up manda para 1; truncar ou banker's rounding dariam 0.
    assert.strictEqual(computeDeclarationPremiumCents({ cargoAmountCents: 12_500, ratePercent: 0.004 }), 1);
  });

  it('meio centavo cuja representação float fica ABAIXO de .5 também sobe (epsilon do motor)', () => {
    // 2_500_000 × 0,0035% = 87,5 centavos EXATOS em decimal, mas o produto float fica um epsilon
    // abaixo (0.0035 não tem representação binária exata) — sem o epsilon do motor, Math.round
    // devolveria 87. O half-up correto é 88.
    assert.strictEqual(computeDeclarationPremiumCents({ cargoAmountCents: 2_500_000, ratePercent: 0.0035 }), 88);
  });

  it('abaixo do meio centavo desce (12.499 × 0,004% = 0,49996 centavo → 0)', () => {
    assert.strictEqual(computeDeclarationPremiumCents({ cargoAmountCents: 12_499, ratePercent: 0.004 }), 0);
  });

  it('roundHalfUpCents é half-up, não banker\'s rounding (1,5 → 2 E 2,5 → 3)', () => {
    assert.strictEqual(roundHalfUpCents(1.5), 2);
    assert.strictEqual(roundHalfUpCents(2.5), 3, "banker's rounding daria 2 — half-up exige 3");
  });

  it('entrada inválida LANÇA (nunca NaN silencioso): centavos fracionários/negativos, taxa <= 0', () => {
    assert.throws(() => computeDeclarationPremiumCents({ cargoAmountCents: 100.5, ratePercent: 0.072 }));
    assert.throws(() => computeDeclarationPremiumCents({ cargoAmountCents: -1, ratePercent: 0.072 }));
    assert.throws(() => computeDeclarationPremiumCents({ cargoAmountCents: 2_500_000, ratePercent: 0 }));
    assert.throws(() => computeDeclarationPremiumCents({ cargoAmountCents: 2_500_000, ratePercent: -0.072 }));
  });
});

// ===================================================================================================
// selectApplicableRate — vigência + percurso + empate
// ===================================================================================================

/** Fixture de linha de taxa — shape mínimo de seleção (`RateScheduleForSelection`). */
function buildRate(overrides = {}) {
  return {
    ratePercent: 0.072,
    routeScope: null,
    monthlyMinimumAmount: 0,
    validFrom: '2026-01-01',
    validUntil: null,
    status: 'active',
    ...overrides
  };
}

describe('selectApplicableRate — vigência cobre a data', () => {
  it('taxa cuja vigência cobre a data é selecionada; fora da janela, null', () => {
    const rates = [buildRate({ validFrom: '2026-01-01', validUntil: '2026-12-31' })];
    assert.ok(selectApplicableRate(rates, { referenceDate: '2026-08-15' }));
    assert.strictEqual(selectApplicableRate(rates, { referenceDate: '2025-12-31' }), null, 'antes de validFrom');
    assert.strictEqual(selectApplicableRate(rates, { referenceDate: '2027-01-01' }), null, 'depois de validUntil');
  });

  it('validUntil null = vigência aberta (cobre qualquer data >= validFrom)', () => {
    const rates = [buildRate({ validFrom: '2026-01-01', validUntil: null })];
    assert.ok(selectApplicableRate(rates, { referenceDate: '2030-01-01' }));
  });

  it('cancelled NUNCA concorre; superseded CONCORRE (é o histórico de datas passadas)', () => {
    const cancelled = [buildRate({ status: 'cancelled' })];
    assert.strictEqual(selectApplicableRate(cancelled, { referenceDate: '2026-08-15' }), null);

    // Cenário real do create supersede: taxa antiga vira superseded quando a nova entra — para uma
    // data ANTERIOR à vigência da nova, a antiga (superseded) é a única que cobre e DEVE vencer.
    const rates = [
      buildRate({ ratePercent: 0.072, validFrom: '2026-01-01', status: 'superseded' }),
      buildRate({ ratePercent: 0.08, validFrom: '2026-09-01', status: 'active' })
    ];
    const forPastDate = selectApplicableRate(rates, { referenceDate: '2026-08-15' });
    assert.strictEqual(forPastDate?.ratePercent, 0.072, 'data passada resolve pela taxa histórica (superseded)');
  });

  it('sem nenhuma taxa aplicável → null (lista vazia inclusive)', () => {
    assert.strictEqual(selectApplicableRate([], { referenceDate: '2026-08-15' }), null);
  });
});

describe('selectApplicableRate — match exato de percurso vence o default', () => {
  const rates = [
    buildRate({ ratePercent: 0.1, routeScope: null }),
    buildRate({ ratePercent: 0.2, routeScope: 'SP-PR' })
  ];

  it('operação SP-PR pega a taxa do percurso, não a default', () => {
    const selected = selectApplicableRate(rates, { referenceDate: '2026-08-15', routeScope: 'SP-PR' });
    assert.strictEqual(selected?.ratePercent, 0.2);
  });

  it('operação de OUTRO percurso cai na default da apólice', () => {
    const selected = selectApplicableRate(rates, { referenceDate: '2026-08-15', routeScope: 'SP-MG' });
    assert.strictEqual(selected?.ratePercent, 0.1);
  });

  it('operação SEM percurso informado cai na default', () => {
    const selected = selectApplicableRate(rates, { referenceDate: '2026-08-15' });
    assert.strictEqual(selected?.ratePercent, 0.1);
  });

  it('só existe taxa de percurso (sem default) e a operação é de outro percurso → null', () => {
    const onlyScoped = [buildRate({ routeScope: 'SP-PR' })];
    assert.strictEqual(selectApplicableRate(onlyScoped, { referenceDate: '2026-08-15', routeScope: 'SP-MG' }), null);
  });
});

describe('selectApplicableRate — empate resolve pela validFrom mais recente', () => {
  it('duas vigências abertas cobrindo a data → vence a que começou por último', () => {
    const rates = [
      buildRate({ ratePercent: 0.072, validFrom: '2026-01-01', status: 'superseded' }),
      buildRate({ ratePercent: 0.08, validFrom: '2026-06-01', status: 'active' })
    ];
    const selected = selectApplicableRate(rates, { referenceDate: '2026-08-15' });
    assert.strictEqual(selected?.ratePercent, 0.08);
  });

  it('o desempate é POR CLASSE de escopo: percurso exato mais antigo ainda vence default mais novo', () => {
    const rates = [
      buildRate({ ratePercent: 0.1, routeScope: null, validFrom: '2026-06-01' }),
      buildRate({ ratePercent: 0.2, routeScope: 'SP-PR', validFrom: '2026-01-01' })
    ];
    const selected = selectApplicableRate(rates, { referenceDate: '2026-08-15', routeScope: 'SP-PR' });
    assert.strictEqual(selected?.ratePercent, 0.2, 'match exato vence ANTES do desempate por validFrom');
  });
});
