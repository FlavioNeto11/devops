// test/control-ai-kit.test.mjs — testes node:test, 100% offline.
// fetchImpl + clock injetados para nao tocar a rede nem o relogio real.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControlAi, createPromptSource, ControlAiConfigError } from '../src/index.js';

// (a) control-plane fora (fetch lanca) => retorna o fallback, sem throw.
test('createPromptSource: control-plane fora cai no fallback (nunca lanca)', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED — control-plane fora');
  };
  const src = createPromptSource({
    controlPlaneUrl: 'http://ai-control-plane.invalid',
    app: 'myapp',
    fallback: { triage: 'PROMPT DE FALLBACK' },
    fetchImpl,
  });
  const text = await src.resolve('triage');
  assert.equal(text, 'PROMPT DE FALLBACK');
});

// (b) cache: 2a resolucao dentro do TTL NAO chama fetch de novo.
test('createPromptSource: cache evita segundo fetch dentro do TTL', async () => {
  let calls = 0;
  let nowMs = 1000;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ data: { promptText: 'DO CONTROL-PLANE' } }) };
  };
  const src = createPromptSource({
    controlPlaneUrl: 'http://cp.local',
    app: 'myapp',
    fallback: {},
    cacheTtlMs: 60_000,
    fetchImpl,
    clock: () => nowMs,
  });

  const a = await src.resolve('triage');
  assert.equal(a, 'DO CONTROL-PLANE');
  assert.equal(calls, 1);

  nowMs += 5_000; // ainda dentro do TTL
  const b = await src.resolve('triage');
  assert.equal(b, 'DO CONTROL-PLANE');
  assert.equal(calls, 1, 'segundo resolve nao deve chamar fetch');

  // alem do TTL: refaz o fetch.
  nowMs += 120_000;
  await src.resolve('triage');
  assert.equal(calls, 2, 'apos o TTL o fetch deve ocorrer de novo');
});

// (b.2) sem remoto nem fallback => lanca ControlAiConfigError.
test('createPromptSource: sem remoto nem fallback lanca ControlAiConfigError', async () => {
  const src = createPromptSource({ app: 'myapp', fallback: {} });
  await assert.rejects(() => src.resolve('inexistente'), ControlAiConfigError);
});

// (c) createControlAi sem llm => fail-closed.
test('createControlAi sem llm lanca ControlAiConfigError (fail-closed)', () => {
  assert.throws(
    () => createControlAi({ appName: 'myapp', llm: null, prompts: { triage: 'x' } }),
    (err) => err instanceof ControlAiConfigError && err.code === 'CONTROL_AI_CONFIG',
  );
});

// (d) createControlAi com llm mock => ask responde usando o prompt resolvido.
test('createControlAi com llm mock: ask usa o prompt resolvido', async () => {
  let seenSystem = null;
  const llm = {
    async complete({ messages }) {
      seenSystem = messages.find((m) => m.role === 'system')?.content ?? null;
      return 'ok';
    },
  };
  const ai = createControlAi({
    appName: 'myapp',
    llm,
    prompts: { triage: 'POLITICA DE TRIAGEM' },
    // sem controlPlaneUrl => so fallback (offline). ai-core nao instalado no teste
    // => degrada para o llm direto.
  });

  const out = await ai.ask({ prompt: 'triage', input: 'ola' });
  assert.equal(out, 'ok');
  assert.equal(seenSystem, 'POLITICA DE TRIAGEM', 'o prompt resolvido vira o system message');
});
