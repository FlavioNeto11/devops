/**
 * Trava de CONTRATO do catálogo do copiloto para o módulo Transportadora
 * (REQ-SICAT-0032, onda F5): toda tela do módulo tem contexto próprio (não cai
 * no genérico), toda quickAction é local/navigate (o dispatcher do backend não
 * tem tools de transporte — prompt `backend` sem tool induz resposta sem dado)
 * e todo deep-link aponta para rota declarada no router.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getShellScreenMeta, getShellScreenDescription } from '../../src/config/conversation-screen-catalog.js';

const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

const TRANSPORTE_ROUTE_NAMES = [
  'TransporteOperacaoList',
  'TransporteOperacaoNova',
  'TransporteOperacaoDetalhe',
  'TransportePendencias',
  'TransporteTransportadorList',
  'TransporteTransportadorDetalhe',
  'TransporteVeiculoList',
  'TransporteMotoristaList',
  'TransporteMotoristaDetalhe',
  'TransporteSegurosApolices',
  'TransporteSegurosAverbacoes',
  'TransporteSegurosApuracao',
  'TransporteGr',
  'TransporteHabilitacao',
  'TransporteRegras',
  'TransporteWatchList',
  'TransporteWatchDetalhe',
  'TransportePisoTabelas'
];

const genericDescription = getShellScreenDescription('RotaQueNaoExiste');

test('toda tela do módulo Transportadora tem entrada própria no catálogo do copiloto', () => {
  for (const routeName of TRANSPORTE_ROUTE_NAMES) {
    const meta = getShellScreenMeta(routeName);
    assert.notEqual(
      getShellScreenDescription(routeName),
      genericDescription,
      `${routeName} caiu no DEFAULT_SCREEN_META — o copiloto fica sem contexto da tela`
    );
    assert.ok(meta.title, `${routeName} sem title`);
    assert.ok(meta.purpose, `${routeName} sem purpose`);
    assert.ok(Array.isArray(meta.fieldHints) && meta.fieldHints.length > 0, `${routeName} sem fieldHints`);
  }
});

test('quickActions do módulo são só local/navigate e deep-links existem no router', () => {
  for (const routeName of TRANSPORTE_ROUTE_NAMES) {
    const meta = getShellScreenMeta(routeName);
    for (const action of meta.quickActions || []) {
      assert.ok(
        action.kind === 'local' || action.kind === 'navigate',
        `${routeName}/${action.id}: kind '${action.kind}' — backend só quando o dispatcher tiver tools de transporte`
      );
      if (action.kind === 'navigate') {
        assert.ok(
          routerSource.includes(`path: '${action.to}'`),
          `${routeName}/${action.id}: navigate para rota inexistente ${action.to}`
        );
      }
    }
    for (const related of meta.relatedRoutes || []) {
      assert.ok(
        routerSource.includes(`path: '${related.to}'`),
        `${routeName}: relatedRoute para rota inexistente ${related.to}`
      );
    }
  }
});
