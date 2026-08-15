/**
 * ABA PRESA NA VERSÃO ANTIGA — o cache do navegador não avisa ninguém.
 *
 * Sintoma medido em produção: navegação normal para /sicat/manifestos carregou
 * `index-Yyrg84HD.js` (DUAS publicações atrás) com `deliveryType: "cache"` e
 * `transferSize: 0`, sem service worker e com Cache API vazia. Nenhum asset deu
 * 404 — logo a rede de segurança de chunk removido nunca acordou. A sessão
 * ficou na versão velha em SILÊNCIO.
 *
 * A decisão coberta aqui é a comparação de identificadores de build feita em
 * runtime, por fora do cache HTTP. Os dois riscos do mecanismo são o alvo dos
 * testes: avisar sem motivo (identificador ilegível → tem de CALAR) e avisar
 * para sempre (mesmo identificador → tem de parar depois do primeiro aviso).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION_CHECK_MIN_INTERVAL_MS,
  VERSION_MANIFEST_FILE,
  buildVersionManifestUrl,
  normalizeBuildId,
  readServedBuildId,
  shouldCheckNow,
  shouldPromptReload
} from '../../src/lib/version-check.js';

test('identificadores iguais: a aba está atualizada, não avisa', () => {
  assert.equal(shouldPromptReload('20260803120000-a1b2c3', '20260803120000-a1b2c3'), false);
  // Espaço em volta é ruído de serialização, não versão diferente.
  assert.equal(shouldPromptReload('20260803120000-a1b2c3', ' 20260803120000-a1b2c3\n'), false);
});

test('identificadores diferentes: há publicação nova no servidor, avisa', () => {
  assert.equal(shouldPromptReload('20260801090000-yyrg84', '20260803120000-a1b2c3'), true);
});

test('CONTROLE NEGATIVO: identificador servido ausente/inválido NUNCA avisa', () => {
  const embutido = '20260801090000-yyrg84';
  const lixo = [
    '',
    '   ',
    null,
    undefined,
    0,
    42,
    Number.NaN,
    {},
    [],
    true,
    // Build mal configurado que embutiu a palavra `undefined` como string:
    // compararia diferente de tudo e avisaria o operador para sempre.
    'undefined',
    'null',
    'NaN',
    // Resposta errada (HTML de erro/portal cativo) que virou JSON por acidente.
    'x'.repeat(5000)
  ];

  for (const servido of lixo) {
    assert.equal(
      shouldPromptReload(embutido, servido),
      false,
      `avisou indevidamente com servido=${String(servido).slice(0, 30)}`
    );

    // Com a trava de laço JÁ ocupada por outro id: garante que quem cala aqui é
    // a checagem de "identificador ilegível", e não a trava por coincidência
    // (id vazio batendo com trava vazia).
    assert.equal(
      shouldPromptReload(embutido, servido, '20260802000000-outro'),
      false,
      `avisou indevidamente com servido=${String(servido).slice(0, 30)} (trava ocupada)`
    );
  }
});

test('CONTROLE NEGATIVO: identificador embutido ausente/inválido também cala', () => {
  // Bundle antigo (sem VITE_BUILD_ID) ou `vite dev`: não há o que comparar.
  for (const embutido of ['', null, undefined, 'undefined', 123, {}]) {
    assert.equal(shouldPromptReload(embutido, '20260803120000-a1b2c3'), false);
  }
});

test('sem laço: o MESMO identificador servido só rende UM aviso', () => {
  const embutido = '20260801090000-yyrg84';
  const servido = '20260803120000-a1b2c3';

  // Primeira vez: avisa.
  assert.equal(shouldPromptReload(embutido, servido, ''), true);

  // Já avisamos (e possivelmente já recarregamos) por este id e continuamos no
  // bundle antigo — insistir viraria recarregamento em ciclo.
  assert.equal(shouldPromptReload(embutido, servido, servido), false);

  // Mas uma publicação AINDA mais nova volta a avisar.
  assert.equal(shouldPromptReload(embutido, '20260804080000-zzz999', servido), true);
});

test('readServedBuildId aceita só o formato do manifesto', () => {
  assert.equal(readServedBuildId({ buildId: '20260803120000-a1b2c3', builtAt: '2026-08-03T12:00:00Z' }), '20260803120000-a1b2c3');
  assert.equal(readServedBuildId({}), '');
  assert.equal(readServedBuildId({ buildId: 123 }), '');
  assert.equal(readServedBuildId([{ buildId: 'x' }]), '');
  assert.equal(readServedBuildId('20260803120000-a1b2c3'), '');
  assert.equal(readServedBuildId(null), '');
  assert.equal(readServedBuildId(undefined), '');
});

test('normalizeBuildId reduz tudo que não serve para comparar a string vazia', () => {
  assert.equal(normalizeBuildId('  abc  '), 'abc');
  assert.equal(normalizeBuildId(''), '');
  assert.equal(normalizeBuildId('undefined'), '');
  assert.equal(normalizeBuildId(null), '');
  assert.equal(normalizeBuildId('a'.repeat(201)), '');
  assert.equal(normalizeBuildId('a'.repeat(200)), 'a'.repeat(200));
});

test('a URL do manifesto leva cache-busting e respeita o base path', () => {
  const url = buildVersionManifestUrl('/sicat/', 1_700_000_000_000);
  assert.equal(url, `/sicat/${VERSION_MANIFEST_FILE}?_=1700000000000`);

  // Base sem barra final não pode grudar o nome do arquivo no diretório.
  assert.equal(buildVersionManifestUrl('/sicat', 7), '/sicat/version.json?_=7');
  assert.equal(buildVersionManifestUrl('/', 7), '/version.json?_=7');
  assert.equal(buildVersionManifestUrl('', 7), '/version.json?_=7');

  // Duas checagens seguidas não podem cair na mesma URL (proxy guardaria).
  assert.notEqual(buildVersionManifestUrl('/sicat/', 1), buildVersionManifestUrl('/sicat/', 2));
});

test('debounce: foco e troca de rota disparam muito; não vira polling', () => {
  const agora = 1_000_000;

  // Nunca checou ainda.
  assert.equal(shouldCheckNow(0, agora), true);
  assert.equal(shouldCheckNow(Number.NaN, agora), true);
  assert.equal(shouldCheckNow('lixo', agora), true);

  // Checou agora há pouco: segura.
  assert.equal(shouldCheckNow(agora - 1000, agora), false);
  assert.equal(shouldCheckNow(agora - (VERSION_CHECK_MIN_INTERVAL_MS - 1), agora), false);

  // Passou o piso: pode checar.
  assert.equal(shouldCheckNow(agora - VERSION_CHECK_MIN_INTERVAL_MS, agora), true);

  // Relógio ajustado para trás não pode congelar a checagem para sempre.
  assert.equal(shouldCheckNow(agora + 999_999, agora), true);
});
