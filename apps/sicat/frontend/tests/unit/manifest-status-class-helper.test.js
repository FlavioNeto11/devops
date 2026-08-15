/**
 * ARMADILHA DE COR EM `manifestHelpers` — guard de superfície.
 *
 * `manifestHelpers` decide AÇÃO (o que o operador pode fazer com um manifesto).
 * Quem decide COR é `SicatStatusBadge`, lendo o mapa canônico `lib/status-map.js`.
 * O DL-100 declarou deprecated os helpers locais de classe de status e afirmou
 * tê-los removido das views — mas um sobreviveu neste módulo, sem chamador
 * nenhum: `normalizedStatusClass`, que classificava status por substring.
 *
 * Ele nunca chegou a mentir na tela porque ninguém o chamava. Ligá-lo é que era
 * o perigo: `'submit_unconfirmed'.includes('submit')` devolvia `'succeeded'` —
 * VERDE no único estado que existe para o operador NÃO concluir que deu certo
 * ("despachei para a CETESB e não sei se o MTR nasceu"). O canônico é `warning`,
 * travado em `manifest-submit-unconfirmed.test.js`.
 *
 * Este arquivo não testa a função removida (ela não existe): testa que NENHUM
 * helper de pintura volte a nascer aqui. Segunda fonte de cor = duas telas
 * discordando sobre o mesmo manifesto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as manifestHelpers from '../../src/features/mtr/list/manifestHelpers.js';

/**
 * Detector: nome de export que denuncia decisão de PINTURA (classe CSS, cor,
 * tonalidade, badge). Deliberadamente por nome, não por comportamento — a
 * armadilha aqui nasce como "só mais um helperzinho de status".
 */
const PAINTING_EXPORT = /(class|colou?r|tone|badge)/i;

function findPaintingExports(moduleNamespace) {
  return Object.keys(moduleNamespace).filter((name) => PAINTING_EXPORT.test(name));
}

test('manifestHelpers não exporta helper de cor/classe de status', () => {
  const painting = findPaintingExports(manifestHelpers);

  assert.deepEqual(
    painting,
    [],
    `manifestHelpers voltou a decidir COR (${painting.join(', ')}). `
    + 'Cor de status vem de lib/status-map.js via SicatStatusBadge — que trata '
    + 'submit_unconfirmed como warning. Um segundo classificador aqui volta a '
    + 'arriscar pintar de verde um envio de desfecho desconhecido.'
  );
});

test('CONTROLE NEGATIVO: o detector enxerga um helper de pintura de verdade', () => {
  // Sem isto, o teste acima passaria igual se o detector estivesse quebrado
  // (regex errada, namespace vazio) — "passou" não provaria que ele mede algo.
  const comArmadilha = {
    isSubmitUnconfirmedManifest: () => true,
    normalizedStatusClass: () => 'succeeded'
  };

  assert.deepEqual(findPaintingExports(comArmadilha), ['normalizedStatusClass']);

  // Outras grafias que a mesma armadilha usaria ao voltar.
  assert.deepEqual(findPaintingExports({ statusColor: () => {} }), ['statusColor']);
  assert.deepEqual(findPaintingExports({ resolveManifestStatusTone: () => {} }), ['resolveManifestStatusTone']);
  assert.deepEqual(findPaintingExports({ manifestBadgeVariant: () => {} }), ['manifestBadgeVariant']);
});

test('CONTROLE DE SANIDADE: o módulo inspecionado é o real, não um vazio', () => {
  // Um caminho de import errado lança; mas um módulo esvaziado por engano faria
  // o guard acima passar VAZIAMENTE. Estas âncoras provam que há superfície viva.
  for (const exportadoEsperado of [
    'isSubmitUnconfirmedManifest',
    'canPrintManifest',
    'canSubmitManifest',
    'resolveManifestStatusLabel',
    'normalizedStatusValue'
  ]) {
    assert.equal(
      typeof manifestHelpers[exportadoEsperado],
      'function',
      `${exportadoEsperado} sumiu de manifestHelpers`
    );
  }
});
