// gateways/gateway.js — ÚNICA porta de saída para o sistema externo. Gerado pela Forge.
const BASE = process.env.EXTERNAL_BASE_URL || 'http://helpflow-mock-central:8090';
const TIMEOUT = Number(process.env.EXTERNAL_TIMEOUT_MS) || 4000;
export class GatewayError extends Error { constructor(m, o = {}) { super(m); this.name = 'GatewayError'; this.transient = !!o.transient; } }

// ---- Redação AUTORITATIVA (fonte da verdade) ----------------------------------
// Tudo que sai do gateway para a trilha/tela passa por aqui. Nenhum segredo cru
// chega ao cliente: a tela só faz defesa-em-profundidade. Redige por NOME de campo
// (allowlist de padrões sensíveis) e por VALOR (Bearer e JWT de 3 segmentos).
const SECRET_KEY_RE = /(token|secret|password|passwd|authorization|api[_-]?key|apikey|bearer|credential|private[_-]?key|client[_-]?secret|cookie|session)/i;
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const REDACTED = '••• redigido •••';
export function redactValue(v) {
  if (typeof v !== 'string') return v;
  if (/^Bearer\s+/i.test(v)) return 'Bearer ' + REDACTED;
  if (JWT_RE.test(v.trim())) return REDACTED;
  return v;
}
export function redact(value, key) {
  if (key && SECRET_KEY_RE.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((x) => redact(x));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = redact(value[k], k);
    return out;
  }
  return redactValue(value);
}

// ping(integration) — teste de conectividade do gateway: tenta alcançar o destino
// configurado (base_url ou o mock) respeitando timeout/retries da integração e
// devolve um veredito JÁ REDIGIDO no contrato fixo consumido pela tela.
export async function ping(integration = {}) {
  const target = integration.base_url || (BASE + '/health');
  const timeoutMs = Number(integration.timeout_ms) || TIMEOUT;
  const retries = integration.retries == null ? 0 : Math.min(5, Number(integration.retries) || 0);
  const started = Date.now();
  let lastErr = null;
  let statusCode = null;
  let body = null;
  for (let a = 0; a <= retries; a++) {
    try {
      const r = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
      statusCode = r.status;
      body = await r.text().then((t) => { try { return JSON.parse(t); } catch { return (t || '').slice(0, 2000); } }).catch(() => null);
      if (r.status >= 500) { lastErr = new GatewayError('externo ' + r.status, { transient: true }); }
      else { lastErr = null; break; }
    } catch (e) {
      lastErr = e instanceof GatewayError ? e : new GatewayError(String(e && e.message || e), { transient: true });
    }
    if (a < retries) await new Promise((res) => setTimeout(res, 150 * (a + 1)));
  }
  const latencyMs = Date.now() - started;
  const ok = lastErr == null && statusCode != null && statusCode < 400;
  return {
    ok,
    method: 'GET',
    target: redactValue(target),
    status_code: statusCode,
    latency_ms: latencyMs,
    message: lastErr ? lastErr.message : (ok ? 'Gateway respondeu com sucesso' : 'Resposta sem sucesso'),
    response: redact(body),
    redacted: true,
  };
}
export async function dispatch(record, opts = {}) {
  const retries = opts.retries == null ? 2 : opts.retries; let last;
  for (let a = 0; a <= retries; a++) {
    try {
      const r = await fetch(BASE + '/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id, title: record.title }), signal: AbortSignal.timeout(TIMEOUT) });
      if (r.status >= 500) { last = new GatewayError('externo ' + r.status, { transient: true }); }
      else if (!r.ok) { throw new GatewayError('externo ' + r.status, { transient: false }); }
      else { const j = await r.json().catch(() => ({})); return { externalRef: j.ref || ('EXT-' + record.id) }; }
    } catch (e) { last = e instanceof GatewayError ? e : new GatewayError(String(e.message || e), { transient: true }); if (!last.transient) break; }
    if (a < retries) await new Promise((res) => setTimeout(res, 150 * (a + 1)));
  }
  throw last;
}
