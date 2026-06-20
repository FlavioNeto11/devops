// cache.js — cache TTL com stale-while-revalidate + single-flight (dedupe de refresh
// concorrente). As Admin APIs dos provedores são lentas/diárias/rate-limited; isto evita
// estampida e mantém o painel rápido. Em erro de refresh, SERVE o último valor (stale).
export function createCache({ now = () => Date.now() } = {}) {
  const store = new Map(); // key -> { value, at, ttl, refreshing: Promise|null, error }

  // get(key, ttlMs, loader): retorna valor fresco do cache; se vencido, dispara refresh em
  // background e devolve o stale (se houver) imediatamente; se não houver valor, aguarda o loader.
  async function get(key, ttlMs, loader) {
    const e = store.get(key);
    const fresh = e && (now() - e.at) < ttlMs;
    if (fresh) return { value: e.value, stale: false, at: e.at, error: null };

    // single-flight: se já há refresh em voo, reusa
    if (e && e.refreshing) {
      if (e.value !== undefined) return { value: e.value, stale: true, at: e.at, error: e.error || null };
      const v = await e.refreshing.catch(() => undefined);
      const after = store.get(key);
      return { value: v, stale: false, at: after ? after.at : now(), error: after ? after.error : null };
    }

    const p = Promise.resolve()
      .then(() => loader())
      .then((value) => {
        store.set(key, { value, at: now(), ttl: ttlMs, refreshing: null, error: null });
        return value;
      })
      .catch((err) => {
        const prev = store.get(key) || {};
        store.set(key, { value: prev.value, at: prev.at || 0, ttl: ttlMs, refreshing: null, error: err });
        throw err;
      });

    store.set(key, { value: e ? e.value : undefined, at: e ? e.at : 0, ttl: ttlMs, refreshing: p, error: e ? e.error : null });

    if (e && e.value !== undefined) {
      // serve o stale e revalida em background (não propaga erro)
      p.catch(() => {});
      return { value: e.value, stale: true, at: e.at, error: e.error || null };
    }
    // sem valor anterior: aguarda
    const value = await p.catch(() => undefined);
    const after = store.get(key);
    return { value, stale: false, at: after ? after.at : now(), error: after ? after.error : null };
  }

  function clear() { store.clear(); }
  return { get, clear, _store: store };
}
