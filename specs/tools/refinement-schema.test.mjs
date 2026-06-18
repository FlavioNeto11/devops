// Testes do schema de refinamento (REF-*) + guard de drift de enum vs. o schema de requisito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(__dirname, '..', 'schema');
const reqSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'requirement.schema.json'), 'utf8'));
const refSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'refinement.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(refSchema);

// fixture válida mínima (screen com rota, 1 âncora, 1 estado, origem)
const valid = () => ({
  id: 'REF-GYMOPS-0001',
  title: 'Endereço do empreendimento no perfil',
  kind: 'screen',
  status: 'draft',
  scope: { product_scope: 'gymops' },
  anchors: [{ requirement_id: 'REQ-GYMOPS-0010', relation: 'refines' }],
  surface: { route: '/profile', name: 'Perfil do usuário' },
  behavior: { states: [{ name: 'normal', when: 'tem unidade', ui: 'mostra endereço' }] },
  source: { source_paths: ['apps/gymops'] },
  version: { baseline_version: '1.0.0', item_revision: 1 },
});

test('refinement: fixture válida passa', () => {
  assert.equal(validate(valid()), true, JSON.stringify(validate.errors));
});

test('refinement: sem âncora reprova (anchors >= 1)', () => {
  const d = valid(); d.anchors = [];
  assert.equal(validate(d), false);
});

test('refinement: screen sem surface.route reprova (allOf if/then)', () => {
  const d = valid(); delete d.surface;
  assert.equal(validate(d), false);
});

test('refinement: sem behavior.states reprova', () => {
  const d = valid(); d.behavior = { states: [] };
  assert.equal(validate(d), false);
});

test('refinement: sem source.source_paths reprova', () => {
  const d = valid(); delete d.source;
  assert.equal(validate(d), false);
});

test('refinement: id fora do padrão REF-* reprova', () => {
  const d = valid(); d.id = 'REQ-GYMOPS-0001';
  assert.equal(validate(d), false);
});

test('refinement: kind inválido reprova', () => {
  const d = valid(); d.kind = 'pagina';
  assert.equal(validate(d), false);
});

test('refinement: anchor.requirement_id fora do padrão REQ-* reprova', () => {
  const d = valid(); d.anchors = [{ requirement_id: 'REF-X-0001', relation: 'refines' }];
  assert.equal(validate(d), false);
});

test('refinement: campo desconhecido reprova (additionalProperties:false)', () => {
  const d = valid(); d.foo = 'bar';
  assert.equal(validate(d), false);
});

// --- GUARD de drift de enum: os enums compartilhados são DUPLICADOS entre os dois
// schemas (JSON Schema 2020-12 não dá $ref de enum cross-file trivial). Este teste falha
// se alguém evoluir um enum num schema e esquecer o outro.
test('drift-guard: status, verification_method e semantic_change idênticos nos 2 schemas', () => {
  assert.deepEqual(refSchema.properties.status.enum, reqSchema.properties.status.enum);
  assert.deepEqual(
    refSchema.properties.verification_method.items.enum,
    reqSchema.properties.verification_method.items.enum,
  );
  assert.deepEqual(
    refSchema.properties.version.properties.semantic_change.enum,
    reqSchema.properties.version.properties.semantic_change.enum,
  );
});
