import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLabel, Loading, Banner, Markdown, FileViewer, OutcomeBadge, formatBytes } from '../ui.jsx';
import { Icon } from '../icons.jsx';

export default function JurisprudenciaDetail() {
  const { id } = useParams();
  const [it, setIt] = useState(null);
  const [error, setError] = useState(null);
  const [related, setRelated] = useState([]);
  const label = useLabel();

  useEffect(() => {
    setIt(null); setError(null);
    api.jurisprudenceGet(id).then((d) => {
      setIt(d);
      api.jurisprudence({ creditorCategory: d.creditorCategory }).then((list) => setRelated(list.filter((x) => x.id !== d.id).slice(0, 8))).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [id]);

  return (
    <>
      <div className="crumbs"><Link to="/jurisprudencia">Jurisprudência</Link> › {it ? it.title : '…'}</div>
      <Banner kind="err">{error}</Banner>
      {!it && !error && <Loading />}

      {it && (
        <div className="detail-aside-layout">
          <div className="detail-content">
            <div className="case-summary">
              <div className="cs-top">
                <div className="cs-title">
                  <h1>{it.title}</h1>
                  <div className="cs-sub">{[it.clientCase, it.comarca, it.uf].filter(Boolean).join(' · ') || label('creditor_category', it.creditorCategory)}</div>
                </div>
                <div className="cs-actions"><OutcomeBadge value={it.outcome} /></div>
              </div>
              <div className="chip-row" style={{ marginTop: 12 }}>
                {it.tribunal && it.tribunal !== 'outro' && <span className="chip chip-blue">{label('tribunal', it.tribunal)}</span>}
                <span className="chip chip-accent">{label('creditor_category', it.creditorCategory)}</span>
                {(it.mechanism || []).map((m) => <span key={m} className="chip">{label('mechanism', m)}</span>)}
              </div>
              <div className="cs-metrics">
                <div className="cs-metric"><span className="m-k">Instância</span><span className="m-v">{label('instancia', it.instancia)}</span></div>
                <div className="cs-metric"><span className="m-k">Ano</span><span className="m-v">{it.year || '—'}</span></div>
                <div className="cs-metric"><span className="m-k">UF</span><span className="m-v">{it.uf || '—'}</span></div>
                <div className="cs-metric"><span className="m-k">Nº do processo</span><span className="m-v" style={{ fontSize: 13 }}>{it.processNumber || '—'}</span></div>
              </div>
            </div>

            {(it.ementa || it.summary) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3>Ementa / resumo</h3></div>
                <div className="card-body"><Markdown text={it.ementa || it.summary} /></div>
              </div>
            )}

            {it.fileRef && it.fileRef.stored ? (
              <div className="card">
                <div className="card-head"><h3>Inteiro teor</h3><div className="spacer" style={{ flex: 1 }} /><span className="small muted">PDF · {formatBytes(it.fileRef.sizeBytes)}</span></div>
                <div className="card-body"><FileViewer url={api.jurisprudenceFileUrl(it.id)} mime={it.fileRef.mime || 'application/pdf'} title={it.title} downloadLabel="Baixar PDF" /></div>
              </div>
            ) : (
              <Banner kind="warn">O PDF desta decisão ainda não foi carregado no portal.</Banner>
            )}

            <div className="help-callout" style={{ marginTop: 16 }}>
              <div className="hc-icon" aria-hidden="true">⚖️</div>
              <div><div className="hc-body">Resumo organizacional a partir do inteiro teor. <strong>Requer validação jurídica</strong> — não constitui parecer nem recomendação.</div></div>
            </div>
          </div>

          <aside>
            <div className="card">
              <div className="card-head"><h3>Decisões relacionadas</h3></div>
              <div className="card-body">
                {related.length === 0 && <p className="small muted">—</p>}
                {related.map((r) => (
                  <Link key={r.id} to={`/jurisprudencia/${r.id}`} style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="small muted">{label('tribunal', r.tribunal)} · {r.year || '—'}</div>
                  </Link>
                ))}
                <Link to={`/jurisprudencia?creditorCategory=${it.creditorCategory}`} className="btn sm ghost" style={{ marginTop: 12 }}><Icon name="filter" size={13} /> Ver todas de {label('creditor_category', it.creditorCategory)}</Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
