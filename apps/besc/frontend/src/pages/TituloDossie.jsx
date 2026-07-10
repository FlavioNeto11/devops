import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Banner, Loading, Markdown, useLabel,
  LegalStatusBadge, AvailableBadge, RiskBadge, formatBRL,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';
import { useInvestorMode, DemoWatermark } from '../investor.jsx';

function fmtDate(s) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('pt-BR');
}

// precedente pode vir como id (string/number) ou como objeto {id,title}
function precedentId(p) { return (p && typeof p === 'object') ? p.id : p; }
function precedentLabel(p) {
  if (p && typeof p === 'object') return p.title || p.label || p.id;
  return `Decisão ${p}`;
}

export default function TituloDossie() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const label = useLabel();
  const { user, hasPerm } = useAuth();
  const mode = useInvestorMode();

  useEffect(() => {
    setD(null); setError(null);
    api.investor.dossier(id).then(setD).catch((e) => setError(e.message));
  }, [id]);

  const demo = (!mode.loading && !mode.goLive) || !!(d && d.demonstration);
  const canContract = hasPerm('contracts:contract');
  const param = d && d.active_parameter;
  const val = d && d.latest_valuation;
  const timeline = (d && d.legal_timeline) || [];
  const precedents = (d && d.linked_precedents) || [];

  return (
    <>
      <DemoWatermark show={demo} />
      <div className="crumbs"><Link to="/marketplace">Investir</Link> › {d ? d.label : '…'}</div>
      <Banner kind="err">{error}</Banner>
      {!d && !error && <Loading label="Carregando dossiê…" />}

      {d && (
        <div className="detail-aside-layout">
          <div className="detail-content">
            <div className="case-summary">
              <div className="cs-top">
                <div className="cs-title">
                  <h1>{d.label}</h1>
                  <div className="cs-sub">{label('share_class', d.share_class)}</div>
                </div>
                <div className="cs-actions"><AvailableBadge available={d.available} /></div>
              </div>
              <div className="chip-row" style={{ marginTop: 12 }}>
                <LegalStatusBadge status={d.legal_status} />
                {d.risk_level && <RiskBadge level={d.risk_level} />}
              </div>
              <div className="cs-metrics">
                <div className="cs-metric"><span className="m-k">Quantidade de ações</span><span className="m-v">{d.share_quantity != null ? Number(d.share_quantity).toLocaleString('pt-BR') : '—'}</span></div>
                {param && <div className="cs-metric"><span className="m-k">Fator (tokens por ação)</span><span className="m-v">{param.tokens_per_share != null ? Number(param.tokens_per_share).toLocaleString('pt-BR') : '—'}</span></div>}
                {param && <div className="cs-metric"><span className="m-k">Valor unitário (face)</span><span className="m-v">{formatBRL(param.unit_face_value)}</span></div>}
                {val && <div className="cs-metric"><span className="m-k">Última avaliação</span><span className="m-v">{formatBRL(val.value_per_share)}</span></div>}
              </div>
            </div>

            {/* Parâmetro ativo de tokenização */}
            {param ? (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3><Icon name="layers" size={15} /> Parâmetro de tokenização</h3></div>
                <div className="card-body">
                  <div className="cs-metrics" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                    <div className="cs-metric"><span className="m-k">Tokens por ação</span><span className="m-v">{Number(param.tokens_per_share).toLocaleString('pt-BR')}</span></div>
                    <div className="cs-metric"><span className="m-k">Valor unitário de face</span><span className="m-v">{formatBRL(param.unit_face_value)}</span></div>
                    <div className="cs-metric"><span className="m-k">Moeda</span><span className="m-v">{param.currency || 'BRL'}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <Banner kind="info">Este título ainda não tem parâmetro de tokenização ativo.</Banner>
            )}

            {/* Última avaliação */}
            {val && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3><Icon name="coins" size={15} /> Última avaliação de mercado</h3></div>
                <div className="card-body">
                  <div className="cs-metrics" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                    <div className="cs-metric"><span className="m-k">Valor por ação</span><span className="m-v">{formatBRL(val.value_per_share)}</span></div>
                    <div className="cs-metric"><span className="m-k">Data-base</span><span className="m-v">{fmtDate(val.valuation_date)}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Linha do tempo jurídica */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3><Icon name="landmark" size={15} /> Linha do tempo jurídica</h3></div>
              <div className="card-body">
                {timeline.length === 0
                  ? <p className="muted">Sem eventos jurídicos registrados.</p>
                  : (
                    <div className="timeline">
                      {timeline.map((ev, i) => (
                        <div key={i} className="tl-item">
                          <div className="tl-date">{fmtDate(ev.occurred_at)}</div>
                          <div className="tl-title"><LegalStatusBadge status={ev.to_status} /></div>
                          {ev.reason && <div className="tl-text">{ev.reason}</div>}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Precedentes vinculados */}
            {precedents.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3><Icon name="gavel" size={15} /> Jurisprudência vinculada</h3></div>
                <div className="card-body">
                  {precedents.map((p, i) => (
                    <Link key={i} to={`/jurisprudencia/${precedentId(p)}`} className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{precedentLabel(p)}</span>
                      <Icon name="chevronRight" size={14} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="help-callout" style={{ marginTop: 16 }}>
              <div className="hc-icon" aria-hidden="true">⚖️</div>
              <div><div className="hc-body">
                Projeção curada a partir do levantamento. <strong>Requer validação jurídica</strong> — não constitui
                oferta, recomendação de investimento nem parecer.
              </div></div>
            </div>
          </div>

          <aside>
            {/* Painel de contratação: só para investidor logado E título disponível */}
            {canContract && d.available && (
              <ContractPanel titleId={d.id} unitFaceValue={param && param.unit_face_value} demo={demo} />
            )}
            {canContract && !d.available && (
              <div className="card"><div className="card-body">
                <h3 style={{ fontSize: 14, marginBottom: 6 }}><Icon name="lock" size={14} /> Indisponível</h3>
                <p className="small muted">Este título não está disponível para contratação no momento (depende do estado jurídico e da publicação).</p>
              </div></div>
            )}
            {!user && (
              <div className="card"><div className="card-body">
                <h3 style={{ fontSize: 14, marginBottom: 6 }}><Icon name="login" size={14} /> Contratar tokens</h3>
                <p className="small muted" style={{ marginBottom: 12 }}>Entre com sua conta de investidor para contratar tokens deste título.</p>
                <Link className="btn primary sm" to={`/entrar?next=${encodeURIComponent(`/marketplace/titulos/${d.id}`)}`}>
                  <Icon name="login" size={13} /> Entrar
                </Link>
              </div></div>
            )}
            {user && !canContract && (
              <div className="card"><div className="card-body">
                <h3 style={{ fontSize: 14, marginBottom: 6 }}>Conta não habilitada</h3>
                <p className="small muted">Sua conta ainda não está habilitada a contratar tokens. Se você acredita que deveria estar, fale com o gestor da plataforma.</p>
              </div></div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

// Painel "Contratar tokens": quantidade → total = qty × valor de face (travado na contratação).
// Aceite de termos inline quando a API responde 409 com termsId.
function ContractPanel({ titleId, unitFaceValue, demo }) {
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);        // contrato criado
  const [terms, setTerms] = useState(null);      // {id,title,body,requiredId} quando 409
  const [accepted, setAccepted] = useState(false);

  const quantity = Math.floor(Number(qty)) || 0;
  const total = useMemo(() => {
    const unit = Number(unitFaceValue);
    if (!quantity || Number.isNaN(unit)) return null;
    return quantity * unit;
  }, [quantity, unitFaceValue]);

  const runContract = async () => {
    const c = await api.investor.contract(titleId, { quantity });
    setDone(c);
    setTerms(null);
  };

  const submit = async () => {
    if (quantity < 1) { setError('Informe uma quantidade de pelo menos 1 token.'); return; }
    setBusy(true); setError(null);
    try {
      await runContract();
    } catch (e) {
      if (e.status === 409 && e.termsId) {
        // precisa aceitar os termos antes — busca o documento para exibir inline
        try {
          const t = await api.investor.terms('investor_terms');
          setTerms({ ...(t || {}), requiredId: e.termsId });
          setAccepted(false);
        } catch (te) {
          setError(`É preciso aceitar os termos, mas não foi possível carregá-los: ${te.message}`);
        }
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptAndContract = async () => {
    if (!accepted) return;
    setBusy(true); setError(null);
    try {
      await api.investor.acceptTerms((terms && terms.requiredId) || (terms && terms.id));
      await runContract();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card"><div className="card-body">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}><Icon name="check" size={15} /> Contrato registrado</h3>
        <p className="small" style={{ marginBottom: 10 }}>
          Sua contratação de <strong>{quantity.toLocaleString('pt-BR')}</strong> token(s) foi registrada
          {done.contract_number ? <> sob o número <strong>{done.contract_number}</strong></> : null}.
          O valor de face ficou <strong>travado</strong> nesta contratação.
        </p>
        {demo && <p className="small muted">Registro de demonstração — sem efeito financeiro real.</p>}
        <Link className="btn sm" to="/investidor/carteira" style={{ marginTop: 8 }}>Ver na minha carteira <Icon name="chevronRight" size={13} /></Link>
      </div></div>
    );
  }

  return (
    <div className="card"><div className="card-body">
      <h3 style={{ fontSize: 14, marginBottom: 10 }}><Icon name="coins" size={15} /> Contratar tokens</h3>

      {!terms && (
        <>
          <label className="field">
            <span className="lbl">Quantidade de tokens</span>
            <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ex.: 100" />
          </label>

          <div className="cs-metrics" style={{ marginTop: 12, paddingTop: 12 }}>
            <div className="cs-metric"><span className="m-k">Valor unitário (face)</span><span className="m-v">{formatBRL(unitFaceValue)}</span></div>
            <div className="cs-metric"><span className="m-k">Total</span><span className="m-v">{total != null ? formatBRL(total) : '—'}</span></div>
          </div>

          <p className="small muted" style={{ margin: '12px 0' }}>
            <Icon name="lock" size={12} /> O <strong>valor de face fica travado</strong> no momento da contratação:
            eventos jurídicos posteriores não alteram o valor congelado no seu contrato.
          </p>

          <Banner kind="err">{error}</Banner>

          <button className="btn primary sm" disabled={busy || quantity < 1} onClick={submit} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Contratar {quantity > 0 ? `${quantity.toLocaleString('pt-BR')} token(s)` : ''}
          </button>
        </>
      )}

      {terms && (
        <div className="stack" style={{ gap: 12 }}>
          <Banner kind="info">Para concluir, leia e aceite os termos do investidor{terms.version ? ` (versão ${terms.version})` : ''}.</Banner>
          {terms.title && <strong style={{ fontSize: 13 }}>{terms.title}</strong>}
          {terms.body && (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--surface-2)' }}>
              <Markdown text={terms.body} />
            </div>
          )}
          <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span className="small">Li e aceito os termos do investidor.</span>
          </label>
          <Banner kind="err">{error}</Banner>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary sm" disabled={busy || !accepted} onClick={acceptAndContract}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Aceitar e contratar
            </button>
            <button className="btn sm" disabled={busy} onClick={() => { setTerms(null); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div></div>
  );
}
