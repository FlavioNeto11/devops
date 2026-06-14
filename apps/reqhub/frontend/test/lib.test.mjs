import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, matchesQuery, filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, bandRank, cosineSim, topSimilar, toYaml, scalarYaml, validateDraft } from '../assets/lib.js';

const reqs = [
  { id: 'REQ-SICAT-0002', title: 'Submissão MTR', statement: 'O sistema deve submeter', type: 'functional', status: 'approved', priority: 'critical', architectural_significance: true, impact_band: 'high', impact_score: 80, scope: { product_scope: 'sicat', applies_to: 'product' }, acceptance_criteria: ['x'], verification_method: ['test-integration'], version: { item_revision: 1 }, allocation: { adr_refs: ['ADR-0002'] } },
  { id: 'REQ-GYMOPS-0004', title: 'Atividades', statement: 'CRUD de atividades', type: 'functional', status: 'approved', priority: 'high', architectural_significance: false, impact_band: 'medium', impact_score: 50, scope: { product_scope: 'gymops', applies_to: 'product' }, version: { item_revision: 1 }, allocation: {} },
  { id: 'REQ-CMS-NFR-001', title: 'Cache', statement: 'Servir com cache', type: 'non-functional', status: 'approved', priority: 'high', architectural_significance: false, impact_band: 'low', impact_score: 30, scope: { product_scope: 'cms', applies_to: 'product' }, quality_scenarios: [{}], version: { item_revision: 1 } },
];
const edges = [
  { from: 'REQ-SICAT-0002', to: 'REQ-SICAT-0011', type: 'depends_on' },
  { from: 'REQ-CMS-NFR-001', to: 'REQ-CMS-0005', type: 'constrains' },
];
const nodes = [
  { id: 'REQ-SICAT-0002', product: 'sicat', asr: true },
  { id: 'REQ-SICAT-0011', product: 'sicat' },
  { id: 'REQ-CMS-NFR-001', product: 'cms' },
  { id: 'REQ-CMS-0005', product: 'cms' },
];

test('norm remove acentos e caixa', () => {
  assert.equal(norm('Ção É Ótimo'), 'cao e otimo');
});

test('matchesQuery casa id, título e enunciado', () => {
  assert.ok(matchesQuery(reqs[0], 'sicat'));
  assert.ok(matchesQuery(reqs[0], 'submeter'));
  assert.ok(matchesQuery(reqs[0], 'MTR'));
  assert.ok(!matchesQuery(reqs[0], 'inexistente'));
  assert.ok(matchesQuery(reqs[0], ''));
});

test('filterReqs por produto/tipo/asr/band/q', () => {
  assert.equal(filterReqs(reqs, { product: 'sicat' }).length, 1);
  assert.equal(filterReqs(reqs, { type: 'non-functional' }).length, 1);
  assert.equal(filterReqs(reqs, { asr: 'yes' }).length, 1);
  assert.equal(filterReqs(reqs, { asr: 'no' }).length, 2);
  assert.equal(filterReqs(reqs, { band: 'high' }).length, 1);
  assert.equal(filterReqs(reqs, { q: 'cache' }).length, 1);
  assert.equal(filterReqs(reqs, {}).length, 3);
});

test('groupByProduct agrupa e ordena', () => {
  const g = groupByProduct(reqs);
  assert.deepEqual(g.map((x) => x.product), ['cms', 'gymops', 'sicat']);
  assert.equal(g[2].items[0].id, 'REQ-SICAT-0002');
});

test('neighborhood separa entrada/saída', () => {
  const nb = neighborhood(edges, 'REQ-SICAT-0002');
  assert.equal(nb.outgoing.length, 1);
  assert.equal(nb.incoming.length, 0);
});

test('coverageRow e coverageScore', () => {
  const row = coverageRow(reqs[0]);
  assert.equal(row.acceptance, true);
  assert.equal(row.method, true);
  assert.equal(row.evidence, false);
  assert.equal(row.adr, true);
  assert.ok(coverageScore(reqs[0]) > coverageScore(reqs[1]));
});

test('uniqueValues distintos e ordenados', () => {
  assert.deepEqual(uniqueValues(reqs, (r) => r.scope.product_scope), ['cms', 'gymops', 'sicat']);
});

test('graphLayout posiciona em colunas e recorta vizinhança', () => {
  const full = graphLayout(nodes, edges);
  assert.equal(full.nodes.length, 4);
  assert.ok(full.width > 0 && full.height > 0);
  const focus = graphLayout(nodes, edges, 'REQ-SICAT-0002');
  assert.deepEqual(focus.nodes.map((n) => n.id).sort(), ['REQ-SICAT-0002', 'REQ-SICAT-0011']);
});

test('bandRank ordena impacto', () => {
  assert.ok(bandRank('high') > bandRank('medium'));
  assert.ok(bandRank('medium') > bandRank('low'));
});

test('cosineSim de vetores normalizados', () => {
  assert.equal(cosineSim([1, 0], [1, 0]), 1);
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
  assert.equal(cosineSim(null, [1]), 0);
});

test('topSimilar ordena por cosseno e exclui o próprio', () => {
  const vectors = { A: [1, 0], B: [0.9, 0.1], C: [0, 1] };
  const top = topSimilar(vectors, 'A', 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].id, 'B');
  assert.ok(top[0].score > top[1].score);
  assert.equal(topSimilar(vectors, 'INEXISTENTE').length, 0);
});

test('toYaml: escalares, objetos, arrays e quoting', () => {
  assert.equal(scalarYaml('approved'), 'approved');
  assert.equal(scalarYaml('REQ-X-0001'), 'REQ-X-0001');
  assert.equal(scalarYaml('tem: dois pontos'), '"tem: dois pontos"');
  assert.equal(scalarYaml(true), 'true');
  const y = toYaml({ id: 'REQ-X-0001', scope: { product_scope: 'x', applies_to: 'product' }, acceptance_criteria: ['um', 'dois'] });
  assert.match(y, /id: REQ-X-0001/);
  assert.match(y, /scope:\n {2}product_scope: x\n {2}applies_to: product/);
  assert.match(y, /acceptance_criteria:\n {2}- um\n {2}- dois/);
});

test('toYaml: array de objetos (quality_scenarios)', () => {
  const y = toYaml({ quality_scenarios: [{ source: 's', stimulus: 'x: y' }] });
  assert.match(y, /quality_scenarios:\n {2}- source: s\n {4}stimulus: "x: y"/);
});

test('validateDraft pega erros', () => {
  assert.deepEqual(validateDraft({ id: 'REQ-X-0001', title: 'abc', statement: 'enunciado valido aqui', type: 'functional', scope: { product_scope: 'x' } }), []);
  const errs = validateDraft({ id: 'bad', title: '', statement: '', type: 'functional', scope: {} });
  assert.ok(errs.length >= 3);
  assert.ok(validateDraft({ id: 'REQ-X-0001', title: 'abc', statement: 'enunciado valido', type: 'non-functional', scope: { product_scope: 'x' } }).some((e) => /quality_scenario/.test(e)));
});
