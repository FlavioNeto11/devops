// Nova reivindicação (F2): reclamante + reivindicação. A origem é BESC; outras origens ficam
// bloqueadas no backend enquanto o multi_issuer_research_gate estiver CLOSED.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, Field, HelpCallout, friendly } from '../ui.jsx';
import { CLAIM_KIND_LABEL, PERSON_TYPE_LABEL } from '../recovery-ui.jsx';

export default function RecuperacaoNova() {
  const navigate = useNavigate();
  const [f, setF] = useState({ personType: 'PF', displayName: '', claimKind: 'UNKNOWN', claimedSecurityClass: '', claimedQuantityWritten: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const claimant = await api.recovery.createClaimant({ personType: f.personType, displayName: f.displayName });
      const claim = await api.recovery.createClaim({
        claimantId: claimant.id, claimKind: f.claimKind, assetOriginId: 'BESC',
        claimedSecurityClass: f.claimedSecurityClass || null, claimedQuantityWritten: f.claimedQuantityWritten || null,
      });
      navigate(`/recuperacao/${claim.id}`);
    } catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="crumbs"><Link to="/recuperacao">Reivindicações</Link> / Nova</div>
      <div className="pgtitle"><h1>Nova reivindicação</h1></div>
      <form onSubmit={submit} className="card"><div className="card-body">
        <HelpCallout title="O que acontece aqui">
          A reivindicação nasce como <strong>POSSÍVEL DIREITO</strong>. A classe e a quantidade informadas são o que está
          escrito nos documentos, não uma posição confirmada. Depois de criar, envie as evidências.
        </HelpCallout>
        {err && <Banner>{err}</Banner>}
        <div className="form-grid">
          <Field label="Tipo de pessoa">
            <select value={f.personType} onChange={set('personType')}>
              {Object.entries(PERSON_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Nome do reclamante" hint="Dado pessoal: fica fora da trilha de auditoria.">
            <input value={f.displayName} onChange={set('displayName')} required />
          </Field>
          <Field label="Tipo de reivindicação">
            <select value={f.claimKind} onChange={set('claimKind')}>
              {Object.entries(CLAIM_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Origem">
            <input value="BESC (Banco do Estado de Santa Catarina)" disabled />
          </Field>
          <Field label="Classe escrita no documento" hint="Ex.: ON, PNA, PNB. Opcional.">
            <input value={f.claimedSecurityClass} onChange={set('claimedSecurityClass')} />
          </Field>
          <Field label="Quantidade escrita no documento" hint="Como aparece no papel; não é posição atual.">
            <input value={f.claimedQuantityWritten} onChange={set('claimedQuantityWritten')} />
          </Field>
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy || !f.displayName.trim()}>{busy ? 'Criando…' : 'Criar reivindicação'}</button>
          <Link className="btn" to="/recuperacao">Cancelar</Link>
        </div>
      </div></form>
    </>
  );
}
