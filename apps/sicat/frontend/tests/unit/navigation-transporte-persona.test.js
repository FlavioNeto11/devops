/**
 * Trava de CONTRATO da navegação do MÓDULO do Transportador (REQ-SICAT-0032).
 *
 * Sob node:test a flag de build (VITE_FEATURE_TRANSPORTE via import.meta.env)
 * resolve para DESLIGADA — os grupos transporte-* nascem `hidden`. Por isso o
 * contrato de persona é validado em duas camadas: (1) ESTÁTICA sobre o fonte
 * (mesmo padrão de router-persona-routes.test.js) para as declarações que o
 * runtime de teste não enxerga; (2) COMPORTAMENTAL sobre filterNavigationGroups
 * para o que é observável com a flag desligada (ninguém vê transporte-*) e para
 * o recorte de persona dos módulos já existentes (regressão do mecanismo).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAVIGATION_GROUPS, filterNavigationGroups } from '../../src/config/navigation.js';
import { getGlossaryTerm } from '../../src/config/glossary.js';

const navigationSource = readFileSync(
  fileURLToPath(new URL('../../src/config/navigation.js', import.meta.url)),
  'utf8'
);
const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

const transporteGroups = NAVIGATION_GROUPS.filter((group) => String(group.id).startsWith('transporte-'));

test('os grupos do módulo Transporte existem e declaram persona carrier + gate de flag', () => {
  assert.ok(transporteGroups.length >= 3, 'esperados ao menos 3 grupos transporte-*');
  for (const group of transporteGroups) {
    assert.deepEqual(
      group.personas,
      ['carrier'],
      `${group.id} precisa declarar personas: ['carrier'] — é o mecanismo que faz o Transporte ser um módulo`
    );
  }
  // A ligação `hidden: !TRANSPORTE_FEATURE_FLAG` é resolvida no import (build-time);
  // aqui a checagem é estática no fonte, uma por grupo declarado.
  const hiddenDecls = navigationSource.match(/hidden:\s*!TRANSPORTE_FEATURE_FLAG/g) || [];
  assert.ok(
    hiddenDecls.length >= transporteGroups.length,
    'todo grupo transporte-* precisa de hidden: !TRANSPORTE_FEATURE_FLAG (gate de build)'
  );
});

test('com a flag desligada, NENHUMA persona vê o módulo Transporte (gate antes do recorte)', () => {
  for (const accountType of ['carrier', 'generator', 'receiver', '']) {
    const groups = filterNavigationGroups({ accountType });
    assert.equal(
      groups.some((group) => String(group.id).startsWith('transporte-')),
      false,
      `flag desligada deve esconder transporte-* para accountType='${accountType}'`
    );
  }
});

test('o recorte por persona continua funcionando nos módulos existentes (regressão do mecanismo)', () => {
  const generatorGroups = filterNavigationGroups({ accountType: 'generator' });
  const receiverGroups = filterNavigationGroups({ accountType: 'receiver' });
  assert.ok(
    generatorGroups.some((group) => group.id === 'mtr-provisorio'),
    'gerador vê MTR provisório'
  );
  assert.equal(
    receiverGroups.some((group) => group.id === 'mtr-provisorio'),
    false,
    'destinador não vê MTR provisório'
  );
  assert.ok(receiverGroups.some((group) => group.id === 'cdf'), 'destinador vê CDF');
});

test('todo glossaryKey declarado na navegação resolve para verbete existente', () => {
  for (const group of NAVIGATION_GROUPS) {
    if (group.glossaryKey) {
      assert.ok(
        getGlossaryTerm(group.glossaryKey),
        `glossaryKey '${group.glossaryKey}' do grupo ${group.id} não resolve no glossário`
      );
    }
    for (const item of group.items || []) {
      if (item.glossaryKey) {
        assert.ok(
          getGlossaryTerm(item.glossaryKey),
          `glossaryKey '${item.glossaryKey}' do item ${item.to} não resolve no glossário`
        );
      }
    }
  }
});

test('todo item de menu do módulo Transporte aponta para rota declarada no router', () => {
  for (const group of transporteGroups) {
    for (const item of group.items || []) {
      assert.ok(
        routerSource.includes(`path: '${item.to}'`),
        `item de menu ${item.to} (${group.id}) não tem rota correspondente em router.js — menu nunca aponta para tela inexistente`
      );
    }
  }
});
