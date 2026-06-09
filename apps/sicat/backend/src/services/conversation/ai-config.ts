import { ChatOpenAI } from '@langchain/openai';
import { buildChatOpenAIArgs, isReasoningModel as kitIsReasoningModel } from '@flavioneto11/ai-kit';
import { AppError } from '../../lib/problem.js';

// Contrato gpt-5 centralizado em @flavioneto11/ai-kit (compartilhado com o GymOps).
// AI_KIT=off volta ao caminho inline legado (rollback de 1 ciclo; ver deprecation-policy).
const AI_KIT_ENABLED = (process.env.AI_KIT ?? 'on').trim().toLowerCase() !== 'off';

// Defaults alinhados aos ÚNICOS modelos liberados nesta conta (gpt-5, gpt-5-nano,
// text-embedding-3-*). Assim, mesmo que uma env OPENAI_*_MODEL falte (nova app, deploy
// incompleto), nenhum fluxo cai em modelo inexistente. Ajuste fino via env no ambiente.
const DEFAULT_OPENAI_AGENT_MODEL = 'gpt-5';
const DEFAULT_OPENAI_SYNTHESIS_MODEL = 'gpt-5';
const DEFAULT_OPENAI_ESCALATION_MODEL = 'gpt-5';
const DEFAULT_OPENAI_JUDGE_MODEL = 'gpt-5-nano';

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
 * OPENAI_AGENT_MODEL (default: gpt-5), OPENAI_SYNTHESIS_MODEL (default: gpt-5),
 * OPENAI_ESCALATION_MODEL (default: gpt-5) e OPENAI_JUDGE_MODEL (default: gpt-5-nano)
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
  if (AI_KIT_ENABLED) return kitIsReasoningModel(model);
  return /^(gpt-5|o\d)/i.test(String(model || '').trim());
}

// Reasoning effort POR FASE (não global). O roteamento (classificação/planejamento de
// ferramenta) precisa de ALGUM reasoning para acertar a tool — mas o GROUNDING (RAG no
// roteamento + KB de capacidade + descrições claras das tools) é quem carrega a correção,
// não o esforço alto. Medição (gpt-5): 'medium' custava 44–75s/turno (estourava o timeout do
// front); 'low' roteia igualmente certo (mesmas tools, confiança 0.85–0.91) em ~13–20s. Por
// isso o default de routing é 'low' (não 'medium'). A síntese segue leve ('low', e muitas
// consultas nem chamam síntese — bypass determinístico). Tudo ajustável por env sem rebuild;
// base ('minimal') mantém o comportamento legado para chamadas que não declaram fase.
export type ReasoningPhase = 'routing' | 'synthesis' | 'base';

export function getReasoningEffortFor(phase: ReasoningPhase = 'base'): string {
  const base = (process.env.OPENAI_REASONING_EFFORT || 'minimal').trim();
  if (phase === 'routing') return (process.env.OPENAI_REASONING_EFFORT_ROUTING || 'low').trim();
  if (phase === 'synthesis') return (process.env.OPENAI_REASONING_EFFORT_SYNTHESIS || 'low').trim();
  return base;
}

// Fábrica única de ChatOpenAI compatível com reasoning models.
// - Modelos comuns: temperature: 0 (determinístico).
// - Modelos de reasoning (gpt-5*, o*): SEM temperature (só aceitam o default 1) e com
//   `reasoning_effort` configurável. `reasoningEffort` pode ser passado pelo chamador
//   (ex.: getReasoningEffortFor('routing')); na ausência, cai no OPENAI_REASONING_EFFORT
//   (default 'minimal'). Encadeamentos ReAct devem manter o roteamento focado e a síntese leve.
export function createChatModel(model: string, apiKey: string, reasoningEffort?: string): ChatOpenAI {
  const effort = (reasoningEffort || process.env.OPENAI_REASONING_EFFORT || 'minimal').trim();
  if (AI_KIT_ENABLED) {
    return new ChatOpenAI(buildChatOpenAIArgs(model, apiKey, { reasoningEffort: effort }));
  }
  // --- legado (AI_KIT=off) ---
  if (!isReasoningModel(model)) {
    return new ChatOpenAI({ apiKey, model, temperature: 0 });
  }
  return new ChatOpenAI({ apiKey, model, modelKwargs: { reasoning_effort: effort } });
}
