import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ensureOpenAiJudgeConfigured,
  isTransientNetworkError,
  readOpenAiJudgeModel,
  validateBackendResponseQualityGate
} from '../../scripts/ai-smoke/run-sicat-ai-smoke.mjs';

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_OPENAI_MODEL = process.env.OPENAI_MODEL;
const ORIGINAL_OPENAI_JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL;

afterEach(() => {
  if (typeof ORIGINAL_OPENAI_KEY === 'string') {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  if (typeof ORIGINAL_OPENAI_MODEL === 'string') {
    process.env.OPENAI_MODEL = ORIGINAL_OPENAI_MODEL;
  } else {
    delete process.env.OPENAI_MODEL;
  }

  if (typeof ORIGINAL_OPENAI_JUDGE_MODEL === 'string') {
    process.env.OPENAI_JUDGE_MODEL = ORIGINAL_OPENAI_JUDGE_MODEL;
  } else {
    delete process.env.OPENAI_JUDGE_MODEL;
  }
});

describe('ai-smoke quality gate', () => {
  it('reprova provider heuristico da lista bloqueada', () => {
    const result = validateBackendResponseQualityGate({}, {
      status: 'responded',
      llm: { provider: 'rule-based' },
      result: {}
    });

    assert.equal(result.pass, false);
    assert.equal(result.reasonCode, 'HEURISTIC_PROVIDER_NOT_ALLOWED');
    assert.equal(
      result.reason,
      'Resposta heuristica/rule-based nao permitida. O Chat SICAT deve responder pelo agente/LLM real.'
    );
  });

  it('reprova responded sem provider real', () => {
    const result = validateBackendResponseQualityGate({}, {
      status: 'responded',
      llm: { provider: '' },
      result: {}
    });

    assert.equal(result.pass, false);
    assert.equal(result.reasonCode, 'INVALID_LLM_PROVIDER');
  });

  it('reprova fallback indevido e aceita fallback marcado explicitamente no catalogo', () => {
    const rejected = validateBackendResponseQualityGate({}, {
      status: 'failed',
      llm: { provider: 'layered-llm' },
      result: { fallback: true }
    });
    assert.equal(rejected.pass, false);
    assert.equal(rejected.reasonCode, 'FALLBACK_NOT_ALLOWED');

    const accepted = validateBackendResponseQualityGate({ expect_provider_unavailable: true }, {
      status: 'failed',
      llm: { provider: 'provider-unavailable' },
      result: { fallback: true, reasonCode: 'PROVIDER_UNAVAILABLE' }
    });
    assert.equal(accepted.pass, true);
  });

  it('reprova responded com provider indisponivel', () => {
    const result = validateBackendResponseQualityGate({}, {
      status: 'responded',
      llm: { provider: 'layered-llm' },
      result: { reasonCode: 'PROVIDER_UNAVAILABLE' }
    });

    assert.equal(result.pass, false);
    assert.equal(result.reasonCode, 'RESPONDED_PROVIDER_UNAVAILABLE');
  });

  it('aprova provider real quando backend respondeu sem fallback', () => {
    const result = validateBackendResponseQualityGate({}, {
      status: 'responded',
      llm: { provider: 'langchain' },
      result: { reasonCode: null }
    });

    assert.equal(result.pass, true);
    assert.equal(result.reasonCode, null);
  });

  it('falha explicitamente quando OPENAI_API_KEY nao esta configurada', () => {
    delete process.env.OPENAI_API_KEY;

    assert.throws(() => ensureOpenAiJudgeConfigured(), (error) => {
      assert.equal(error?.code, 'SMOKE_JUDGE_CONFIG_ERROR');
      return true;
    });
  });

  it('usa OPENAI_JUDGE_MODEL com precedencia sobre OPENAI_MODEL', () => {
    process.env.OPENAI_MODEL = 'gpt-4.1';
    process.env.OPENAI_JUDGE_MODEL = 'gpt-4o-mini';

    assert.equal(readOpenAiJudgeModel(), 'gpt-4o-mini');
  });

  it('usa OPENAI_MODEL apenas como fallback de compatibilidade do juiz', () => {
    process.env.OPENAI_MODEL = 'gpt-4.1';
    delete process.env.OPENAI_JUDGE_MODEL;

    assert.equal(readOpenAiJudgeModel(), 'gpt-4.1');
  });
});

describe('isTransientNetworkError', () => {
  it('detecta fetch failed como erro transiente', () => {
    assert.equal(isTransientNetworkError(new Error('fetch failed')), true);
  });

  it('detecta ECONNREFUSED como erro transiente', () => {
    assert.equal(isTransientNetworkError(new Error('connect ECONNREFUSED 127.0.0.1:8080')), true);
  });

  it('detecta ECONNRESET como erro transiente', () => {
    assert.equal(isTransientNetworkError(new Error('read ECONNRESET')), true);
  });

  it('detecta ETIMEDOUT como erro transiente', () => {
    assert.equal(isTransientNetworkError(new Error('connect ETIMEDOUT')), true);
  });

  it('nao classifica HTTP 4xx como transiente', () => {
    assert.equal(isTransientNetworkError(new Error('HTTP 401: Unauthorized')), false);
  });

  it('nao classifica erro de config como transiente', () => {
    assert.equal(isTransientNetworkError(new Error('SICAT_ACCESS_TOKEN ausente')), false);
  });

  it('nao classifica null/undefined como transiente', () => {
    assert.equal(isTransientNetworkError(null), false);
    assert.equal(isTransientNetworkError(undefined), false);
  });
});
