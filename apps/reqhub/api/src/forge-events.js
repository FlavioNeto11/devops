// forge-events.js — SSE do estado VIVO da Forja (A6, Forja 4.0). Empurra o forgeState() (ConfigMap
// montado, cache 3s) para o browser SEMPRE que a assinatura mudar — o polling de 15s do frontend
// vira fallback. Decisão da revisão adversarial: SSE alimentado pelo LEITOR server-side existente
// (zero superfície pública nova — nada de webhook do GitHub). Mesmo padrão do live-hub do ai-usage:
// auth pelo SSO de borda (EventSource não envia Authorization), heartbeat, para quando ocioso.
import { forgeState } from './forge-state.js';

const INTERVAL_MS = 5000;    // cadência de checagem (o forgeState já tem cache interno de 3s)
const HEARTBEAT_MS = 25000;  // comentário keep-alive p/ proxies não fecharem a conexão

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx/traefik: não bufferizar o stream
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

export function createForgeEventsHub({ stateFn } = {}) {
  const getState = stateFn || forgeState;
  const clients = new Set();
  let timer = null;
  let hb = null;
  let last = '';

  const broadcast = (chunk) => {
    for (const res of [...clients]) {
      try { res.write(chunk); } catch { clients.delete(res); }
    }
  };

  async function tick(force) {
    let st = null;
    try { st = await getState(); } catch { return; } // fail-soft: sem estado, sem frame
    if (!st) return;
    // assinatura barata: nomes + progresso — o payload completo só desce quando algo mudou
    const sig = JSON.stringify(((st.products || [])).map((p) => [p.name, p.reqCount, p.progress && p.progress.done, p.progress && p.progress.pct]));
    if (!force && sig === last) return;
    last = sig;
    broadcast(`event: state\ndata: ${JSON.stringify(st)}\n\n`);
  }

  function stopIfIdle() {
    if (clients.size) return;
    if (timer) { clearInterval(timer); timer = null; }
    if (hb) { clearInterval(hb); hb = null; }
    last = '';
  }

  return {
    addClient(req, res) {
      setSseHeaders(res);
      res.write(': connected\n\n');
      clients.add(res);
      if (!timer) timer = setInterval(() => { void tick(false); }, INTERVAL_MS);
      if (!hb) hb = setInterval(() => broadcast(': hb\n\n'), HEARTBEAT_MS);
      void tick(true); // snapshot imediato para o cliente novo
      req.on('close', () => { clients.delete(res); stopIfIdle(); });
    },
    _internals: { clients, tick },
  };
}
