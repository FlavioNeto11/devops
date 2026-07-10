import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

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
    const e = (meta && meta.enums && meta.enums[enumName]) || (meta && meta.contentEnums && meta.contentEnums[enumName]);
    return (e && e[value]) || value || '—';
  };
}

// Mapa {valor: rotulo} de um enum (enums ou contentEnums) — p/ facetas/filtros.
export function useEnum(enumName) {
  const { meta } = useMeta();
  return (meta && meta.enums && meta.enums[enumName]) || (meta && meta.contentEnums && meta.contentEnums[enumName]) || {};
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

// ---- marketplace (títulos): estado jurídico, listing e disponibilidade ----
// Rótulos e cores fixos (espelham api/src/marketplace/states.js) — favorável/reativado = verde,
// negado/derrotado = vermelho, recurso = âmbar, não julgado/arquivado = cinza.
export const LEGAL_STATUS_LABEL = {
  unjudged: 'Não julgado', ruled_favorable: 'Julgado favorável', ruled_against: 'Julgado desfavorável',
  under_appeal: 'Em recurso', reinstated: 'Reativado', defeated: 'Definitivamente negado', archived: 'Arquivado',
};
const LEGAL_STATUS_CLASS = {
  unjudged: 'b-grey', ruled_favorable: 'b-green', reinstated: 'b-green',
  ruled_against: 'b-red', defeated: 'b-red', under_appeal: 'b-amber', archived: 'b-grey',
};
export function LegalStatusBadge({ status }) {
  return <span className={`badge ${LEGAL_STATUS_CLASS[status] || 'b-grey'}`}>{LEGAL_STATUS_LABEL[status] || status || '—'}</span>;
}

export const LISTING_LABEL = { draft: 'Rascunho', listed: 'Publicado', delisted: 'Despublicado' };
const LISTING_CLASS = { draft: 'b-grey', listed: 'b-green', delisted: 'b-amber' };
export function ListingBadge({ status }) {
  return <span className={`badge ${LISTING_CLASS[status] || 'b-grey'}`}>{LISTING_LABEL[status] || status || '—'}</span>;
}

export function AvailableBadge({ available }) {
  return <span className={`badge ${available ? 'b-green' : 'b-grey'}`}>{available ? 'Disponível' : 'Indisponível'}</span>;
}

// Dinheiro a partir de um NÚMERO (ou string numérica "1234.56", como o Postgres devolve NUMERIC).
// Diferente de formatMoney(), que faz parse heurístico de texto pt-BR livre (campos do case).
export function formatBRL(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
      <div className="hc-icon" aria-hidden="true"><Icon name="info" size={18} /></div>
      <div>
        {title && <strong>{title}</strong>}
        <div className="hc-body">{children}</div>
      </div>
    </div>
  );
}

export function EnumSelect({ enumName, value, onChange, allowEmpty }) {
  const { meta } = useMeta();
  const opts = (meta && meta.enums && meta.enums[enumName]) || (meta && meta.contentEnums && meta.contentEnums[enumName]) || {};
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

export function formatBytes(n) {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function Banner({ kind = 'err', children }) {
  if (!children) return null;
  return <div className={`banner ${kind}`}>{children}</div>;
}

export function Loading({ label = 'Carregando…' }) {
  return <div className="center-load"><span className="spinner" /> {label}</div>;
}

// Skeletons de carregamento (percepção de performance; sem layout shift)
export function SkeletonList({ count = 6, lines = 2 }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-card">
          <div className="skel skel-title" />
          {Array.from({ length: lines }).map((_, j) => (
            <div key={j} className="skel skel-line" style={{ width: j === lines - 1 ? '70%' : '100%' }} />
          ))}
        </div>
      ))}
    </div>
  );
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

// ---- Markdown CSP-safe (sem deps, sem dangerouslySetInnerHTML) ----
function mdInline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0]; const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      if (mm) out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>);
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null;
  const flush = (key) => {
    if (!list) return;
    const L = list;
    blocks.push(L.ordered
      ? <ol key={key}>{L.items.map((it, i) => <li key={i}>{mdInline(it, key + i)}</li>)}</ol>
      : <ul key={key}>{L.items.map((it, i) => <li key={i}>{mdInline(it, key + i)}</li>)}</ul>);
    list = null;
  };
  lines.forEach((raw, idx) => {
    const key = 'b' + idx;
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) { flush(key + 'l'); const T = ['h2', 'h3', 'h4'][h[1].length - 1]; blocks.push(React.createElement(T, { key }, mdInline(h[2], key))); }
    else if (ol) { if (!list || !list.ordered) { flush(key + 'l'); list = { ordered: true, items: [] }; } list.items.push(ol[1]); }
    else if (ul) { if (!list || list.ordered) { flush(key + 'l'); list = { ordered: false, items: [] }; } list.items.push(ul[1]); }
    else if (line.trim() === '') flush(key + 'l');
    else if (/^(---|\*\*\*)$/.test(line.trim())) { flush(key + 'l'); blocks.push(<hr key={key} />); }
    else { flush(key + 'l'); blocks.push(<p key={key}>{mdInline(line, key)}</p>); }
  });
  flush('bend');
  return <div className="md-body">{blocks}</div>;
}

// ---- Chips e badges de conteudo ----
export function Chip({ enumName, value, tone = 'neutral' }) {
  const label = useLabel();
  return <span className={`chip chip-${tone}`}>{enumName ? label(enumName, value) : value}</span>;
}

const OUTCOME_CLASS = { favoravel: 'b-green', parcial: 'b-amber', desfavoravel: 'b-red', indefinido: 'b-grey' };
export function OutcomeBadge({ value }) {
  const label = useLabel();
  return <span className={`badge ${OUTCOME_CLASS[value] || 'b-grey'}`}>{label('outcome', value)}</span>;
}

// ---- Faceta multi-selecao (fieldset/checkbox, teclado/SR nativos) ----
export function FacetGroup({ title, enumName, options, selected, onToggle, counts }) {
  const label = useLabel();
  const opts = options || Object.keys(useEnumMap(enumName));
  const sel = new Set(selected || []);
  return (
    <fieldset className="facet-group">
      <legend>{title}</legend>
      {opts.map((v) => {
        const c = counts ? (counts[v] || 0) : null;
        return (
          <label key={v} className="facet-opt">
            <input type="checkbox" checked={sel.has(v)} onChange={() => onToggle(v)} />
            <span className="facet-lbl">{enumName ? label(enumName, v) : v}</span>
            {c != null && <span className="facet-count">{c}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
function useEnumMap(name) { return useEnum(name); }

// ---- Visualizador de arquivo (mesma origem: pdf/video inline, docx download) ----
export function FileViewer({ url, mime, title, downloadLabel = 'Baixar / abrir' }) {
  const isVideo = (mime || '').startsWith('video/');
  const isPdf = (mime || '').includes('pdf');
  return (
    <div className="viewer-wrap">
      {isVideo && <video className="viewer-frame" controls src={url} title={title || 'Vídeo'} />}
      {isPdf && <iframe className="viewer-frame" src={url} title={title || 'Documento'} />}
      {!isVideo && !isPdf && (
        <div className="viewer-fallback">
          <p className="muted">Pré-visualização não disponível para este formato.</p>
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <a className="btn sm" href={url} target="_blank" rel="noreferrer">{downloadLabel}</a>
      </div>
    </div>
  );
}

// ---- Barra de contagem (mapa de facetas na home / resultados) ----
export function CountBar({ label, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="count-bar">
      <span className="cb-label">{label}</span>
      <div className="cb-track"><span style={{ width: `${pct}%` }} /></div>
      <span className="cb-count">{count}</span>
    </div>
  );
}
