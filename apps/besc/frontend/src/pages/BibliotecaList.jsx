import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta, useLabel, useEnum, SkeletonList, Banner, formatBytes } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const KIND_ICON = { fundamento: 'shield', historia: 'clock', base_legal: 'scale', custos: 'coins', modelo: 'file', comunicado_bacen: 'landmark', laudo: 'report', video: 'video', outro: 'file' };

export default function BibliotecaList() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const label = useLabel();
  const kinds = useEnum('library_kind');

  useEffect(() => { api.library().then(setItems).catch((e) => setError(e.message)); }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => {
      if (kind && it.kind !== kind) return false;
      if (q) {
        const hay = `${it.title} ${it.summary || ''} ${(it.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, q, kind]);

  const grouped = useMemo(() => {
    const g = {};
    for (const it of filtered) (g[it.kind] = g[it.kind] || []).push(it);
    return g;
  }, [filtered]);

  return (
    <>
      <div className="pgtitle"><h1>Biblioteca institucional</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: '74ch' }}>
        Documentos que explicam o que são as ações do BESC, como se deu a incorporação pelo Banco do
        Brasil, a base legal, os custos e os materiais de apoio.
      </p>

      <Banner kind="err">{error}</Banner>
      {!items && !error && <SkeletonList count={6} />}

      {items && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}><Icon name="search" size={15} /></span>
            <input placeholder="Buscar na biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 240 }}>
              <option value="">Todos os tipos</option>
              {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="small muted">{filtered.length} de {items.length}</span>
          </div>
        </div>
      )}

      {items && filtered.length === 0 && <div className="card"><div className="empty"><h3>Nada encontrado</h3><p className="muted">Ajuste a busca ou o filtro de tipo.</p></div></div>}

      {Object.keys(kinds).filter((k) => grouped[k]).map((k) => (
        <div key={k} style={{ marginBottom: 22 }}>
          <div className="section-title"><Icon name={KIND_ICON[k] || 'file'} size={13} /> {label('library_kind', k)} <span className="muted">· {grouped[k].length}</span></div>
          <div className="grid2">
            {grouped[k].map((it) => (
              <Link key={it.id} to={`/biblioteca/${it.id}`} className="card" style={{ display: 'block' }}>
                <div className="card-body">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="chip chip-accent"><Icon name={KIND_ICON[k] || 'file'} size={12} /> {label('library_kind', it.kind)}</span>
                    {it.fileRef && <span className="small muted">{it.fileRef.mime && it.fileRef.mime.startsWith('video') ? 'vídeo' : (it.fileRef.ext || '').replace('.', '').toUpperCase()} · {formatBytes(it.fileRef.sizeBytes)}</span>}
                  </div>
                  <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: 4 }}>{it.title}</div>
                  {it.summary && <div className="small muted" style={{ lineHeight: 1.5 }}>{it.summary.slice(0, 160)}{it.summary.length > 160 ? '…' : ''}</div>}
                  {it.needsOcr && <div className="small" style={{ color: 'var(--amber)', marginTop: 6 }}>documento digitalizado</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
