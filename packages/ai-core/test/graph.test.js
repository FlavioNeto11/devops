import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiGraph } from '../src/graph.js';
import { createToolRegistry } from '../src/tools.js';

// LLM mock roteirizado: fila de respostas; registra cada chamada para asserções.
function scriptedLlm(script) {
  const calls = [];
  return {
    calls,
    complete: async (req) => {
      calls.push(req);
      const next = script.shift();
      if (!next) throw new Error('script esgotado');
      return { text: next.text ?? '', toolCalls: next.toolCalls ?? [], usage: next.usage ?? { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
}

const SPECIALISTS = [{ id: 'ops', description: 'atividades, atrasos e estatisticas', systemPrompt: 'Voce e o especialista operacional.' }];

function opsRegistry(executedLog = []) {
  return createToolRegistry([{
    name: 'query_overdue',
    description: 'Lista atividades atrasadas',
    specialist: 'ops',
    risk: 'R1',
    mutates: false,
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    authorize: async ({ identity }) => ({ allowed: Boolean(identity?.sub), reason: 'precisa identidade' }),
    execute: async (input, ctx) => { executedLog.push({ input, dryRun: ctx.dryRun }); return { rows: [{ title: 'Ar-condicionado', daysOverdue: 9 }], total: 1 }; },
  }]);
}

test('fast-path: trivial → router + synth (2 chamadas), sem tools', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"trivial","specialist":null,"reason":"saudacao"}' },
    { text: 'Olá! Como posso ajudar?' },
    { text: '{"score":0.95,"reason":"ok"}' }, // verify
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS });
  const r = await graph.runTurn({ message: 'oi, tudo bem?', identity: { sub: 'u1' } });
  assert.equal(r.route, 'fast');
  assert.equal(r.toolCalls.length, 0);
  assert.equal(r.text, 'Olá! Como posso ajudar?');
  assert.equal(llm.calls.length, 3);
  assert.ok(r.judge.score > 0.9);
  assert.ok(r.usage.inputTokens > 0 && r.usage.costUsd >= 0);
});

test('deep-path: complex → especialista chama tool com authz e responde com evidência', async () => {
  const executed = [];
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"precisa dados"}' },
    { toolCalls: [{ id: 'tc1', name: 'query_overdue', arguments: { limit: 10 } }] },
    { text: 'Há 1 atividade atrasada: Ar-condicionado (9 dias).' },
    { text: '{"score":0.9,"reason":"ancorado"}' },
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(executed), specialists: SPECIALISTS });
  const r = await graph.runTurn({ message: 'o que está atrasado?', identity: { sub: 'u1' } });
  assert.equal(r.route, 'deep');
  assert.equal(r.specialist, 'ops');
  assert.deepEqual(r.toolCalls.map((t) => [t.name, t.status]), [['query_overdue', 'executed']]);
  assert.equal(executed.length, 1);
  assert.equal(r.evidence[0].output.total, 1);
  assert.match(r.text, /Ar-condicionado/);
  // a mensagem de tool foi anexada ao histórico do loop (4ª chamada tem role tool)
  const deepCall = llm.calls[2];
  assert.ok(deepCall.messages.some((m) => m.role === 'tool'));
});

test('deep-path: tool negada vira mensagem de erro para o modelo (não derruba o turno)', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"dados"}' },
    { toolCalls: [{ id: 'tc1', name: 'query_overdue', arguments: {} }] },
    { text: 'Não tenho permissão para consultar isso agora.' },
    { text: '{"score":0.8,"reason":"coerente"}' },
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS });
  const r = await graph.runTurn({ message: 'atrasadas?', identity: {} }); // sem sub → authorize nega
  assert.deepEqual(r.toolCalls.map((t) => t.status), ['denied']);
  assert.match(r.text, /permissão/);
});

test('verify reprovado → escalation com retry deep e re-judge', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"simple","specialist":null,"reason":"contexto"}' },
    { text: 'Existem 42 atividades atrasadas.' },             // fast inventa número
    { text: '{"score":0.2,"reason":"nao ancorado"}' },        // judge reprova
    { toolCalls: [{ id: 'tc1', name: 'query_overdue', arguments: {} }] }, // retry deep usa tool
    { text: 'Há 1 atividade atrasada: Ar-condicionado.' },
    { text: '{"score":0.95,"reason":"ancorado na tool"}' },   // re-judge aprova
  ]);
  const escalations = [];
  const metrics = {
    observeTurn: () => {}, addTokens: () => {}, addCost: () => {}, countToolCall: () => {},
    countError: () => {}, observeJudgeScore: () => {}, countEscalation: (r) => escalations.push(r),
  };
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS, metrics });
  const r = await graph.runTurn({ message: 'quantas atrasadas?', identity: { sub: 'u1' } });
  assert.equal(r.escalated, true);
  assert.equal(escalations.length, 1);
  assert.match(r.text, /Ar-condicionado/);
  assert.ok(r.judge.score >= 0.9);
});

test('limite de rounds: loop ReAct força resposta final sem tools', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"dados"}' },
    { toolCalls: [{ id: 'a', name: 'query_overdue', arguments: {} }] },
    { toolCalls: [{ id: 'b', name: 'query_overdue', arguments: {} }] },
    { text: 'Resumo final com base nas consultas.' }, // chamada pós-limite (sem tools)
    { text: '{"score":0.85,"reason":"ok"}' },
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS, maxToolRounds: 2 });
  const r = await graph.runTurn({ message: 'detalhe os atrasos', identity: { sub: 'u1' } });
  assert.equal(r.toolCalls.length, 2);
  assert.match(r.text, /Resumo final/);
});
