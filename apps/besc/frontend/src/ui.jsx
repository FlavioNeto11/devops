import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

// ---- meta (enums + catalogos) ----
const MetaCtx = createContext(null);

export function MetaProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null });
  useEffect(() => {
    let alive = true;
    api.meta()
      .then((meta) => alive && setState({ loading: false, error: null, meta }))
      .catch((e) => alive && setState({ loading: false, error: e.message, meta: null }));
    return () => { alive = false; };
  }, []);
  return <MetaCtx.Provider value={state}>{children}</MetaCtx.Provider>;
}

export function useMeta() {
  return useContext(MetaCtx);
}

export function useLabel() {
  const { meta } = useMeta();
  return (enumName, value) => {
    const e = meta && meta.enums && meta.enums[enumName];
    return (e && e[value]) || value || '—';
  };
}

// ---- badges ----
const STATUS_CLASS = {
  new: 'b-grey', docs_incomplete: 'b-amber', legal_review: 'b-blue',
  awaiting_calculation: 'b-blue', awaiting_opinion: 'b-blue',
  ready_for_structuring: 'b-green', ready_with_caveats: 'b-teal',
  not_eligible: 'b-red', archived: 'b-grey',
};
const RISK_CLASS = { low: 'b-green', medium: 'b-amber', high: 'b-red', undetermined: 'b-grey' };

export function StatusBadge({ status }) {
  const label = useLabel();
  return <span className={`badge ${STATUS_CLASS[status] || 'b-grey'}`}>{label('case_status', status)}</span>;
}

export function RiskBadge({ level }) {
  const label = useLabel();
  return <span className={`badge ${RISK_CLASS[level] || 'b-grey'}`}>Risco {label('legal_risk', level).toLowerCase()}</span>;
}

export function Progress({ pct }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <div className="progress" style={{ flex: 1 }}><span style={{ width: `${pct || 0}%` }} /></div>
      <span className="small muted" style={{ minWidth: 34, textAlign: 'right' }}>{pct || 0}%</span>
    </div>
  );
}

// ---- form controls ----
export function Field({ label, hint, help, example, children }) {
  const [open, setOpen] = useState(false);
  const hasHelp = !!(help || example);
  return (
    <label className="field">
      {label && (
        <span className="lbl">
          {label}
          {hasHelp && (
            <button
              type="button"
              className="help-toggle"
              aria-label="Ajuda sobre este campo"
              title="Ajuda"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
            >?</button>
          )}
        </span>
      )}
      {children}
      {open && hasHelp && (
        <span className="help-pop">
          {help}
          {example && <>{help ? <br /> : null}<strong>Exemplo:</strong> {example}</>}
        </span>
      )}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

// Bloco de ajuda contextual (topo de aba/tela): explica a etapa e dá exemplos.
export function HelpCallout({ title, children }) {
  return (
    <div className="help-callout">
      <div className="hc-icon" aria-hidden="true">💡</div>
      <div>
        {title && <strong>{title}</strong>}
        <div className="hc-body">{children}</div>
      </div>
    </div>
  );
}

export function EnumSelect({ enumName, value, onChange, allowEmpty }) {
  const { meta } = useMeta();
  const opts = (meta && meta.enums && meta.enums[enumName]) || {};
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">—</option>}
      {Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

// ---- helpers ----
export function formatMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Banner({ kind = 'err', children }) {
  if (!children) return null;
  return <div className={`banner ${kind}`}>{children}</div>;
}

export function Loading({ label = 'Carregando…' }) {
  return <div className="center-load"><span className="spinner" /> {label}</div>;
}

export function ConfirmButton({ onConfirm, label, confirmLabel = 'Confirmar?', className = 'btn danger sm' }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => { if (armed) { onConfirm(); setArmed(false); } else { setArmed(true); setTimeout(() => setArmed(false), 3000); } }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
