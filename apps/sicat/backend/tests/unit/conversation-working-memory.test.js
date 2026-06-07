import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyWorkingMemory,
  workingMemoryDraftSchema,
  WORKING_MEMORY_VERSION
} from '../../src/services/conversation/memory/conversation-working-memory-types.js';
import {
  buildWorkingMemoryContextBlock,
  operationalTodayIso
} from '../../src/services/conversation/memory/conversation-working-memory-service.js';

test('operationalTodayIso retorna data no formato YYYY-MM-DD', () => {
  assert.match(operationalTodayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('emptyWorkingMemory tem a forma esperada', () => {
  const wm = emptyWorkingMemory('2026-05-29T00:00:00.000Z');
  assert.equal(wm.version, WORKING_MEMORY_VERSION);
  assert.equal(wm.goal, null);
  assert.equal(wm.operationalFocus.activeDateWindow, null);
  assert.deepEqual(wm.operationalFocus.activeManifestIds, []);
});

test('contexto sem memória injeta o relógio operacional e marca nova conversa', () => {
  const block = buildWorkingMemoryContextBlock(null, '2026-05-29');
  assert.match(block, /Data operacional atual: 2026-05-29/);
  assert.match(block, /nova conversa/i);
});

test('contexto com memória injeta objetivo, janela ativa, foco e narrativa', () => {
  const wm = {
    version: WORKING_MEMORY_VERSION,
    goal: 'consultar manifestos de hoje',
    operationalFocus: {
      partnerRole: 'gerador',
      activeDateWindow: { dateFrom: '2026-05-29', dateTo: '2026-05-29', label: 'hoje' },
      activeManifestIds: ['260012073434', '260012073529'],
      activeJobIds: [],
      activeCdfIds: []
    },
    establishedFacts: ['3 manifestos com status salvo'],
    openThreads: ['emitir CDF dos manifestos de hoje'],
    narrative: 'Usuario consultou os manifestos de hoje.',
    updatedAt: '2026-05-29T12:00:00.000Z'
  };
  const block = buildWorkingMemoryContextBlock(wm, '2026-05-29');
  assert.match(block, /consultar manifestos de hoje/);
  assert.match(block, /2026-05-29 a 2026-05-29/);
  assert.match(block, /260012073434/);
  assert.match(block, /emitir CDF dos manifestos de hoje/);
  assert.match(block, /Usuario consultou os manifestos de hoje/);
  assert.match(block, /ancore pedidos relativos/i);
});

test('schema do draft aceita saída parcial do LLM e rejeita tipos inválidos', () => {
  assert.equal(
    workingMemoryDraftSchema.safeParse({
      goal: 'emitir CDF',
      operationalFocus: { activeManifestIds: ['260012073434'] },
      narrative: 'resumo'
    }).success,
    true
  );
  // Tudo opcional → objeto vazio é válido (carrega o estado anterior no merge).
  assert.equal(workingMemoryDraftSchema.safeParse({}).success, true);
  // Tipo inválido em campo de array é rejeitado.
  assert.equal(workingMemoryDraftSchema.safeParse({ establishedFacts: 'nope' }).success, false);
});
