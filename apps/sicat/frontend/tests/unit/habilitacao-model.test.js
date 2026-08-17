/**
 * Testes do modelo PURO de "Minha habilitação" (onda F9 — REQ-SICAT-0037, com
 * os derivados de REQ-SICAT-0033).
 *
 * O que estes testes protegem, em ordem de risco:
 *  1. RNTRC "regular" exige situação ATIVA **e** verificação registrada — a
 *     leitura ingênua (`rntrcNumber` preenchido) marcaria como habilitada uma
 *     transportadora com registro suspenso.
 *  2. Todo destino do checklist existe no router (mesma trava do carrier-home).
 *  3. A tipologia é DERIVADA pelo backend e apenas TRADUZIDA aqui — o aviso de
 *     divergência não pode ser recalculado no frontend (segunda verdade).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildHabilitacaoChecklist,
  countHabilitacaoPending,
  describeTypology,
  isHabilitacaoComplete,
  isRntrcRegular
} from '../../src/views/transporte/habilitacao-model.js';

const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

const CARRIER_REGULAR = Object.freeze({
  id: 'trparty_1',
  rntrcNumber: '12345678',
  rntrcCategory: 'ETC',
  rntrcStatus: 'active',
  rntrcVerifiedAt: '2026-08-01T12:00:00.000Z'
});

test('RNTRC só é regular com situação ativa E verificação registrada', () => {
  assert.equal(isRntrcRegular(CARRIER_REGULAR), true);
  assert.equal(
    isRntrcRegular({ ...CARRIER_REGULAR, rntrcVerifiedAt: null }),
    false,
    'registro nunca verificado não habilita — o status "active" é só o declarado'
  );
  assert.equal(
    isRntrcRegular({ ...CARRIER_REGULAR, rntrcStatus: 'suspended' }),
    false,
    'suspenso é justamente o caso que a tela precisa pegar'
  );
  assert.equal(isRntrcRegular(null), false);
});

test('checklist deriva dos dados e cobre os quatro requisitos do pré-embarque', () => {
  const vazio = buildHabilitacaoChecklist({});
  assert.deepEqual(vazio.map((step) => step.key), ['rntrc', 'frota', 'motoristas', 'seguro']);
  assert.deepEqual(vazio.map((step) => step.done), [false, false, false, false]);
  assert.equal(isHabilitacaoComplete(vazio), false);
  assert.equal(countHabilitacaoPending(vazio), 4);

  const parcial = buildHabilitacaoChecklist({
    carrier: CARRIER_REGULAR,
    vehiclesCount: 2,
    driversCount: 0,
    activePoliciesCount: 1
  });
  assert.deepEqual(parcial.map((step) => step.done), [true, true, false, true]);
  assert.equal(countHabilitacaoPending(parcial), 1);
  assert.equal(isHabilitacaoComplete(parcial), false, 'sem motorista a habilitação não fecha');

  const completo = buildHabilitacaoChecklist({
    carrier: CARRIER_REGULAR,
    vehiclesCount: 1,
    driversCount: 1,
    activePoliciesCount: 1
  });
  assert.equal(isHabilitacaoComplete(completo), true);
  assert.equal(countHabilitacaoPending(completo), 0);
});

test('todo destino do checklist existe no router e tem rótulo de ação', () => {
  for (const step of buildHabilitacaoChecklist({})) {
    assert.ok(
      routerSource.includes(`path: '${step.to}'`),
      `passo ${step.key} aponta para rota inexistente: ${step.to}`
    );
    assert.ok(step.actionLabel, `passo ${step.key} sem rótulo de ação`);
    assert.ok(step.description, `passo ${step.key} sem explicação didática`);
  }
});

test('tipologia é traduzida (nunca recalculada) e explica a régua PF/TAC/ETC', () => {
  const tac = describeTypology({ derivedTypology: 'tac', fleetSize: 3, typologyWarning: null });
  assert.equal(tac.code, 'tac');
  assert.equal(tac.known, true);
  assert.match(tac.label, /TAC/);
  assert.match(tac.explanation, /3 veículos/);
  assert.equal(tac.fleetLabel, '3 veículos na frota ativa');
  assert.equal(tac.warning, null);

  const etc = describeTypology({ derivedTypology: 'etc', fleetSize: 1 });
  assert.match(etc.explanation, /CIOT/, 'a obrigação que distingue a ETC precisa aparecer');
  assert.equal(etc.fleetLabel, '1 veículo na frota ativa', 'singular correto');

  // Divergência declarado × derivado é decisão do BACKEND (não bloqueante):
  // a tela só REPASSA o texto — recalcular aqui criaria uma segunda verdade.
  const divergente = describeTypology({
    derivedTypology: 'etc',
    fleetSize: 5,
    rntrcCategory: 'TAC',
    typologyWarning: 'Categoria declarada TAC, frota indica ETC.'
  });
  assert.equal(divergente.warning, 'Categoria declarada TAC, frota indica ETC.');

  const semDerivacao = describeTypology(null);
  assert.equal(semDerivacao.known, false);
  assert.equal(semDerivacao.fleetSize, 0);
  assert.match(semDerivacao.explanation, /frota ativa/);
});
