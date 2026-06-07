import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchNamespaces, fetchPods, fetchLogs } from '../api.js';

/**
 * Logs
 * ----
 * Seletor de namespace + pod e exibicao das ultimas ~200 linhas de log.
 *
 * Fluxo:
 *  1. Carrega namespaces (/namespaces) e pods (/pods) ao montar.
 *  2. O usuario escolhe namespace -> a lista de pods e filtrada por namespace.
 *  3. O usuario escolhe um pod e clica em "Atualizar" para buscar os logs
 *     via /logs?namespace=<ns>&name=<pod>.
 *
 * O backend e responsavel por limitar a saida (tailLines ~200). Ainda assim,
 * truncamos defensivamente para 200 linhas na exibicao.
 */
const MAX_LINES = 200;

export default function Logs() {
  const [namespaces, setNamespaces] = useState([]);
  const [pods, setPods] = useState([]);
  const [ns, setNs] = useState('');
  const [pod, setPod] = useState('');

  const [logText, setLogText] = useState('');
  const [error, setError] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Carrega namespaces e pods ao montar.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoadingMeta(true);
      setError(null);
      try {
        const [nsRes, podRes] = await Promise.all([
          fetchNamespaces({ signal: ctrl.signal }),
          fetchPods({ signal: ctrl.signal }),
        ]);
        setNamespaces(normalizeNamespaces(nsRes));
        setPods(normalizePods(podRes));
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        setError(err.message || String(err));
      } finally {
        setLoadingMeta(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  // Pods filtrados pelo namespace selecionado.
  const podsInNs = useMemo(
    () => (ns ? pods.filter((p) => p.namespace === ns) : []),
    [pods, ns]
  );

  // Ao trocar de namespace, limpa o pod selecionado se ele nao pertencer mais.
  useEffect(() => {
    if (pod && !podsInNs.some((p) => p.name === pod)) {
      setPod('');
      setLogText('');
    }
  }, [ns, podsInNs, pod]);

  const loadLogs = useCallback(async () => {
    if (!ns || !pod) return;
    setLoadingLogs(true);
    setError(null);
    try {
      const res = await fetchLogs(ns, pod);
      const text = extractLogText(res);
      const trimmed = text.split('\n').slice(-MAX_LINES).join('\n');
      setLogText(trimmed);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setError(err.message || String(err));
      setLogText('');
    } finally {
      setLoadingLogs(false);
    }
  }, [ns, pod]);

  return (
    <section className="logs" aria-label="Logs de pods">
      <div className="toolbar logs__toolbar">
        <label className="field">
          <span className="field__label">Namespace</span>
          <select
            className="select"
            value={ns}
            onChange={(e) => setNs(e.target.value)}
            disabled={loadingMeta}
          >
            <option value="">— selecione —</option>
            {namespaces.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Pod</span>
          <select
            className="select"
            value={pod}
            onChange={(e) => setPod(e.target.value)}
            disabled={!ns || loadingMeta}
          >
            <option value="">— selecione —</option>
            {podsInNs.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn--primary"
          onClick={loadLogs}
          disabled={!ns || !pod || loadingLogs}
        >
          {loadingLogs ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {loadingMeta && (
        <p className="state state--loading">Carregando namespaces e pods…</p>
      )}

      {error && (
        <div className="state state--error" role="alert">
          Erro: {error}
        </div>
      )}

      {!ns || !pod ? (
        <p className="state state--empty">
          Selecione um namespace e um pod e clique em <strong>Atualizar</strong>{' '}
          para ver as ultimas {MAX_LINES} linhas de log.
        </p>
      ) : (
        <pre className="logbox" aria-label={`Logs de ${pod} em ${ns}`}>
          {logText || (loadingLogs ? '' : '(sem logs)')}
        </pre>
      )}
    </section>
  );
}

/** Aceita lista de strings, lista de objetos {name|metadata.name} ou {items}. */
function normalizeNamespaces(res) {
  const arr = Array.isArray(res) ? res : res?.namespaces || res?.items || [];
  return arr
    .map((n) => (typeof n === 'string' ? n : n.name || n?.metadata?.name))
    .filter(Boolean);
}

/** Normaliza pods para { name, namespace }. */
function normalizePods(res) {
  const arr = Array.isArray(res) ? res : res?.pods || res?.items || [];
  return arr
    .map((p) => ({
      name: p.name || p?.metadata?.name,
      namespace: p.namespace || p?.metadata?.namespace,
    }))
    .filter((p) => p.name && p.namespace);
}

/** O endpoint /logs pode devolver texto puro, {logs} ou {log}. */
function extractLogText(res) {
  if (typeof res === 'string') return res;
  if (res && typeof res.logs === 'string') return res.logs;
  if (res && typeof res.log === 'string') return res.log;
  if (res && Array.isArray(res.lines)) return res.lines.join('\n');
  return '';
}
