import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPods, fetchDeployments } from '../api.js';
import { phaseBadgeClass, asCount } from '../format.js';

/**
 * Health
 * ------
 * Status geral de saude por pod/deployment, com badges/pontos verde-amarelo-
 * vermelho, restartCount e readiness. Resumo (contadores) no topo.
 *
 * Fontes de dados (alinhadas ao backend):
 *  - Pods: /pods (objeto com readiness.{ready,text} e restartCount). Em tempo
 *    real, o snapshot SSE traz pods resumidos (ready: string, restartCount).
 *  - Deployments: /deployments (replicas.{desired,ready,available}). O snapshot
 *    SSE NAO inclui deployments, entao eles sao atualizados via fetch (botao /
 *    refetch periodico nao necessario aqui — usamos o fetch inicial e o SSE
 *    apenas para os pods).
 */
export default function Health({ streamData, streamStatus }) {
  const [pods, setPods] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    setError(null);
    try {
      const opt = signal ? { signal } : undefined;
      const [podList, depList] = await Promise.all([
        fetchPods(opt),
        fetchDeployments(opt),
      ]);
      setPods(Array.isArray(podList) ? podList : []);
      setDeployments(Array.isArray(depList) ? depList : []);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Atualizacao em tempo real dos pods via snapshot SSE (deployments seguem do fetch).
  useEffect(() => {
    if (streamData && Array.isArray(streamData.pods)) {
      setPods(streamData.pods);
      setLoading(false);
    }
  }, [streamData]);

  const evaluated = useMemo(
    () => pods.map((p) => ({ ...p, _health: podHealth(p) })),
    [pods]
  );

  const summary = useMemo(() => {
    const acc = { ok: 0, warn: 0, err: 0 };
    for (const p of evaluated) acc[p._health] += 1;
    return acc;
  }, [evaluated]);

  if (loading && pods.length === 0 && deployments.length === 0) {
    return <p className="state state--loading">Carregando saude…</p>;
  }

  return (
    <section className="health" aria-label="Saude do cluster">
      {error && (
        <div className="state state--error" role="alert">
          Erro ao carregar saude: {error}
          {streamStatus === 'open' && ' (aguardando proximo frame em tempo real…)'}
        </div>
      )}

      <div className="health-summary">
        <span className="badge badge-ok">{summary.ok} saudaveis</span>
        <span className="badge badge-warn">{summary.warn} atencao</span>
        <span className="badge badge-err">{summary.err} criticos</span>
      </div>

      <h2 className="section-title">Pods</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Saude</th>
              <th>Nome</th>
              <th>Namespace</th>
              <th>Fase</th>
              <th>Ready</th>
              <th className="num">Restarts</th>
            </tr>
          </thead>
          <tbody>
            {evaluated.length === 0 && (
              <tr>
                <td colSpan={6} className="table__empty">
                  Nenhum pod encontrado.
                </td>
              </tr>
            )}
            {evaluated.map((p) => {
              const restarts = asCount(p.restartCount);
              return (
                <tr key={`${p.namespace}/${p.name}`}>
                  <td>
                    <span className={`dot dot--${p._health}`} aria-hidden="true" />
                    <span className="sr-only">{healthLabel(p._health)}</span>
                  </td>
                  <td className="mono">{p.name}</td>
                  <td>{p.namespace}</td>
                  <td>
                    <span className={phaseBadgeClass(p.phase)}>
                      {p.phase || '—'}
                    </span>
                  </td>
                  <td className="mono">{readyText(p)}</td>
                  <td className={`num ${restarts > 0 ? 'warn-text' : ''}`}>
                    {restarts}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Deployments</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Saude</th>
              <th>Nome</th>
              <th>Namespace</th>
              <th className="num">Ready / Desejado</th>
            </tr>
          </thead>
          <tbody>
            {deployments.length === 0 && (
              <tr>
                <td colSpan={4} className="table__empty">
                  Nenhum deployment encontrado.
                </td>
              </tr>
            )}
            {deployments.map((d) => {
              const r = d.replicas || {};
              const ready = asCount(r.ready);
              const desired = asCount(r.desired);
              const health =
                desired === 0
                  ? 'warn'
                  : ready >= desired
                    ? 'ok'
                    : ready > 0
                      ? 'warn'
                      : 'err';
              return (
                <tr key={`${d.namespace}/${d.name}`}>
                  <td>
                    <span className={`dot dot--${health}`} aria-hidden="true" />
                    <span className="sr-only">{healthLabel(health)}</span>
                  </td>
                  <td className="mono">{d.name}</td>
                  <td>{d.namespace}</td>
                  <td className="num mono">
                    {ready} / {desired}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Texto de readiness: objeto readiness.text (/pods) ou ready string (SSE). */
function readyText(p) {
  if (p.readiness && typeof p.readiness.text === 'string') return p.readiness.text;
  if (typeof p.ready === 'string') return p.ready;
  return '—';
}

/** Retorna true quando todos os containers do pod estao prontos. */
function isReady(p) {
  if (p.readiness && typeof p.readiness.ready === 'boolean') {
    return p.readiness.ready;
  }
  // Snapshot SSE: ready vem como "x/y".
  const text =
    (p.readiness && p.readiness.text) ||
    (typeof p.ready === 'string' ? p.ready : '');
  if (text.includes('/')) {
    const [a, b] = text.split('/').map((n) => Number(n));
    return Number.isFinite(a) && Number.isFinite(b) && b > 0 && a >= b;
  }
  return false;
}

/** Classifica a saude do pod em 'ok' | 'warn' | 'err'. */
function podHealth(p) {
  const phase = (p.phase || '').toLowerCase();
  const restarts = asCount(p.restartCount);

  if (phase === 'failed' || phase === 'crashloopbackoff') return 'err';
  if (restarts >= 5) return 'err';
  if (phase === 'succeeded') return 'ok';
  if (phase === 'running' && isReady(p)) return restarts > 0 ? 'warn' : 'ok';
  if (phase === 'pending' || phase === 'containercreating') return 'warn';
  if (phase === 'running' && !isReady(p)) return 'warn';
  return 'err';
}

/** Rotulo acessivel para cada estado de saude. */
function healthLabel(h) {
  if (h === 'ok') return 'Saudavel';
  if (h === 'warn') return 'Atencao';
  return 'Critico';
}
