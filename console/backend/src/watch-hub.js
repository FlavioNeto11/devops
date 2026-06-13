'use strict';

/**
 * watch-hub.js
 * ------------
 * Núcleo de TEMPO REAL orientado a eventos do Console (substitui o polling
 * server-side de 4s do /stream). Mantém UM conjunto de informers
 * (list+watch do @kubernetes/client-node) COMPARTILHADO no processo, alimentado
 * por push do API server, e re-difunde um snapshot por SSE para N clientes
 * APENAS quando o estado muda de verdade.
 *
 * Decisões (validadas por verificação adversarial — ver docs/handoffs):
 *  - O snapshot é SEMPRE recomputado a partir de `informer.list()` (cache
 *    canônico do ListWatch), nunca de mapas mutados por evento. Isso elimina
 *    por construção o "buraco" de objetos deletados durante o gap do 410 Gone:
 *    o re-list do informer reconcilia e o list() já reflete o estado correto.
 *  - Coalescing: rajadas de eventos (um rollout gera dezenas em ms) marcam
 *    "dirty" e um único recompute roda após o debounce — 1 snapshot, não N.
 *  - Supressão: se o snapshot serializado for idêntico ao anterior, não
 *    difunde (zero tráfego quando nada muda — o oposto do polling).
 *  - Fan-out seguro: handlers de fechamento são anexados ANTES de inserir o
 *    cliente no Set; cada write é protegido (um cliente meio-fechado não
 *    derruba o broadcast para os demais).
 *  - Resiliência: no ERROR de um informer, re-start com backoff + jitter (o
 *    client-node 0.21 NÃO reinicia sozinho após erro terminal). Um informer
 *    que falha não impede os outros (ex.: CRD do Traefik ausente).
 *
 * PRESSUPOSTO: o backend roda replicas:1 (cache local ao processo). Para
 * escalar, manter replicas:1 (read-only barato) ou cada réplica observa o
 * cluster de forma independente (converge em segundos; read-only, sem risco
 * de dados). Documentado em k8s/backend-deployment.yaml.
 */

const k8s = require('@kubernetes/client-node');

const RECOMPUTE_DEBOUNCE_MS = 300; // coalesce de rajadas
const RECOMPUTE_MAX_WAIT_MS = 1000; // teto: nunca segura um recompute além disso
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;

/**
 * Cria o hub.
 * @param {object} opts
 * @param {import('@kubernetes/client-node').KubeConfig} opts.kc
 * @param {Array<{key:string, path:string, listFn:Function, optional?:boolean}>} opts.resources
 * @param {(caches: Record<string, any[]>) => any} opts.buildSnapshot  monta o objeto de snapshot a partir dos caches crus
 * @param {(msg:string)=>void} [opts.log]
 */
function createWatchHub({ kc, resources, buildSnapshot, log = () => {} }) {
  const informers = new Map(); // key -> informer
  const ready = new Map(); // key -> boolean (já sincronizou ao menos uma vez)
  const backoff = new Map(); // key -> ms atual
  const clients = new Set(); // Set<http.ServerResponse>

  let lastSnapshot = null; // objeto
  let lastSerialized = null; // string (para supressão)
  let dirty = false;
  let debounceTimer = null;
  let maxWaitTimer = null;
  let stopped = false;

  // ----------------------------- recompute -------------------------------
  function collectCaches() {
    const caches = {};
    for (const { key } of resources) {
      const inf = informers.get(key);
      // list() é a fonte de verdade do ListWatch (reconciliada no re-list).
      caches[key] = inf ? inf.list() : [];
    }
    return caches;
  }

  function recompute() {
    if (stopped) return;
    dirty = false;
    let snapshot;
    try {
      snapshot = buildSnapshot(collectCaches());
    } catch (err) {
      log(`[watch-hub] erro ao montar snapshot: ${err && err.message ? err.message : err}`);
      return;
    }
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSerialized) {
      return; // nada mudou de fato → não difunde
    }
    lastSnapshot = snapshot;
    lastSerialized = serialized;
    broadcast('snapshot', serialized);
  }

  function scheduleRecompute() {
    dirty = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (maxWaitTimer) {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
      }
      recompute();
    }, RECOMPUTE_DEBOUNCE_MS);
    debounceTimer.unref && debounceTimer.unref();
    // Teto: garante um recompute mesmo sob rajada contínua que rearma o debounce.
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(() => {
        maxWaitTimer = null;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        if (dirty) recompute();
      }, RECOMPUTE_MAX_WAIT_MS);
      maxWaitTimer.unref && maxWaitTimer.unref();
    }
  }

  // ------------------------------ fan-out --------------------------------
  function writeFrame(res, eventName, dataStr) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${dataStr}\n\n`);
  }

  function broadcast(eventName, dataStr) {
    for (const res of clients) {
      try {
        writeFrame(res, eventName, dataStr);
      } catch (err) {
        // Cliente meio-fechado (write after end): remove e segue para os demais.
        clients.delete(res);
      }
    }
  }

  /**
   * Registra um cliente SSE. Anexa os handlers de remoção ANTES de inserir no
   * Set (evita vazamento quando o cliente abre e fecha em rajada — ex.: React
   * StrictMode). Envia o snapshot atual imediatamente (first paint).
   * @returns {() => void} função de cleanup (idempotente).
   */
  function addClient(req, res) {
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      clients.delete(res);
    };
    req.on('close', remove);
    req.on('aborted', remove);
    res.on('error', remove);

    clients.add(res);

    // First paint: estado atual já consolidado (ou um snapshot fresco se ainda
    // não houve nenhum). Cliente novo nunca fica numa tela vazia esperando o
    // próximo evento do cluster.
    if (!lastSerialized) {
      try {
        recompute();
      } catch { /* ignore */ }
    }
    if (lastSerialized) {
      try {
        writeFrame(res, 'snapshot', lastSerialized);
      } catch {
        remove();
      }
    }
    return remove;
  }

  function clientCount() {
    return clients.size;
  }

  // --------------------------- informers ---------------------------------
  function startInformer(resource) {
    const { key, path, listFn, optional } = resource;
    let informer;
    try {
      informer = k8s.makeInformer(kc, path, listFn);
    } catch (err) {
      log(`[watch-hub] falha ao criar informer ${key}: ${err && err.message ? err.message : err}`);
      return;
    }
    informers.set(key, informer);

    const onChange = () => {
      ready.set(key, true);
      backoff.set(key, BACKOFF_MIN_MS); // sincronizou → reseta backoff
      scheduleRecompute();
    };
    informer.on('add', onChange);
    informer.on('update', onChange);
    informer.on('delete', onChange);
    informer.on('connect', () => {
      log(`[watch-hub] informer ${key} conectado.`);
    });
    informer.on('error', (err) => {
      const msg = err && err.message ? err.message : String(err);
      if (optional) {
        // CRD ausente (ex.: Traefik não instalado): não insiste em loop.
        log(`[watch-hub] informer opcional ${key} indisponível: ${msg} — seguindo sem ele.`);
        return;
      }
      const delay = nextBackoff(key);
      log(`[watch-hub] informer ${key} caiu: ${msg} — reiniciando em ${Math.round(delay / 1000)}s.`);
      const t = setTimeout(() => {
        if (stopped) return;
        informer.start().catch((e) => log(`[watch-hub] re-start ${key} falhou: ${e && e.message ? e.message : e}`));
      }, delay);
      t.unref && t.unref();
    });

    informer.start().catch((err) => {
      const msg = err && err.message ? err.message : String(err);
      if (optional) {
        log(`[watch-hub] informer opcional ${key} não iniciou: ${msg} — seguindo sem ele.`);
        return;
      }
      const delay = nextBackoff(key);
      log(`[watch-hub] start de ${key} falhou: ${msg} — tentando em ${Math.round(delay / 1000)}s.`);
      const t = setTimeout(() => {
        if (!stopped) informer.start().catch(() => {});
      }, delay);
      t.unref && t.unref();
    });
  }

  function nextBackoff(key) {
    const current = backoff.get(key) || BACKOFF_MIN_MS;
    const next = Math.min(current * 2, BACKOFF_MAX_MS);
    backoff.set(key, next);
    // jitter ±20% para não sincronizar reconexões.
    const jitter = current * 0.2 * (Math.random() * 2 - 1);
    return Math.max(BACKOFF_MIN_MS, Math.round(current + jitter));
  }

  function start() {
    for (const resource of resources) {
      backoff.set(resource.key, BACKOFF_MIN_MS);
      startInformer(resource);
    }
  }

  function stop() {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    for (const inf of informers.values()) {
      try { inf.stop(); } catch { /* ignore */ }
    }
    for (const res of clients) {
      try { res.end(); } catch { /* ignore */ }
    }
    clients.clear();
  }

  return { start, stop, addClient, clientCount, getSnapshot: () => lastSnapshot };
}

module.exports = { createWatchHub };
