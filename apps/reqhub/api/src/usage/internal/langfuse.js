// internal/langfuse.js — cliente mínimo da API pública do Langfuse (Basic auth public:secret),
// adaptado p/ JS a partir de apps/sicat/.../langfuse/langfuse-client.ts. NEVER-THROW.
// Usado só p/ cross-check per-model do custo/tokens (o Prometheus é a fonte primária, com a
// dimensão `app`/módulo que o Langfuse não separa por padrão). As chaves NUNCA saem do backend.
export function createLangfuseClient({ baseUrl, publicKey, secretKey, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const token = Buffer.from(`${publicKey || ''}:${secretKey || ''}`).toString('base64');
  const authHeader = `Basic ${token}`;
  const enabled = Boolean(base && publicKey && secretKey);

  async function get(path, query) {
    if (!enabled) return { ok: false, error: 'Langfuse não configurado' };
    try {
      const url = new URL(`${base}${path}`);
      if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
      const r = await fetchImpl(url, { headers: { Authorization: authHeader, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return { ok: false, error: `Langfuse HTTP ${r.status}`, status: r.status };
      return { ok: true, data: await r.json() };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function health() { return get('/api/public/projects'); }
  function dailyMetrics(query) { return get('/api/public/metrics/daily', query); }

  return { enabled, get, health, dailyMetrics };
}

// Rollup do /metrics/daily numa janela -> { ok, totalCost, totalTraces, byModel:[{model,inputTokens,outputTokens,cost}] }.
export async function langfuseUsage(client, { fromDate, toDate } = {}) {
  if (!client || !client.enabled) return { ok: false, reachable: false, totalCost: 0, totalTraces: 0, byModel: [] };
  const res = await client.dailyMetrics({ fromTimestamp: fromDate, toTimestamp: toDate });
  if (!res.ok) return { ok: false, reachable: false, error: res.error, totalCost: 0, totalTraces: 0, byModel: [] };
  const rows = (res.data && res.data.data) || [];
  let totalCost = 0; let totalTraces = 0;
  const byModel = new Map();
  for (const day of rows) {
    totalCost += Number(day.totalCost || 0);
    totalTraces += Number(day.countTraces || 0);
    for (const u of (day.usage || [])) {
      const key = u.model || '—';
      const m = byModel.get(key) || { model: key, inputTokens: 0, outputTokens: 0, cost: 0 };
      m.inputTokens += Number(u.inputUsage || 0);
      m.outputTokens += Number(u.outputUsage || 0);
      m.cost += Number(u.totalCost || u.cost || 0);
      byModel.set(key, m);
    }
  }
  return { ok: true, reachable: true, totalCost: Math.round(totalCost * 1e6) / 1e6, totalTraces, byModel: [...byModel.values()] };
}
