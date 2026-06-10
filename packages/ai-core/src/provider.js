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

/** Extrai { inputTokens, outputTokens } do `usage` de uma resposta OpenAI/LangChain (defensivo). */
export function extractTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, outputTokens: 0 };
  const u = usage;
  return {
    inputTokens: Number(u.prompt_tokens ?? u.input_tokens ?? u.promptTokens ?? u.inputTokens ?? 0) || 0,
    outputTokens: Number(u.completion_tokens ?? u.output_tokens ?? u.completionTokens ?? u.outputTokens ?? 0) || 0,
  };
}
