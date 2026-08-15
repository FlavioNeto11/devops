/**
 * Testes do módulo puro lib/feature-flags.js.
 *
 * A vertical Transporte (DL-103, Onda 1.5/PR-F1) nasce atrás de
 * `VITE_FEATURE_TRANSPORTE`, default DESLIGADO — este teste prende o
 * comportamento de parsing para a env var nunca "vazar" a feature por
 * acidente (ex.: valor truthy em JS como string não-vazia "false").
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isEnvFlagOn } from '../../src/lib/feature-flags.js';

test('isEnvFlagOn: só "true"/"1" ligam a flag', () => {
  assert.equal(isEnvFlagOn('true'), true);
  assert.equal(isEnvFlagOn('TRUE'), true);
  assert.equal(isEnvFlagOn(' true '), true);
  assert.equal(isEnvFlagOn('1'), true);
});

test('isEnvFlagOn: qualquer outro valor — incluindo ausente — desliga (default seguro)', () => {
  assert.equal(isEnvFlagOn('false'), false);
  assert.equal(isEnvFlagOn('0'), false);
  assert.equal(isEnvFlagOn(''), false);
  assert.equal(isEnvFlagOn(undefined), false);
  assert.equal(isEnvFlagOn(null), false);
  assert.equal(isEnvFlagOn('on'), false, 'string truthy em JS mas não reconhecida — não pode ligar por acidente');
});
