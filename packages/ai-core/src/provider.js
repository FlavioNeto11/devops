// provider.js — preços por modelo e cálculo de custo (USD) por tokens.
//
// A tabela é um DEFAULT informativo (preços por 1M de tokens) e pode ser
// sobrescrita por env (AI_PRICE_IN_<MODEL> / AI_PRICE_OUT_<MODEL>, com o nome
// do modelo em maiúsculas e '-'/'.' trocados por '_'). O custo alimenta a
// métrica ai_cost_usd_total e o KPI custo/conversa — é estimativa, não fatura.

const DEFAULT_PRICES_PER_MTOK = Object.freeze({
  'gpt-5': { in: 1.25, out: 10 },
  'gpt-5-mini': { in: 0.25, out: 2 },
  'gpt-5-nano': { in: 0.05, out: 0.4 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  'text-embedding-3-large': { in: 0.13, out: 0 },
  // Anthropic (USD por 1M tokens) — override por env AI_PRICE_IN_/OUT_<MODEL> se mudar.
  'claude-opus-4-8': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  // Google Gemini (USD por 1M tokens) — override por env AI_PRICE_IN_/OUT_<MODEL> se mudar.
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-2.0-flash-lite': { in: 0.075, out: 0.3 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
});

function envKeyFor(model, direction) {
  return `AI_PRICE_${direction.toUpperCase()}_${String(model).toUpperCase().replace(/[-.]/g, '_')}`;
}

/** Preço por 1M tokens de `model` (env override → tabela default → 0). */
export function priceForModel(model) {
  const base = DEFAULT_PRICES_PER_MTOK[String(model || '').trim()] || { in: 0, out: 0 };
  const envIn = Number(process.env[envKeyFor(model, 'in')]);
  const envOut = Number(process.env[envKeyFor(model, 'out')]);
  return {
    in: Number.isFinite(envIn) && envIn >= 0 ? envIn : base.in,
    out: Number.isFinite(envOut) && envOut >= 0 ? envOut : base.out,
  };
}

/** Custo estimado em USD de uma chamada (tokens de entrada/saída). */
export function estimateCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const p = priceForModel(model);
  const cost = (Number(inputTokens) || 0) * (p.in / 1e6) + (Number(outputTokens) || 0) * (p.out / 1e6);
  return Math.round(cost * 1e8) / 1e8; // 8 casas — evita ruído de float em somas
}

// Deriva o PROVIDER pelo nome do modelo: claude -> anthropic; gpt/o1/o3/text-embedding -> openai.
export function providerForModel(model) {
  const m = String(model || '').toLowerCase().trim();
  if (!m) return 'unknown';
  if (m.startsWith('claude') || m.startsWith('anthropic') || m.includes('claude')) return 'anthropic';
  if (m.startsWith('gemini') || m.startsWith('models/gemini') || m.startsWith('google/')) return 'google';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('chatgpt') || m.startsWith('text-') || m.startsWith('davinci') || m.startsWith('babbage')) return 'openai';
  return 'unknown';
}

/** Extrai { inputTokens, outputTokens } do `usage` de uma resposta OpenAI/LangChain (defensivo). */
export function extractTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, outputTokens: 0 };
  const u = usage;
  return {
    inputTokens: Number(u.prompt_tokens ?? u.input_tokens ?? u.promptTokens ?? u.inputTokens ?? 0) || 0,
    outputTokens: Number(u.completion_tokens ?? u.output_tokens ?? u.completionTokens ?? u.outputTokens ?? 0) || 0,
  };
}
