// Tipos de @flavioneto11/ai-kit

export const REASONING_MODEL_RE: RegExp;
export const DEFAULT_MODELS: Readonly<{ chat: string; nano: string }>;
export const REASONING_EFFORTS: ReadonlyArray<'minimal' | 'low' | 'medium' | 'high'>;

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export function isReasoningModel(model: string): boolean;
export function resolveReasoningEffort(fallback?: ReasoningEffort | string): string;

export interface ChatParamsOptions {
  reasoningEffort?: ReasoningEffort | string;
  temperature?: number;
  jsonMode?: boolean;
}
export function buildChatParams(model: string, opts?: ChatParamsOptions): Record<string, unknown>;

export interface ChatOpenAIArgsOptions {
  reasoningEffort?: ReasoningEffort | string;
  temperature?: number;
}
export function buildChatOpenAIArgs(
  model: string,
  apiKey: string,
  opts?: ChatOpenAIArgsOptions,
): { apiKey: string; model: string; temperature?: number; modelKwargs?: { reasoning_effort: string } };

export class AiTimeoutError extends Error {
  timeoutMs?: number;
}
export function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T>;
export function callWithFallback<T, C>(
  fn: (client: C) => Promise<T> | T,
  fallback: T,
  ms: number,
  client: C | null | undefined,
): Promise<T>;

/** Cliente OpenAI estrutural (apenas o que usamos). */
export interface ChatCompletionsClient {
  chat: { completions: { create: (args: any) => Promise<any> } };
}
export interface ChatJSONOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort | string;
  temperature?: number;
}
export function chatJSON(client: ChatCompletionsClient, prompt: string, opts?: ChatJSONOptions): Promise<unknown>;
export function chatText(
  client: ChatCompletionsClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts?: ChatJSONOptions,
): Promise<string>;
