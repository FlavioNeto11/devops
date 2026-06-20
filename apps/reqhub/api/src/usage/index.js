// usage/index.js — roteador do painel "Uso da IA" (/v1/ai-usage/*). Agrega telemetria
// interna (Prometheus + Langfuse) e, nas fases 2-4, as contas dos provedores + live + budgets.
// Admin-only (grupo platform-admins) ou Bearer REQHUB_API_TOKEN. Tudo fail-soft.
import express from 'express';
import { ssoIdentity, evaluateAuth } from '../auth.js';
import { loadUsageConfig } from './config.js';
import { createCache } from './cache.js';
import { createPrometheusClient } from './internal/prometheus.js';
import { createLangfuseClient } from './internal/langfuse.js';
import { createOpenAiAdminClient } from './providers/openai-admin.js';
import { createAnthropicAdminClient } from './providers/anthropic-admin.js';
import { windowToRange, buildInternalByProvider, assembleBreakdown, summaryFromBreakdown, PROVIDERS } from './model.js';
import { computeBudget, deriveAlerts } from './budgets.js';

// Middleware: exige admin-SSO (platform-admins) OU Bearer token. Espelha requireAuthoringAuth,
// mas é leitura pura (não depende de OPENAI_API_KEY/getLlm).
export function requireUsageAdmin(req, res, next) {
  const sso = ssoIdentity(req.headers);
  if (sso && sso.isAdmin) { req.identity = sso.email || 'sso-admin'; req.sso = sso; return next(); }
  if (sso && !sso.isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'painel de uso da IA é exclusivo de platform-admins' } });
  }
  const r = evaluateAuth(req.headers.authorization, process.env.REQHUB_API_TOKEN);
  if (!r.ok) return res.status(r.status).json({ error: { code: r.code, message: r.message } });
  req.identity = r.identity;
  next();
}

// Contexto reutilizável (clientes + cache). Injetável p/ teste.
export function createUsageContext({ config, cache, prom, lf, openai, anthropic } = {}) {
  const cfg = config || loadUsageConfig();
  const c = cache || createCache();
  const prometheus = prom || createPrometheusClient({ baseUrl: cfg.prometheusUrl, timeoutMs: cfg.timeoutMs });
  const langfuse = lf || createLangfuseClient({ ...cfg.langfuse, timeoutMs: cfg.timeoutMs });
  const openaiAdmin = openai || createOpenAiAdminClient({ ...cfg.openai, timeoutMs: cfg.timeoutMs });
  const anthropicAdmin = anthropic || createAnthropicAdminClient({ ...cfg.anthropic, timeoutMs: cfg.timeoutMs });
  return { cfg, cache: c, prom: prometheus, lf: langfuse, openai: openaiAdmin, anthropic: anthropicAdmin };
}

// Contas (real) por provider numa janela — cache 6h (dados diários). Sem chave -> ausente.
export async function collectAccount(ctx, windowId) {
  const w = windowToRange(windowId);
  const range = { fromMs: w.fromMs, toMs: w.toMs };
  const out = {};
  const tryOne = async (provider, client) => {
    if (!client.enabled) return;
    const r = await ctx.cache.get(`acct:${provider}:${windowId}`, 6 * 3600_000, () => client.accountUsage(range));
    if (r.value && r.value.ok) out[provider] = r.value;
  };
  await Promise.all([tryOne('openai', ctx.openai), tryOne('anthropic', ctx.anthropic)]);
  return out;
}

// Rate-limits ao vivo (via probe) por provider — cache 5min; só se AI_USAGE_PROBE_ENABLED.
export async function collectLimits(ctx) {
  const out = {};
  if (!ctx.cfg.probeEnabled) return out;
  const tryOne = async (provider, client) => {
    const r = await ctx.cache.get(`limits:${provider}`, 300_000, () => client.rateLimitProbe());
    if (r.value && r.value.ok) out[provider] = { tier: r.value.tier, rateLimits: r.value.rateLimits, probedAt: r.value.probedAt };
  };
  await Promise.all([tryOne('openai', ctx.openai), tryOne('anthropic', ctx.anthropic)]);
  return out;
}

// Custo interno (estimado) por provider numa janela — base p/ orçamento (MTD).
async function internalCostByProvider(ctx, windowId) {
  const w = windowToRange(windowId);
  const rows = await ctx.cache.get(`prom:rows:${windowId}`, 60_000, () => ctx.prom.breakdownRows(w.toMs - w.fromMs));
  const by = buildInternalByProvider(rows.value || { costRows: [], tokenRows: [], reqRows: [] });
  const out = {};
  for (const p of PROVIDERS) out[p] = by.get(p) ? by.get(p).cost : 0;
  return out;
}

// Monta o breakdown completo: telemetria interna (Prometheus) + contas (Admin API) + limites
// + budgets. account/limits são buscados internamente (cache); override aceito p/ teste.
export async function collectBreakdown(ctx, { windowId = '30d' } = {}, overrides = {}) {
  const w = windowToRange(windowId);
  const windowMs = w.toMs - w.fromMs;
  const [promRes, accountByProvider, limitsByProvider] = await Promise.all([
    ctx.cache.get(`prom:rows:${windowId}`, 60_000, () => ctx.prom.breakdownRows(windowMs)),
    overrides.accountByProvider != null ? Promise.resolve(overrides.accountByProvider) : collectAccount(ctx, windowId),
    overrides.limitsByProvider != null ? Promise.resolve(overrides.limitsByProvider) : collectLimits(ctx),
  ]);
  const rows = promRes.value || { reachable: false, costRows: [], tokenRows: [], reqRows: [] };
  const internalByProvider = buildInternalByProvider(rows);

  // Langfuse health (cross-check leve; não altera o shape na fase 1)
  let langfuseHealth = ctx.lf.enabled ? 'unknown' : 'absent';
  if (ctx.lf.enabled) {
    const lh = await ctx.cache.get('lf:health', 300_000, () => ctx.lf.health());
    langfuseHealth = lh.value && lh.value.ok ? 'ok' : 'degraded';
  }

  // Budgets a partir do gasto MTD (estimado por enquanto; conta entra na fase 2).
  const mtdCost = await internalCostByProvider(ctx, 'mtd');
  const budgetByProvider = {};
  const bcfg = ctx.cfg.budgets;
  const monthly = { openai: bcfg.openaiMonthlyUsd, anthropic: bcfg.anthropicMonthlyUsd };
  for (const p of PROVIDERS) {
    const acc = accountByProvider[p];
    const spent = acc && Number.isFinite(acc.cost) && !acc.stale ? acc.cost : mtdCost[p];
    const b = computeBudget({ provider: p, monthlyUsd: monthly[p], spentUsd: spent, warnPct: bcfg.warnPct, breachPct: bcfg.breachPct });
    if (b) budgetByProvider[p] = b;
  }

  const sourcesHealth = {
    prometheus: rows.reachable ? 'ok' : (promRes.error ? 'down' : 'degraded'),
    langfuse: langfuseHealth,
    openaiAdmin: accountByProvider.openai ? 'ok' : (ctx.cfg.openai.enabled ? 'error' : 'absent'),
    anthropicAdmin: accountByProvider.anthropic ? 'ok' : (ctx.cfg.anthropic.enabled ? 'error' : 'absent'),
  };

  return assembleBreakdown({
    window: { id: w.id, from: w.from, to: w.to, granularity: w.granularity },
    internalByProvider, accountByProvider, limitsByProvider, budgetByProvider, sourcesHealth,
  });
}

export function buildUsageRouter({ config, cache, context, liveHub } = {}) {
  const ctx = context || createUsageContext({ config, cache });
  const router = express.Router();
  router.use(requireUsageAdmin);
  // hub de live (SSE) — injetável p/ teste; criado preguiçosamente p/ evitar ciclo na avaliação.
  let hub = liveHub || null;
  const getHub = async () => { if (!hub) { const { createLiveHub } = await import('./live-hub.js'); hub = createLiveHub(ctx); } return hub; };

  const VALID_WINDOWS = new Set(['24h', '7d', '30d', '90d', 'mtd']);
  const win = (req) => { const w = String(req.query.window || '30d'); return VALID_WINDOWS.has(w) ? w : '30d'; };

  router.get('/health', async (_req, res) => {
    const lh = ctx.lf.enabled ? await ctx.lf.health() : { ok: false };
    const pr = await ctx.prom.query('vector(1)');
    res.json({
      status: 'ok',
      sources: {
        prometheus: pr.ok ? 'ok' : 'down',
        langfuse: ctx.lf.enabled ? (lh.ok ? 'ok' : 'degraded') : 'absent',
        openaiAdmin: ctx.cfg.openai.enabled ? 'configured' : 'absent',
        anthropicAdmin: ctx.cfg.anthropic.enabled ? 'configured' : 'absent',
        probe: ctx.cfg.probeEnabled ? 'enabled' : 'disabled',
      },
    });
  });

  router.get('/breakdown', async (req, res) => {
    try {
      const breakdown = await collectBreakdown(ctx, { windowId: win(req) });
      res.json(breakdown);
    } catch (err) {
      console.error('[reqhub-api] ai-usage/breakdown:', err);
      res.status(500).json({ error: { code: 'USAGE_ERROR', message: 'falha ao agregar uso da IA' } });
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      const breakdown = await collectBreakdown(ctx, { windowId: win(req) });
      res.json(summaryFromBreakdown(breakdown));
    } catch (err) {
      console.error('[reqhub-api] ai-usage/summary:', err);
      res.status(500).json({ error: { code: 'USAGE_ERROR', message: 'falha ao agregar uso da IA' } });
    }
  });

  router.get('/budgets', (_req, res) => {
    res.json({ budgets: ctx.cfg.budgets });
  });

  // Visão OFICIAL da conta de um provedor (Admin API). Sem chave -> 503 PROVIDER_KEY_ABSENT.
  router.get('/providers/:provider', async (req, res) => {
    const provider = String(req.params.provider).toLowerCase();
    const client = provider === 'openai' ? ctx.openai : provider === 'anthropic' ? ctx.anthropic : null;
    if (!client) return res.status(404).json({ error: { code: 'UNKNOWN_PROVIDER', message: `provider ${provider} desconhecido` } });
    if (!client.enabled) return res.status(503).json({ error: { code: 'PROVIDER_KEY_ABSENT', message: `chave admin de ${provider} não configurada — exibindo apenas telemetria interna` } });
    const w = windowToRange(win(req));
    const r = await ctx.cache.get(`acct:${provider}:${w.id}`, 6 * 3600_000, () => client.accountUsage({ fromMs: w.fromMs, toMs: w.toMs }));
    if (!r.value || !r.value.ok) return res.status(502).json({ error: { code: (r.value && r.value.code) || 'PROVIDER_ERROR', message: (r.value && r.value.error) || 'falha ao consultar a conta' } });
    res.json({ provider, window: { id: w.id, from: w.from, to: w.to }, account: { ...r.value, stale: r.stale } });
  });

  // Rate-limits ao vivo (probe) + budgets + flags de breach.
  router.get('/limits', async (req, res) => {
    try {
      const [limitsByProvider, breakdown] = await Promise.all([collectLimits(ctx), collectBreakdown(ctx, { windowId: win(req) })]);
      const budgets = {};
      for (const p of breakdown.providers) if (p.budget) budgets[p.provider] = p.budget;
      res.json({ probeEnabled: ctx.cfg.probeEnabled, limits: limitsByProvider, budgets });
    } catch (err) {
      res.json({ probeEnabled: ctx.cfg.probeEnabled, limits: {}, budgets: {} });
    }
  });

  router.get('/alerts', async (req, res) => {
    try {
      const breakdown = await collectBreakdown(ctx, { windowId: win(req) });
      const budgetsByProvider = {}; const limitsByProvider = {};
      for (const p of breakdown.providers) { if (p.budget) budgetsByProvider[p.provider] = p.budget; if (p.limits) limitsByProvider[p.provider] = p.limits; }
      res.json({ alerts: deriveAlerts({ budgetsByProvider, limitsByProvider }) });
    } catch (err) {
      res.json({ alerts: [] });
    }
  });

  // SSE — taxas ao vivo (custo/min, tokens/min, requests/min, headroom de rate-limit, budget).
  // EventSource não envia Authorization; a auth vem do SSO de borda (X-Auth-Request-*), igual /v1/me.
  router.get('/stream', async (req, res) => {
    try { (await getHub()).addClient(req, res); }
    catch (err) { console.error('[reqhub-api] ai-usage/stream:', err); if (!res.headersSent) res.status(500).end(); }
  });

  return { router, ctx };
}
