// @flavioneto11/ai-kit — contrato compartilhado de IA (gpt-5/reasoning).
//
// Fonte unica da verdade de "como falar com gpt-5" na plataforma, hoje duplicada em:
//   - GymOps (SDK nativo)         -> usa chatJSON/chatText/callWithFallback
//   - SICAT  (LangChain ChatOpenAI) -> usa buildChatOpenAIArgs
//
// Regras (por que isto existe):
//   - Modelos de reasoning (gpt-5*, o1/o3...) REJEITAM temperature != 1 -> NAO enviar temperature;
//     usar reasoning_effort. Modelos comuns usam temperature normal.
//   - Timeout + fallback gracioso: se a IA falhar/estourar, o fluxo continua com um fallback.
//
// Zero dependencias de runtime: o cliente OpenAI e passado por quem chama (tipagem estrutural),
// e para LangChain devolvemos apenas os ARGS do construtor (o app faz `new ChatOpenAI(args)`).

/** Regex que identifica modelos de reasoning (gpt-5*, o1/o2/o3...). */
export const REASONING_MODEL_RE = /^(gpt-5|o\d)/i;

/** Modelos default liberados na conta. */
export const DEFAULT_MODELS = Object.freeze({ chat: 'gpt-5', nano: 'gpt-5-nano' });

/** Esforcos de reasoning validos. */
export const REASONING_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high']);

/** True se `model` for um modelo de reasoning (que omite temperature). */
export function isReasoningModel(model) {
  return REASONING_MODEL_RE.test(String(model || '').trim());
}

/**
 * Le OPENAI_REASONING_EFFORT do ambiente, caindo no `fallback` informado.
 * GymOps usa default 'low'; SICAT (agente ReAct, latencia-sensivel) usa 'minimal'.
 */
export function resolveReasoningEffort(fallback = 'low') {
  const v = (process.env.OPENAI_REASONING_EFFORT || '').trim();
  return v || fallback;
}

/**
 * Monta os parametros para espalhar em `client.chat.completions.create` (SDK nativo).
 * - jsonMode: adiciona response_format json_object.
 * - reasoning: omite temperature e seta reasoning_effort.
 * - comum: aplica temperature (se number).
 */
export function buildChatParams(model, opts = {}) {
  const { reasoningEffort, temperature, jsonMode } = opts;
  const params = { model };
  if (jsonMode) params.response_format = { type: 'json_object' };
  if (isReasoningModel(model)) {
    params.reasoning_effort = reasoningEffort || resolveReasoningEffort();
  } else if (typeof temperature === 'number') {
    params.temperature = temperature;
  }
  return params;
}

/**
 * Monta os ARGS do construtor de ChatOpenAI (LangChain). O app chama `new ChatOpenAI(args)`,
 * mantendo @langchain/openai como dependencia DELE (este pacote nao importa LangChain).
 * - comum: temperature (default 0, deterministico).
 * - reasoning: SEM temperature + modelKwargs.reasoning_effort.
 */
export function buildChatOpenAIArgs(model, apiKey, opts = {}) {
  const { reasoningEffort, temperature = 0 } = opts;
  if (!isReasoningModel(model)) {
    return { apiKey, model, temperature };
  }
  return { apiKey, model, modelKwargs: { reasoning_effort: reasoningEffort || resolveReasoningEffort('minimal') } };
}

/** Erro lancado quando uma chamada de IA estoura o timeout. */
export class AiTimeoutError extends Error {
  constructor(ms) {
    super('AI_TIMEOUT');
    this.name = 'AiTimeoutError';
    this.timeoutMs = ms;
  }
}

/** Faz race entre `promise` e um timeout de `ms` ms (rejeita com AiTimeoutError). */
export function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new AiTimeoutError(ms)), ms);
  });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), timeout]);
}

/**
 * Executa fn(client) com timeout, devolvendo `fallback` se nao houver client ou se falhar/estourar.
 * Reproduz o callAI do GymOps de forma agnostica ao app.
 */
export async function callWithFallback(fn, fallback, ms, client) {
  if (!client) return fallback;
  try {
    return await withTimeout(fn(client), ms);
  } catch {
    return fallback;
  }
}

/**
 * Chat JSON (response_format json_object) via SDK nativo. `client` e estrutural
 * ({ chat.completions.create }). Drop-in do chatJSON do GymOps.
 * Default temperature 0.3 (so aplicada a modelos comuns).
 */
export async function chatJSON(client, prompt, opts = {}) {
  const { model = DEFAULT_MODELS.nano, reasoningEffort, temperature = 0.3 } = opts;
  const completion = await client.chat.completions.create({
    ...buildChatParams(model, { reasoningEffort, temperature, jsonMode: true }),
    messages: [{ role: 'user', content: prompt }],
  });
  const content = completion.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content);
}

/**
 * Chat de texto livre via SDK nativo. Drop-in do chatText do GymOps.
 * Default temperature 0.4 (so aplicada a modelos comuns).
 */
export async function chatText(client, messages, opts = {}) {
  const { model = DEFAULT_MODELS.nano, reasoningEffort, temperature = 0.4 } = opts;
  const completion = await client.chat.completions.create({
    ...buildChatParams(model, { reasoningEffort, temperature }),
    messages,
  });
  return completion.choices?.[0]?.message?.content ?? '';
}
