/**
 * AI Control Center — contratos DTO compartilhados.
 *
 * Estes tipos são a fonte de verdade dos payloads expostos por `/v1/ai-control/*`
 * e consumidos pelo frontend. Nenhum segredo (chaves Langfuse, JWT, tokens) deve
 * aparecer aqui — apenas flags `*Configured: boolean`.
 */
import type { getConversationTelemetrySnapshot } from '../conversation/conversation-observability.js';
import type { ConversationToolRiskLevel } from '../conversation/tools/tool-types.js';

export type AiRiskLevel = ConversationToolRiskLevel;
export type AiToolSource = 'code' | 'db' | 'langfuse' | 'manual';
export type AiObservabilityStatus = 'ready' | 'disabled' | 'degraded';

/** Snapshot de telemetria conversacional local (reaproveita a observabilidade existente). */
export type AiConversationTelemetry = ReturnType<typeof getConversationTelemetrySnapshot>;

// ─── Runtime: tools & agents ────────────────────────────────────────────────

export type AiRuntimeToolPolicy = {
  riskLevel: AiRiskLevel;
  allowChannels: string[];
  requiresConfirmation: boolean;
  isAction: boolean;
};

export type AiRuntimeToolStats = {
  total: number;
  responded: number;
  executed: number;
  blocked: number;
  failed: number;
};

export type AiRuntimeTool = {
  toolName: string;
  category: string;
  objective: string;
  dependencies: string[];
  enabled: boolean;
  source: AiToolSource;
  activeVersion: string | null;
  hasSchema: boolean;
  schema: Record<string, unknown> | null;
  policy: AiRuntimeToolPolicy;
  stats: AiRuntimeToolStats;
};

export type AiRuntimeAgent = {
  agentName: string;
  description: string;
  specialistType: string | null;
  /** Texto dinâmico do agente: o que ele resolve (injetado no planner/síntese). */
  focus: string;
  /** Intents que pertencem a este agente (estrutura de roteamento). */
  intents: string[];
  /** Tópicos para enriquecer o retrieval de conhecimento (RAG goal-aware). */
  knowledgeTopics: string[];
  toolNames: string[];
  promptName: string | null;
  enabled: boolean;
  source: AiToolSource;
  config: Record<string, unknown>;
};

export type AiRuntimePolicyView = {
  policyId: string;
  toolName: string;
  riskLevel: AiRiskLevel;
  allowChannels: string[];
  requiresConfirmation: boolean;
  isAction: boolean;
  enabled: boolean;
  source: AiToolSource;
};

// ─── Overview ───────────────────────────────────────────────────────────────

export type AiControlRuntimeStatus = {
  aiControlEnabled: boolean;
  readOnly: boolean;
  providerConfigured: boolean;
  provider: {
    status: 'ready' | 'degraded';
    lastFailureAt: string | null;
    lastFailureCorrelationId: string | null;
  };
  agentModel: string | null;
  synthesisModel: string | null;
  escalationModel: string | null;
  judgeModel: string | null;
  langSmithEnabled: boolean;
  toolsTotal: number;
  toolsEnabled: number;
  agentsTotal: number;
};

export type AiControlLangfuseStatus = {
  enabled: boolean;
  status: AiObservabilityStatus;
  baseUrl: string | null;
  projectId: string | null;
  publicKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  lastSyncAt: string | null;
  error: string | null;
};

export type AiControlCostMetrics = {
  totalCost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  avgLatencyMs: number | null;
};

export type AiControlMetrics = {
  totalTurns: number;
  outcomes: { responded: number; blocked: number; executed: number; failed: number };
  topTools: Array<{ toolName: string; total: number; executed: number; blocked: number; failed: number }>;
  policyBlocksByReason: Record<string, number>;
  confirmation: { requiredTotal: number; confirmedTotal: number; blockedMissingTotal: number };
  artifactsGeneratedTotal: number;
  errorsByCode: Record<string, number>;
  cost: AiControlCostMetrics | null;
  recentEvents: AiTraceEvent[];
};

export type AiControlOverview = {
  generatedAt: string;
  runtime: AiControlRuntimeStatus;
  conversationTelemetry: AiConversationTelemetry;
  langfuse: AiControlLangfuseStatus;
  metrics: AiControlMetrics;
};

// ─── Prompts ──────────────────────────────────────────────────────────────--

export type AiPromptProviderSource = 'local' | 'langfuse' | 'manual';

export type AiPromptVersion = {
  id: string;
  version: string;
  label: string | null;
  model: string | null;
  promptText: string;
  promptConfig: Record<string, unknown>;
  langfusePromptId: string | null;
  langfuseVersion: number | null;
  createdBy: string | null;
  createdAt: string | null;
  activatedAt: string | null;
  active: boolean;
};

export type AiPromptSummary = {
  promptName: string;
  description: string | null;
  providerSource: AiPromptProviderSource;
  activeVersion: string | null;
  versionsCount: number;
  source: AiToolSource;
  updatedAt: string | null;
};

export type AiPromptDetail = AiPromptSummary & {
  versions: AiPromptVersion[];
  localFallbackAvailable: boolean;
};

// ─── Knowledge base ──────────────────────────────────────────────────────────

export type AiKnowledgeSource = {
  sourceKey: string;
  sourceType: string;
  title: string;
  pathOrUri: string | null;
  enabled: boolean;
  embeddingModel: string | null;
  lastIndexedAt: string | null;
  chunkCount: number;
  status: string;
};

export type AiKnowledgeChunk = {
  chunkKey: string;
  sourceKey: string | null;
  title: string | null;
  text: string;
  score: number | null;
};

export type AiKnowledgeRetrievalHit = {
  source: string;
  title: string | null;
  text: string;
  score: number;
};

export type AiKnowledgeIndexStatus = {
  available: boolean;
  embeddingModel: string | null;
  totalChunks: number;
  builtAt: string | null;
  sources: AiKnowledgeSource[];
};

// ─── Memory ────────────────────────────────────────────────────────────────-

export type AiMemorySnapshot = {
  conversationSessionId: string;
  integrationAccountId: string | null;
  workingMemory: Record<string, unknown> | null;
  memoryPatches: Array<Record<string, unknown>>;
  vectorMemory: { count: number; hits: Array<{ role: string; text: string; score: number }> };
  activeManifestIds: string[];
  askedManifestIds: string[];
  activeJobIds: string[];
  artifactIds: string[];
  dateRange: { dateFrom: string | null; dateTo: string | null } | null;
  messagesCount: number;
  lastUpdatedAt: string | null;
  recentMessages: Array<{ role: string; text: string | null; createdAt: string | null }>;
};

// ─── Local traces ─────────────────────────────────────────────────────────--

export type AiTraceEvent = {
  id: string;
  traceSource: 'sicat' | 'langfuse';
  traceId: string | null;
  observationId: string | null;
  conversationSessionId: string | null;
  conversationTurnId: string | null;
  correlationId: string | null;
  userId: string | null;
  toolName: string | null;
  eventType: string;
  status: string | null;
  latencyMs: number | null;
  tokenInput: number | null;
  tokenOutput: number | null;
  cost: number | null;
  payload: Record<string, unknown>;
  createdAt: string | null;
};

// ─── Langfuse DTOs ────────────────────────────────────────────────────────--

export type AiLangfuseTraceSummary = {
  traceId: string;
  name: string | null;
  conversationSessionId: string | null;
  conversationTurnId: string | null;
  correlationId: string | null;
  userId: string | null;
  status: string | null;
  startedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  deepLink: string | null;
};

export type AiLangfuseObservation = {
  id: string;
  traceId: string;
  type: string;
  name: string | null;
  status: string | null;
  startedAt: string | null;
  durationMs: number | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
};

export type AiLangfuseTraceTreeNode = {
  id: string;
  type: string;
  name: string;
  status: string | null;
  durationMs: number | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cost?: number | null;
  children: AiLangfuseTraceTreeNode[];
};

export type AiLangfuseTraceTree = AiLangfuseTraceSummary & {
  nodes: AiLangfuseTraceTreeNode[];
};

export type AiLangfuseMetrics = {
  available: boolean;
  window: string | null;
  totalTraces: number | null;
  totalCost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  avgLatencyMs: number | null;
};

// ─── Evals / smoke ────────────────────────────────────────────────────────--

export type AiEvalMode = 'sample' | 'full' | 'category' | 'dry-run';
export type AiEvalStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'blocked';

export type AiEvalSummary = {
  total: number;
  passed: number;
  failed: number;
  passRate: number | null;
  avgScore: number | null;
  regressions: number | null;
  toolAccuracy: number | null;
  policyAccuracy: number | null;
  topReasonCodes: Array<{ code: string; count: number }>;
  failedCategories: Array<{ category: string; count: number }>;
};

export type AiEvalRun = {
  runId: string;
  runKey: string;
  mode: AiEvalMode;
  status: AiEvalStatus;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: string | null;
  summary: AiEvalSummary | null;
  langfuseDatasetRunId: string | null;
  createdAt: string | null;
};

export type AiEvalCase = {
  caseId: string;
  category: string | null;
  prompt: string | null;
  expected: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
  score: Record<string, unknown> | null;
  status: string | null;
  traceId: string | null;
};

export type AiEvalBattery = {
  key: string;
  label: string;
  mode: AiEvalMode;
  catalog: string;
  totalScenarios: number;
  description: string;
  blockedByDefault: boolean;
};

// ─── Health / settings ───────────────────────────────────────────────────--

export type AiControlHealth = {
  ok: boolean;
  aiControlEnabled: boolean;
  readOnly: boolean;
  sseEnabled: boolean;
  allowFullSmoke: boolean;
  traceRetentionDays: number;
  provider: { configured: boolean; status: 'ready' | 'degraded' };
  langfuse: AiControlLangfuseStatus;
  knowledge: { available: boolean; totalChunks: number };
  database: { ok: boolean; error: string | null };
};

export type AiControlSettings = {
  langfuse: AiControlLangfuseStatus;
  flushIntervalMs: number;
  syncTimeoutMs: number;
  provider: {
    configured: boolean;
    agentModel: string | null;
    synthesisModel: string | null;
    escalationModel: string | null;
    judgeModel: string | null;
  };
  langSmithEnabled: boolean;
  aiControlEnabled: boolean;
  readOnly: boolean;
  debug: boolean;
  enableSse: boolean;
  allowFullSmoke: boolean;
  traceRetentionDays: number;
  knowledgeEmbeddingModel: string;
};

/** Eventos emitidos pela camada SSE local (`/v1/ai-control/events/stream`). */
export type AiControlStreamEventType =
  | 'turn.started'
  | 'classifier.done'
  | 'rag.done'
  | 'planner.done'
  | 'policy.blocked'
  | 'tool.started'
  | 'tool.done'
  | 'tool.failed'
  | 'response.done'
  | 'langfuse.synced'
  | 'eval.started'
  | 'eval.done'
  | 'heartbeat';

export type AiControlStreamEvent = {
  type: AiControlStreamEventType;
  at: string;
  payload: Record<string, unknown>;
};
