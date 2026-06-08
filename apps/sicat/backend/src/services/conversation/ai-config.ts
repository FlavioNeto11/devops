import { ChatOpenAI } from '@langchain/openai';
import { AppError } from '../../lib/problem.js';

const DEFAULT_OPENAI_AGENT_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_SYNTHESIS_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_ESCALATION_MODEL = 'gpt-5.1';
const DEFAULT_OPENAI_JUDGE_MODEL = 'gpt-4.1-mini';

export type AiConfig = {
  openAiApiKey: string;
  openAiAgentModel: string;
  openAiSynthesisModel: string;
  openAiEscalationModel: string;
  openAiJudgeModel: string;
  langSmithEnabled: boolean;
};

type OpenAiModelEnvKey = 'OPENAI_AGENT_MODEL' | 'OPENAI_SYNTHESIS_MODEL' | 'OPENAI_ESCALATION_MODEL' | 'OPENAI_JUDGE_MODEL';

function readOpenAiModel(envKey: OpenAiModelEnvKey, fallback: string): string {
  const explicitModel = process.env[envKey];
  if (typeof explicitModel === 'string' && explicitModel.trim().length > 0) {
    return explicitModel.trim();
  }

  // Para compatibilidade legada, OPENAI_MODEL é apenas fallback
  if (envKey !== 'OPENAI_ESCALATION_MODEL' && envKey !== 'OPENAI_JUDGE_MODEL') {
    const compatibilityModel = process.env.OPENAI_MODEL;
    if (typeof compatibilityModel === 'string' && compatibilityModel.trim().length > 0) {
      return compatibilityModel.trim();
    }
  }

  return fallback;
}

export function hasOpenAiApiKey(): boolean {
  return typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim().length > 0;
}

/**
 * Lê e valida as variáveis de ambiente necessárias para a integração com OpenAI e LangSmith.
 * OPENAI_API_KEY é obrigatória.
 * OPENAI_AGENT_MODEL (default: gpt-5-mini), OPENAI_SYNTHESIS_MODEL (default: gpt-4.1-mini),
 * OPENAI_ESCALATION_MODEL (default: gpt-5.1) e OPENAI_JUDGE_MODEL (default: gpt-4.1-mini)
 * usam OPENAI_MODEL apenas como fallback de compatibilidade (somente para agent/synthesis).
 * LangSmith é habilitado via LANGSMITH_TRACING=true + LANGSMITH_API_KEY.
 * Mapeia LANGSMITH_* → LANGCHAIN_* se as variáveis LANGCHAIN_* não estiverem definidas.
 */
export function getAiConfig(): AiConfig {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new AppError(
      503,
      'AI nao configurado',
      'OPENAI_API_KEY e obrigatoria e nao esta definida no ambiente.',
      { code: 'PROVIDER_UNAVAILABLE' }
    );
  }

  const openAiAgentModel = readOpenAiModel('OPENAI_AGENT_MODEL', DEFAULT_OPENAI_AGENT_MODEL);
  const openAiSynthesisModel = readOpenAiModel('OPENAI_SYNTHESIS_MODEL', DEFAULT_OPENAI_SYNTHESIS_MODEL);
  const openAiEscalationModel = readOpenAiModel('OPENAI_ESCALATION_MODEL', DEFAULT_OPENAI_ESCALATION_MODEL);
  const openAiJudgeModel = readOpenAiModel('OPENAI_JUDGE_MODEL', DEFAULT_OPENAI_JUDGE_MODEL);

  // Propaga LANGSMITH_* → LANGCHAIN_* para compatibilidade com LangChain auto-tracing
  if (process.env.LANGSMITH_API_KEY && !process.env.LANGCHAIN_API_KEY) {
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
  }
  if (process.env.LANGSMITH_PROJECT && !process.env.LANGCHAIN_PROJECT) {
    process.env.LANGCHAIN_PROJECT = process.env.LANGSMITH_PROJECT;
  }
  if (process.env.LANGSMITH_TRACING === 'true' && !process.env.LANGCHAIN_TRACING_V2) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
  }

  const langSmithEnabled = process.env.LANGCHAIN_TRACING_V2 === 'true';

  return {
    openAiApiKey,
    openAiAgentModel,
    openAiSynthesisModel,
    openAiEscalationModel,
    openAiJudgeModel,
    langSmithEnabled
  };
}

// Modelos de reasoning (gpt-5*, o1/o3...) só aceitam `temperature` default (1) e usam
// `max_completion_tokens`. Enviar `temperature: 0` resulta em 400 da OpenAI e derruba a
// conversa em PROVIDER_UNAVAILABLE. Por isso, para esses modelos, NÃO enviamos temperature.
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(String(model || '').trim());
}

// Fábrica única de ChatOpenAI compatível com reasoning models: omite `temperature`
// quando o modelo é de reasoning; mantém `temperature: 0` (determinístico) para os demais.
export function createChatModel(model: string, apiKey: string): ChatOpenAI {
  return new ChatOpenAI(
    isReasoningModel(model) ? { apiKey, model } : { apiKey, model, temperature: 0 }
  );
}
