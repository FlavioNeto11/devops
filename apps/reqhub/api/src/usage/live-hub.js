// live-hub.js — fan-out SSE de TAXAS ao vivo do uso da IA (espelha console/backend/watch-hub:
// poll com supressão de frame igual + keep-alive). Fonte = polling do Prometheus p/ rolling rates
// + limites/budgets em cache. Liga o poll só quando há cliente; desliga quando esvazia.
import { windowToRange, buildInternalByProvider, PROVIDERS } from './model.js';
import { computeBudget } from './budgets.js';
import { collectLimits } from './index.js'; // ciclo seguro: função hoisted, usada só em runtime

export function createLiveHub(ctx, { intervalMs = 12000 } = {}) {
  const clients = new Set();
  let timer = null;
  let last = '';

  function setSseHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx/traefik: não bufferizar o stream
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
  }

  async function buildSnapshot() {
    const w = windowToRange('mtd');
    const [rates, limitsByProvider, promRes] = await Promise.all([
      ctx.prom.liveRates(),
      collectLimits(ctx),
      ctx.cache.get('prom:rows:mtd', 60_000, () => ctx.prom.breakdownRows(w.toMs - w.fromMs)),
    ]);
    const by = buildInternalByProvider(promRes.value || {});
    const monthly = { openai: ctx.cfg.budgets.openaiMonthlyUsd, anthropic: ctx.cfg.budgets.anthropicMonthlyUsd };
    const providers = PROVIDERS.map((provider) => {
      const spent = by.get(provider) ? by.get(provider).cost : 0;
      const budget = computeBudget({ provider, monthlyUsd: monthly[provider], spentUsd: spent, warnPct: ctx.cfg.budgets.warnPct, breachPct: ctx.cfg.budgets.breachPct });
      const rolling = (rates.byProvider && rates.byProvider[provider]) || { costUsdPerMin: 0, tokensPerMin: 0, requestsPerMin: 0 };
      return {
        provider,
        rolling: {
          costUsdPerMin: Math.round(rolling.costUsdPerMin * 1e6) / 1e6,
          tokensPerMin: Math.round(rolling.tokensPerMin),
          requestsPerMin: Math.round(rolling.requestsPerMin * 100) / 100,
        },
        limits: (limitsByProvider[provider] && limitsByProvider[provider].rateLimits) || [],
        budget: budget ? { pctOfLimit: budget.pctOfLimit, threshold: budget.threshold, breach: budget.breach } : null,
      };
    });
    return { at: new Date().toISOString(), providers };
  }

  function send(res, snap) {
    try { res.write(`event: rates\ndata: ${JSON.stringify(snap)}\n\n`); } catch { /* cliente foi embora */ }
  }

  async function tick() {
    if (clients.size === 0) return;
    let snap;
    try { snap = await buildSnapshot(); } catch { return; }
    const serialized = JSON.stringify(snap.providers); // supressão: ignora o timestamp
    if (serialized === last) return; // frame igual -> não emite
    last = serialized;
    for (const res of clients) send(res, snap);
  }

  function startLoop() {
    if (timer) return;
    timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }
  function stopLoop() { if (timer) { clearInterval(timer); timer = null; last = ''; } }

  async function addClient(req, res) {
    setSseHeaders(res);
    clients.add(res);
    startLoop();
    // keep-alive a cada 15s p/ atravessar timeouts de proxy
    const ka = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch { /* ignore */ } }, 15000);
    if (typeof ka.unref === 'function') ka.unref();
    // primeiro frame imediato
    try { send(res, await buildSnapshot()); } catch { /* fail-soft */ }
    const cleanup = () => {
      clearInterval(ka);
      clients.delete(res);
      if (clients.size === 0) stopLoop();
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('error', cleanup);
  }

  return { addClient, _clients: clients, buildSnapshot };
}
