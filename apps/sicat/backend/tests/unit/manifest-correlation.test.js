import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendManifestCorrelationMarker,
  buildManifestCorrelationMarker,
  extractManifestIdFromObservation
} from '../../src/lib/manifest-correlation.js';

// C1 — marcador determinístico de correlação pré-submit.
// Estes testes provam as três propriedades exigidas do marcador:
// determinismo, preservação da observação do usuário e recuperabilidade
// (round-trip via extractManifestIdFromObservation, o mesmo parse usado
// para reencontrar o MTR no manObservacao devolvido por searchManifests).

test('buildManifestCorrelationMarker é determinístico: mesma entrada, mesma saída', () => {
  const first = buildManifestCorrelationMarker('man_abc123');
  const second = buildManifestCorrelationMarker('man_abc123');
  assert.equal(first, second);
  assert.equal(first, '[sicat:man_abc123]');
});

test('buildManifestCorrelationMarker distingue manifestos: entradas diferentes, saídas diferentes', () => {
  const markerA = buildManifestCorrelationMarker('man_aaa111');
  const markerB = buildManifestCorrelationMarker('man_bbb222');
  assert.notEqual(markerA, markerB);
});

test('buildManifestCorrelationMarker nunca produz marcador vazio', () => {
  const marker = buildManifestCorrelationMarker('man_abc123');
  assert.ok(marker.length > 0);
  assert.ok(marker.includes('man_abc123'));
});

test('buildManifestCorrelationMarker rejeita id vazio ou inválido', () => {
  assert.throws(() => buildManifestCorrelationMarker(''), /obrigatório/);
  assert.throws(() => buildManifestCorrelationMarker('   '), /obrigatório/);
  assert.throws(() => buildManifestCorrelationMarker('man com espaço'), /inválido/);
  assert.throws(() => buildManifestCorrelationMarker('man[123]'), /inválido/);
});

test('appendManifestCorrelationMarker preserva a observação do usuário (concatena, não sobrescreve)', () => {
  const result = appendManifestCorrelationMarker('Entrega pela portaria 2', 'man_abc123');
  assert.equal(result, 'Entrega pela portaria 2 [sicat:man_abc123]');
  assert.ok(result.startsWith('Entrega pela portaria 2'));
});

test('appendManifestCorrelationMarker com observação vazia/ausente retorna só o marcador', () => {
  assert.equal(appendManifestCorrelationMarker('', 'man_abc123'), '[sicat:man_abc123]');
  assert.equal(appendManifestCorrelationMarker(null, 'man_abc123'), '[sicat:man_abc123]');
  assert.equal(appendManifestCorrelationMarker(undefined, 'man_abc123'), '[sicat:man_abc123]');
  assert.equal(appendManifestCorrelationMarker('   ', 'man_abc123'), '[sicat:man_abc123]');
});

test('appendManifestCorrelationMarker é idempotente: não duplica marcador já presente', () => {
  const once = appendManifestCorrelationMarker('Obs do usuário', 'man_abc123');
  const twice = appendManifestCorrelationMarker(once, 'man_abc123');
  assert.equal(once, twice);
  const occurrences = twice.split('[sicat:man_abc123]').length - 1;
  assert.equal(occurrences, 1);
});

test('round-trip: o id é recuperável do manObservacao gerado', () => {
  const observation = appendManifestCorrelationMarker('Obs qualquer do operador', 'man_xyz789');
  assert.equal(extractManifestIdFromObservation(observation), 'man_xyz789');
});

test('extractManifestIdFromObservation retorna null sem marcador ou com entrada não-string', () => {
  assert.equal(extractManifestIdFromObservation('observação comum sem marcador'), null);
  assert.equal(extractManifestIdFromObservation(''), null);
  assert.equal(extractManifestIdFromObservation(null), null);
  assert.equal(extractManifestIdFromObservation(42), null);
  assert.equal(extractManifestIdFromObservation({}), null);
});
