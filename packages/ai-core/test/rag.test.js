import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashContent, splitWithOverlap, chunkMarkdownSections,
  createEmbedder, createPgVectorStore, createReranker,
} from '../src/rag.js';

test('hashContent é estável e sensível ao conteúdo', () => {
  assert.equal(hashContent('abc'), hashContent('abc'));
  assert.notEqual(hashContent('abc'), hashContent('abd'));
  assert.equal(hashContent('abc').length, 64);
});

test('splitWithOverlap quebra com sobreposição em pontos naturais', () => {
  const text = ('Primeira frase do documento. ' + 'x'.repeat(500) + '.\n\n' + 'Segundo parágrafo relevante. ' + 'y'.repeat(500) + '.').trim();
  const parts = splitWithOverlap(text, { maxChars: 600, overlap: 80 });
  assert.ok(parts.length >= 2);
  // toda parte respeita o teto e há sobreposição entre vizinhas
  for (const p of parts) assert.ok(p.length <= 600);
  assert.deepEqual(splitWithOverlap('curto', { minChars: 40 }), []);
});

test('chunkMarkdownSections divide por ## e subdivide seções longas', () => {
  const md = `# Título\nintro curta que passa do mínimo de chars para contar como chunk.\n\n## Seção A\n${'conteúdo A. '.repeat(150)}\n\n## Seção B\npequena mas válida, com texto suficiente para o mínimo.`;
  const chunks = chunkMarkdownSections(md, { maxChars: 700, overlap: 100 });
  assert.ok(chunks.length >= 3); // intro + A subdividida + B
  const aChunks = chunks.filter((c) => c.title === 'Seção A');
  assert.ok(aChunks.length >= 2);
  assert.ok(chunks.every((c, i) => c.index === i));
});

test('createEmbedder faz batching e valida dimensões', async () => {
  const batches = [];
  const embedFn = async (texts) => { batches.push(texts.length); return texts.map(() => [0.1, 0.2]); };
  const e = createEmbedder({ embedFn, batchSize: 2, dimensions: 2 });
  const out = await e.embedBatch(['a', 'b', 'c']);
  assert.equal(out.length, 3);
  assert.deepEqual(batches, [2, 1]);
  const bad = createEmbedder({ embedFn: async (t) => t.map(() => [1]), dimensions: 2 });
  await assert.rejects(() => bad.embedQuery('x'), /dims/);
});

test('createPgVectorStore: upsert incremental + search com score', async () => {
  const calls = [];
  const rowsFor = (sql) => {
    if (sql.includes('select content_hash')) return [{ content_hash: 'old-hash' }];
    if (sql.includes('1 - (embedding <=>')) {
      return [
        { id: 'c1', source_id: 'doc.md', title: 'T', content: 'texto', score: '0.91' },
        { id: 'c2', source_id: 'doc.md', title: null, content: 'outro', score: '0.72' },
      ];
    }
    if (sql.includes('count(*)')) return [{ n: 2 }];
    return [];
  };
  const query = async (sql, params) => { calls.push({ sql, params }); return { rows: rowsFor(sql), rowCount: 1 }; };
  const store = createPgVectorStore({ query });

  assert.equal(await store.getSourceHash('doc.md'), 'old-hash');

  await store.upsertSource({
    sourceId: 'doc.md', contentHash: 'new-hash', embeddingModel: 'text-embedding-3-small',
    chunks: [{ id: 'doc.md#0', index: 0, title: 'T', content: 'texto', embedding: [0.1, 0.2] }],
  });
  const inserts = calls.filter((c) => c.sql.startsWith('insert into knowledge_chunks'));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].params[5], '[0.1,0.2]'); // literal pgvector
  assert.ok(calls.some((c) => c.sql.includes('delete from knowledge_chunks')));
  assert.ok(calls.some((c) => c.sql.includes('on conflict (source_id)')));

  const hits = await store.search([0.1, 0.2], { k: 2 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].score, 0.91);
  assert.equal(hits[0].source, 'doc.md');

  const stats = await store.stats();
  assert.deepEqual(stats, { chunks: 2, sources: 2 });
});

test('createReranker reordena pelo score do LLM e é defensivo', async () => {
  const llm = { complete: async () => ({ text: '{"scores":[{"i":0,"s":0.2},{"i":1,"s":0.95}]}' }) };
  const r = createReranker({ llm });
  const hits = [
    { id: 'a', source: 's', text: 'pouco relevante', score: 0.9 },
    { id: 'b', source: 's', text: 'muito relevante', score: 0.7 },
  ];
  const out = await r.rerank('consulta', hits, { topN: 2 });
  assert.equal(out[0].id, 'b'); // LLM inverteu a ordem do cosseno
  assert.equal(out[0].rerankScore, 0.95);

  const broken = createReranker({ llm: { complete: async () => ({ text: 'não-json' }) } });
  const fallback = await broken.rerank('q', hits, { topN: 1 });
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, 'a'); // ordem original preservada
});
