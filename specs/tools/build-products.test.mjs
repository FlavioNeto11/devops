// Testes dos helpers puros do build-products.mjs (importável — main() é guarded) +
// validação dos schemas novos (tier/profile/services-vazio-em-t1) via ajv real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { blueprintTier, basePathErrors, tierBlockErrors, computeCatalogHash } from './build-products.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const blueprintOf = (id) => readJson(path.join(SPECS_DIR, 'blueprints', id, 'blueprint.json'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const vBlueprint = ajv.compile(readJson(path.join(SPECS_DIR, 'schema', 'blueprint.schema.json')));
const vProduct = ajv.compile(readJson(path.join(SPECS_DIR, 'schema', 'product.schema.json')));
const vCapability = ajv.compile(readJson(path.join(SPECS_DIR, 'schema', 'capability.schema.json')));

// --- tiers como presets de blueprint -------------------------------------------

test('blueprintTier: ausente = t3 (aditivo); cms-portal = t1; app-simples = t2', () => {
  assert.equal(blueprintTier({}), 't3');
  assert.equal(blueprintTier(null), 't3');
  assert.equal(blueprintTier(blueprintOf('cms-portal')), 't1');
  assert.equal(blueprintTier(blueprintOf('app-simples')), 't2');
  assert.equal(blueprintTier(blueprintOf('node-api-vue-spa')), 't3');
});

test('NEGATIVO: produto t1 (cms-portal) com bloco de código FALHA com erro claro', () => {
  const prod = { name: 'meu-portal', blueprint: 'cms-portal', capability_blocks: ['observabilidade'] };
  const errs = tierBlockErrors(prod, blueprintOf('cms-portal'));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /t1/, 'o erro deveria explicar que o blueprint é t1');
  assert.match(errs[0], /capability_blocks/, 'o erro deveria citar os blocos ofensores');
});

test('produto t1 SEM blocos passa; produto t3 com blocos passa', () => {
  assert.deepEqual(tierBlockErrors({ name: 'p', capability_blocks: [] }, blueprintOf('cms-portal')), []);
  assert.deepEqual(tierBlockErrors({ name: 'p' }, blueprintOf('cms-portal')), []);
  assert.deepEqual(tierBlockErrors({ name: 'sicat', capability_blocks: ['observabilidade'] }, blueprintOf('node-api-vue-spa')), []);
});

// --- base_path por app_type -----------------------------------------------------

test('base_path: produto comum exige /<name>; /sites/<name> é recusado', () => {
  const bp = blueprintOf('node-api-vue-spa');
  assert.deepEqual(basePathErrors({ name: 'sicat', base_path: '/sicat' }, bp), []);
  assert.equal(basePathErrors({ name: 'sicat', base_path: '/sites/sicat' }, bp).length, 1);
  assert.equal(basePathErrors({ name: 'sicat', base_path: '/outro' }, bp).length, 1);
});

test('base_path: produto cms_portal (blueprint t1) aceita /sites/<name> E /<name>', () => {
  const bp = blueprintOf('cms-portal');
  const prod = { name: 'expo-verde', app_type: 'cms_portal' };
  assert.deepEqual(basePathErrors({ ...prod, base_path: '/sites/expo-verde' }, bp), []);
  assert.deepEqual(basePathErrors({ ...prod, base_path: '/expo-verde' }, bp), []);
  assert.equal(basePathErrors({ ...prod, base_path: '/sites/outro' }, bp).length, 1);
});

// --- catalog_hash (mesmo padrão do baseline_hash) --------------------------------

test('computeCatalogHash: estável e sensível a conteúdo', () => {
  const bps = [{ id: 'a' }];
  const caps = [{ id: 'x', title: 't' }];
  const h1 = computeCatalogHash(bps, caps);
  const h2 = computeCatalogHash([{ id: 'a' }], [{ id: 'x', title: 't' }]);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, h2, 'mesmo conteúdo => mesmo hash');
  assert.notEqual(h1, computeCatalogHash(bps, [{ id: 'x', title: 'MUDOU' }]), 'conteúdo diferente => hash diferente');
});

test('catalog_hash emitido em specs/baseline/capabilities.json bate com o recomputado', () => {
  const idx = readJson(path.join(SPECS_DIR, 'baseline', 'capabilities.json'));
  const bidx = readJson(path.join(SPECS_DIR, 'baseline', 'blueprints.json'));
  assert.match(idx.catalog_hash || '', /^[0-9a-f]{64}$/);
  assert.equal(idx.catalog_hash, computeCatalogHash(bidx.blueprints, idx.capabilities));
});

// --- schemas: tier/profile/services-vazio só em t1 -------------------------------

test('schema blueprint: t1 permite services vazio e sem scaffold (cms-portal real valida)', () => {
  const doc = blueprintOf('cms-portal');
  assert.ok(vBlueprint(doc), JSON.stringify(vBlueprint.errors));
});

test('schema blueprint: fora de t1, services vazio ou sem scaffold REPROVA (aditivo — regra antiga intacta)', () => {
  const base = { id: 'x', version: '1.0.0', name: 'blueprint x', stack: { api: 'node' }, scaffold: { generator: 'g', args: {} } };
  assert.ok(!vBlueprint({ ...base, services: [] }), 'services vazio sem tier deveria reprovar');
  assert.ok(!vBlueprint({ ...base, tier: 't2', services: [] }), 'services vazio em t2 deveria reprovar');
  const { scaffold, ...noScaffold } = { ...base, services: ['api'] };
  assert.ok(!vBlueprint(noScaffold), 'sem scaffold fora de t1 deveria reprovar');
  assert.ok(vBlueprint({ ...base, services: ['api'] }), JSON.stringify(vBlueprint.errors));
});

test('schema blueprint: tier inválido reprova; profile é objeto livre', () => {
  const base = { id: 'x', version: '1.0.0', name: 'blueprint x', stack: {}, services: ['api'], scaffold: { generator: 'g', args: {} } };
  assert.ok(!vBlueprint({ ...base, tier: 't9' }));
  assert.ok(vBlueprint({ ...base, tier: 't4', profile: { qualquer: 'coisa' } }), JSON.stringify(vBlueprint.errors));
});

test('schema capability: tiers opcional aditivo (mobile-pwa real valida; tier inválido reprova)', () => {
  const doc = readJson(path.join(SPECS_DIR, 'forge', 'capabilities', 'blocks', 'mobile-pwa.json'));
  assert.ok(vCapability(doc), JSON.stringify(vCapability.errors));
  assert.ok(!vCapability({ ...doc, tiers: ['t9'] }));
});

test('schema product: base_path aceita /sites/<chave> (padrão) e segue recusando lixo', () => {
  const prod = readJson(path.join(SPECS_DIR, 'products', 'sicat', 'product.json'));
  assert.ok(vProduct(prod), JSON.stringify(vProduct.errors));
  assert.ok(vProduct({ ...prod, name: 'expo-verde', base_path: '/sites/expo-verde', app_type: 'cms_portal' }), JSON.stringify(vProduct.errors));
  assert.ok(!vProduct({ ...prod, base_path: '/sites/x/y' }));
  assert.ok(!vProduct({ ...prod, base_path: 'sicat' }));
});
