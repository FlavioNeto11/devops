import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiToolError } from '@flavioneto11/ai-core';
import { retryLlmTool } from '../src/retry.js';

test('retryLlmTool: re-tenta LLM_INVALID_JSON e sucede na 2ª', async () => {
  let calls = 0;
  const r = await retryLlmTool('t', async () => { calls++; if (calls < 2) throw new AiToolError('LLM_INVALID_JSON', 'ruim'); return 'ok'; }, { attempts: 3, backoff: () => 0 });
  assert.equal(r, 'ok');
  assert.equal(calls, 2);
});

test('retryLlmTool: NÃO re-tenta erro determinístico (TOOL_DENIED) — 1 chamada só', async () => {
  let calls = 0;
  await assert.rejects(
    () => retryLlmTool('t', async () => { calls++; throw new AiToolError('TOOL_DENIED', 'nao'); }),
    (e) => e.code === 'TOOL_DENIED',
  );
  assert.equal(calls, 1);
});

test('retryLlmTool: esgota as tentativas e re-lança o último erro', async () => {
  let calls = 0;
  await assert.rejects(
    () => retryLlmTool('t', async () => { calls++; throw new AiToolError('LLM_INVALID_JSON', 'ruim'); }, { attempts: 2, backoff: () => 0 }),
    (e) => e.code === 'LLM_INVALID_JSON',
  );
  assert.equal(calls, 2);
});

test('retryLlmTool: inventário inválido do propose_screens é transitório (code LLM_INVALID_JSON preservado)', () => {
  // O throw do tools.js usa { invCode, sample } (não { code }) — senão o Object.assign do AiToolError
  // sobrescreveria .code para NO_SCREENS e o retry não pegaria. Este teste documenta o contrato.
  const e = new AiToolError('LLM_INVALID_JSON', 'inventario invalido: sem telas', { invCode: 'NO_SCREENS', sample: 'sem telas' });
  assert.equal(e.code, 'LLM_INVALID_JSON');
  assert.equal(e.invCode, 'NO_SCREENS');
});
