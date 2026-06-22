// gateways/gateway.js — ÚNICA porta de saída para o sistema externo. Gerado pela Forge.
const BASE = process.env.EXTERNAL_BASE_URL || 'http://stockpilot-mock-central:8090';
const TIMEOUT = Number(process.env.EXTERNAL_TIMEOUT_MS) || 4000;
export class GatewayError extends Error { constructor(m, o = {}) { super(m); this.name = 'GatewayError'; this.transient = !!o.transient; } }
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
