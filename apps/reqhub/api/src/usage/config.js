// config.js — lê TODA a configuração do painel "Uso da IA" do ambiente, uma vez.
// Tudo opcional/fail-soft: sem chaves o painel degrada (só telemetria interna; conta = 503).
function s(v) { return String(v == null ? '' : v).trim(); }
function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function b(v, d) { const x = s(v).toLowerCase(); if (x === 'true' || x === '1' || x === 'yes') return true; if (x === 'false' || x === '0' || x === 'no') return false; return d; }

export function loadUsageConfig(env = process.env) {
  return {
    // Telemetria interna (in-cluster)
    prometheusUrl: s(env.PROMETHEUS_URL) || 'http://prometheus.observability.svc.cluster.local:9090',
    langfuse: {
      baseUrl: s(env.LANGFUSE_BASE_URL) || 'http://langfuse.observability.svc.cluster.local:3000',
      publicKey: s(env.LANGFUSE_PUBLIC_KEY),
      secretKey: s(env.LANGFUSE_SECRET_KEY),
      enabled: Boolean(s(env.LANGFUSE_PUBLIC_KEY) && s(env.LANGFUSE_SECRET_KEY)),
    },
    // Contas (Admin APIs) — net-new, server-side only
    openai: {
      adminKey: s(env.OPENAI_ADMIN_KEY),
      apiKey: s(env.OPENAI_API_KEY), // p/ probe de rate-limit
      enabled: Boolean(s(env.OPENAI_ADMIN_KEY)),
      base: s(env.OPENAI_BASE_URL) || 'https://api.openai.com',
    },
    anthropic: {
      adminKey: s(env.ANTHROPIC_ADMIN_KEY),
      apiKey: s(env.ANTHROPIC_API_KEY), // p/ probe de rate-limit
      enabled: Boolean(s(env.ANTHROPIC_ADMIN_KEY)),
      base: s(env.ANTHROPIC_BASE_URL) || 'https://api.anthropic.com',
      version: s(env.ANTHROPIC_VERSION) || '2023-06-01',
    },
    probeEnabled: b(env.AI_USAGE_PROBE_ENABLED, false),
    timeoutMs: n(env.AI_USAGE_TIMEOUT_MS, 8000),
    // Budgets (ConfigMap, não-secreto)
    budgets: {
      openaiMonthlyUsd: n(env.AI_BUDGET_OPENAI_MONTHLY_USD, null),
      anthropicMonthlyUsd: n(env.AI_BUDGET_ANTHROPIC_MONTHLY_USD, null),
      warnPct: n(env.AI_BUDGET_WARN_PCT, 80),
      breachPct: n(env.AI_BUDGET_BREACH_PCT, 100),
    },
  };
}
