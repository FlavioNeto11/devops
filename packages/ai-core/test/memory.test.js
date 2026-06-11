import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadStore, createRollingSummarizer, createUserMemory, extractMemoryFacts } from '../src/memory.js';
import { createAiGraph } from '../src/graph.js';

// banco fake em memória que entende os SQLs do threadStore/userMemory
function fakeDb() {
  const threads = new Map();
  const memories = [];
  const query = async (sql, params = []) => {
    if (sql.includes('from ai_chat_threads')) {
      const t = threads.get(params[0]);
      return { rows: t ? [{ id: params[0], messages: JSON.stringify(t.messages), rolling_summary: t.rollingSummary, turn_count: t.turnCount }] : [] };
    }
    if (sql.startsWith('insert into ai_chat_threads')) {
      threads.set(params[0], { messages: JSON.parse(params[1]), rollingSummary: params[2], turnCount: params[3] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('from ai_user_memory')) {
      const rows = memories
        .filter((m) => m.userId === params[0])
        .map((m) => ({ kind: m.kind, content: m.content, score: 0.9 }));
      return { rows: rows.slice(0, params[2]) };
    }
    if (sql.startsWith('insert into ai_user_memory')) {
      memories.push({ userId: params[0], kind: params[1], content: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('delete from ai_user_memory')) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`sql inesperado: ${sql.slice(0, 60)}`);
  };
  return { query, threads, memories };
}

const fakeEmbedder = { embedQuery: async () => [0.1, 0.2, 0.3] };

test('threadStore: appendTurn acumula, persiste e respeita teto', async () => {
  const db = fakeDb();
  const store = createThreadStore({ query: db.query });
  assert.equal(await store.get('t1'), null);
  await store.appendTurn('t1', 'oi', 'olá!');
  await store.appendTurn('t1', 'como estão as atividades?', 'tudo em dia.');
  const t = await store.get('t1');
  assert.equal(t.messages.length, 4);
  assert.equal(t.turnCount, 2);
  assert.equal(t.messages[0].content, 'oi');
  // teto: maxMessages corta os antigos
  for (let i = 0; i < 25; i++) await store.appendTurn('t1', `p${i}`, `r${i}`, { maxMessages: 10 });
  assert.equal((await store.get('t1')).messages.length, 10);
});

test('rollingSummarizer: compacta antigos preservando os recentes', async () => {
  const llm = { complete: async () => ({ text: '{"summary":"Usuario acompanha atrasos da unidade Centro."}' }) };
  const sum = createRollingSummarizer({ llm, keepRecent: 4, triggerAt: 6 });
  const thread = { messages: Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })), rollingSummary: null, turnCount: 5 };
  assert.equal(sum.needsCompaction(thread), true);
  const out = await sum.compact(thread);
  assert.equal(out.messages.length, 4);
  assert.equal(out.messages[0].content, 'm6');
  assert.match(out.rollingSummary, /Centro/);
  // falha do LLM → thread intacta
  const broken = createRollingSummarizer({ llm: { complete: async () => { throw new Error('x'); } }, keepRecent: 4 });
  assert.equal(await broken.compact(thread), thread);
});

test('userMemory: store/recall ESCOPADOS por usuário (não vaza cross-user)', async () => {
  const db = fakeDb();
  const um = createUserMemory({ query: db.query, embedder: fakeEmbedder });
  await um.store('u1', [{ kind: 'preference', content: 'Prefere resumos curtos.' }]);
  await um.store('u2', [{ kind: 'context', content: 'Gerencia a unidade Centro.' }]);
  const u1 = await um.recall('u1', 'como ele gosta dos resumos?');
  assert.equal(u1.length, 1);
  assert.match(u1[0].content, /resumos curtos/);
  const u2 = await um.recall('u2', 'qualquer coisa');
  assert.equal(u2.length, 1);
  assert.match(u2[0].content, /Centro/);
  assert.equal((await um.recall('u3', 'x')).length, 0);
});

test('extractMemoryFacts: extrai fatos e é defensivo', async () => {
  const llm = { complete: async () => ({ text: '{"facts":[{"kind":"preference","content":"Prefere relatorios pela manha."},{"kind":"identity","content":"Se chama Carla."}]}' }) };
  const facts = await extractMemoryFacts({ llm, conversationText: 'user: me chamo Carla, manda os relatorios de manha' });
  assert.equal(facts.length, 2);
  assert.equal(facts[0].kind, 'preference');
  assert.deepEqual(await extractMemoryFacts({ llm: { complete: async () => ({ text: 'lixo' }) }, conversationText: 'x' }), []);
});

test('grafo + memória: thread do servidor prevalece, recall entra no contexto e o turno é persistido', async () => {
  const db = fakeDb();
  const store = createThreadStore({ query: db.query });
  const um = createUserMemory({ query: db.query, embedder: fakeEmbedder });
  await um.store('u1', [{ kind: 'preference', content: 'Prefere respostas diretas.' }]);
  await store.put('chat:org:u1', { messages: [{ role: 'user', content: 'primeira pergunta' }, { role: 'assistant', content: 'primeira resposta' }], rollingSummary: 'Conversa iniciada sobre atrasos.', turnCount: 1 });

  const seen = { systemContext: null, history: null };
  const llm = {
    complete: async ({ messages, jsonMode }) => {
      const sys = String(messages[0]?.content || '');
      if (jsonMode && sys.includes('ROTEADOR')) return { text: '{"complexity":"trivial"}', toolCalls: [], usage: {} };
      if (jsonMode) return { text: '{"score":0.9,"reason":"ok"}', toolCalls: [], usage: {} };
      // chamada do synth: captura o contexto/história efetivos
      seen.systemContext = sys;
      seen.history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => m.content);
      return { text: 'resposta nova', toolCalls: [], usage: {} };
    },
  };
  const graph = createAiGraph({ llm, specialists: [], memory: { threadStore: store, userMemory: um } });
  const r = await graph.runTurn({ message: 'segunda pergunta', threadId: 'chat:org:u1', identity: { sub: 'u1' }, systemContext: 'CONTEXTO BASE.' });

  assert.equal(r.memory.hadThread, true);
  assert.equal(r.memory.recalled, 1);
  assert.match(seen.systemContext, /RESUMO DA CONVERSA/);
  assert.match(seen.systemContext, /respostas diretas/);
  assert.ok(seen.history.includes('primeira pergunta')); // histórico veio do SERVIDOR
  const after = await store.get('chat:org:u1');
  assert.equal(after.turnCount, 2);
  assert.equal(after.messages.at(-1).content, 'resposta nova');
});
