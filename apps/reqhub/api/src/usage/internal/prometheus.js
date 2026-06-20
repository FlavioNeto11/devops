// internal/prometheus.js — cliente PromQL (instant + range) sobre as métricas ai_* que
// kube-prometheus-stack já raspa de sicat/gymops (e do próprio reqhub após instrumentar).
// NEVER-THROW: devolve { ok, data } | { ok:false, error } e linhas vazias em falha.
import { providerForModel } from '../model.js';

function durSeconds(ms) { return `${Math.max(60, Math.round(ms / 1000))}s`; }

export function createPrometheusClient({ baseUrl, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');

  async function query(promql) {
    if (!base) return { ok: false, error: 'PROMETHEUS_URL ausente', result: [] };
    const url = `${base}/api/v1/query?query=${encodeURIComponent(promql)}`;
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
      if (!r.ok) return { ok: false, error: `prometheus ${r.status}`, result: [] };
      const j = await r.json();
      if (j.status !== 'success') return { ok: false, error: j.error || 'prometheus error', result: [] };
      const result = (j.data && j.data.result) || [];
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), result: [] };
    }
  }

  // Converte o vetor instantâneo em [{app, model, direction?, value}].
  function rows(result) {
    return result.map((s) => ({
      app: s.metric.app || s.metric.exported_app || 'desconhecido',
      model: s.metric.model || '—',
      direction: s.metric.direction,
      value: Number(Array.isArray(s.value) ? s.value[1] : 0),
    }));
  }

  // Pega cost/tokens/requests da janela (ms). Usa increase() sobre range vector.
  async function breakdownRows(windowMs) {
    const W = durSeconds(windowMs);
    const [cost, tokens, reqs] = await Promise.all([
      query(`sum by (app, model) (increase(ai_cost_usd_total[${W}]))`),
      query(`sum by (app, model, direction) (increase(ai_tokens_total[${W}]))`),
      query(`sum by (app, model) (increase(ai_tool_calls_total[${W}]))`),
    ]);
    return {
      ok: cost.ok || tokens.ok || reqs.ok,
      reachable: cost.ok, // se a 1ª consulta respondeu, Prometheus está acessível
      costRows: cost.ok ? rows(cost.result) : [],
      tokenRows: tokens.ok ? rows(tokens.result) : [],
      reqRows: reqs.ok ? rows(reqs.result) : [],
      error: cost.error || tokens.error || reqs.error || null,
    };
  }

  // Taxas rolantes p/ o SSE: custo/5m, tokens/min, requests/min — por (app, model) -> provider.
  async function liveRates() {
    const [cost5m, tok1m, req1m] = await Promise.all([
      query('sum by (app, model) (rate(ai_cost_usd_total[5m]))'),
      query('sum by (app, model) (rate(ai_tokens_total[1m]))'),
      query('sum by (app, model) (rate(ai_tool_calls_total[1m]))'),
    ]);
    const byProvider = { openai: { costUsdPerMin: 0, tokensPerMin: 0, requestsPerMin: 0 }, anthropic: { costUsdPerMin: 0, tokensPerMin: 0, requestsPerMin: 0 } };
    const add = (res, key, mult) => {
      if (!res.ok) return;
      for (const r of rows(res.result)) {
        const p = providerForModel(r.model);
        if (!byProvider[p]) continue;
        byProvider[p][key] += r.value * mult;
      }
    };
    add(cost5m, 'costUsdPerMin', 60); // rate é por segundo -> por minuto
    add(tok1m, 'tokensPerMin', 60);
    add(req1m, 'requestsPerMin', 60);
    return { ok: cost5m.ok || tok1m.ok || req1m.ok, byProvider };
  }

  return { query, rows, breakdownRows, liveRates };
}
