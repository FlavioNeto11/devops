/**
 * Apuração mensal do prêmio (PR-I4, REQ-SICAT-0035): a conta do mês é
 * `max(soma dos prêmios, custo mínimo)` — a regra que o circuito real do TRC usa
 * (doc Irmãos PADILHA: mínimo R$ 700 RCTR-C/RC-DC, R$ 300 RC-V).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBillingPeriodCents } from '../../src/lib/transport/insurance-premium-engine.ts';

test('mês fraco: o custo mínimo prevalece sobre o apurado', () => {
  // Uma viagem de R$ 25.000 com a taxa somada de 0,097% rende R$ 24,25 de prêmio.
  const totals = computeBillingPeriodCents({
    declarations: [{ declaredCargoAmountCents: 2_500_000, premiumAmountCents: 2_425 }],
    minimumAmountCents: 70_000
  });
  assert.equal(totals.declaredTotalCents, 2_500_000);
  assert.equal(totals.premiumTotalCents, 2_425);
  assert.equal(totals.billedCents, 70_000, 'cobra o mínimo de R$ 700,00');
  assert.equal(totals.billingBasis, 'minimum');
});

test('mês forte: a soma dos prêmios passa do mínimo e é ela que vale', () => {
  const totals = computeBillingPeriodCents({
    declarations: [
      { declaredCargoAmountCents: 50_000_000, premiumAmountCents: 48_500 },
      { declaredCargoAmountCents: 30_000_000, premiumAmountCents: 29_100 }
    ],
    minimumAmountCents: 70_000
  });
  assert.equal(totals.declaredTotalCents, 80_000_000);
  assert.equal(totals.premiumTotalCents, 77_600);
  assert.equal(totals.billedCents, 77_600);
  assert.equal(totals.billingBasis, 'premium');
});

test('empate resolve como minimum (o piso foi quem sustentou a cobrança)', () => {
  const totals = computeBillingPeriodCents({
    declarations: [{ declaredCargoAmountCents: 1_000_000, premiumAmountCents: 70_000 }],
    minimumAmountCents: 70_000
  });
  assert.equal(totals.billedCents, 70_000);
  assert.equal(totals.billingBasis, 'minimum');
});

test('mês sem averbação nenhuma ainda cobra o mínimo', () => {
  const totals = computeBillingPeriodCents({ declarations: [], minimumAmountCents: 30_000 });
  assert.deepEqual(totals, {
    declaredTotalCents: 0,
    premiumTotalCents: 0,
    billedCents: 30_000,
    billingBasis: 'minimum'
  });
});

test('apólice sem mínimo configurado cobra exatamente o apurado', () => {
  const totals = computeBillingPeriodCents({
    declarations: [{ declaredCargoAmountCents: 2_500_000, premiumAmountCents: 2_425 }],
    minimumAmountCents: 0
  });
  assert.equal(totals.billedCents, 2_425);
  assert.equal(totals.billingBasis, 'premium');
});

test('entrada inválida falha alto (nunca conta silenciosamente errada)', () => {
  assert.throws(
    () => computeBillingPeriodCents({ declarations: [], minimumAmountCents: -1 }),
    /minimumAmountCents/
  );
  assert.throws(
    () => computeBillingPeriodCents({
      declarations: [{ declaredCargoAmountCents: 100.5, premiumAmountCents: 10 }],
      minimumAmountCents: 0
    }),
    /centavos inteiros/
  );
});
