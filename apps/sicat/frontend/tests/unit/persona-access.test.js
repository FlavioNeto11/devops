/**
 * GUARD DE PERFIL (persona) — o teste que faltava.
 *
 * Causa de fundo relatada na revisão: "o wizard e o guard não têm teste que os
 * prenda; as guardas de QA passaram verdes com o Destinador conseguindo emitir
 * MTR". Estes casos prendem a regra de acesso por perfil da conta CETESB, sem
 * browser e sem servidor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_PERSONAS,
  describeRequiredPersonas,
  normalizePersona,
  resolveActivePersona,
  routeAllowsPersona
} from '../../src/lib/persona-access.js';

/** Rota exclusiva do Gerador — é a rota real de "Emitir MTR" (`/manifestos/novo`). */
const ROUTE_GENERATOR_ONLY = { path: '/manifestos/novo', meta: { personas: ['generator'] } };
/** Rota exclusiva do Destinador — CDF. */
const ROUTE_RECEIVER_ONLY = { path: '/cdf/novo', meta: { personas: ['receiver'] } };
/** Rota sem restrição de perfil — lista de manifestos. */
const ROUTE_ANY_PERSONA = { path: '/manifestos', meta: {} };

/** Store de auth falso: só o que `resolveActivePersona` lê. */
function fakeAuthStore(accountType) {
  return { activeAccount: { value: accountType === undefined ? null : { accountType } } };
}

test('(a) conta receiver NÃO acessa rota exclusiva do generator', () => {
  const persona = resolveActivePersona(fakeAuthStore('receiver'));
  assert.equal(persona, 'receiver');
  assert.equal(
    routeAllowsPersona(ROUTE_GENERATOR_ONLY, persona),
    false,
    'Destinador não pode emitir MTR — este é o furo relatado na revisão.'
  );
});

test('(b) conta generator acessa a mesma rota', () => {
  const persona = resolveActivePersona(fakeAuthStore('generator'));
  assert.equal(persona, 'generator');
  assert.equal(routeAllowsPersona(ROUTE_GENERATOR_ONLY, persona), true);
});

test('(c) rota sem personas é permitida para qualquer perfil', () => {
  for (const accountType of [...KNOWN_PERSONAS, '', 'qualquer-coisa']) {
    const persona = resolveActivePersona(fakeAuthStore(accountType));
    assert.equal(
      routeAllowsPersona(ROUTE_ANY_PERSONA, persona),
      true,
      `rota livre bloqueou o perfil "${accountType}"`
    );
  }

  // `meta.personas` vazio conta como "sem restrição" (mesma semântica de navigation.js).
  assert.equal(routeAllowsPersona({ meta: { personas: [] } }, 'receiver'), true);
  assert.equal(routeAllowsPersona({}, 'receiver'), true);
});

test('(d) accountType não reconhecido/vazio NÃO restringe (fail-open documentado)', () => {
  // Enquanto o backend não resolve o tipo da conta, a UI não pode trancar o
  // operador fora das telas — o menu (config/navigation.js) usa a mesma regra.
  // É fail-open DELIBERADO: a autorização de verdade é do backend.
  for (const accountType of ['', '   ', null, undefined, 'GERADOR', 'transportadora', 42]) {
    const persona = resolveActivePersona(fakeAuthStore(accountType));
    assert.equal(persona, '', `accountType "${String(accountType)}" não deveria resolver perfil`);
    assert.equal(routeAllowsPersona(ROUTE_GENERATOR_ONLY, persona), true);
    assert.equal(routeAllowsPersona(ROUTE_RECEIVER_ONLY, persona), true);
  }
});

test('resolveActivePersona normaliza caixa e espaços do accountType', () => {
  assert.equal(resolveActivePersona(fakeAuthStore('  Receiver ')), 'receiver');
  assert.equal(resolveActivePersona(fakeAuthStore('GENERATOR')), 'generator');
  // Sem conta ativa (ou sem store) não explode: perfil não resolvido.
  assert.equal(resolveActivePersona(fakeAuthStore(undefined)), '');
  assert.equal(resolveActivePersona(null), '');
  assert.equal(normalizePersona('carrier'), 'carrier');
});

test('perfis conhecidos são exatamente generator/carrier/receiver', () => {
  assert.deepEqual([...KNOWN_PERSONAS].sort(), ['carrier', 'generator', 'receiver']);
});

test('cada perfil só entra na rota do seu perfil', () => {
  const matrix = [
    ['generator', ROUTE_GENERATOR_ONLY, true],
    ['carrier', ROUTE_GENERATOR_ONLY, false],
    ['receiver', ROUTE_GENERATOR_ONLY, false],
    ['generator', ROUTE_RECEIVER_ONLY, false],
    ['carrier', ROUTE_RECEIVER_ONLY, false],
    ['receiver', ROUTE_RECEIVER_ONLY, true]
  ];

  for (const [persona, route, expected] of matrix) {
    assert.equal(
      routeAllowsPersona(route, persona),
      expected,
      `${persona} em ${route.path} deveria ser ${expected ? 'permitido' : 'bloqueado'}`
    );
  }
});

test('rota com dois perfis aceita os dois e descreve o requisito em pt-BR', () => {
  const route = { meta: { personas: ['generator', 'receiver'] } };
  assert.equal(routeAllowsPersona(route, 'generator'), true);
  assert.equal(routeAllowsPersona(route, 'receiver'), true);
  assert.equal(routeAllowsPersona(route, 'carrier'), false);
  assert.equal(describeRequiredPersonas(route), 'Gerador ou Destinador');
  assert.equal(describeRequiredPersonas(ROUTE_GENERATOR_ONLY), 'Gerador');
  assert.equal(describeRequiredPersonas(ROUTE_ANY_PERSONA), '');
});
