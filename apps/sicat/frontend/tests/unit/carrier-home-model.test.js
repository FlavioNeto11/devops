/**
 * Testes do modelo PURO da home do Transportador (REQ-SICAT-0032).
 * A jornada é decisão de produto: checklist derivado de dados, atenção ordenada
 * por severidade com teto, e hub que NUNCA aponta para rota inexistente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildCarrierAttention,
  buildCarrierChecklist,
  buildCarrierHubActions,
  countOpenOperations,
  countOperations,
  isChecklistComplete
} from '../../src/features/dashboard/carrier-home-model.js';

const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

test('checklist deriva dos dados e completa na ordem da jornada', () => {
  const vazio = buildCarrierChecklist({});
  assert.equal(vazio.length, 3);
  assert.deepEqual(vazio.map((step) => step.done), [false, false, false]);
  assert.equal(isChecklistComplete(vazio), false);

  const parcial = buildCarrierChecklist({ carriersCount: 1, vehiclesCount: 0, operationsCount: 0 });
  assert.deepEqual(parcial.map((step) => step.done), [true, false, false]);

  const completo = buildCarrierChecklist({ carriersCount: 2, vehiclesCount: 3, operationsCount: 1 });
  assert.equal(isChecklistComplete(completo), true);
});

test('atenção ordena por severidade (error antes de warning) e respeita o teto', () => {
  const overview = {
    operationsByStatus: { blocked: 2 },
    fiscalDocuments: { invalid: 1 },
    jobs: { retryWait: 1, dlq: 2 },
    ciot: { unconfirmedPending: 3 },
    insurance: { expiringOrExpiredCount: 1 },
    rntrc: { staleCarriers: 4 }
  };
  const { items, totalCount } = buildCarrierAttention(overview);
  assert.equal(totalCount, 6, 'todas as fontes contam no total');
  assert.equal(items.length, 4, 'exibição tem teto de 4');
  assert.deepEqual(
    items.map((item) => item.tone),
    ['error', 'error', 'error', 'warning'],
    'erros vêm antes de avisos'
  );
  for (const item of items) {
    assert.ok(item.to, `item ${item.key} precisa de deep-link`);
    assert.ok(item.actionLabel, `item ${item.key} precisa de ação`);
  }
});

test('overview vazio/nulo não gera atenção nem quebra', () => {
  assert.deepEqual(buildCarrierAttention(null), { items: [], totalCount: 0 });
  assert.deepEqual(buildCarrierAttention({}), { items: [], totalCount: 0 });
});

test('contagens de operações somam o mapa por status e separam abertas de terminais', () => {
  const overview = { operationsByStatus: { draft: 2, in_transit: 1, completed: 5, cancelled: 1 } };
  assert.equal(countOperations(overview), 9);
  assert.equal(countOpenOperations(overview), 3, 'completed/cancelled ficam de fora das abertas');
  assert.equal(countOperations(null), 0);
});

test('hub: registrar viagem é a ação primária; badge das abertas fica no acompanhar', () => {
  const semBadge = buildCarrierHubActions({ openOperationsCount: 0 });
  assert.equal(semBadge[0].key, 'registrar', 'a ação primária do transportador é registrar a viagem');
  assert.equal(semBadge[0].tone, 'primary');
  assert.equal(semBadge[1].badge, '', 'sem operações abertas, sem badge');
  const comBadge = buildCarrierHubActions({ openOperationsCount: 7 });
  assert.equal(comBadge[1].badge, 7);

  for (const action of comBadge) {
    assert.ok(
      routerSource.includes(`path: '${action.to}'`),
      `ação do hub aponta para rota inexistente: ${action.to}`
    );
  }
});

test('checklist e atenção: TODO destino existe no router (menu nunca aponta para tela inexistente)', () => {
  for (const step of buildCarrierChecklist({})) {
    assert.ok(routerSource.includes(`path: '${step.to}'`), `passo do checklist sem rota: ${step.to}`);
  }
  const overview = {
    operationsByStatus: { blocked: 1 },
    fiscalDocuments: { invalid: 1 },
    jobs: { dlq: 1 },
    ciot: { unconfirmedPending: 1 },
    insurance: { expiringOrExpiredCount: 1 },
    rntrc: { staleCarriers: 1 }
  };
  const { items } = buildCarrierAttention(overview, { cap: 10 });
  for (const item of items) {
    assert.ok(routerSource.includes(`path: '${item.to}'`), `atenção sem rota: ${item.to}`);
  }
});
