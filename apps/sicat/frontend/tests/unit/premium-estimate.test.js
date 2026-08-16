/**
 * `estimateDeclarationPremium` — a estimativa de prêmio que a UI mostra na
 * confirmação do "Averbar" (onda F7, REQ-SICAT-0034).
 *
 * CASO DE OURO do circuito Irmãos PADILHA: carga de R$ 25.000,00 × 0,097% =
 * R$ 24,25. O mesmo número que o motor `insurance-premium-engine.ts` congela no
 * backend — se os dois divergirem, o operador confirma um valor e é cobrado
 * outro, e a confiança na tela acaba ali.
 *
 * As duas armadilhas travadas aqui: (1) `ratePercent` é PERCENTUAL LITERAL —
 * dividir por 100 é responsabilidade da função, e quem passar 0.00097 achando
 * que "já é a fração" recebe 100× menos; (2) sem insumo o retorno é `null`,
 * NUNCA 0 — um "R$ 0,00" na confirmação seria lido como "averbar é de graça".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDeclarationPremium, formatCurrencyBRL } from '../../src/views/transporte/transporteUiHelpers.js';

/** `Intl` usa espaço NÃO-QUEBRÁVEL entre "R$" e o número — normalizar evita
 *  um falso vermelho que não diz nada sobre a aritmética. */
function normalizeCurrency(value) {
  return String(value).replace(/ /g, ' ');
}

test('CASO DE OURO: R$ 25.000,00 × 0,097% = R$ 24,25', () => {
  assert.equal(estimateDeclarationPremium(25000, 0.097), 24.25);
  assert.equal(normalizeCurrency(formatCurrencyBRL(estimateDeclarationPremium(25000, 0.097))), 'R$ 24,25');
});

test('taxas do circuito (RCTR-C 0,072% e RC-DC 0,025%) sobre a mesma carga', () => {
  assert.equal(estimateDeclarationPremium(25000, 0.072), 18);
  assert.equal(estimateDeclarationPremium(25000, 0.025), 6.25);
});

test('o percentual é LITERAL: 0.097 e 0.00097 dão resultados 100× diferentes', () => {
  assert.equal(estimateDeclarationPremium(25000, 0.097), 24.25);
  assert.equal(estimateDeclarationPremium(25000, 0.00097), 0.24);
});

test('arredondamento a centavos é half-up (meio centavo sobe)', () => {
  // 1000 × 0,0125% = 0,125 → 0,13
  assert.equal(estimateDeclarationPremium(1000, 0.0125), 0.13);
  // 100 × 0,005% = 0,005 → 0,01
  assert.equal(estimateDeclarationPremium(100, 0.005), 0.01);
  // Abaixo do meio centavo desce.
  assert.equal(estimateDeclarationPremium(100, 0.004), 0);
});

test('nunca devolve mais de 2 casas decimais (o valor vai direto para a tela)', () => {
  for (const [amount, rate] of [[12345.67, 0.097], [999.99, 0.0333], [7777, 0.1234]]) {
    const premium = estimateDeclarationPremium(amount, rate);
    const decimals = String(premium).split('.')[1] || '';
    assert.ok(decimals.length <= 2, `${amount} × ${rate}% devolveu ${premium}`);
  }
});

test('carga alta não perde precisão de centavo', () => {
  assert.equal(estimateDeclarationPremium(1000000, 0.097), 970);
  assert.equal(estimateDeclarationPremium(2500000, 0.097), 2425);
});

test('taxa ou valor zerado dá zero — é resposta legítima, não falta de insumo', () => {
  assert.equal(estimateDeclarationPremium(0, 0.097), 0);
  assert.equal(estimateDeclarationPremium(25000, 0), 0);
});

test('sem insumo válido devolve null — nunca 0, nunca NaN', () => {
  for (const [amount, rate] of [
    [null, 0.097],
    [undefined, 0.097],
    [25000, null],
    [25000, undefined],
    ['abc', 0.097],
    [25000, 'abc'],
    [NaN, 0.097],
    [Infinity, 0.097],
    [-25000, 0.097],
    [25000, -0.097]
  ]) {
    assert.equal(
      estimateDeclarationPremium(amount, rate),
      null,
      `(${String(amount)}, ${String(rate)}) deveria ser null`
    );
  }
});

test('formatCurrencyBRL trata o null da estimativa como "-" (não "R$ 0,00")', () => {
  assert.equal(formatCurrencyBRL(estimateDeclarationPremium(null, 0.097)), '-');
});
