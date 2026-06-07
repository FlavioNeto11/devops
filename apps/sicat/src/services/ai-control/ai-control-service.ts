/**
 * Serviço agregador do AI Control Center: overview (status do provider + Langfuse
 * + telemetria + métricas), health, settings (sem segredos) e leitura de traces
 * locais. Tolerante a OPENAI ausente e a DB indisponível (reporta status, não quebra).
 */
import { getAiConfig, hasOpenAiApiKey } from '../conversation/ai-config.js';
import {
  getConversationTelemetrySnapshot,
  getConversationOperationalReadiness
} from '../conversation/conversation-observability.js';
import { isKnowledgeIndexAvailable, KNOWLEDGE_EMBEDDING_MODEL } from '../conversation/knowledge/conversation-knowledge-service.js';
import { getAiControlConfig, getLangfuseConfig } from './ai-control-config.js';
import { getLangfuseStatus, getObservabilityProvider } from './ai-control-observability-service.js';
import { listRuntimeTools } from './ai-tool-admin-service.js';
import { listRuntimeAgents } from './ai-agent-admin-service.js';
import {
  listAiTraceEvents,
  listAiTraceEventsByTurn,
  type AiTraceEventFilters
} from '../../repositories/ai-trace-event-repo.js';
import type {
  AiControlHealth,
  AiControlMetrics,
  AiControlOverview,
  AiControlRuntimeStatus,
  AiControlSettings,
  AiTraceEvent
} from './ai-control-types.js';

type ProviderModels = {
  configured: boolean;
  agentModel: string | null;
  synthesisModel: string | null;
  escalationModel: string | null;
  judgeModel: string | null;
  langSmithEnabled: boolean;
};

function resolveProviderModels(): ProviderModels {
  let configured = hasOpenAiApiKey();
  let agentModel: string | null = null;
  let synthesisModel: string | null = null;
  let escalationModel: string | null = null;
  let judgeModel: string | null = null;
  let langSmithEnabled = false;

  if (configured) {
    try {
      const config = getAiConfig();
      agentModel = config.openAiAgentModel;
      synthesisModel = config.openAiSynthesisModel;
      escalationModel = config.openAiEscalationModel;
      judgeModel = config.openAiJudgeModel;
      langSmithEnabled = config.langSmithEnabled;
    } catch {
      configured = false;
    }
  }

  return { configured, agentModel, synthesisModel, escalationModel, judgeModel, langSmithEnabled };
}

export async function getOverview(): Promise<AiControlOverview> {
  const aiControl = getAiControlConfig();
  const provider = resolveProviderModels();
  const readiness = getConversationOperationalReadiness();
  const telemetry = getConversationTelemetrySnapshot();

  const [tools, agents, langfuse, recentEvents, observabilityMetrics] = await Promise.all([
    listRuntimeTools().catch(() => []),
    listRuntimeAgents().catch(() => []),
    getLangfuseStatus(),
    listAiTraceEvents({ limit: 20 }).catch(() => [] as AiTraceEvent[]),
    getObservabilityProvider().getMetrics().catch(() => null)
  ]);

  const runtime: AiControlRuntimeStatus = {
    aiControlEnabled: aiControl.enabled,
    readOnly: aiControl.readOnly,
    providerConfigured: provider.configured,
    provider: {
      status: readiness.provider.status === 'degraded' ? 'degraded' : 'ready',
      lastFailureAt: readiness.provider.lastFailureAt,
      lastFailureCorrelationId: readiness.provider.lastFailureCorrelationId
    },
    agentModel: provider.agentModel,
    synthesisModel: provider.synthesisModel,
    escalationModel: provider.escalationModel,
    judgeModel: provider.judgeModel,
    langSmithEnabled: provider.langSmithEnabled,
    toolsTotal: tools.length,
    toolsEnabled: tools.filter((tool) => tool.enabled).length,
    agentsTotal: agents.length
  };

  const topTools = Object.entries(telemetry.operations.tools)
    .map(([toolName, counters]) => ({
      toolName,
      total: counters.total,
      executed: counters.executed,
      blocked: counters.blocked,
      failed: counters.failed
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const metrics: AiControlMetrics = {
    totalTurns: telemetry.counters.totalTurns,
    outcomes: { ...telemetry.counters.outcomes },
    topTools,
    policyBlocksByReason: { ...telemetry.breakdown.blockedByReason },
    confirmation: { ...telemetry.operations.confirmation },
    artifactsGeneratedTotal: telemetry.counters.artifactsGeneratedTotal,
    errorsByCode: { ...telemetry.breakdown.errorsByCode },
    cost:
      observabilityMetrics && observabilityMetrics.available
        ? {
            totalCost: observabilityMetrics.totalCost,
            inputTokens: observabilityMetrics.inputTokens,
            outputTokens: observabilityMetrics.outputTokens,
            avgLatencyMs: observabilityMetrics.avgLatencyMs
          }
        : null,
    recentEvents
  };

  return {
    generatedAt: new Date().toISOString(),
    runtime,
    conversationTelemetry: telemetry,
    langfuse,
    metrics
  };
}

export async function getHealth(): Promise<AiControlHealth> {
  const aiControl = getAiControlConfig();
  const provider = resolveProviderModels();
  const readiness = getConversationOperationalReadiness();
  const langfuse = await getLangfuseStatus();

  let dbOk = true;
  let dbError: string | null = null;
  try {
    await listAiTraceEvents({ limit: 1 });
  } catch (error: unknown) {
    dbOk = false;
    dbError = error instanceof Error ? error.message : 'erro de banco';
  }

  return {
    ok: dbOk,
    aiControlEnabled: aiControl.enabled,
    readOnly: aiControl.readOnly,
    sseEnabled: aiControl.enableSse,
    allowFullSmoke: aiControl.allowFullSmoke,
    traceRetentionDays: aiControl.traceRetentionDays,
    provider: {
      configured: provider.configured,
      status: readiness.provider.status === 'degraded' ? 'degraded' : 'ready'
    },
    langfuse,
    knowledge: { available: isKnowledgeIndexAvailable(), totalChunks: 0 },
    database: { ok: dbOk, error: dbError }
  };
}

export async function getSettings(): Promise<AiControlSettings> {
  const aiControl = getAiControlConfig();
  const langfuseConfig = getLangfuseConfig();
  const langfuse = await getLangfuseStatus();
  const provider = resolveProviderModels();

  return {
    langfuse,
    flushIntervalMs: langfuseConfig.flushIntervalMs,
    syncTimeoutMs: langfuseConfig.syncTimeoutMs,
    provider: {
      configured: provider.configured,
      agentModel: provider.agentModel,
      synthesisModel: provider.synthesisModel,
      escalationModel: provider.escalationModel,
      judgeModel: provider.judgeModel
    },
    langSmithEnabled: provider.langSmithEnabled,
    aiControlEnabled: aiControl.enabled,
    readOnly: aiControl.readOnly,
    debug: aiControl.debug,
    enableSse: aiControl.enableSse,
    allowFullSmoke: aiControl.allowFullSmoke,
    traceRetentionDays: aiControl.traceRetentionDays,
    knowledgeEmbeddingModel: KNOWLEDGE_EMBEDDING_MODEL
  };
}

export async function listLocalTraces(filters: AiTraceEventFilters): Promise<AiTraceEvent[]> {
  return listAiTraceEvents(filters);
}

export async function getLocalTraceByTurn(conversationTurnId: string): Promise<AiTraceEvent[]> {
  return listAiTraceEventsByTurn(conversationTurnId);
}
