import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Banner } from '../ui.jsx';
import { Icon } from '../icons.jsx';

export default function Glossario() {
  const [terms, setTerms] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => { api.glossary().then(setTerms).catch((e) => setError(e.message)); }, []);

  const byKey = useMemo(() => {
    const m = {};
    for (const t of terms || []) m[t.id.replace(/^gl_/, '')] = t;
    return m;
  }, [terms]);

  const filtered = useMemo(() => {
    if (!terms) return [];
    if (!q) return terms;
    const n = q.toLowerCase();
    return terms.filter((t) => `${t.term} ${t.definition}`.toLowerCase().includes(n));
  }, [terms, q]);

  return (
    <>
      <div className="help-hero">
        <h1>Glossário</h1>
        <p>Termos do processo BESC — da incorporação e da perícia aos mecanismos de liquidação e à tokenização — explicados de forma objetiva.</p>
      </div>

      <Banner kind="err">{error}</Banner>
      {!terms && !error && <Loading />}

      {terms && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="search" size={15} /></span>
              <input aria-label="Buscar termo no glossário" placeholder="Buscar termo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
              <div className="spacer" style={{ flex: 1 }} />
              <span className="small muted">{filtered.length} termos</span>
            </div>
          </div>

          {filtered.map((t) => (
            <div key={t.id} id={t.id} className="gloss-item">
              <h3>{t.term}</h3>
              <p>{t.definition}</p>
              {(t.seeAlso || []).length > 0 && (
                <div className="gloss-see">
                  <span className="small muted">Veja também:</span>
                  {t.seeAlso.map((k) => byKey[k] ? <a key={k} href={`#gl_${k}`} className="chip">{byKey[k].term}</a> : null)}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
