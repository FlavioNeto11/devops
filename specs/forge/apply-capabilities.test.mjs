import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, resolveBlocks, buildManifest, catalogSourceSha } from './apply-capabilities.mjs';

const byId = loadCatalog(); // catálogo real (specs/baseline/capabilities.json)

test('catálogo real carrega os 15 blocos', () => {
  assert.ok(byId.size >= 15, `esperava >=15 blocos, veio ${byId.size}`);
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
