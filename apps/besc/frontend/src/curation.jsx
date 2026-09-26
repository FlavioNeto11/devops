// Curadoria editorial (ADR-010): UNKNOWN ≠ PUBLIC. Só quem tem content:write vê conteúdo restrito
// e só por aqui ele é publicado — com natureza, motivo e, para material de terceiro, autorização.
// A API é a autoridade: valida tudo de novo e recusa com 422.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Banner, Field, friendly } from './ui.jsx';

export function PublicationBadge({ publication }) {
  return publication === 'PUBLIC_SAFE'
    ? <span className="badge b-green">Público</span>
    : <span className="badge b-amber">Restrito à curadoria</span>;
}

const NEEDS_AUTH = new Set(['COMMERCIAL_MATERIAL', 'CONSULTANCY', 'PRIVATE_APPRAISAL', 'PETITION']);

export function CurationPanel({ item, kind, onSaved }) {
  const [natures, setNatures] = useState({});
  const [f, setF] = useState({
    sourceNature: (item.curation && item.curation.sourceNature) || item.sourceNature || (item.assessment && item.assessment.sourceNature) || 'UNKNOWN',
    publication: item.publication || 'RESTRICTED', reason: '', authorizationRef: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.recovery.meta().then((m) => setNatures(m.sourceNatures || {})).catch(() => {}); }, []);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const body = { ...f, authorizationRef: f.authorizationRef || null };
      const saved = kind === 'library' ? await api.libraryCurate(item.id, body) : await api.jurisprudenceCurate(item.id, body);
      onSaved && onSaved(saved);
    } catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };
  const unknown = f.sourceNature === 'UNKNOWN';
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h3>Curadoria</h3><div className="spacer" style={{ flex: 1 }} /><PublicationBadge publication={item.publication} /></div>
      <div className="card-body">
        <p className="small muted">Conteúdo de natureza desconhecida nunca é público. Petição, laudo ou material de terceiro só é publicado com referência de autorização.</p>
        {err && <Banner>{err}</Banner>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Natureza da fonte">
              <select value={f.sourceNature} onChange={set('sourceNature')}>
                {Object.entries(natures).filter(([k]) => k !== 'FINAL_COURT_DECISION').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Publicação">
              <select value={f.publication} onChange={set('publication')}>
                <option value="RESTRICTED">Restrito à curadoria</option>
                <option value="PUBLIC_SAFE" disabled={unknown}>Público (PUBLIC_SAFE)</option>
              </select>
            </Field>
            <Field label="Motivo (mín. 10 caracteres)"><input value={f.reason} onChange={set('reason')} required minLength={10} /></Field>
            {NEEDS_AUTH.has(f.sourceNature) && f.publication === 'PUBLIC_SAFE' && (
              <Field label="Referência da autorização"><input value={f.authorizationRef} onChange={set('authorizationRef')} required /></Field>
            )}
          </div>
          <button className="btn sm primary" disabled={busy || (unknown && f.publication === 'PUBLIC_SAFE')}>{busy ? 'Salvando…' : 'Registrar curadoria'}</button>
        </form>
      </div>
    </div>
  );
}
