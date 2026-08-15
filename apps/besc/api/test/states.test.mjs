// Testes de unidade da máquina de estado jurídico (Fase 1). Sem banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, cascadeFor, AVAILABLE_STATES, TRANSITIONS, LEGAL_STATUSES } from '../src/marketplace/states.js';

test('7 estados jurídicos definidos', () => {
  assert.deepEqual(Object.keys(LEGAL_STATUSES).sort(), ['archived', 'defeated', 'reinstated', 'ruled_against', 'ruled_favorable', 'under_appeal', 'unjudged'].sort());
});

test('estados disponíveis para contratação', () => {
  for (const s of ['unjudged', 'ruled_favorable', 'reinstated']) assert.ok(AVAILABLE_STATES.has(s), s);
  for (const s of ['ruled_against', 'under_appeal', 'defeated', 'archived']) assert.ok(!AVAILABLE_STATES.has(s), s);
});

test('transições permitidas do desenho', () => {
  assert.ok(canTransition('unjudged', 'ruled_against'));
  assert.ok(canTransition('ruled_against', 'under_appeal'));
  assert.ok(canTransition('under_appeal', 'reinstated'));
  assert.ok(canTransition('ruled_against', 'defeated'));
  assert.ok(canTransition('defeated', 'archived'));
});

test('transições proibidas rejeitadas', () => {
  assert.ok(!canTransition('ruled_against', 'ruled_favorable')); // não pula de volta sem recurso
  assert.ok(!canTransition('defeated', 'reinstated'));           // derrota é terminal (só archived)
  assert.ok(!canTransition('unjudged', 'defeated'));             // precisa passar por ruled_against
});

test('cascatas por transição de destino', () => {
  assert.equal(cascadeFor('ruled_against'), 'suspend');
  assert.equal(cascadeFor('under_appeal'), 'suspend');
  assert.equal(cascadeFor('reinstated'), 'reactivate');
  assert.equal(cascadeFor('defeated'), 'defeat');
  assert.equal(cascadeFor('archived'), 'freeze_only');
});

test('nenhum destino de transição é estado desconhecido', () => {
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    assert.ok(LEGAL_STATUSES[from], `from desconhecido: ${from}`);
    for (const to of tos) assert.ok(LEGAL_STATUSES[to], `to desconhecido: ${to}`);
  }
});
