// model.js — normalização PURA (sem rede/sem DOM) do painel "Uso da IA".
// Deriva provider a partir do nome do modelo (fase 1: sem label `provider` no ai-core),
// converte janelas em ranges, e monta o shape canônico aninhado
// providers[] -> { account, internal, limits, budget, modules[] -> models[] }.
// Tudo testável em node:test.

export const PROVIDERS = ['openai', 'anthropic'];

const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Claude (Anthropic)', unknown: 'Outros' };
export function providerLabel(p) { return PROVIDER_LABEL[p] || p; }

// Deriva o provider pelo nome do modelo. Determinístico, sem rede. Acende a Claude
// assim que QUALQUER app emitir ai_* com um modelo `claude-*`/`anthropic.*`.
export function providerForModel(model) {
  const m = String(model || '').toLowerCase().trim();
  if (!m) return 'unknown';
  if (m.startsWith('claude') || m.startsWith('anthropic') || m.includes('claude')) return 'anthropic';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') ||
      m.startsWith('text-embedding') || m.startsWith('text-') || m.startsWith('davinci') ||
      m.startsWith('babbage') || m.startsWith('chatgpt') || m.startsWith('omni')) return 'openai';
  return 'unknown';
}

// Janela -> { id, from, to, granularity }. nowMs injetável p/ teste determinístico.
export function windowToRange(id, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const DAY = 86400000;
  const spans = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };
  let fromMs;
  let granularity = 'day';
  if (id === 'mtd') {
    const d = new Date(now);
    fromMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  } else if (spans[id]) {
    fromMs = now - spans[id];
    if (id === '24h') granularity = 'hour';
  } else {
    return windowToRange('30d', now);
  }
  return { id: spans[id] || id === 'mtd' ? id : '30d', from: new Date(fromMs).toISOString(), to: new Date(now).toISOString(), granularity, fromMs, toMs: now };
}

// num seguro (NaN/undefined -> 0); arredonda custo a 6 casas (evita ruído de float).
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round6(v) { return Math.round(num(v) * 1e6) / 1e6; }

// Agrega as linhas cruas do Prometheus num mapa provider -> { total, modules{app -> {total, models{model}}} }.
// costRows/reqRows: [{ app, model, value }]; tokenRows: [{ app, model, direction, value }].
export function buildInternalByProvider({ costRows = [], tokenRows = [], reqRows = [] } = {}) {
  const out = new Map(); // provider -> agg
  const ensureP = (p) => {
    if (!out.has(p)) out.set(p, { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0, modules: new Map() });
    return out.get(p);
  };
  const ensureM = (P, app) => {
    if (!P.modules.has(app)) P.modules.set(app, { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0, models: new Map() });
    return P.modules.get(app);
  };
  const ensureModel = (M, model) => {
    if (!M.models.has(model)) M.models.set(model, { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 });
    return M.models.get(model);
  };
  for (const r of costRows) {
    const p = providerForModel(r.model); const app = r.app || 'desconhecido';
    const P = ensureP(p); const M = ensureM(P, app); const md = ensureModel(M, r.model || '—');
    const v = num(r.value); P.cost += v; M.cost += v; md.cost += v;
  }
  for (const r of tokenRows) {
    const p = providerForModel(r.model); const app = r.app || 'desconhecido';
    const P = ensureP(p); const M = ensureM(P, app); const md = ensureModel(M, r.model || '—');
    const v = num(r.value); const dir = String(r.direction || '').toLowerCase();
    const key = (dir === 'out' || dir === 'output' || dir === 'completion') ? 'tokensOut' : 'tokensIn';
    P[key] += v; M[key] += v; md[key] += v;
  }
  for (const r of reqRows) {
    const p = providerForModel(r.model); const app = r.app || 'desconhecido';
    const P = ensureP(p); const M = ensureM(P, app); const md = ensureModel(M, r.model || '—');
    const v = num(r.value); P.requests += v; M.requests += v; md.requests += v;
  }
  return out;
}

// Converte o mapa-provider numa estrutura serializável (modules[]/models[] ordenados por custo).
function serializeInternal(P) {
  if (!P) return { source: 'internal', estimated: true, cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 };
  return {
    source: 'internal', estimated: true,
    cost: round6(P.cost), tokensIn: Math.round(P.tokensIn), tokensOut: Math.round(P.tokensOut), requests: Math.round(P.requests),
  };
}
function serializeModules(P) {
  if (!P) return [];
  const mods = [...P.modules.entries()].map(([app, M]) => ({
    module: app,
    internal: { source: 'internal', estimated: true, cost: round6(M.cost), tokensIn: Math.round(M.tokensIn), tokensOut: Math.round(M.tokensOut), requests: Math.round(M.requests) },
    models: [...M.models.entries()].map(([model, md]) => ({
      model, cost: round6(md.cost), tokensIn: Math.round(md.tokensIn), tokensOut: Math.round(md.tokensOut), requests: Math.round(md.requests),
      source: 'internal', pctOfProvider: P.cost > 0 ? round6((md.cost / P.cost) * 100) : 0,
    })).sort((a, b) => b.cost - a.cost),
  }));
  return mods.sort((a, b) => b.internal.cost - a.internal.cost);
}

const CLAUDE_NOTE = 'Os limites que aparecem na IDE da Claude são da assinatura do Claude Code (janelas 5h/semana) e não têm API pública para espelhar aqui. Mostramos o uso/custo/limites da API da Anthropic.';

// Monta o shape final do /breakdown. internalByProvider = Map de buildInternalByProvider.
// account/limits/budget por provider são opcionais (fases 2-4); ausentes -> null.
export function assembleBreakdown({ window, internalByProvider, accountByProvider = {}, limitsByProvider = {}, budgetByProvider = {}, sourcesHealth = {}, generatedAt } = {}) {
  const byP = internalByProvider instanceof Map ? internalByProvider : new Map();
  const providers = PROVIDERS.map((provider) => {
    const P = byP.get(provider);
    const internal = serializeInternal(P);
    const account = accountByProvider[provider] || null;
    const modules = serializeModules(P);
    return {
      provider,
      label: providerLabel(provider),
      account,           // ACTUAL (Admin API) — null até a fase 2 / sem chave
      internal,          // ESTIMADO (Prometheus/Langfuse)
      limits: limitsByProvider[provider] || null,
      budget: budgetByProvider[provider] || null,
      drift: account && Number.isFinite(account.cost) ? round6(account.cost - internal.cost) : null,
      modules,
      ...(provider === 'anthropic' ? { claudeCodeSubscriptionNote: CLAUDE_NOTE } : {}),
    };
  });
  const totals = providers.reduce((acc, p) => {
    const s = p.account && !p.account.stale ? p.account : p.internal;
    acc.cost = round6(acc.cost + num(s.cost));
    acc.tokensIn += Math.round(num(s.tokensIn));
    acc.tokensOut += Math.round(num(s.tokensOut));
    acc.requests += Math.round(num(s.requests));
    return acc;
  }, { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 });
  return { window, generatedAt: generatedAt || new Date().toISOString(), providers, totals, sourcesHealth };
}

// Resumo enxuto (header do painel) a partir do breakdown completo.
export function summaryFromBreakdown(breakdown) {
  return {
    window: breakdown.window,
    generatedAt: breakdown.generatedAt,
    totals: breakdown.totals,
    sourcesHealth: breakdown.sourcesHealth,
    providers: breakdown.providers.map((p) => ({
      provider: p.provider, label: p.label, account: p.account, internal: p.internal,
      limits: p.limits, budget: p.budget, drift: p.drift, moduleCount: p.modules.length,
      ...(p.claudeCodeSubscriptionNote ? { claudeCodeSubscriptionNote: p.claudeCodeSubscriptionNote } : {}),
    })),
  };
}
