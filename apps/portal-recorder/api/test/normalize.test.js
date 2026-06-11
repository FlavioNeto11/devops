import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvents, inferSchema, looksLikeId, buildTemplate } from '../src/normalize.js';

test('looksLikeId: numérico/hash/uuid/encoded', () => {
  assert.ok(looksLikeId('12345'));
  assert.ok(looksLikeId('a1b2c3d4e5f6a1b2'));
  assert.ok(looksLikeId('Item%20A'));
  assert.ok(!looksLikeId('estados'));
  assert.ok(!looksLikeId('tratamento'));
});

test('buildTemplate: segmento variável id-like vira {param}, fixo permanece', () => {
  const t = buildTemplate(['/api/cidades/26', '/api/cidades/35']);
  assert.equal(t, '/api/cidades/{p3}');
  const fixed = buildTemplate(['/api/estados', '/api/estados']);
  assert.equal(fixed, '/api/estados');
});

test('buildTemplate: 1 amostra com segmento não-id permanece literal', () => {
  assert.equal(buildTemplate(['/api/residuo/tratamento']), '/api/residuo/tratamento');
});

test('normalizeEvents: agrupa por template e conta ocorrências', () => {
  const events = [
    { id: 'e1', method: 'GET', host: 'h', path: '/api/cidades/26', status_code: 200, resp_body: [{ cidCodigo: 1 }] },
    { id: 'e2', method: 'GET', host: 'h', path: '/api/cidades/35', status_code: 200, resp_body: [{ cidCodigo: 2 }] },
    { id: 'e3', method: 'GET', host: 'h', path: '/api/estados', status_code: 200, resp_body: [{ estCodigo: 26 }] },
  ];
  const eps = normalizeEvents(events);
  const cidades = eps.find((e) => e.path_template.includes('cidades'));
  assert.equal(cidades.path_template, '/api/cidades/{p3}');
  assert.equal(cidades.occurrence_count, 2);
  const estados = eps.find((e) => e.path_template === '/api/estados');
  assert.equal(estados.occurrence_count, 1);
});

test('inferSchema: required vs optional + sensitive', () => {
  const s = inferSchema([
    { sistema: 0, login: 'a', senha: 'x' },
    { sistema: 1, login: 'b', senha: 'y', recaptcha: '' },
  ]);
  assert.ok(s.required.includes('sistema') && s.required.includes('login'));
  assert.equal(s.properties.recaptcha.optional, true);
  assert.equal(s.properties.senha.sensitive, true);
});

test('normalizeEvents: requires_auth quando algum evento sinaliza', () => {
  const eps = normalizeEvents([
    { id: 'e1', method: 'POST', host: 'h', path: '/api/x', status_code: 200, req_body: { a: 1 }, requires_auth_hint: true },
  ]);
  assert.equal(eps[0].requires_auth, true);
});
