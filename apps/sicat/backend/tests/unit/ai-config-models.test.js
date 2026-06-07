import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getAiConfig } from '../../src/services/conversation/ai-config.js';

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_AGENT_MODEL: process.env.OPENAI_AGENT_MODEL,
  OPENAI_SYNTHESIS_MODEL: process.env.OPENAI_SYNTHESIS_MODEL,
  OPENAI_ESCALATION_MODEL: process.env.OPENAI_ESCALATION_MODEL,
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL,
  OPENAI_MODEL: process.env.OPENAI_MODEL
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe('ai-config model separation and cost optimization', () => {
  describe('defaults otimizados para custo', () => {
    it('usa gpt-5-mini como default para agentModel (otimizado para custo)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-5-mini');
    });

    it('usa gpt-4.1-mini como default para synthesisModel (otimizado para custo)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-4.1-mini');
    });

    it('usa gpt-5.1 como default para escalationModel (full capability)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-5.1');
    });

    it('usa gpt-4.1-mini como default para judgeModel (otimizado para custo)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-4.1-mini');
    });
  });

  describe('override de env vars', () => {
    it('OPENAI_AGENT_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_AGENT_MODEL = 'gpt-4.1';
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4.1');
    });

    it('OPENAI_SYNTHESIS_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      process.env.OPENAI_SYNTHESIS_MODEL = 'gpt-4.1';
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-4.1');
    });

    it('OPENAI_ESCALATION_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      process.env.OPENAI_ESCALATION_MODEL = 'gpt-4.1';
      delete process.env.OPENAI_JUDGE_MODEL;
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-4.1');
    });

    it('OPENAI_JUDGE_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
      delete process.env.OPENAI_MODEL;

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-4.1');
    });
  });

  describe('OPENAI_MODEL fallback legado (somente para agent/synthesis)', () => {
    it('usa OPENAI_MODEL como fallback apenas quando nenhum env específico esta definido', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4o');
      assert.equal(config.openAiSynthesisModel, 'gpt-4o');
    });

    it('OPENAI_MODEL nao aplica para escalationModel (only explicit OPENAI_ESCALATION_MODEL)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      // escalationModel deve usar default, NAO o fallback OPENAI_MODEL
      assert.equal(config.openAiEscalationModel, 'gpt-5.1');
    });

    it('OPENAI_MODEL nao aplica para judgeModel (only explicit OPENAI_JUDGE_MODEL)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_AGENT_MODEL;
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      // judgeModel deve usar default, NAO o fallback OPENAI_MODEL
      assert.equal(config.openAiJudgeModel, 'gpt-4.1-mini');
    });

    it('modelos explicitos sobrescrevem OPENAI_MODEL fallback', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_AGENT_MODEL = 'gpt-5.1';
      delete process.env.OPENAI_SYNTHESIS_MODEL;
      delete process.env.OPENAI_ESCALATION_MODEL;
      delete process.env.OPENAI_JUDGE_MODEL;
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-5.1');
      assert.equal(config.openAiSynthesisModel, 'gpt-4o-mini'); // fallback legado
    });
  });

  describe('prioridade de resolucao (especifico > legado fallback > default otimizado)', () => {
    it('OPENAI_AGENT_MODEL > OPENAI_MODEL > default gpt-5-mini', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_AGENT_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4.1');
    });

    it('OPENAI_SYNTHESIS_MODEL > OPENAI_MODEL > default gpt-4.1-mini', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_SYNTHESIS_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-4.1');
    });

    it('OPENAI_ESCALATION_MODEL > default gpt-5.1 (OPENAI_MODEL ignorado)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_ESCALATION_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-4.1');
    });

    it('OPENAI_JUDGE_MODEL > default gpt-4.1-mini (OPENAI_MODEL ignorado)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-4.1');
    });
  });
});