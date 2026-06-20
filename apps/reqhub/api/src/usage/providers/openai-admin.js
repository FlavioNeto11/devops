// providers/openai-admin.js — visão OFICIAL da conta OpenAI via Admin/Usage APIs.
// NEVER-THROW; sem OPENAI_ADMIN_KEY -> { ok:false, code:'PROVIDER_KEY_ABSENT' }.
// As chaves NUNCA saem do backend; chamadas server-side only.
const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export function createOpenAiAdminClient({ adminKey, apiKey, base = 'https://api.openai.com', timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const enabled = Boolean(adminKey);
  const root = String(base).replace(/\/+$/, '');

  async function adminGet(path, params) {
    if (!enabled) return { ok: false, code: 'PROVIDER_KEY_ABSENT', error: 'OPENAI_ADMIN_KEY ausente' };
    try {
      const url = new URL(root + path);
      for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
      const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${adminKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return { ok: false, code: 'PROVIDER_HTTP', status: r.status, error: `OpenAI ${r.status}` };
      return { ok: true, data: await r.json() };
    } catch (err) { return { ok: false, code: 'PROVIDER_NET', error: String((err && err.message) || err) }; }
  }

  // Custo + uso (tokens/requests por modelo) da conta numa janela. Defensivo a variações de shape.
  async function accountUsage({ fromMs, toMs }) {
    if (!enabled) return { ok: false, code: 'PROVIDER_KEY_ABSENT', error: 'OPENAI_ADMIN_KEY ausente' };
    const start = unix(new Date(fromMs).toISOString());
    const end = unix(new Date(toMs).toISOString());
    const [costRes, usageRes] = await Promise.all([
      adminGet('/v1/organization/costs', { start_time: start, end_time: end, bucket_width: '1d', limit: 180 }),
      adminGet('/v1/organization/usage/completions', { start_time: start, end_time: end, bucket_width: '1d', group_by: 'model', limit: 180 }),
    ]);
    let cost = 0; const currency = 'USD';
    if (costRes.ok) {
      for (const bucket of (costRes.data.data || [])) for (const res of (bucket.results || [])) cost += num(res.amount && res.amount.value);
    }
    let tokensIn = 0; let tokensOut = 0; let requests = 0; const perModel = new Map();
    if (usageRes.ok) {
      for (const bucket of (usageRes.data.data || [])) for (const res of (bucket.results || [])) {
        const ti = num(res.input_tokens); const to = num(res.output_tokens); const rq = num(res.num_model_requests || res.n_requests);
        tokensIn += ti; tokensOut += to; requests += rq;
        const model = res.model || '—';
        const m = perModel.get(model) || { model, tokensIn: 0, tokensOut: 0, requests: 0 };
        m.tokensIn += ti; m.tokensOut += to; m.requests += rq; perModel.set(model, m);
      }
    }
    const ok = costRes.ok || usageRes.ok;
    return ok
      ? { ok: true, source: 'account', provider: 'openai', cost: Math.round(cost * 1e6) / 1e6, currency, tokensIn, tokensOut, requests, perModel: [...perModel.values()], lag: 'daily', asOf: new Date(toMs).toISOString(), stale: false }
      : { ok: false, code: costRes.code || usageRes.code, status: costRes.status || usageRes.status, error: costRes.error || usageRes.error };
  }

  // Probe leve p/ ler os headers de rate-limit (x-ratelimit-*). Usa a chave NORMAL (não a admin).
  async function rateLimitProbe() {
    if (!apiKey) return { ok: false, code: 'PROBE_KEY_ABSENT', rateLimits: [] };
    try {
      const r = await fetchImpl(`${root}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.AI_USAGE_PROBE_MODEL || 'gpt-5-nano', messages: [{ role: 'user', content: 'ping' }], max_completion_tokens: 1 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const h = r.headers;
      const rl = (limit, remaining, unit, kind) => {
        const L = num(h.get(limit)); const R = num(h.get(remaining));
        if (!h.get(limit)) return null;
        return { kind, limit: L, remaining: R, unit, pctUsed: L > 0 ? Math.round(((L - R) / L) * 1000) / 10 : 0 };
      };
      const rateLimits = [
        rl('x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'per-minute', 'requests'),
        rl('x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens', 'per-minute', 'tokens'),
      ].filter(Boolean);
      return { ok: true, tier: 'openai', rateLimits, probedAt: new Date().toISOString() };
    } catch (err) { return { ok: false, code: 'PROBE_NET', error: String((err && err.message) || err), rateLimits: [] }; }
  }

  return { enabled, accountUsage, rateLimitProbe };
}
