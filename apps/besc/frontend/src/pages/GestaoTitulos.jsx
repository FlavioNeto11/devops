import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Banner, Loading, SkeletonList, HelpCallout, useLabel,
  LegalStatusBadge, ListingBadge, AvailableBadge, formatBRL,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';

const ELIGIBLE_CASE_STATUS = ['ready_for_structuring', 'ready_with_caveats'];

// Capacidade total de tokens do título = nº de ações × fator (tokens/ação) da versão ativa.
// O quanto já foi emitido vive no detalhe (aba Emissões) — a lista de títulos não traz esse total.
function totalSupply(t) {
  const factor = Number(t.active_tokens_per_share);
  const shares = Number(t.share_quantity);
  if (!factor || Number.isNaN(factor) || Number.isNaN(shares)) return null;
  return shares * factor;
}

export default function GestaoTitulos() {
  const [titles, setTitles] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();
  const label = useLabel();
  const [params] = useSearchParams();
  const preCase = params.get('novo'); // deep-link do CaseDetail: preabre o painel com o caso

  const load = () => { setError(null); api.mkt.titles().then(setTitles).catch((e) => setError(e.message)); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (preCase) setShowNew(true); }, [preCase]);

  return (
    <>
      <div className="crumbs"><Link to="/casos">Casos</Link> / Gestão de títulos</div>
      <div className="pgtitle between">
        <h1><Icon name="coins" size={22} /> Gestão de títulos</h1>
        {!showNew && <button className="btn primary" onClick={() => setShowNew(true)}><Icon name="plus" /> Novo título</button>}
      </div>

      <HelpCallout title="Títulos do marketplace (fase off-chain)">
        Um <strong>título</strong> é o ativo do marketplace, originado de um caso do levantamento que já esteja
        <strong> apto</strong>. A partir dele você registra o <strong>valor de mercado</strong>, define os
        <strong> parâmetros de tokenização</strong> (fator ação→tokens e valor unitário), emite lotes, publica no
        catálogo e administra o <strong>estado jurídico</strong>. Nada é executado em blockchain — é uma simulação
        auditável.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      {showNew && <NewTitlePanel preCase={preCase} onClose={() => setShowNew(false)} onCreated={(t) => navigate(`/gestao/titulos/${t.id}`)} />}

      {!titles && !error && <SkeletonList count={5} lines={2} />}

      {titles && titles.length === 0 && (
        <div className="card"><div className="empty">
          <h3>Nenhum título cadastrado</h3>
          <p className="muted">Crie o primeiro título a partir de um caso apto para estruturação.</p>
          {!showNew && <div className="row" style={{ marginTop: 8, justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => setShowNew(true)}>+ Criar primeiro título</button>
          </div>}
        </div></div>
      )}

      {titles && titles.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Títulos ({titles.length})</h3></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Título</th><th>Classe</th><th>Estado jurídico</th><th>Publicação</th>
                  <th>Disponível</th><th>Valor unitário ativo</th><th>Supply total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {titles.map((t) => {
                  const total = totalSupply(t);
                  return (
                    <tr
                      key={t.id}
                      className="clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/gestao/titulos/${t.id}`)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/gestao/titulos/${t.id}`); }
                      }}
                    >
                      <td><div style={{ fontWeight: 600 }}>{t.label}</div></td>
                      <td>{label('share_class', t.share_class)}</td>
                      <td><LegalStatusBadge status={t.legal_status} /></td>
                      <td><ListingBadge status={t.listing_status} /></td>
                      <td><AvailableBadge available={t.available} /></td>
                      <td>{formatBRL(t.active_unit_value)}</td>
                      <td>{total != null ? total.toLocaleString('pt-BR') : <span className="muted small">sem parâmetro ativo</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link className="btn sm" to={`/gestao/titulos/${t.id}`} onClick={(e) => e.stopPropagation()}>Abrir</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// Painel "Novo título": seletor de caso elegível + label + override (só p/ ready_with_caveats).
function NewTitlePanel({ preCase, onClose, onCreated }) {
  const [cases, setCases] = useState(null);
  const [titles, setTitles] = useState(null);
  const [caseId, setCaseId] = useState(preCase || '');
  const [label, setLabel] = useState('');
  const [override, setOverride] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lbl = useLabel();

  useEffect(() => {
    Promise.all([api.list().catch(() => []), api.mkt.titles().catch(() => [])])
      .then(([cs, ts]) => { setCases(cs); setTitles(ts); });
  }, []);

  // casos elegíveis (apto / apto com ressalvas) que ainda NÃO originaram título
  const eligible = useMemo(() => {
    if (!cases) return [];
    const used = new Set((titles || []).map((t) => t.case_id));
    return cases.filter((c) => ELIGIBLE_CASE_STATUS.includes(c.status) && !used.has(c.id));
  }, [cases, titles]);

  const selected = eligible.find((c) => c.id === caseId) || null;
  const withCaveats = selected && selected.status === 'ready_with_caveats';

  // ao trocar o caso, some com override se o caso não for "com ressalvas"
  useEffect(() => { if (!withCaveats) setOverride(false); }, [withCaveats]);

  const submit = async () => {
    if (!caseId) { setError('Selecione um caso elegível.'); return; }
    setBusy(true); setError(null);
    try {
      const t = await api.mkt.createTitle({ caseId, label: label.trim() || undefined, override });
      onCreated(t);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head"><h3>Novo título do marketplace</h3><div className="spacer" style={{ flex: 1 }} /><button className="btn sm" onClick={onClose}>Fechar</button></div>
      <div className="card-body stack">
        <Banner kind="err">{error}</Banner>
        {!cases && <Loading label="Carregando casos elegíveis…" />}
        {cases && eligible.length === 0 && (
          <Banner kind="info">
            Nenhum caso elegível disponível. Só casos <strong>aptos para estruturação</strong> (ou
            <strong> aptos com ressalvas</strong>) que ainda não viraram título podem originar um novo título.
          </Banner>
        )}
        {cases && eligible.length > 0 && (
          <>
            <label className="field">
              <span className="lbl">Caso de origem</span>
              <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">— selecione um caso elegível —</option>
                {eligible.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.holder_name || '(sem titular)')} · {lbl('case_status', c.status)}
                  </option>
                ))}
              </select>
              <span className="hint">Apenas casos aptos aparecem aqui.</span>
            </label>

            <label className="field">
              <span className="lbl">Nome do título (opcional)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={selected ? (selected.holder_name || 'Título') : 'Ex.: Ações PNB — Espólio Silva'} />
              <span className="hint">Se vazio, usa o nome do titular do caso.</span>
            </label>

            {withCaveats && (
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={override} onChange={(e) => setOverride(e.target.checked)} />
                <span>
                  <strong>Aceitar as ressalvas</strong> e originar o título mesmo assim. O caso está
                  <em> apto com ressalvas</em> — a criação exige esta confirmação do Gestor (fica registrada no
                  <em> snapshot de elegibilidade</em>).
                </span>
              </label>
            )}

            <div className="row">
              <button className="btn primary" disabled={busy || !caseId || (withCaveats && !override)} onClick={submit}>
                {busy ? <span className="spinner" /> : <Icon name="plus" size={14} />} Criar título
              </button>
              <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
