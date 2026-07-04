import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeta } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const TABS = [
  { key: 'mecanismos', label: 'Mecanismos', icon: 'layers' },
  { key: 'conversao', label: 'Relações de substituição', icon: 'coins' },
  { key: 'base_legal', label: 'Base legal', icon: 'scale' },
  { key: 'historia', label: 'Histórico', icon: 'clock' },
  { key: 'custas', label: 'Custas de cartório', icon: 'coins' },
  { key: 'jurisprudencia', label: 'Padrão jurisprudencial', icon: 'gavel' },
];

export default function Referencia() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('mecanismos');
  const ref = (meta && meta.reference) || {};

  return (
    <>
      <div className="pgtitle"><h1>Referência</h1></div>
      <div className="detail-layout">
        <nav className="tab-rail">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </nav>

        <div className="detail-content">
          {tab === 'mecanismos' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 12 }}>Mecanismos de liquidação com ações BESC</h2>
              {(ref.mechanisms || []).map((m) => (
                <div key={m.key} className="checklist-item">
                  <div style={{ fontWeight: 650, color: 'var(--accent-ink)', marginBottom: 3 }}>{m.title}</div>
                  <div className="small muted" style={{ lineHeight: 1.55 }}>{m.when}</div>
                </div>
              ))}
            </div></div>
          )}

          {tab === 'conversao' && ref.shareConversion && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 4 }}>Relações de substituição (conversão)</h2>
              <p className="muted" style={{ marginBottom: 12 }}>{ref.shareConversion.summary}</p>
              <table className="data">
                <thead><tr><th>Equivale a</th><th>Ações do BESC / BESCRI</th></tr></thead>
                <tbody>
                  {ref.shareConversion.ratios.map((r, i) => (
                    <tr key={i}><td>{r.from}</td><td style={{ fontWeight: 600 }}>{r.to}</td></tr>
                  ))}
                </tbody>
              </table>
              <ul style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {ref.shareConversion.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <div className="banner warn" style={{ fontSize: 12.5, marginTop: 8 }}>{ref.shareConversion.disclaimer}</div>
            </div></div>
          )}

          {tab === 'base_legal' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 12 }}>Base legal invocada</h2>
              {(ref.legalBasis || []).map((b) => (
                <div key={b.key} className="checklist-item">
                  <div style={{ fontWeight: 650, color: 'var(--accent-ink)', marginBottom: 3 }}>{b.title}</div>
                  <div className="small muted" style={{ lineHeight: 1.55 }}>{b.text}</div>
                </div>
              ))}
            </div></div>
          )}

          {tab === 'historia' && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 16 }}>Histórico da incorporação</h2>
              <div className="timeline">
                {(ref.historyTimeline || []).map((h, i) => (
                  <div key={i} className="tl-item">
                    <div className="tl-date">{h.date}</div>
                    <div className="tl-title">{h.title}</div>
                    <div className="tl-text">{h.text}</div>
                  </div>
                ))}
              </div>
            </div></div>
          )}

          {tab === 'custas' && ref.notaryFees && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 4 }}>{ref.notaryFees.title}</h2>
              <p className="small muted" style={{ marginBottom: 4 }}>{ref.notaryFees.source}</p>
              <div className="banner warn" style={{ fontSize: 12.5 }}>{ref.notaryFees.disclaimer}</div>
              <p className="small"><strong>UFESP 2024:</strong> {ref.notaryFees.parameters.ufesp_2024} · <strong>ISS:</strong> {ref.notaryFees.parameters.iss} · <strong>UF:</strong> {ref.notaryFees.parameters.jurisdiction}</p>
              <table className="data" style={{ marginTop: 12 }}>
                <thead><tr><th>Faixa</th><th>De (R$)</th><th>Até (R$)</th><th style={{ textAlign: 'right' }}>Total (R$)</th></tr></thead>
                <tbody>
                  {(ref.notaryFees.registro_declarado || []).map((r) => (
                    <tr key={r.faixa}><td>{r.faixa}</td><td>{r.de}</td><td>{r.ate}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{r.total}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted" style={{ marginTop: 10 }}>{ref.notaryFees.note}</p>
            </div></div>
          )}

          {tab === 'jurisprudencia' && ref.jurisprudencePattern && (
            <div className="card"><div className="card-body">
              <h2 style={{ fontSize: 17, marginBottom: 6 }}>Padrão jurisprudencial</h2>
              <p className="muted" style={{ marginBottom: 14 }}>{ref.jurisprudencePattern.summary}</p>
              {(ref.jurisprudencePattern.stages || []).map((s, i) => (
                <div key={i} className="step">
                  <div className="step-n">{i + 1}</div>
                  <div className="step-body"><h4>{s.instance}</h4><p>{s.note}</p></div>
                </div>
              ))}
              <div className="banner info" style={{ fontSize: 12.5, marginTop: 8 }}>{ref.jurisprudencePattern.disclaimer}</div>
              <Link to="/jurisprudencia" className="btn sm ghost" style={{ marginTop: 10 }}><Icon name="gavel" size={13} /> Explorar o acervo</Link>
            </div></div>
          )}
        </div>
      </div>
    </>
  );
}
