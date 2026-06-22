// gateways/dispatch-gateway.js — ÚNICA porta de saída para a central externa (bloco gateway-externo).
// Espelha o cetesb-gateway do SICAT: timeout, retry/backoff em erro transitório, erro tipado,
// redação. routes/services/worker NUNCA chamam o externo direto — sempre por aqui.
const BASE = process.env.EXTERNAL_BASE_URL || 'http://fieldserve-mock-central:8090';
const MODE = (process.env.EXTERNAL_GATEWAY_MODE || 'real').toLowerCase();
const TIMEOUT_MS = Number(process.env.EXTERNAL_TIMEOUT_MS) || 4000;

export class GatewayError extends Error {
  constructor(message, { status, transient } = {}) { super(message); this.name = 'GatewayError'; this.status = status; this.transient = !!transient; }
}

// Submete uma ordem à central. Retorna { externalRef }. Lança GatewayError (transient=true em 5xx/timeout).
export async function dispatchOrder(order, { retries = 2 } = {}) {
  if (MODE === 'mock-skip') return { externalRef: `LOCAL-${order.id}` };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, title: order.title, priority: order.priority }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500) { lastErr = new GatewayError(`central ${res.status}`, { status: res.status, transient: true }); }
      else if (!res.ok) { throw new GatewayError(`central ${res.status}`, { status: res.status, transient: false }); }
      else { const j = await res.json().catch(() => ({})); return { externalRef: j.ref || `CD-${order.id}` }; }
    } catch (e) {
      lastErr = e instanceof GatewayError ? e : new GatewayError(`falha de rede: ${String(e.message || e)}`, { transient: true });
      if (!lastErr.transient) break;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 150 * (attempt + 1))); // backoff interno curto
  }
  throw lastErr;
}
