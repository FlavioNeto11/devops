// Referência (ADR-010): fatos da plataforma, cada um com fonte, e — separadas, com aviso e
// contraponto — as afirmações de terceiros que o portal antigo servia como fato.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeta } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const TABS = [
  { key: 'historia', label: 'Histórico (fatos)', icon: 'clock' },
  { key: 'conversao', label: 'Relações de substituição', icon: 'coins' },
  { key: 'base_legal', label: 'Base legal', icon: 'scale' },
  { key: 'terceiros', label: 'Afirmações de terceiros', icon: 'alert' },
];

function Verification({ item }) {
  const fact = item.verification === 'PLATFORM_VERIFIED_FACT';
  return (
    <div className="small muted" style={{ marginTop: 3 }}>
      <span className={`badge ${fact ? 'b-green' : 'b-amber'}`}>{fact ? 'Fato com fonte' : 'Alegação de fonte'}</span>
      {' '}{item.sourceRef || item.attributedTo}
      {item.warning && <div className="assess">{item.warning}</div>}
    </div>
  );
}

function ClaimBlock({ c }) {
  return (
    <div className="checklist-item">
      <div style={{ fontWeight: 650, marginBottom: 3 }}>{c.title}</div>
      <div className="small" style={{ lineHeight: 1.55 }}><em>“{c.text}”</em></div>
      <div className="small muted">Atribuído a: {c.attributedTo} · {c.natureLabel}</div>
      <div className="small" style={{ lineHeight: 1.55, marginTop: 6 }}><strong>Contraponto:</strong> {c.rebuttal}</div>
    </div>
  );
}

export default function Referencia() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('historia');
  const ref = (meta && meta.reference) || {};
  const tpc = ref.thirdPartyClaims || {};

  return (
    <>
      <div className="pgtitle"><h1>Referência</h1></div>
      <div className="detail-layout">
        <nav className="tab-rail">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} aria-current={tab === t.key ? 'true' : undefined} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </nav>

        <div className="detail-content">
          {tab === 'historia' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 16 }}>O que aconteceu com o BESC</h2>
              <div className="timeline">
                {(ref.historyTimeline || []).map((h) => (
                  <div key={h.id} className="tl-item">
                    <div className="tl-date">{h.date}</div>
                    <div className="tl-title">{h.title}</div>
                    <div className="tl-text">{h.text}</div>
                    <Verification item={h} />
                  </div>
                ))}
              </div>
            </div></div>
          )}

          {tab === 'conversao' && ref.shareConversion && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 4 }}>Relações de substituição</h2>
              <p className="muted" style={{ marginBottom: 12 }}>{ref.shareConversion.summary}</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Equivale a</th><th>Ações das companhias incorporadas</th></tr></thead>
                  <tbody>
                    {ref.shareConversion.ratios.map((r, i) => (
                      <tr key={i}><td>{r.from}</td><td style={{ fontWeight: 600 }}>{r.to}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {ref.shareConversion.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <p className="small muted">Fonte: {ref.shareConversion.sourceRef}</p>
              <div className="banner warn" style={{ fontSize: 12.5, marginTop: 8 }}>{ref.shareConversion.disclaimer}</div>
            </div></div>
          )}

          {tab === 'base_legal' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 12 }}>Base legal</h2>
              {(ref.legalBasis || []).map((b) => (
                <div key={b.key} className="checklist-item">
                  <div style={{ fontWeight: 650, color: 'var(--accent-ink)', marginBottom: 3 }}>{b.title}</div>
                  <div className="small muted" style={{ lineHeight: 1.55 }}>{b.text}</div>
                </div>
              ))}
            </div></div>
          )}

          {tab === 'terceiros' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 6 }}>Afirmações de terceiros</h2>
              <div className="banner warn" style={{ fontSize: 12.5 }}>{tpc.warning}</div>
              <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Material comercial</h3>
              {(tpc.valueProposition || []).map((c) => <ClaimBlock key={c.id} c={c} />)}
              <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Mecanismos alegados em petições</h3>
              {(tpc.mechanisms || []).map((c) => <ClaimBlock key={c.id} c={c} />)}
              <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Teses jurídicas de parte</h3>
              {(tpc.legalTheses || []).map((c) => <ClaimBlock key={c.id} c={c} />)}
              {tpc.jurisprudencePattern && (
                <>
                  <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>“Padrão jurisprudencial”</h3>
                  <ClaimBlock c={{ ...tpc.jurisprudencePattern, title: 'Evolução por instância' }} />
                </>
              )}
              <Link to="/jurisprudencia" className="btn sm ghost" style={{ marginTop: 10 }}><Icon name="gavel" size={13} /> Ver a reavaliação do acervo</Link>
            </div></div>
          )}
        </div>
      </div>
    </>
  );
}
