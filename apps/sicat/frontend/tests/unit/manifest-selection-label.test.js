/**
 * CAIXAS DE SELEÇÃO SEM NOME — as 21 caixas da lista de manifestos (linhas +
 * "selecionar todos") se anunciavam apenas como "caixa de seleção" no leitor de
 * tela. Estes testes travam o nome acessível de cada linha: ele repete o que a
 * coluna "Número MTR" mostra.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManifestSelectionLabel,
  resolveManifestDisplayNumber
} from '../../src/lib/manifest-selection-label.js';

test('o rótulo identifica o MTR pelo número', () => {
  assert.equal(
    buildManifestSelectionLabel({ id: 'man_abc', manifestNumber: '260012603974' }),
    'Selecionar manifesto 260012603974'
  );
});

test('sem número, cai para o mesmo identificador que a coluna exibe', () => {
  assert.equal(buildManifestSelectionLabel({ id: 'man_abc' }), 'Selecionar manifesto man_abc');
  assert.equal(buildManifestSelectionLabel({ externalCode: '99881' }), 'Selecionar manifesto 99881');
  assert.equal(buildManifestSelectionLabel({ manifestId: 'man_x' }), 'Selecionar manifesto man_x');
});

test('linha sem identificador nenhum ainda ganha nome (nunca fica muda)', () => {
  assert.equal(buildManifestSelectionLabel({}), 'Selecionar manifesto sem número');
  assert.equal(buildManifestSelectionLabel(null), 'Selecionar manifesto sem número');
  assert.equal(buildManifestSelectionLabel({ manifestNumber: '   ' }), 'Selecionar manifesto sem número');
});

test('número tem precedência sobre o id interno e vem sem espaços', () => {
  assert.equal(
    resolveManifestDisplayNumber({ id: 'man_abc', externalCode: '99881', manifestNumber: ' 260012603974 ' }),
    '260012603974'
  );
});

test('dois manifestos distintos nunca compartilham o mesmo rótulo', () => {
  const first = buildManifestSelectionLabel({ manifestNumber: '260012603974' });
  const second = buildManifestSelectionLabel({ manifestNumber: '260012603975' });
  assert.notEqual(first, second);
});
