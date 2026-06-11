// Tipos mantidos à mão (pacote source-direct, padrão ai-kit). Sincronizar com src/.
export * from '@flavioneto11/ai-kit';

// ---------------------------------------------------------------- provider
export function priceForModel(model: string): { in: number; out: number };
export function estimateCostUsd(model: string, inputTokens?: number, outputTokens?: number): number;
export function extractTokenUsage(usage: unknown): { inputTokens: number; outputTokens: number };

// ---------------------------------------------------------------- tools
export type AiToolRisk = 'R1' | 'R3' | 'R4';
export const TOOL_RISKS: readonly AiToolRisk[];

/** Schema estrutural (qualquer objeto com .parse(), ex.: Zod). */
export interface ParseSchema<T = unknown> { parse(value: unknown): T }

export interface OidcIdentityLike {
  sub?: string;
  email?: string;
  roles?: string[];
  scopes?: string[];
  [k: string]: unknown;
}

export interface AiToolContext {
  identity?: OidcIdentityLike;
  channel?: string;
  dryRun?: boolean;
  confirmedToolCallId?: string;
  correlationId?: string;
  [k: string]: unknown;
}

export interface AiTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  specialist?: string;
  risk: AiToolRisk;
  mutates: boolean;
  supportsDryRun?: boolean;
  inputSchema?: ParseSchema<I>;
  outputSchema?: ParseSchema<O>;
  /** JSON Schema dos argumentos (exposto ao function-calling do LLM). */
  parameters?: Record<string, unknown>;
  authorize(ctx: AiToolContext): Promise<{ allowed: boolean; reason?: string }>;
  execute(input: I, ctx: AiToolContext): Promise<O>;
}

export class AiToolError extends Error { code: string }
export class AiToolDeniedError extends AiToolError { toolName: string; reason?: string }
export class AiToolConfirmationRequiredError extends AiToolError { toolName: string }
export class AiToolInvalidInputError extends AiToolError { toolName: string; cause?: unknown }

export function assertValidTool<T extends AiTool>(tool: T): T;
export interface AiToolRegistry {
  register<I, O>(tool: AiTool<I, O>): AiTool<I, O>;
  get(name: string): AiTool | null;
  list(): AiTool[];
  forSpecialist(specialist: string): AiTool[];
}
export function createToolRegistry(tools?: AiTool[]): AiToolRegistry;
export function dispatchTool<I, O>(tool: AiTool<I, O>, rawInput: unknown, ctx: AiToolContext):
  Promise<{ status: 'executed' | 'preview'; dryRun: boolean; output: O }>;

// ---------------------------------------------------------------- observability
export interface AiMetrics {
  enabled: boolean;
  observeTurn(stage: string, outcome: 'ok' | 'error', seconds: number): void;
  addTokens(model: string, inputTokens: number, outputTokens: number): void;
  addCost(model: string, usd: number): void;
  countToolCall(tool: string, outcome: string): void;
  countError(stage: string, code?: string): void;
  observeJudgeScore(dimension: string, score: number): void;
  countEscalation(reason: string): void;
}
export function createAiMetrics(opts?: { promClient?: unknown; app?: string; registers?: unknown[] }): AiMetrics;

export interface AiTraceHandle {
  span<T>(name: string, meta: { input?: unknown; metadata?: unknown; redactOutput?: boolean } | undefined, fn: () => Promise<T>): Promise<T>;
  end(meta?: { output?: unknown; metadata?: unknown }): void;
  raw: unknown;
}
export function createAiTracer(opts?: { langfuse?: unknown; metrics?: AiMetrics; app?: string }): {
  traceFor(meta?: { name?: string; userId?: string; sessionId?: string; metadata?: unknown }): AiTraceHandle;
};
export const AI_METRIC_NAMES: Readonly<Record<string, string>>;

// ---------------------------------------------------------------- llm + graph
export interface LlmCompletion {
  text: string;
  toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
  usage: unknown;
  raw?: unknown;
}
export interface LlmAdapter {
  complete(req: {
    model?: string;
    messages: Array<Record<string, unknown>>;
    tools?: AiTool[];
    toolChoice?: string;
    jsonMode?: boolean;
    reasoningEffort?: string;
    maxTokens?: number;
  }): Promise<LlmCompletion>;
}
export function createOpenAiLlm(client: unknown, opts?: { defaultModel?: string }): LlmAdapter;
export function toOpenAiToolDef(tool: AiTool): Record<string, unknown>;

export interface AiSpecialist { id: string; description: string; systemPrompt: string }
export interface GraphTurn {
  message: string;
  history?: Array<{ role: string; content: string }>;
  systemContext?: string;
  identity?: OidcIdentityLike;
  channel?: string;
  correlationId?: string;
  sessionId?: string;
  confirmedToolCallId?: string;
  toolContext?: Record<string, unknown>;
}
export interface GraphResult {
  text: string;
  route: 'fast' | 'deep';
  complexity: 'trivial' | 'simple' | 'complex';
  specialist: string | null;
  toolCalls: Array<{ name: string; status: string; arguments: unknown }>;
  evidence: Array<{ tool: string; output: unknown }>;
  judge: { score: number; reason: string } | null;
  escalated: boolean;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}
export function createAiGraph(opts: {
  llm: LlmAdapter;
  registry?: AiToolRegistry;
  specialists?: AiSpecialist[];
  models?: { router?: string; deep?: string; synth?: string; judge?: string };
  metrics?: AiMetrics;
  tracer?: ReturnType<typeof createAiTracer>;
  maxToolRounds?: number;
  verify?: boolean;
  judgeThreshold?: number;
}): { runTurn(turn: GraphTurn): Promise<GraphResult> };

// ---------------------------------------------------------------- kpi
export interface AiKpiDef {
  id: string; label: string; description: string; unit: string; target: number;
  direction?: 'down'; source: string;
}
export const AI_KPIS: Readonly<Record<string, AiKpiDef>>;
export function listKpis(): AiKpiDef[];
export function summarizeEvalKpis(results: EvalResults): Record<string, { value: number; target: number; ok: boolean }>;

// ---------------------------------------------------------------- eval
export interface GoldenCase {
  id: string;
  input: unknown;
  expected?: { toolName?: string | null; contains?: string[]; notContains?: string[] };
  judge?: string[];
  tags?: string[];
}
export interface RunnerOutput { text: string; toolCalls?: Array<{ name: string; arguments?: unknown }>; evidence?: unknown }
export interface EvalCaseResult {
  id: string; passed: boolean; error: string | null; failures: string[];
  judgeScores: Array<{ dimension: string; score: number | null; reason: string }>; ms: number;
}
export interface EvalResults {
  total: number; passed: number; failed: number;
  toolCallAccuracy: number | null;
  judgeAverages: Record<string, number>;
  byCase: EvalCaseResult[];
}
export function parseGoldenSetJsonl(text: string): GoldenCase[];
export function runEval(cases: GoldenCase[], opts: {
  runner(c: GoldenCase): Promise<RunnerOutput>;
  judgeClient?: unknown; judgeModel?: string; sample?: number;
  onCase?(r: EvalCaseResult): void;
}): Promise<EvalResults>;
