import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNamespaces, fetchPods, fetchLogs } from '../api.js';
import { ageFrom, phaseBadgeClass } from '../format.js';

/**
 * Logs — visualizador rico
 * ------------------------
 * Dois paineis:
 *  - Esquerda: pods AGRUPADOS POR APP (label app.kubernetes.io/part-of), com
 *    ponto de saude (fase/readiness), readiness "x/y", restarts e idade. Clicavel.
 *  - Direita: visualizador com toolbar (namespace, tail, busca, auto-refresh, wrap,
 *    baixar, limpar) e realce de nivel (ERROR/WARN), timestamp esmaecido, realce
 *    do termo buscado, auto-scroll e contador de linhas.
 *
 * Somente leitura: usa os GET /namespaces, /pods e /pods/:ns/:name/logs do backend.
 */

const TAIL_OPTIONS = [100, 200, 500, 1000];
const PART_OF = 'app.kubernetes.io/part-of';

const RE_ERR = /\b(error|err|fatal|panic|exception|fail(?:ed|ure)?)\b/i;
const RE_WARN = /\b(warn(?:ing)?|deprecat)/i;
// Timestamp inicial (ISO completo ou HH:MM:SS), opcionalmente entre colchetes.
const RE_TS = /^(\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[^\s\]]*\]?|\[?\d{2}:\d{2}:\d{2}[^\s\]]*\]?)\s+/;

export default function Logs() {
  const [namespaces, setNamespaces] = useState([]);
  const [pods, setPods] = useState([]);
  const [ns, setNs] = useState(''); // filtro de namespace ('' = todos)
  const [selected, setSelected] = useState(null); // { ns, name }

  const [tail, setTail] = useState(200);
  const [search, setSearch] = useState('');
  const [filterOnly, setFilterOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalSec, setIntervalSec] = useState(5);
  const [wrap, setWrap] = useState(true);

  const [logText, setLogText] = useState('');
  const [error, setError] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const boxRef = useRef(null);

  // ---- Metadados (namespaces + pods) ----
  const loadMeta = useCallback(async (silent) => {
    if (!silent) setLoadingMeta(true);
    try {
      const [nsRes, podRes] = await Promise.all([fetchNamespaces(), fetchPods()]);
      setNamespaces(normalizeNamespaces(nsRes));
      setPods(normalizePods(podRes));
    } catch (err) {
      if (!silent) setError(err.message || String(err));
    } finally {
      if (!silent) setLoadingMeta(false);
    }
  }, []);

  useEffect(() => { loadMeta(false); }, [loadMeta]);

  // ---- Logs do pod selecionado ----
  const loadLogs = useCallback(async (silent) => {
    if (!selected) return;
    if (!silent) setLoadingLogs(true);
    try {
      const res = await fetchLogs(selected.ns, selected.name, tail);
      setLogText(extractLogText(res));
      setLastUpdated(Date.now());
      setNowTick(Date.now());
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      if (!silent) setLoadingLogs(false);
    }
  }, [selected, tail]);

  // Recarrega ao trocar de pod ou tail.
  useEffect(() => { if (selected) loadLogs(false); else setLogText(''); }, [selected, tail, loadLogs]);

  // Auto-refresh (polling) — logs + metadados de forma silenciosa.
  useEffect(() => {
    if (!autoRefresh || !selected) return undefined;
    const id = setInterval(() => { loadLogs(true); loadMeta(true); }, Math.max(2, intervalSec) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, selected, intervalSec, loadLogs, loadMeta]);

  // Ticker de 1s para o "atualizado há Xs".
  useEffect(() => {
    if (!lastUpdated) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Auto-scroll ao final quando o texto muda.
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logText]);

  // Pods filtrados por namespace e agrupados por app.
  const groups = useMemo(() => {
    const list = ns ? pods.filter((p) => p.namespace === ns) : pods;
    const map = new Map();
    for (const p of list) {
      const key = (p.labels && p.labels[PART_OF]) || p.namespace || 'outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()]
      .map(([app, items]) => [app, items.sort((a, b) => a.name.localeCompare(b.name))])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [pods, ns]);

  // Linhas a exibir (com filtro opcional por busca).
  const allLines = useMemo(() => (logText ? logText.split('\n') : []), [logText]);
  const visibleLines = useMemo(() => {
    if (filterOnly && search) {
      const t = search.toLowerCase();
      return allLines.filter((l) => l.toLowerCase().includes(t));
    }
    return allLines;
  }, [allLines, filterOnly, search]);

  const secondsAgo = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated) / 1000)) : null;

  const download = () => {
    if (!logText || !selected) return;
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.name}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="logs" aria-label="Logs de pods">
      {/* Toolbar de opções */}
      <div className="toolbar logs2__opts">
        <label className="field">
          <span className="field__label">Namespace</span>
          <select className="select" value={ns} onChange={(e) => setNs(e.target.value)} disabled={loadingMeta}>
            <option value="">todos</option>
            {namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Linhas (tail)</span>
          <select className="select" value={tail} onChange={(e) => setTail(Number(e.target.value))}>
            {TAIL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field field--grow">
          <span className="field__label">Buscar / filtrar</span>
          <input className="input" placeholder="termo para realçar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={filterOnly} onChange={(e) => setFilterOnly(e.target.checked)} /> só correspondências
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> auto-refresh
        </label>
        {autoRefresh && (
          <label className="field">
            <span className="field__label">Intervalo</span>
            <select className="select" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))}>
              {[3, 5, 10, 30].map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          </label>
        )}
        <label className="check-inline">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> quebrar linha
        </label>
      </div>

      {error && <div className="state state--error" role="alert">Erro: {error}</div>}

      <div className="logs2">
        {/* Painel esquerdo: pods por app */}
        <div className="logs2__list" aria-label="Pods agrupados por aplicação">
          {loadingMeta && <p className="muted" style={{ margin: 4 }}>Carregando pods…</p>}
          {!loadingMeta && !groups.length && <p className="muted" style={{ margin: 4 }}>Nenhum pod encontrado.</p>}
          {groups.map(([app, items]) => (
            <div key={app}>
              <div className="logs2__group-label">{app}</div>
              {items.map((p) => {
                const active = selected && selected.ns === p.namespace && selected.name === p.name;
                return (
                  <button
                    key={p.namespace + '/' + p.name}
                    className={'logs2__pod' + (active ? ' logs2__pod--active' : '')}
                    onClick={() => setSelected({ ns: p.namespace, name: p.name })}
                    title={`${p.namespace}/${p.name}`}
                  >
                    <span className="logs2__pod-name">
                      <span className={'dot ' + phaseDot(p)} />
                      {p.name}
                    </span>
                    <span className="logs2__pod-meta">
                      <span>{p.namespace}</span>
                      {p.readiness && p.readiness.text && <span>ready {p.readiness.text}</span>}
                      {p.restartCount ? <span className="warn-text">↻ {p.restartCount}</span> : null}
                      <span>{ageFrom(p.startTime)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Painel direito: visualizador */}
        <div className="logs2__viewer">
          {!selected ? (
            <p className="state state--empty">Selecione um pod à esquerda para ver os logs (últimas {tail} linhas).</p>
          ) : (
            <>
              <div className="logs2__viewer-head">
                <div>
                  <strong className="mono">{selected.name}</strong>{' '}
                  <span className="muted">· {selected.ns}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="logs2__count">
                    {filterOnly && search ? `${visibleLines.length} de ${allLines.length} linhas` : `${allLines.length} linhas`}
                  </span>
                  {secondsAgo != null && <span className="logs2__count">atualizado há {secondsAgo}s</span>}
                  <button className="btn" onClick={() => loadLogs(false)} disabled={loadingLogs}>
                    {loadingLogs ? 'Carregando…' : '↻ Atualizar'}
                  </button>
                  <button className="btn" onClick={download} disabled={!logText} title="baixar como .log">Baixar</button>
                  <button className="btn" onClick={() => setLogText('')} disabled={!logText} title="limpar visualização">Limpar</button>
                </div>
              </div>

              <div ref={boxRef} className={'logbox logbox--lines' + (wrap ? ' logbox--wrap' : '')} aria-label={`Logs de ${selected.name}`}>
                {visibleLines.length === 0 ? (
                  <span className="logline muted">{loadingLogs ? '' : '(sem logs para exibir)'}</span>
                ) : (
                  visibleLines.map((line, idx) => {
                    const lvl = classify(line);
                    const m = RE_TS.exec(line);
                    const ts = m ? m[0] : '';
                    const rest = m ? line.slice(m[0].length) : line;
                    return (
                      <span key={idx} className={'logline' + (lvl ? ' logline--' + lvl : '')}>
                        {ts && <span className="logline__ts">{ts}</span>}
                        {highlight(rest, search, idx)}
                      </span>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
// Helpers de apresentacao
// --------------------------------------------------------------------------

/** Classe de nivel da linha (realce). */
function classify(line) {
  if (RE_ERR.test(line)) return 'err';
  if (RE_WARN.test(line)) return 'warn';
  return '';
}

/** Ponto de saude do pod: combina fase + readiness. */
function phaseDot(pod) {
  const ready = pod.readiness && pod.readiness.ready;
  const phase = (pod.phase || '').toLowerCase();
  if (phase === 'running' && ready === false) return 'dot--warn';
  const cls = phaseBadgeClass(pod.phase);
  if (cls.includes('badge-ok')) return 'dot--ok';
  if (cls.includes('badge-err')) return 'dot--err';
  if (cls.includes('badge-warn')) return 'dot--warn';
  return 'dot--warn';
}

/** Quebra o texto realçando ocorrencias do termo buscado (case-insensitive). */
function highlight(text, term, keyBase) {
  if (!term) return text;
  const low = text.toLowerCase();
  const t = term.toLowerCase();
  const parts = [];
  let from = 0;
  let i;
  let k = 0;
  while ((i = low.indexOf(t, from)) !== -1) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(<mark key={`${keyBase}-${k++}`}>{text.slice(i, i + t.length)}</mark>);
    from = i + t.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts.length ? parts : text;
}

// --------------------------------------------------------------------------
// Normalizadores das respostas do backend
// --------------------------------------------------------------------------

/** Aceita lista de strings, lista de objetos {name|metadata.name} ou {items}. */
function normalizeNamespaces(res) {
  const arr = Array.isArray(res) ? res : res?.namespaces || res?.items || [];
  return arr
    .map((n) => (typeof n === 'string' ? n : n.name || n?.metadata?.name))
    .filter(Boolean);
}

/** Normaliza pods preservando metadados ricos (labels/phase/readiness/restarts/idade). */
function normalizePods(res) {
  const arr = Array.isArray(res) ? res : res?.pods || res?.items || [];
  return arr
    .map((p) => ({
      name: p.name || p?.metadata?.name,
      namespace: p.namespace || p?.metadata?.namespace,
      phase: p.phase || p?.status?.phase || 'Unknown',
      restartCount: p.restartCount || 0,
      startTime: p.startTime || p?.status?.startTime || p?.metadata?.creationTimestamp || null,
      readiness: p.readiness || null,
      labels: p.labels || p?.metadata?.labels || {},
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
