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

// ── F4: proposeTools (modo de paridade do SICAT) ────────────────────────────

test('proposeTools: deep-path PROPÕE a tool sem executar; verify pulado', async () => {
  const executed = [];
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"precisa dados"}' },
    { toolCalls: [{ id: 'tc9', name: 'query_overdue', arguments: { limit: 5 } }] },
    // NADA depois: nem síntese nem judge devem rodar
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(executed), specialists: SPECIALISTS, proposeTools: true });
  const r = await graph.runTurn({ message: 'liste os atrasados', identity: { sub: 'u1' } });
  assert.equal(r.proposed, true);
  assert.equal(r.route, 'deep');
  assert.equal(executed.length, 0, 'tool NAO pode ser executada em proposeTools');
  assert.equal(r.toolCalls.length, 1);
  assert.deepEqual(r.toolCalls[0], { id: 'tc9', name: 'query_overdue', status: 'proposed', arguments: { limit: 5 } });
  assert.equal(r.judge, null, 'judge nao roda sobre proposta');
  assert.equal(llm.calls.length, 2, 'router + 1 rodada do especialista, nada mais');
});

test('proposeTools: resposta sem tool_call segue o fluxo normal (texto + verify)', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"explicacao"}' },
    { text: 'O fluxo de cancelamento exige confirmação explícita.' },
    { text: '{"score":0.9,"reason":"ok"}' },
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS, proposeTools: true });
  const r = await graph.runTurn({ message: 'como funciona o cancelamento?', identity: { sub: 'u1' } });
  assert.equal(r.proposed, false);
  assert.equal(r.text, 'O fluxo de cancelamento exige confirmação explícita.');
  assert.ok(r.judge && r.judge.score >= 0.9);
});

test('proposeTools: escalation do fast-path aceita a proposta do deep direto', async () => {
  const executed = [];
  const llm = scriptedLlm([
    { text: '{"complexity":"simple","specialist":null,"reason":"parece simples"}' },
    { text: 'Acho que há 3 atrasadas.' },                 // fast (sem evidência)
    { text: '{"score":0.2,"reason":"sem ancoragem"}' },   // judge reprova
    { toolCalls: [{ id: 'tc1', name: 'query_overdue', arguments: {} }] }, // deep retry → proposta
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(executed), specialists: SPECIALISTS, proposeTools: true });
  const r = await graph.runTurn({ message: 'quantas atividades atrasadas?', identity: { sub: 'u1' } });
  assert.equal(r.proposed, true);
  assert.equal(r.escalated, true);
  assert.equal(executed.length, 0);
  assert.equal(r.toolCalls[0].name, 'query_overdue');
});

test('routerContext entra no system do ROUTER', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"trivial","specialist":null}' },
    { text: 'Olá!' },
    { text: '{"score":1,"reason":"ok"}' },
  ]);
  const graph = createAiGraph({ llm, registry: opsRegistry(), specialists: SPECIALISTS, routerContext: 'INTENTS CONHECIDAS: manifest.list' });
  await graph.runTurn({ message: 'oi' });
  assert.ok(String(llm.calls[0].messages[0].content).includes('INTENTS CONHECIDAS: manifest.list'));
});

test('deepFilter nega especialista: delegated=true sem rodada deep nem judge', async () => {
  const executed = [];
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"precisa dados"}' },
    // NADA depois: nem deep, nem fast, nem judge
  ]);
  const graph = createAiGraph({
    llm, registry: opsRegistry(executed), specialists: SPECIALISTS,
    proposeTools: true, deepFilter: (id) => id !== 'ops',
  });
  const r = await graph.runTurn({ message: 'liste os atrasados', identity: { sub: 'u1' } });
  assert.equal(r.delegated, true);
  assert.equal(r.specialist, 'ops');
  assert.equal(r.route, 'deep');
  assert.equal(executed.length, 0);
  assert.equal(llm.calls.length, 1, 'apenas o router roda');
});

test('deepFilter aprovando segue para a proposta normalmente', async () => {
  const llm = scriptedLlm([
    { text: '{"complexity":"complex","specialist":"ops","reason":"precisa dados"}' },
    { toolCalls: [{ id: 'tc1', name: 'query_overdue', arguments: {} }] },
  ]);
  const graph = createAiGraph({
    llm, registry: opsRegistry(), specialists: SPECIALISTS,
    proposeTools: true, deepFilter: () => true,
  });
  const r = await graph.runTurn({ message: 'liste os atrasados', identity: { sub: 'u1' } });
  assert.ok(!r.delegated, 'caminho aprovado nao delega');
  assert.equal(r.proposed, true);
  assert.equal(r.toolCalls[0].name, 'query_overdue');
});
