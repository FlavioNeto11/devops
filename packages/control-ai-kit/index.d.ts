// Tipos de @flavioneto11/control-ai-kit.

export class ControlAiError extends Error {
  code: string;
  constructor(message: string, code?: string);
}
export class ControlAiConfigError extends ControlAiError {
  constructor(message: string);
}

export interface PromptSource {
  /** Namespace do app (prefixo `${app}.${promptName}`). */
  readonly app: string;
  /** Resolve o prompt: cache -> control-plane (timeout) -> fallback local. */
  resolve(promptName: string): Promise<string>;
  /** Limpa o cache em memoria. */
  clearCache(): void;
}

export interface CreatePromptSourceOptions {
  controlPlaneUrl?: string;
  app: string;
  fallback?: Record<string, string>;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  clock?: () => number;
}

export function createPromptSource(opts: CreatePromptSourceOptions): PromptSource;

export interface ControlAiLlm {
  complete?(args: { messages: Array<{ role: string; content: string }>; [k: string]: unknown }): Promise<unknown>;
  invoke?(args: { system: string; input: unknown }): Promise<unknown>;
}

export interface CreateControlAiOptions {
  appName: string;
  /** Adapter estrutural do LLM. OBRIGATORIO (sem ele a kit falha-fechada). */
  llm: ControlAiLlm;
  /** toolRegistry do @flavioneto11/ai-core (opcional). */
  registry?: unknown;
  /** Prompts versionados no repo (fallback offline). */
  prompts?: Record<string, string>;
  /** Base do ai-control-plane (ausente => so fallback). */
  controlPlaneUrl?: string;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
}

export interface ControlAi {
  readonly appName: string;
  readonly promptSource: PromptSource;
  /** Resolve o prompt e responde (grafo do ai-core em producao; llm direto sem ele). */
  ask(args: { prompt: string; input?: unknown }): Promise<unknown>;
}

/** Cria a IA de controle do app. Fail-closed sem `llm`. */
export function createControlAi(opts: CreateControlAiOptions): ControlAi;
