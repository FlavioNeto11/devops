// Motor de orquestracao multi-modelo do imobia. Cortex (roteador barato) classifica a
// mensagem e escolhe o especialista; GPT/Claude/Gemini executam. TUDO fail-soft: sem chaves,
// engineStatus().dormant = true e as chamadas devolvem um fallback claro (o app segue manual).
// Reutiliza @flavioneto11/ai-core (createLlm — inclui o adaptador Gemini novo — + custo/tokens).

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLlm, providerForModel, estimateCostUsd, extractTokenUsage } from '@flavioneto11/ai-core';
import { env } from '../env';
import { SPECIALISTS, cortexSystemPrompt, type Specialist, type SpecialistId } from './prompts';

type Provider = 'openai' | 'anthropic' | 'gemini';
interface LlmHandle { llm: { complete: (req: any) => Promise<any> }; model: string; provider: Provider }

const MODELS: Record<Provider, { router: string; deep: string }> = {
  openai: { router: 'gpt-5-nano', deep: 'gpt-5' },
  anthropic: { router: 'claude-haiku-4-5', deep: 'claude-sonnet-4-6' },
  gemini: { router: 'gemini-2.0-flash-lite', deep: 'gemini-2.0-flash' },
};

const ACTOR_PROVIDER: Record<Specialist['actor'], Provider> = { gpt: 'openai', claude: 'anthropic', gemini: 'gemini' };

let cache: {
  clients: Record<Provider, any>;
  available: Provider[];
} | null = null;

function clients() {
  if (cache) return cache;
  const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  const gemini = env.googleApiKey ? new GoogleGenerativeAI(env.googleApiKey) : null;
  const available: Provider[] = [];
  if (openai) available.push('openai');
  if (anthropic) available.push('anthropic');
  if (gemini) available.push('gemini');
  cache = { clients: { openai, anthropic, gemini }, available };
  return cache;
}

function llmFor(provider: Provider, model: string): LlmHandle | null {
  const c = clients().clients[provider];
  if (!c) return null;
  const providerArg = provider === 'gemini' ? 'google' : provider;
  return { llm: createLlm({ provider: providerArg, client: c, defaultModel: model }), model, provider };
}

/** Cortex = roteador: primeiro provider disponivel, com o modelo barato dele. */
function cortexHandle(): LlmHandle | null {
  const order: Provider[] = ['openai', 'anthropic', 'gemini'];
  for (const p of order) {
    if (clients().available.includes(p)) return llmFor(p, MODELS[p].router);
  }
  return null;
}

/** Especialista -> LLM ideal; se o provider ideal estiver ausente, cai para qualquer disponivel. */
function specialistHandle(spec: Specialist): { handle: LlmHandle; fallbackProvider: boolean } | null {
  const ideal = ACTOR_PROVIDER[spec.actor];
  if (clients().available.includes(ideal)) return { handle: llmFor(ideal, MODELS[ideal].deep)!, fallbackProvider: false };
  const alt = clients().available[0];
  if (!alt) return null;
  return { handle: llmFor(alt, MODELS[alt].deep)!, fallbackProvider: true };
}

export interface EngineStatus {
  dormant: boolean;
  providers: Record<Provider, boolean>;
  cortex: { available: boolean; model: string | null };
  specialists: Array<{ id: SpecialistId; actor: string; ideal: Provider; available: boolean; model: string | null; fallbackProvider: boolean }>;
}

export function engineStatus(): EngineStatus {
  const { available } = clients();
  const cortex = cortexHandle();
  return {
    dormant: available.length === 0,
    providers: { openai: available.includes('openai'), anthropic: available.includes('anthropic'), gemini: available.includes('gemini') },
    cortex: { available: Boolean(cortex), model: cortex?.model ?? null },
    specialists: SPECIALISTS.map((s) => {
      const h = specialistHandle(s);
      const ideal = ACTOR_PROVIDER[s.actor];
      return { id: s.id, actor: s.actor, ideal, available: Boolean(h), model: h?.handle.model ?? null, fallbackProvider: h?.fallbackProvider ?? false };
    }),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(onTimeout()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(onTimeout()); });
  });
}

const DORMANT_REPLY =
  'A IA do imobia está dormente: nenhuma chave de provedor (OpenAI, Anthropic ou Google) foi ' +
  'configurada no Secret imobia-config. Assim que o operador adicionar as chaves, o Cortex passa a ' +
  'rotear automaticamente para GPT (lógica), Claude (redação) e Gemini (documentos/visão). ' +
  'Enquanto isso, todos os módulos funcionam manualmente.';

export interface Triage { specialist: SpecialistId; intent: string; reason: string; dormant?: boolean }

/** Cortex classify (jsonMode). Sem provider -> dormant. Erro/parse -> default 'logica'. */
export async function cortexClassify(message: string): Promise<Triage> {
  const cortex = cortexHandle();
  if (!cortex) return { specialist: 'logica', intent: 'indisponivel', reason: 'sem provider', dormant: true };
  const out = await withTimeout(
    cortex.llm.complete({
      model: cortex.model,
      jsonMode: true,
      maxTokens: 200,
      messages: [{ role: 'system', content: cortexSystemPrompt() }, { role: 'user', content: message }],
    }),
    12_000,
    () => ({ text: '' }),
  );
  let parsed: any = {};
  try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
  const specialist: SpecialistId = ['logica', 'escrita', 'visao'].includes(parsed.specialist) ? parsed.specialist : 'logica';
  return { specialist, intent: String(parsed.intent || 'geral'), reason: String(parsed.reason || '') };
}

export interface OrchestrateInput {
  message: string;
  history?: Array<{ role: string; content: string }>;
  attachments?: any[]; // blocos multimodais (file-ingest) — usados em F4/F7
}
export interface OrchestrateResult {
  dormant: boolean;
  reply: string;
  specialist: SpecialistId | null;
  actor: string | null;
  cortexIntent: string | null;
  model: string | null;
  provider: string | null;
  fallbackProvider: boolean;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  latencyMs: number;
}

/** Turno completo: Cortex classifica -> especialista responde. Fail-soft ponta a ponta. */
export async function orchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const base: OrchestrateResult = {
    dormant: true, reply: DORMANT_REPLY, specialist: null, actor: null, cortexIntent: null,
    model: null, provider: null, fallbackProvider: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0,
  };
  if (engineStatus().dormant) return base;

  const triage = await cortexClassify(input.message);
  const spec = SPECIALISTS.find((s) => s.id === triage.specialist)!;
  const resolved = specialistHandle(spec);
  if (!resolved) return base;
  const { handle, fallbackProvider } = resolved;

  const userContent = input.attachments && input.attachments.length
    ? [{ type: 'text', text: input.message }, ...input.attachments]
    : input.message;

  const messages = [
    { role: 'system', content: spec.systemPrompt },
    ...(input.history || []),
    { role: 'user', content: userContent },
  ];

  const started = Date.now();
  const out = await withTimeout(
    handle.llm.complete({ model: handle.model, maxTokens: 1024, messages }),
    30_000,
    () => ({ text: 'A IA demorou a responder. Tente novamente.', usage: null }),
  );
  const latencyMs = Date.now() - started;
  const usage = extractTokenUsage(out.usage);
  const costUsd = estimateCostUsd(handle.model, usage.inputTokens, usage.outputTokens);

  return {
    dormant: false,
    reply: out.text || '(sem resposta)',
    specialist: spec.id,
    actor: spec.actor,
    cortexIntent: triage.intent,
    model: handle.model,
    provider: providerForModel(handle.model),
    fallbackProvider,
    usage,
    costUsd,
    latencyMs,
  };
}

/** Chamada direta a um especialista (sem passar pelo Cortex) — util p/ tarefas de modulo
 *  como lead scoring. Retorna null se o especialista/provider nao estiver disponivel. */
export async function callSpecialist(
  specialistId: SpecialistId,
  opts: { system?: string; user: string; blocks?: any[]; jsonMode?: boolean; maxTokens?: number },
): Promise<{ text: string; model: string; provider: string; usage: { inputTokens: number; outputTokens: number }; costUsd: number } | null> {
  const spec = SPECIALISTS.find((s) => s.id === specialistId);
  if (!spec) return null;
  const resolved = specialistHandle(spec);
  if (!resolved) return null;
  const { handle } = resolved;
  const userContent = opts.blocks && opts.blocks.length ? [{ type: 'text', text: opts.user }, ...opts.blocks] : opts.user;
  const messages = [
    { role: 'system', content: `${spec.systemPrompt}${opts.system ? '\n\n' + opts.system : ''}` },
    { role: 'user', content: userContent },
  ];
  const out = await withTimeout(
    handle.llm.complete({ model: handle.model, jsonMode: opts.jsonMode, maxTokens: opts.maxTokens || 512, messages }),
    30_000,
    () => ({ text: '', usage: null }),
  );
  const usage = extractTokenUsage(out.usage);
  return { text: out.text || '', model: handle.model, provider: providerForModel(handle.model), usage, costUsd: estimateCostUsd(handle.model, usage.inputTokens, usage.outputTokens) };
}

/** Reset do cache de clientes (util em testes / troca de env). */
export function resetEngine() { cache = null; }
