import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, loadCatalogHash, loadBlueprintTier, resolveBlocks, buildManifest, catalogSourceSha, DEFAULT_BLOCKS } from './apply-capabilities.mjs';

const byId = loadCatalog(); // catálogo real (specs/baseline/capabilities.json)

test('catálogo real carrega os 15 blocos', () => {
  assert.ok(byId.size >= 15, `esperava >=15 blocos, veio ${byId.size}`);
});

test('resolveBlocks: stack null NÃO casa com nada (fail-closed — bug da compatibilidade universal)', () => {
  const r = resolveBlocks(['camadas-rigidas', 'ia-grafo'], null, byId);
  assert.deepEqual(r, [], `stack null deveria resolver vazio, veio ${JSON.stringify(r)}`);
});

test('resolveBlocks: stack desconhecida também resolve vazio (nunca "compatível com tudo")', () => {
  const r = resolveBlocks(['camadas-rigidas'], 'stack-inexistente', byId);
  assert.deepEqual(r, []);
});

test('resolveBlocks: tier t1 (cms-portal) NÃO força DEFAULT_BLOCKS', () => {
  const r = resolveBlocks([], 'sicat', byId, { tier: 't1' });
  assert.deepEqual(r, [], `t1 deveria resolver vazio, veio ${JSON.stringify(r)}`);
});

test('resolveBlocks: tiers com código (t2/t3) seguem forçando os DEFAULT_BLOCKS', () => {
  for (const tier of ['t2', 't3']) {
    const r = resolveBlocks([], 'sicat', byId, { tier });
    for (const d of DEFAULT_BLOCKS) assert.ok(r.includes(d), `${tier} deveria incluir default '${d}'`);
  }
});

test('loadBlueprintTier: cms-portal=t1; existentes=t3; desconhecido=t3 (fail-soft)', () => {
  assert.equal(loadBlueprintTier('cms-portal'), 't1');
  assert.equal(loadBlueprintTier('node-api-vue-spa'), 't3');
  assert.equal(loadBlueprintTier('gymops-style'), 't3');
  assert.equal(loadBlueprintTier('blueprint-fantasma'), 't3');
});

test('buildManifest: carimba o catalog_hash do catálogo', () => {
  const hash = loadCatalogHash();
  assert.ok(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash), 'capabilities.json deveria expor catalog_hash sha256');
  const m = buildManifest({ app: 'x', stack: 'sicat', blocks: [], byId, catalogHash: hash });
  assert.equal(m.catalog_hash, hash);
});

test('bloco mobile-pwa: no catálogo, gymops-only, exemplar real do push VAPID', () => {
  const b = byId.get('mobile-pwa');
  assert.ok(b, 'mobile-pwa deveria estar no catálogo');
  assert.deepEqual(b.compatible_stacks, ['gymops']);
  assert.ok(b.reference.some((r) => r.path === 'apps/gymops/apps/api/src/lib/push.ts'));
  // sicat não recebe o bloco (fail-closed por stack)
  assert.ok(!resolveBlocks(['mobile-pwa'], 'sicat', byId).includes('mobile-pwa'));
  assert.ok(resolveBlocks(['mobile-pwa'], 'gymops', byId).includes('mobile-pwa'));
});

test('resolveBlocks: força observabilidade mesmo sem pedir', () => {
  const r = resolveBlocks(['camadas-rigidas'], 'sicat', byId);
  assert.ok(r.includes('observabilidade'));
});

test('resolveBlocks: fecha requires (ia-grafo -> structured-outputs)', () => {
  const r = resolveBlocks(['ia-grafo'], 'sicat', byId);
  assert.ok(r.includes('ia-grafo') && r.includes('structured-outputs'));
});

test('resolveBlocks: dropa incompatível com a stack (redis-bullmq em sicat)', () => {
  const r = resolveBlocks(['redis-bullmq'], 'sicat', byId);
  assert.ok(!r.includes('redis-bullmq'));
});

test('resolveBlocks: gateway puxa camadas-rigidas (requires)', () => {
  const r = resolveBlocks(['gateway-externo'], 'sicat', byId);
  assert.ok(r.includes('gateway-externo') && r.includes('camadas-rigidas'));
});

test('provenance: manifesto carrega catalog_source_sha (injetável; default fail-soft nunca vazio)', () => {
  const blocks = resolveBlocks(['camadas-rigidas'], 'sicat', byId);
  const m = buildManifest({ app: 'x', stack: 'sicat', blocks, byId, sourceSha: 'abc123' });
  assert.equal(m.catalog_source_sha, 'abc123');            // injetável em teste (determinístico)
  const sha = catalogSourceSha();                          // default: GITHUB_SHA | git rev-parse | "unknown"
  assert.ok(typeof sha === 'string' && sha.length > 0);
  const m2 = buildManifest({ app: 'x', stack: 'sicat', blocks, byId });
  assert.ok(typeof m2.catalog_source_sha === 'string' && m2.catalog_source_sha.length > 0);
});

test('buildManifest: agrega serviços/infra/env e detalha exemplares', () => {
  const blocks = resolveBlocks(['worker-queue-transacional', 'gateway-externo', 'ia-grafo'], 'sicat', byId);
  const m = buildManifest({ app: 'fieldserve', stack: 'sicat', blocks, byId });
  assert.equal(m.app, 'fieldserve');
  assert.ok(m.aggregated.services.includes('worker'));        // worker-queue adiciona o serviço worker
  assert.ok(m.blocks.includes('observabilidade'));            // default
  const wq = m.detail.find((d) => d.id === 'worker-queue-transacional');
  assert.ok(wq.exemplars.some((e) => e.includes('job-runner.ts')));  // aponta o exemplar real
  assert.ok(wq.work_order_guidance.length > 0 && wq.verification.length > 0);
});
