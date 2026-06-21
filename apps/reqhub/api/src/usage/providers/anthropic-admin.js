// providers/anthropic-admin.js — visão OFICIAL da conta Anthropic via Admin/Usage APIs.
// NEVER-THROW; sem ANTHROPIC_ADMIN_KEY -> { ok:false, code:'PROVIDER_KEY_ABSENT' }.
// Server-side only; chaves nunca saem do backend.
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export function createAnthropicAdminClient({ adminKey, apiKey, base = 'https://api.anthropic.com', version = '2023-06-01', timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const enabled = Boolean(adminKey);
  const root = String(base).replace(/\/+$/, '');

  async function adminGet(path, params) {
    if (!enabled) return { ok: false, code: 'PROVIDER_KEY_ABSENT', error: 'ANTHROPIC_ADMIN_KEY ausente' };
    try {
      const url = new URL(root + path);
      for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
      const r = await fetchImpl(url, { headers: { 'x-api-key': adminKey, 'anthropic-version': version, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return { ok: false, code: 'PROVIDER_HTTP', status: r.status, error: `Anthropic ${r.status}` };
      return { ok: true, data: await r.json() };
    } catch (err) { return { ok: false, code: 'PROVIDER_NET', error: String((err && err.message) || err) }; }
  }

  // A Admin API limita bucket_width=1d a limit<=31 por pagina -> pagina via next_page p/ cobrir
  // janelas > 31 dias (ex.: 90d). Erro na 1a pagina propaga; erro nas seguintes retorna o parcial.
  async function adminGetPaged(path, params, maxPages = 16) {
    const buckets = [];
    let page;
    for (let i = 0; i < maxPages; i++) {
      const res = await adminGet(path, page ? { ...params, page } : params);
      if (!res.ok) return i === 0 ? res : { ok: true, data: { data: buckets } };
      const d = res.data || {};
      if (Array.isArray(d.data)) for (const b of d.data) buckets.push(b);
      if (!d.has_more || !d.next_page) break;
      page = d.next_page;
    }
    return { ok: true, data: { data: buckets } };
  }

  async function accountUsage({ fromMs, toMs }) {
    if (!enabled) return { ok: false, code: 'PROVIDER_KEY_ABSENT', error: 'ANTHROPIC_ADMIN_KEY ausente' };
    const starting_at = new Date(fromMs).toISOString();
    const ending_at = new Date(toMs).toISOString();
    // bucket_width SEMPRE 1d (cost_report so aceita 1d) e limit<=31 (cap da API) — paginado.
    const [usageRes, costRes] = await Promise.all([
      adminGetPaged('/v1/organizations/usage_report/messages', { starting_at, ending_at, bucket_width: '1d', limit: 31 }),
      adminGetPaged('/v1/organizations/cost_report', { starting_at, ending_at, bucket_width: '1d', limit: 31 }),
    ]);
    let cost = 0;
    if (costRes.ok) {
      for (const bucket of (costRes.data.data || [])) for (const res of (bucket.results || [])) cost += num(res.amount != null ? res.amount : (res.cost && res.cost.value));
    }
    let tokensIn = 0; let tokensOut = 0; let requests = 0; const perModel = new Map();
    if (usageRes.ok) {
      for (const bucket of (usageRes.data.data || [])) for (const res of (bucket.results || [])) {
        const ti = num(res.input_tokens || res.uncached_input_tokens) + num(res.cache_read_input_tokens) + num(res.cache_creation_input_tokens);
        const to = num(res.output_tokens);
        const rq = num(res.num_requests || res.count);
        tokensIn += ti; tokensOut += to; requests += rq;
        const model = res.model || '—';
        const m = perModel.get(model) || { model, tokensIn: 0, tokensOut: 0, requests: 0 };
        m.tokensIn += ti; m.tokensOut += to; m.requests += rq; perModel.set(model, m);
      }
    }
    const ok = costRes.ok || usageRes.ok;
    return ok
      ? { ok: true, source: 'account', provider: 'anthropic', cost: Math.round(cost * 1e6) / 1e6, currency: 'USD', tokensIn, tokensOut, requests, perModel: [...perModel.values()], lag: 'daily', asOf: ending_at, stale: false }
      : { ok: false, code: costRes.code || usageRes.code, status: costRes.status || usageRes.status, error: costRes.error || usageRes.error };
  }

  async function rateLimitProbe() {
    if (!apiKey) return { ok: false, code: 'PROBE_KEY_ABSENT', rateLimits: [] };
    try {
      const r = await fetchImpl(`${root}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': version, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.AI_USAGE_PROBE_MODEL_ANTHROPIC || 'claude-3-5-haiku-latest', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const h = r.headers;
      const rl = (limit, remaining, kind) => {
        if (!h.get(limit)) return null;
        const L = num(h.get(limit)); const R = num(h.get(remaining));
        return { kind, limit: L, remaining: R, unit: 'per-minute', pctUsed: L > 0 ? Math.round(((L - R) / L) * 1000) / 10 : 0 };
      };
      const rateLimits = [
        rl('anthropic-ratelimit-requests-limit', 'anthropic-ratelimit-requests-remaining', 'requests'),
        rl('anthropic-ratelimit-input-tokens-limit', 'anthropic-ratelimit-input-tokens-remaining', 'input_tokens'),
        rl('anthropic-ratelimit-output-tokens-limit', 'anthropic-ratelimit-output-tokens-remaining', 'output_tokens'),
      ].filter(Boolean);
      return { ok: true, tier: 'anthropic', rateLimits, probedAt: new Date().toISOString() };
    } catch (err) { return { ok: false, code: 'PROBE_NET', error: String((err && err.message) || err), rateLimits: [] }; }
  }

  return { enabled, accountUsage, rateLimitProbe };
}
