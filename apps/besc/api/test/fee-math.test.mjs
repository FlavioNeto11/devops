// Testes de unidade da matemática de fee/pro-rata (Fase 4). Puros, sem banco —
// reproduzem as fórmulas de revenue.js (half-up 2 casas) do Apêndice D.
import test from 'node:test';
import assert from 'node:assert/strict';

const roundHalfUp = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const feePercent = (face, pct, floor) => Math.max(roundHalfUp(face * (pct / 100)), floor);
const prorata = (base, ratePct, billable, dim) => roundHalfUp(roundHalfUp(base * (ratePct / 100)) * (billable / dim));

test('fee de 1ª transferência — exemplo 1 do Apêndice D', () => {
  assert.equal(feePercent(20800, 0.5, 25).toFixed(2), '104.00'); // 400×52 × 0,5%
  assert.equal(feePercent(33000, 0.5, 25).toFixed(2), '165.00'); // 600×55 × 0,5%
  assert.equal((104 + 165).toFixed(2), '269.00');                // receita total de fees
});

test('piso do fee aplica em operações pequenas', () => {
  assert.equal(feePercent(1000, 0.5, 25).toFixed(2), '25.00'); // 0,5% = 5 < piso 25
});

test('aluguel pro-rata — exemplo 2 do Apêndice D', () => {
  assert.equal(prorata(40000, 0.9, 31, 31).toFixed(2), '360.00'); // julho integral
  assert.equal(prorata(40000, 0.9, 15, 31).toFixed(2), '174.19'); // agosto 15/31 (suspenso dia 16)
  assert.equal(prorata(40000, 0.9, 21, 30).toFixed(2), '252.00'); // setembro 21/30 (reativado dia 10)
});

test('DRE do trimestre fecha em −84,81', () => {
  const receita = 269.00 + (360.00 + 174.19 + 252.00);
  const custo = 3 * 320.00 + 180.00;
  assert.equal((receita - custo).toFixed(2), '-84.81');
});
