import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, matchesQuery, filterReqs, groupByProduct, neighborhood, coverageRow, coverageScore, uniqueValues, graphLayout, bandRank, cosineSim, topSimilar, toYaml, scalarYaml, validateDraft, coverageSummary, recentList, hashStr, degreeMap, hslToHex, relLuminance, contrastRatio, textColorFor, productPalette, nodeColor, highlightSet, visibleGraph, truncateLabel, forceLayout, textTokens, textSimilarity, findSimilarReqs } from '../assets/lib.js';

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

test('coverageSummary conta hit/miss/pct por dimensão', () => {
  const sum = coverageSummary(reqs);
  const byKey = Object.fromEntries(sum.map((d) => [d.key, d]));
  // só reqs[0] tem acceptance_criteria
  assert.equal(byKey.acceptance.hit, 1);
  assert.equal(byKey.acceptance.miss, 2);
  assert.equal(byKey.acceptance.total, 3);
  assert.equal(byKey.acceptance.pct, 33);
  // só reqs[0] tem adr_refs
  assert.equal(byKey.adr.hit, 1);
  // ninguém tem evidência
  assert.equal(byKey.evidence.hit, 0);
  assert.equal(byKey.evidence.pct, 0);
  assert.equal(coverageSummary([]).every((d) => d.total === 0 && d.pct === 0), true);
});

test('recentList prepõe, deduplica e limita', () => {
  assert.deepEqual(recentList([], 'A'), ['A']);
  assert.deepEqual(recentList(['A', 'B'], 'C'), ['C', 'A', 'B']);
  assert.deepEqual(recentList(['A', 'B', 'C'], 'B'), ['B', 'A', 'C']);
  assert.deepEqual(recentList(['A', 'B', 'C'], 'D', 2), ['D', 'A']);
  assert.deepEqual(recentList(['A', 'B'], ''), ['A', 'B']);
  assert.deepEqual(recentList(null, 'A'), ['A']);
  assert.deepEqual(recentList(['', null, 'A', 5], 'B'), ['B', 'A']);
});

test('validateDraft pega erros', () => {
  assert.deepEqual(validateDraft({ id: 'REQ-X-0001', title: 'abc', statement: 'enunciado valido aqui', type: 'functional', scope: { product_scope: 'x' }, source: { source_paths: ['apps/x'] } }), []);
  assert.ok(validateDraft({ id: 'REQ-X-0001', title: 'abc', statement: 'enunciado valido aqui', type: 'functional', scope: { product_scope: 'x' } }).some((e) => /origem/.test(e)));
  const errs = validateDraft({ id: 'bad', title: '', statement: '', type: 'functional', scope: {} });
  assert.ok(errs.length >= 3);
  assert.ok(validateDraft({ id: 'REQ-X-0001', title: 'abc', statement: 'enunciado valido', type: 'non-functional', scope: { product_scope: 'x' } }).some((e) => /quality_scenario/.test(e)));
});

/* ============================ MAPA DE IMPACTO ============================ */
const mapNodes = [
  { id: 'REQ-A-0001', product: 'alpha', title: 'Login com SSO via OIDC e fallback', kind: 'requirement' },
  { id: 'REQ-A-0002', product: 'alpha', title: 'Logout', kind: 'requirement' },
  { id: 'REQ-B-0001', product: 'beta', title: 'Relatório mensal', kind: 'requirement' },
  { id: 'REQ-C-0001', product: 'gamma', title: 'Isolado sem conexão', kind: 'requirement' },
  { id: 'infra-db', kind: 'service' },
];
const mapEdges = [
  { from: 'REQ-A-0001', to: 'REQ-A-0002', type: 'depends_on' },
  { from: 'REQ-A-0001', to: 'REQ-B-0001', type: 'relates_to' },
  { from: 'REQ-A-0001', to: 'infra-db', type: 'allocates_to' },
];

test('hashStr é determinístico e distingue entradas', () => {
  assert.equal(hashStr('REQ-A-0001'), hashStr('REQ-A-0001'));
  assert.notEqual(hashStr('REQ-A-0001'), hashStr('REQ-A-0002'));
  assert.equal(typeof hashStr('x'), 'number');
  assert.ok(hashStr('') >= 0);
});

test('degreeMap conta conexões', () => {
  const d = degreeMap(mapEdges);
  assert.equal(d['REQ-A-0001'], 3);
  assert.equal(d['REQ-A-0002'], 1);
  assert.equal(d['infra-db'], 1);
  assert.equal(d['REQ-C-0001'], undefined);
});

test('hslToHex converte ângulos conhecidos', () => {
  assert.equal(hslToHex(0, 1, 0.5), '#ff0000');
  assert.equal(hslToHex(120, 1, 0.5), '#00ff00');
  assert.equal(hslToHex(240, 1, 0.5), '#0000ff');
});

test('relLuminance e contrastRatio batem com WCAG', () => {
  assert.equal(Math.round(relLuminance('#ffffff')), 1);
  assert.equal(relLuminance('#000000'), 0);
  assert.equal(Math.round(contrastRatio('#ffffff', '#000000')), 21);
  assert.equal(contrastRatio('#abc', 'bad'), contrastRatio('#abc', 'bad')); // não lança
});

test('textColorFor sempre garante contraste >= 4.5:1', () => {
  for (let h = 0; h < 360; h += 13) {
    const fill = hslToHex(h, 0.58, 0.55);
    const txt = textColorFor(fill);
    assert.ok(contrastRatio(fill, txt) >= 4.5, `hue ${h} contraste ${contrastRatio(fill, txt)}`);
  }
  assert.equal(textColorFor('#f5f7fa'), '#000000'); // fundo claro -> texto escuro
  assert.equal(textColorFor('#10243a'), '#ffffff'); // fundo escuro -> texto claro
});

test('productPalette: cores estáveis, distintas e legíveis', () => {
  const prods = ['sicat', 'gymops', 'console', 'ai', 'portal'];
  const a = productPalette(prods);
  const b = productPalette([...prods].reverse());
  assert.deepEqual(a, b); // independe da ordem de entrada (ordena internamente)
  assert.equal(Object.keys(a).length, 5);
  const fills = Object.values(a).map((c) => c.fill);
  assert.equal(new Set(fills).size, 5); // todas distintas
  for (const c of Object.values(a)) assert.ok(contrastRatio(c.fill, c.text) >= 4.5);
  assert.deepEqual(Object.keys(productPalette(['x', 'x', null, ''])), ['x']); // dedup + limpeza de vazios/null
});

test('nodeColor: produto -> paleta; alvo -> neutro', () => {
  const pal = productPalette(['alpha', 'beta']);
  assert.equal(nodeColor({ product: 'alpha' }, pal).fill, pal.alpha.fill);
  const t = nodeColor({ id: 'infra-db', kind: 'service' }, pal);
  assert.equal(t.target, true);
  assert.ok(contrastRatio(t.fill, t.text) >= 4.5);
});

test('highlightSet retorna vizinhos e arestas conectoras', () => {
  const hs = highlightSet(mapEdges, 'REQ-A-0001');
  assert.equal(hs.focus, 'REQ-A-0001');
  assert.deepEqual([...hs.neighbors].sort(), ['REQ-A-0002', 'REQ-B-0001', 'infra-db']);
  assert.equal(hs.edges.length, 3);
  assert.equal(highlightSet(mapEdges, 'REQ-C-0001').neighbors.size, 0);
});

test('visibleGraph: oculta isolados por padrão', () => {
  const v = visibleGraph(mapNodes, mapEdges, {});
  assert.ok(v.nodeIds.has('REQ-A-0001'));
  assert.ok(v.nodeIds.has('infra-db'));
  assert.ok(!v.nodeIds.has('REQ-C-0001')); // grau 0 oculto
});

test('visibleGraph: includeIsolated mostra grau 0', () => {
  const v = visibleGraph(mapNodes, mapEdges, { includeIsolated: true });
  assert.ok(v.nodeIds.has('REQ-C-0001'));
});

test('visibleGraph: filtro de produto limita o escopo', () => {
  const v = visibleGraph(mapNodes, mapEdges, { products: new Set(['alpha']) });
  assert.ok(v.nodeIds.has('REQ-A-0001'));
  assert.ok(v.nodeIds.has('REQ-A-0002'));
  assert.ok(!v.nodeIds.has('REQ-B-0001')); // beta não selecionado
  assert.ok(v.nodeIds.has('infra-db')); // alvo conecta a alpha visível
});

test('visibleGraph: revelação cross-product ao selecionar', () => {
  // beta não selecionado, mas REQ-B-0001 é vizinho do selecionado REQ-A-0001
  const v = visibleGraph(mapNodes, mapEdges, { products: new Set(['alpha']), selectedId: 'REQ-A-0001' });
  assert.ok(v.nodeIds.has('REQ-B-0001'), 'vizinho de outro produto deve ser revelado');
  assert.ok(v.revealed.has('REQ-B-0001'));
  assert.ok(v.edges.some((e) => e.to === 'REQ-B-0001' || e.from === 'REQ-B-0001'));
});

test('visibleGraph: filtro por tipo de aresta', () => {
  const v = visibleGraph(mapNodes, mapEdges, { edgeTypes: new Set(['depends_on']) });
  assert.equal(v.edges.length, 1);
  assert.ok(v.nodeIds.has('REQ-A-0002'));
  assert.ok(!v.nodeIds.has('REQ-B-0001')); // só conectava via relates_to (filtrado)
});

test('truncateLabel encurta com reticências e respeita o limite', () => {
  assert.equal(truncateLabel('Logout', 26), 'Logout');
  const t = truncateLabel('Login com SSO via OIDC e fallback', 26);
  assert.ok(t.length <= 26);
  assert.ok(t.endsWith('…'));
  assert.equal(truncateLabel('', 10), '');
  assert.ok(truncateLabel('abcdefghijklmnopqrstuvwxyz0123456789', 12).endsWith('…'));
});

test('forceLayout é determinístico e cabe no quadro', () => {
  const a = forceLayout(mapNodes, mapEdges, { width: 800, height: 600 });
  const b = forceLayout(mapNodes, mapEdges, { width: 800, height: 600 });
  assert.deepEqual(a.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]), b.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]));
  assert.equal(a.nodes.length, mapNodes.length);
  for (const n of a.nodes) {
    assert.ok(n.x >= 0 && n.x <= 800, `x ${n.x}`);
    assert.ok(n.y >= 0 && n.y <= 600, `y ${n.y}`);
    assert.equal(typeof n.deg, 'number');
  }
  assert.equal(a.nodes.find((n) => n.id === 'REQ-A-0001').deg, 3);
});

test('forceLayout: casos triviais (vazio e único)', () => {
  assert.deepEqual(forceLayout([], []).nodes, []);
  const one = forceLayout([{ id: 'REQ-Z-0001', product: 'z' }], [], { width: 400, height: 300 });
  assert.equal(one.nodes.length, 1);
  assert.ok(one.nodes[0].x >= 0 && one.nodes[0].x <= 400);
  assert.ok(one.nodes[0].y >= 0 && one.nodes[0].y <= 300);
});

/* ============================ VALIDAÇÃO / DUPLICATA (Editor) ============================ */
test('textTokens normaliza, remove stopwords e dedup', () => {
  assert.deepEqual(textTokens('O sistema deve submeter o MTR').sort(), ['mtr', 'submeter']);
  assert.deepEqual(textTokens('Relatório relatorio RELATÓRIO').sort(), ['relatorio']); // dedup + acento
  assert.deepEqual(textTokens(''), []);
  assert.deepEqual(textTokens(null), []);
});

test('textSimilarity: Jaccard 0..1', () => {
  assert.equal(textSimilarity('submissão de manifesto MTR', 'submissão de manifesto MTR'), 1);
  assert.equal(textSimilarity('relatório mensal financeiro', 'cadastro de usuário'), 0);
  assert.equal(textSimilarity('', 'qualquer'), 0);
  const s = textSimilarity('submissão assíncrona de manifesto', 'submissão de manifesto ao órgão');
  assert.ok(s > 0 && s < 1);
});

test('findSimilarReqs acha parecidos, exclui o próprio e ordena', () => {
  const reqs = [
    { id: 'REQ-SICAT-0002', title: 'Submissão de manifesto MTR', statement: 'Submeter manifesto ao órgão', scope: { product_scope: 'sicat' } },
    { id: 'REQ-SICAT-0003', title: 'Login OIDC', statement: 'Autenticar via OIDC', scope: { product_scope: 'sicat' } },
    { id: 'REQ-GYMOPS-0001', title: 'Cadastro de atividade', statement: 'CRUD de atividades', scope: { product_scope: 'gymops' } },
  ];
  const draft = { id: 'REQ-NEW-0001', title: 'Submissão de manifesto MTR ao órgão', statement: 'Submeter manifesto MTR' };
  const sim = findSimilarReqs(draft, reqs, 5);
  assert.ok(sim.length >= 1);
  assert.equal(sim[0].id, 'REQ-SICAT-0002');     // o mais parecido vem 1º
  assert.ok(sim[0].score > 0);
  // editar o próprio não retorna ele mesmo
  assert.ok(!findSimilarReqs({ id: 'REQ-SICAT-0002', title: 'Submissão de manifesto MTR', statement: 'x' }, reqs).some((x) => x.id === 'REQ-SICAT-0002'));
  // rascunho vazio => sem resultados
  assert.deepEqual(findSimilarReqs({ title: '', statement: '' }, reqs), []);
});
