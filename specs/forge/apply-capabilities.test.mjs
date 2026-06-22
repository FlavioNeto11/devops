import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, resolveBlocks, buildManifest } from './apply-capabilities.mjs';

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
