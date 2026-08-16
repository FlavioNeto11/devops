/**
 * Trava de CONTRATO do router: as rotas exclusivas de um perfil precisam
 * declarar `meta.personas`, e o guard precisa continuar CHAMADO.
 *
 * `src/router.js` importa `.vue` e o vue-router — não é importável em node:test.
 * Então a checagem é sobre o FONTE (estática, rápida, sem browser). Sem ela,
 * apagar `personas: ['generator']` de "Emitir MTR" ou remover a chamada do guard
 * passaria verde: exatamente o cenário do Destinador emitindo MTR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

/** Trecho do fonte entre a declaração de `path` e a próxima rota. */
function routeBlock(path) {
  const marker = `path: '${path}'`;
  const start = routerSource.indexOf(marker);
  assert.notEqual(start, -1, `rota ${path} não encontrada em src/router.js`);
  const next = routerSource.indexOf("path: '", start + marker.length);
  return routerSource.slice(start, next === -1 ? routerSource.length : next);
}

test('rotas de emissão de MTR são exclusivas do Gerador', () => {
  for (const path of ['/manifestos/novo', '/mtr-provisorio', '/mtr-provisorio/novo', '/mtr-provisorio/:id']) {
    assert.match(
      routeBlock(path),
      /personas:\s*\['generator'\]/,
      `${path} precisa declarar personas: ['generator'] — sem isso o Destinador emite MTR por URL direta`
    );
  }
});

test('rotas de CDF são exclusivas do Destinador', () => {
  for (const path of ['/cdf', '/cdf/novo']) {
    assert.match(
      routeBlock(path),
      /personas:\s*\['receiver'\]/,
      `${path} precisa declarar personas: ['receiver']`
    );
  }
});

test('rotas do módulo Transporte são exclusivas do Transportador (REQ-SICAT-0032)', () => {
  for (const path of [
    '/transporte/operacoes',
    '/transporte/operacoes/:operationId',
    '/transporte/regras',
    '/transporte/pendencias',
    '/transporte/transportadores',
    '/transporte/transportadores/:partyId',
    '/transporte/veiculos',
    '/transporte/motoristas',
    '/transporte/motoristas/:driverId',
    '/transporte/seguros/averbacoes',
    '/transporte/seguros/apolices',
    '/transporte/seguros/apuracao',
    '/transporte/watch',
    '/transporte/watch/:itemId',
    '/transporte/piso/tabelas'
  ]) {
    assert.match(
      routeBlock(path),
      /personas:\s*\['carrier'\]/,
      `${path} precisa declarar personas: ['carrier'] — o módulo é ancorado na persona do Transportador`
    );
  }
});

test('a home do módulo Transporte é um alias para o dashboard (sem segunda home)', () => {
  assert.match(
    routeBlock('/transporte'),
    /redirect:\s*'\/dashboard'/,
    "/transporte deve redirecionar para /dashboard — a home por persona é o DashboardView"
  );
});

test('rotas compartilhadas não declaram perfil', () => {
  for (const path of ['/manifestos', '/dashboard', '/dmr']) {
    assert.doesNotMatch(
      routeBlock(path),
      /personas:/,
      `${path} é tela comum aos perfis — não deve restringir persona`
    );
  }
});

test('o guard de persona continua ligado ao beforeEach', () => {
  assert.match(
    routerSource,
    /routeAllowsPersona\(\s*to,\s*resolveActivePersona\(\s*authStore\s*\)\s*\)/,
    'o beforeEach precisa avaliar routeAllowsPersona(to, resolveActivePersona(authStore))'
  );
  assert.match(
    routerSource,
    /from '\.\/lib\/persona-access\.js'/,
    'o router deve usar o módulo puro lib/persona-access.js (fonte única, testada)'
  );
});
