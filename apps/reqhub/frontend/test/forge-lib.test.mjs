import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPhases, phaseModel, productSummaries } from '../assets/forge-lib.js';

const impl = (m) => ({ items: Object.fromEntries(Object.entries(m).map(([id, status]) => [id, { status }])) });

test('consistência "no ar": phaseModel e hub usam deployed+done (merged NÃO é no ar)', () => {
  const product = { name: 'x', display_name: 'X', requirement_ids: ['a', 'b', 'c'], phases: { requirements: { status: 'approved' }, architecture: { status: 'approved' } } };
  const implStatus = impl({ a: 'merged', b: 'deployed', c: 'not_started' });
  const build = phaseModel(product, { waves: [{ id: 'w0' }], status: 'approved' }, implStatus).find((s) => s.key === 'build');
  assert.match(build.detail, /1\/3 no ar/); // só 'b' (deployed) está no ar; 'a' (merged) NÃO
  assert.notEqual(build.status, 'done');     // não 100% enquanto houver merged/não-deployed
  const p = productSummaries({ products: [product] }, implStatus)[0];
  assert.equal(p.progress.live, 1);          // mesma contagem do build/pipeline
  assert.equal(p.progress.delivered, 2);     // merged+deployed = "código no main"
});

test('launchPhases: cenário ContaViva 360 — requisitos done, plano/build pendentes => Publicado PENDING (não done)', () => {
  const stages = [
    { key: 'requisitos', label: 'Requisitos no git', status: 'done', detail: 'PR #153 mesclado', url: 'u' },
    { key: 'plano', label: 'Arquitetura & plano', status: 'pending', detail: 'aguardando os requisitos…' },
    { key: 'build', label: 'Construção (implementação)', status: 'pending', detail: 'aguardando o plano…' },
  ];
  const product = { requirement_ids: ['REQ-CV-0001', 'REQ-CV-0002'], phases: {} };
  const phases = launchPhases(stages, product, impl({}), undefined);
  const by = Object.fromEntries(phases.map((p) => [p.key, p.status]));
  assert.equal(by.requisitos, 'done');
  assert.equal(by.plano, 'pending');
  assert.equal(by.build, 'pending');
  assert.equal(by.publicado, 'pending', 'Publicado NUNCA pode estar done antes da construção');
  // ordem dos 4 passos preservada
  assert.deepEqual(phases.map((p) => p.key), ['requisitos', 'plano', 'build', 'publicado']);
});

test('launchPhases: tudo entregue (reqs deployed/done) => 4 fases done + Publicado no ar', () => {
  const stages = [
    { key: 'requisitos', status: 'done' }, { key: 'plano', status: 'done' },
    { key: 'build', status: 'active', detail: 'gerando…' },
  ];
  const product = { requirement_ids: ['a', 'b'], phases: { architecture: { status: 'approved' } } };
  const phases = launchPhases(stages, product, impl({ a: 'deployed', b: 'done' }), { waves: [{ id: 'w0' }], status: 'approved' });
  const by = Object.fromEntries(phases.map((p) => [p.key, p.status]));
  assert.equal(by.build, 'done');
  assert.equal(by.publicado, 'done');
  assert.equal(phases.find((p) => p.key === 'publicado').detail, 'no ar');
});

test('launchPhases: construção parcial => build ACTIVE, Publicado PENDING', () => {
  const stages = [{ key: 'requisitos', status: 'done' }, { key: 'plano', status: 'done' }, { key: 'build', status: 'active' }];
  const product = { requirement_ids: ['a', 'b', 'c', 'd'], phases: { architecture: { status: 'approved' } } };
  const phases = launchPhases(stages, product, impl({ a: 'deployed', b: 'merged', c: 'not_started', d: 'not_started' }), { waves: [{ id: 'w0' }], status: 'approved' });
  const by = Object.fromEntries(phases.map((p) => [p.key, p]));
  assert.equal(by.build.status, 'active');
  assert.match(by.build.detail, /1\/4 requisito\(s\) no ar/); // só 'a' deployed conta como no ar
  assert.equal(by.publicado.status, 'pending');
});

test('launchPhases: clamp monotônico — fase done à frente de uma incompleta vira pending', () => {
  // build diz 'done' por engano, mas plano está pending => build e publicado caem p/ pending
  const stages = [{ key: 'requisitos', status: 'done' }, { key: 'plano', status: 'pending' }, { key: 'build', status: 'done' }];
  const phases = launchPhases(stages, { requirement_ids: [], phases: {} }, impl({}), undefined);
  const by = Object.fromEntries(phases.map((p) => [p.key, p.status]));
  assert.equal(by.plano, 'pending');
  assert.equal(by.build, 'pending', 'não pode estar done à frente de plano pendente');
  assert.equal(by.publicado, 'pending');
});
