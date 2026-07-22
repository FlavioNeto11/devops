import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLabel, SkeletonList, Banner, OutcomeBadge, CountBar } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const FACETS = [
  { key: 'tribunal', enumName: 'tribunal', title: 'Tribunal', get: (it) => (it.tribunal ? [it.tribunal] : []) },
  { key: 'creditorCategory', enumName: 'creditor_category', title: 'Natureza do credor', get: (it) => (it.creditorCategory ? [it.creditorCategory] : []) },
  { key: 'mechanism', enumName: 'mechanism', title: 'Mecanismo', get: (it) => it.mechanism || [] },
  { key: 'outcome', enumName: 'outcome', title: 'Resultado', get: (it) => (it.outcome ? [it.outcome] : []) },
  { key: 'instancia', enumName: 'instancia', title: 'Instância', get: (it) => (it.instancia ? [it.instancia] : []) },
];

function passesFacet(it, f, sel) {
  if (!sel || sel.length === 0) return true;
  const vals = f.get(it);
  return vals.some((v) => sel.includes(v));
}
function passesText(it, q) {
  if (!q) return true;
  const hay = `${it.title} ${it.summary || ''} ${it.clientCase || ''} ${it.comarca || ''} ${it.processNumber || ''} ${(it.tags || []).join(' ')}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function JurisprudenciaList() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [params, setParams] = useSearchParams();
  const [groupBy, setGroupBy] = useState(false);
  const label = useLabel();

  useEffect(() => { api.jurisprudence().then(setItems).catch((e) => setError(e.message)); }, []);

  const q = params.get('q') || '';
  const state = useMemo(() => {
    const s = {};
    for (const f of FACETS) s[f.key] = params.getAll(f.key);
    return s;
  }, [params]);

  const setQ = (v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p, { replace: true }); };
  const toggle = (facetKey, value) => {
    const p = new URLSearchParams(params);
    const cur = p.getAll(facetKey);
    p.delete(facetKey);
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    next.forEach((v) => p.append(facetKey, v));
    setParams(p, { replace: true });
  };
  const clearAll = () => { const p = new URLSearchParams(); if (q) p.set('q', q); setParams(p, { replace: true }); };

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => passesText(it, q) && FACETS.every((f) => passesFacet(it, f, state[f.key])));
  }, [items, q, state]);

  // contagens contextuais: para cada faceta, aplica todas as OUTRAS facetas + busca
  const counts = useMemo(() => {
    const out = {};
    if (!items) return out;
    for (const f of FACETS) {
      const base = items.filter((it) => passesText(it, q) && FACETS.every((g) => g.key === f.key || passesFacet(it, g, state[g.key])));
      const c = {};
      for (const it of base) for (const v of f.get(it)) c[v] = (c[v] || 0) + 1;
      out[f.key] = c;
    }
    return out;
  }, [items, q, state]);

  const facetOptions = useMemo(() => {
    const out = {};
    if (!items) return out;
    for (const f of FACETS) {
      const set = new Set();
      for (const it of items) for (const v of f.get(it)) set.add(v);
      out[f.key] = [...set].sort((a, b) => (counts[f.key] && counts[f.key][b] || 0) - (counts[f.key] && counts[f.key][a] || 0) || label(f.enumName, a).localeCompare(label(f.enumName, b), 'pt-BR'));
    }
    return out;
  }, [items, counts]);

  const anyActive = q || FACETS.some((f) => state[f.key].length > 0);

  // mapa de contagem por categoria (dos resultados atuais)
  const byCat = useMemo(() => {
    const c = {};
    for (const it of filtered) if (it.creditorCategory) c[it.creditorCategory] = (c[it.creditorCategory] || 0) + 1;
    return c;
  }, [filtered]);
  const maxCat = Math.max(1, ...Object.values(byCat));

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const g = {};
    for (const it of filtered) (g[it.creditorCategory || 'outros'] = g[it.creditorCategory || 'outros'] || []).push(it);
    return g;
  }, [filtered, groupBy]);

  const Card = (it) => (
    <Link key={it.id} to={`/jurisprudencia/${it.id}`} className="result-card">
      <div className="rc-title">{it.title}</div>
      <div className="chip-row">
        {it.tribunal && it.tribunal !== 'outro' && <span className="chip chip-blue">{label('tribunal', it.tribunal)}</span>}
        <span className="chip chip-accent">{label('creditor_category', it.creditorCategory)}</span>
        {(it.mechanism || []).map((m) => <span key={m} className="chip">{label('mechanism', m)}</span>)}
        <OutcomeBadge value={it.outcome} />
      </div>
      {it.summary && <div className="rc-summary">{it.summary.slice(0, 220)}{it.summary.length > 220 ? '…' : ''}</div>}
      <div className="rc-meta">
        {[it.clientCase, it.comarca, it.uf, it.year, it.processNumber && `proc. ${it.processNumber}`].filter(Boolean).join(' · ')}
      </div>
    </Link>
  );

  return (
    <>
      <div className="pgtitle between">
        <h1>Jurisprudência</h1>
        {items && <span className="small muted">{filtered.length} de {items.length} decisões</span>}
      </div>

      <Banner kind="err">{error}</Banner>
      {!items && !error && <SkeletonList count={6} lines={3} />}

      {items && (
        <div className="facet-layout">
          <aside className="facet-rail">
            <div className="field" style={{ marginBottom: 14 }}>
              <input aria-label="Buscar no acervo de jurisprudência" placeholder="Buscar no acervo…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {FACETS.map((f) => (
              (facetOptions[f.key] || []).length > 0 && (
                <fieldset key={f.key} className="facet-group">
                  <legend>{f.title}</legend>
                  {facetOptions[f.key].map((v) => (
                    <label key={v} className="facet-opt">
                      <input type="checkbox" checked={state[f.key].includes(v)} onChange={() => toggle(f.key, v)} />
                      <span className="facet-lbl">{label(f.enumName, v)}</span>
                      <span className="facet-count">{(counts[f.key] && counts[f.key][v]) || 0}</span>
                    </label>
                  ))}
                </fieldset>
              )
            ))}
            {anyActive && <button className="btn ghost sm" onClick={clearAll}><Icon name="filter" size={13} /> Limpar filtros</button>}
          </aside>

          <div className="facet-results">
            {Object.keys(byCat).length > 1 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3>Mapa dos resultados</h3><div className="spacer" style={{ flex: 1 }} /><label className="row small" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={groupBy} onChange={(e) => setGroupBy(e.target.checked)} style={{ width: 'auto' }} /> Agrupar por categoria</label></div>
                <div className="card-body">
                  {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <CountBar key={k} label={label('creditor_category', k)} count={v} max={maxCat} />)}
                </div>
              </div>
            )}

            {filtered.length === 0 && <div className="card"><div className="empty"><h3>Nenhuma decisão encontrada</h3><p className="muted">Ajuste os filtros ou a busca.</p></div></div>}

            {!groups && filtered.map(Card)}
            {groups && Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([cat, list]) => (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div className="section-title">{label('creditor_category', cat)} · {list.length}</div>
                {list.map(Card)}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
