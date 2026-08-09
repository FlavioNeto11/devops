import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_MODELS } from '@flavioneto11/ai-kit';
import { getAiConfig } from '../../src/services/conversation/ai-config.js';

// POR QUE OS DEFAULTS SAO 'gpt-5' / 'gpt-5-nano' (leia antes de "otimizar")
//
// Esta suite ja exigiu defaults "otimizados para custo" (gpt-5-mini, gpt-4.1-mini, gpt-5.1).
// Eles foram REVERTIDOS de proposito no commit 4acbd7ce ("defaults de modelo alinhados aos
// modelos liberados"): aqueles modelos NAO EXISTEM nesta conta OpenAI. O default so entra em
// cena quando a env OPENAI_*_MODEL falta (app nova, deploy incompleto, secret sem a chave) —
// exatamente a hora em que apontar para um modelo inexistente troca um fallback silencioso por
// um 404 do provedor. Default tem de ser o modelo que a conta libera, nao o mais barato do catalogo.
//
// A restricao e da PLATAFORMA, nao deste app: `packages/ai-kit` (contrato de IA compartilhado com
// o GymOps) declara `DEFAULT_MODELS = { chat: 'gpt-5', nano: 'gpt-5-nano' }` como "modelos default
// liberados na conta", e todo o resto do backend segue a mesma dupla (router, re-ranker,
// working-memory, ingest). Ver tambem o comentario no topo de `src/services/conversation/ai-config.ts`.
//
// Trocar estes defaults por modelos mini/4.1 nao e otimizacao: e trocar 6 testes verdes por falha
// em producao. Se a conta passar a liberar outros modelos, a mudanca comeca no `ai-kit` (fonte
// unica) e desce para ca — nunca o contrario. Ate la, o ajuste fino de custo se faz por ENV no
// ambiente, e e isso que os casos de override abaixo protegem.
//
// O que esta suite realmente prende: (a) as quatro fases (agent / synthesis / escalation / judge)
// resolvem o modelo de forma INDEPENDENTE; (b) cada uma e sobrescrivivel por env propria;
// (c) o fallback legado OPENAI_MODEL vale SO para agent/synthesis.

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

/** Zera as envs de modelo para exercitar o caminho de DEFAULT puro. */
function clearModelEnv() {
  delete process.env.OPENAI_AGENT_MODEL;
  delete process.env.OPENAI_SYNTHESIS_MODEL;
  delete process.env.OPENAI_ESCALATION_MODEL;
  delete process.env.OPENAI_JUDGE_MODEL;
  delete process.env.OPENAI_MODEL;
}

describe('ai-config: separacao de modelos por fase e defaults presos aos modelos liberados na conta', () => {
  describe('defaults limitados aos modelos liberados na conta', () => {
    it('usa gpt-5 como default para agentModel (modelo liberado na conta)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-5');
    });

    it('usa gpt-5 como default para synthesisModel (modelo liberado na conta)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-5');
    });

    it('usa gpt-5 como default para escalationModel (modelo liberado na conta)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-5');
    });

    it('usa gpt-5-nano como default para judgeModel (modelo liberado na conta)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-5-nano');
    });

    // Tripwire: amarra os defaults a fonte unica da plataforma (`ai-kit`) em vez de a literais
    // soltos. Se alguem "otimizar" um default para gpt-5-mini / gpt-4.1-mini / gpt-5.1, este
    // caso falha com o motivo escrito na mensagem — que e o ponto de todo o comentario do topo.
    it('todo default cai dentro do conjunto liberado pelo ai-kit (gpt-5 / gpt-5-nano)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();

      const allowed = new Set([DEFAULT_MODELS.chat, DEFAULT_MODELS.nano]);
      const config = getAiConfig();
      const defaults = {
        openAiAgentModel: config.openAiAgentModel,
        openAiSynthesisModel: config.openAiSynthesisModel,
        openAiEscalationModel: config.openAiEscalationModel,
        openAiJudgeModel: config.openAiJudgeModel
      };

      for (const [field, model] of Object.entries(defaults)) {
        assert.ok(
          allowed.has(model),
          `${field} caiu no default '${model}', que NAO esta liberado nesta conta ` +
            `(liberados: ${[...allowed].join(', ')}). Default so e usado quando a env ` +
            'OPENAI_*_MODEL falta — apontar para modelo inexistente vira 404 do provedor em ' +
            'producao. Ver o comentario no topo deste arquivo e o commit 4acbd7ce.'
        );
      }
    });
  });

  describe('override de env vars', () => {
    it('OPENAI_AGENT_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_AGENT_MODEL = 'gpt-4.1';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4.1');
    });

    it('OPENAI_SYNTHESIS_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_SYNTHESIS_MODEL = 'gpt-4.1';

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-4.1');
    });

    it('OPENAI_ESCALATION_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_ESCALATION_MODEL = 'gpt-4.1';

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-4.1');
    });

    it('OPENAI_JUDGE_MODEL sobrescreve default', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-4.1');
    });

    // Controle negativo da separacao: sobrescrever UMA fase nao pode arrastar as outras.
    // Sem isto, um `readOpenAiModel` que ignorasse o `envKey` passaria nos quatro casos acima.
    it('override de uma fase nao contamina as demais', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_AGENT_MODEL = 'gpt-4.1';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4.1');
      assert.equal(config.openAiSynthesisModel, 'gpt-5');
      assert.equal(config.openAiEscalationModel, 'gpt-5');
      assert.equal(config.openAiJudgeModel, 'gpt-5-nano');
    });
  });

  describe('OPENAI_MODEL fallback legado (somente para agent/synthesis)', () => {
    it('usa OPENAI_MODEL como fallback apenas quando nenhum env especifico esta definido', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4o');
      assert.equal(config.openAiSynthesisModel, 'gpt-4o');
    });

    it('OPENAI_MODEL nao aplica para escalationModel (only explicit OPENAI_ESCALATION_MODEL)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      // escalationModel deve usar o default da conta, NAO o fallback OPENAI_MODEL
      assert.equal(config.openAiEscalationModel, 'gpt-5');
    });

    it('OPENAI_MODEL nao aplica para judgeModel (only explicit OPENAI_JUDGE_MODEL)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_MODEL = 'gpt-4o';

      const config = getAiConfig();

      // judgeModel deve usar o default da conta, NAO o fallback OPENAI_MODEL
      assert.equal(config.openAiJudgeModel, 'gpt-5-nano');
    });

    it('modelos explicitos sobrescrevem OPENAI_MODEL fallback', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_AGENT_MODEL = 'gpt-5.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-5.1');
      assert.equal(config.openAiSynthesisModel, 'gpt-4o-mini'); // fallback legado
    });
  });

  describe('prioridade de resolucao (especifico > fallback legado > default da conta)', () => {
    it('OPENAI_AGENT_MODEL > OPENAI_MODEL > default gpt-5', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_AGENT_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiAgentModel, 'gpt-4.1');
    });

    it('OPENAI_SYNTHESIS_MODEL > OPENAI_MODEL > default gpt-5', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_SYNTHESIS_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiSynthesisModel, 'gpt-4.1');
    });

    it('OPENAI_ESCALATION_MODEL > default gpt-5 (OPENAI_MODEL ignorado)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_ESCALATION_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiEscalationModel, 'gpt-4.1');
    });

    it('OPENAI_JUDGE_MODEL > default gpt-5-nano (OPENAI_MODEL ignorado)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      clearModelEnv();
      process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getAiConfig();

      assert.equal(config.openAiJudgeModel, 'gpt-4.1');
    });
  });
});
