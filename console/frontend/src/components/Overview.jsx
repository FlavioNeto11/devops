import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEvents, fetchOverview, fetchPods } from '../api.js';
import { ageFrom, phaseBadgeClass, shortImage, asCount } from '../format.js';
import { CardSkeleton, TableSkeleton } from './Skeleton.jsx';

/** Máximo de eventos exibidos no painel "Eventos recentes". */
const EVENTS_LIMIT = 15;

/**
 * Overview
 * --------
 * Cards com contagens (namespaces, pods por fase, deployments, services,
 * ingressroutes) + tabela de pods.
 *
 * Fontes de dados (alinhadas ao backend real):
 *  - /overview retorna SOMENTE { generatedAt, counts } — sem array de pods.
 *    counts = { namespaces, pods (numero), podsByPhase, deployments, services,
 *    ingressroutes }.
 *  - A tabela de pods vem de /pods no fetch inicial e, em tempo real, do campo
 *    `pods` do snapshot SSE (resumo: name, namespace, phase, ready(string),
 *    restartCount, node, age).
 *
 * O App entrega `streamData` = snapshot SSE completo
 * { generatedAt, overview, pods, events }.
 */
export default function Overview({ streamData, streamStatus }) {
  const [counts, setCounts] = useState(null);
  const [pods, setPods] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [podFilter, setPodFilter] = useState('');

  // Fetch inicial: overview (contagens) + pods (tabela) + eventos, em paralelo.
  const load = useCallback(async (signal) => {
    setError(null);
    try {
      const opt = signal ? { signal } : undefined;
      const [ov, podList, evts] = await Promise.all([
        fetchOverview(opt),
        fetchPods(opt),
        // Eventos degradam graciosamente: falha aqui não derruba o overview inteiro
        // (o snapshot SSE repõe a lista no próximo frame).
        fetchEvents(opt).catch(() => []),
      ]);
      setCounts(ov?.counts || null);
      setPods(Array.isArray(podList) ? podList : []);
      setEvents(Array.isArray(evts) ? evts : []);
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

  // Atualizacao em tempo real a partir do snapshot SSE (que já traz `events`).
  useEffect(() => {
    if (!streamData) return;
    if (streamData.overview?.counts) setCounts(streamData.overview.counts);
    if (Array.isArray(streamData.pods)) setPods(streamData.pods);
    if (Array.isArray(streamData.events)) setEvents(streamData.events);
    setLoading(false);
  }, [streamData]);

  const byPhase = counts?.podsByPhase || {};

  if (loading && !counts) {
    return (
      <section className="overview" aria-label="Visão geral do cluster">
        <CardSkeleton count={8} />
        <h2 className="section-title">Pods</h2>
        <TableSkeleton rows={6} cols={7} />
        <h2 className="section-title">Eventos recentes</h2>
        <TableSkeleton rows={4} cols={5} />
      </section>
    );
  }

  const visiblePods = pods.filter((p) => !podFilter
    || `${p.name} ${p.namespace}`.toLowerCase().includes(podFilter.toLowerCase()));

  return (
    <section className="overview" aria-label="Visão geral do cluster">
      {error && (
        <div className="state state--error" role="alert">
          Erro ao carregar overview: {error}
          {streamStatus === 'open' && ' (aguardando proximo frame em tempo real…)'}
          <button type="button" className="btn" style={{ marginLeft: 12 }} onClick={() => load()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="cards">
        <Card label="Namespaces" value={asCount(counts?.namespaces)} />
        <Card label="Pods (total)" value={asCount(counts?.pods)} />
        <Card label="Pods Running" value={asCount(byPhase.Running)} tone="ok" />
        <Card
          label="Pods Pending"
          value={asCount(byPhase.Pending)}
          tone={asCount(byPhase.Pending) > 0 ? 'warn' : 'muted'}
        />
        <Card
          label="Pods Failed"
          value={asCount(byPhase.Failed)}
          tone={asCount(byPhase.Failed) > 0 ? 'err' : 'muted'}
        />
        <Card label="Deployments" value={asCount(counts?.deployments)} />
        <Card label="Services" value={asCount(counts?.services)} />
        <Card label="IngressRoutes" value={asCount(counts?.ingressroutes)} />
      </div>

      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        Pods
        <input className="input" style={{ width: 220, fontWeight: 400 }} placeholder="Filtrar por nome ou namespace…"
          value={podFilter} onChange={(e) => setPodFilter(e.target.value)} aria-label="Filtrar pods" />
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Namespace</th>
              <th>Status</th>
              <th>Ready</th>
              <th className="num">Restarts</th>
              <th>Imagem</th>
              <th className="num">Idade</th>
            </tr>
          </thead>
          <tbody>
            {!error && pods.length === 0 && (
              <tr>
                <td colSpan={7} className="table__empty">
                  Nenhum pod encontrado.
                </td>
              </tr>
            )}
            {pods.length > 0 && visiblePods.length === 0 && (
              <tr>
                <td colSpan={7} className="table__empty">
                  Nenhum resultado para "{podFilter}".{' '}
                  <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => setPodFilter('')}>
                    Limpar filtro
                  </button>
                </td>
              </tr>
            )}
            {visiblePods.map((p) => {
              const ready = readyText(p);
              const restarts = asCount(p.restartCount);
              return (
                <tr key={`${p.namespace}/${p.name}`}>
                  <td className="mono">{p.name}</td>
                  <td>{p.namespace}</td>
                  <td>
                    <span className={phaseBadgeClass(p.phase)}>
                      {p.phase || '—'}
                    </span>
                  </td>
                  <td className="mono">{ready}</td>
                  <td className={`num ${restarts > 0 ? 'warn-text' : ''}`}>
                    {restarts}
                  </td>
                  <td className="mono" title={p.image || ''}>
                    {shortImage(p.image)}
                  </td>
                  <td className="num">{p.age || ageFrom(p.startTime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Eventos recentes do cluster: fetch inicial (/events) + campo `events` do
          snapshot SSE que o App já entrega — nenhuma mudança no backend. */}
      <h2 className="section-title">Eventos recentes</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Motivo</th>
              <th>Objeto</th>
              <th>Mensagem</th>
              <th className="num">Idade</th>
            </tr>
          </thead>
          <tbody>
            {!error && events.length === 0 && (
              <tr>
                <td colSpan={5} className="table__empty">
                  Nenhum evento recente.
                </td>
              </tr>
            )}
            {events.slice(0, EVENTS_LIMIT).map((e, idx) => (
              <tr key={`${e.namespace || ''}/${e.name || idx}`}>
                <td>
                  <span className={e.type === 'Warning' ? 'badge badge-err' : 'badge badge-muted'}>
                    {e.type || '—'}
                  </span>
                </td>
                <td className="mono">
                  {e.reason || '—'}
                  {asCount(e.count) > 1 && <span className="muted"> ×{e.count}</span>}
                </td>
                <td className="mono" title={e.involvedObject?.namespace || e.namespace || ''}>
                  {e.involvedObject
                    ? `${e.involvedObject.kind || '?'}/${e.involvedObject.name || '?'}`
                    : '—'}
                </td>
                <td>{e.message || '—'}</td>
                <td className="num">{e.timestamp ? ageFrom(e.timestamp) : (e.age || '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Normaliza o campo de readiness do pod. No fetch /pods vem como objeto
 * `readiness.text` ("1/1"); no snapshot SSE vem achatado como `ready` (string).
 */
function readyText(p) {
  if (p.readiness && typeof p.readiness.text === 'string') return p.readiness.text;
  if (typeof p.ready === 'string') return p.ready;
  return '—';
}

/** Card de contagem reutilizavel. */
function Card({ label, value, tone }) {
  return (
    <div className={`card ${tone ? `card--${tone}` : ''}`}>
      <span className="card__value">{value}</span>
      <span className="card__label">{label}</span>
    </div>
  );
}
