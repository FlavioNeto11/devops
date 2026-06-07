import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicPlan } from '../../src/services/conversation/llm-provider.js';

describe('conversation planner deterministic output', () => {
  it('nao roteia selected set attributes por regex', () => {
    const plan = buildDeterministicPlan(
      'quais sao os geradores deles',
      { lastManifestSelectionIds: ['man_11', 'man_12'] }
    );

    assert.equal(plan, null);
  });

  it('nao roteia cancel recent por regex', () => {
    const plan = buildDeterministicPlan('cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente');

    assert.equal(plan, null);
  });

  it('nao roteia replicate with patch por regex', () => {
    const plan = buildDeterministicPlan('replicar manifesto man_123 alterando nome do caminhoneiro Joao Silva e placa ABC1D23');

    assert.equal(plan, null);
  });

  it('nao usa heuristica para top 3 mais recentes (camada LLM deve classificar)', () => {
    const plan = buildDeterministicPlan('quais sao meus manifestos mais recentes, o top 3');

    assert.equal(plan, null);
  });

  it('nao usa heuristica para pedido de top 5 com datas (camada LLM deve classificar)', () => {
    const plan = buildDeterministicPlan('me retorne os 5 manifestos mais recentes com as datas e status');

    assert.equal(plan, null);
  });

  it('nao usa heuristica generica de mais dados deles sem atributo explicito', () => {
    const plan = buildDeterministicPlan(
      'quero mais dados deles',
      { lastManifestSelectionIds: ['man_01', 'man_02', 'man_03'] }
    );

    assert.equal(plan, null);
  });

  it('responde saudacao simples sem tool call', () => {
    const plan = buildDeterministicPlan('oi');

    assert.equal(plan, null);
  });
});
