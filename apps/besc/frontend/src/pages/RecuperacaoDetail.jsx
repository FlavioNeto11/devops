// Detalhe da reivindicação (F2, ADR-010): jornada em três estágios, evidências legadas
// (upload, hash, classificação), valores alegados e histórico de estados.
// O frontend não decide nada: a API recusa o que a fase não permite (F3–F5 = não disponível).
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, Field, Loading, formatBytes, friendly } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';
import {
  STAGES, StageBadge, CLAIM_STATE_LABEL, CLAIM_KIND_LABEL, EVIDENCE_STATE_LABEL, JOURNEY_STATUS, VALUE_TYPE_LABEL, PERSON_TYPE_LABEL,
} from '../recovery-ui.jsx';

function Journey({ steps }) {
  return STAGES.map((s) => {
    const mine = steps.filter((x) => x.stage === s.key);
    if (!mine.length) return null;
    return (
      <div key={s.key} className="journey-stage">
        <h4><span className={`badge ${s.tone}`}>{s.label}</span></h4>
        {mine.map((st) => {
          const js = JOURNEY_STATUS[st.status] || { label: st.status, tone: 'b-grey' };
          return (
            <div key={st.key} className="journey-step">
              <span>{st.label}<span className="phase">{st.phase}</span></span>
              <span className={`badge ${js.tone}`}>{js.label}</span>
            </div>
          );
        })}
      </div>
    );
  });
}

function ClassifyForm({ evidence, meta, onDone }) {
  const [f, setF] = useState({ documentKind: 'CERTIFICATE', sourceNature: 'UNKNOWN', originCandidate: 'BESC', securityClassWritten: '', certificateNumber: '', quantityWritten: '', documentDateWritten: '', notes: '', reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const correcting = !!evidence.classification;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      await api.recovery.classify(evidence.id, body);
      onDone();
    } catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 10 }}>
      {err && <Banner>{err}</Banner>}
      <div className="form-grid">
        <Field label="Tipo de documento">
          <select value={f.documentKind} onChange={set('documentKind')}>
            {(meta.documentKinds || []).map((k) => <option key={k} value={k}>{(meta.documentKindLabels || {})[k] || k}</option>)}
          </select>
        </Field>
        <Field label="Natureza da fonte" hint="Laudo privado é sempre alegação de parte.">
          <select value={f.sourceNature} onChange={set('sourceNature')}>
            {Object.entries(meta.sourceNatures || {}).filter(([k]) => k !== 'FINAL_COURT_DECISION').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Classe escrita"><input value={f.securityClassWritten} onChange={set('securityClassWritten')} /></Field>
        <Field label="Número do certificado"><input value={f.certificateNumber} onChange={set('certificateNumber')} /></Field>
        <Field label="Quantidade escrita"><input value={f.quantityWritten} onChange={set('quantityWritten')} /></Field>
        <Field label="Data escrita no documento"><input value={f.documentDateWritten} onChange={set('documentDateWritten')} placeholder="como aparece no papel" /></Field>
        <Field label="Observações"><input value={f.notes} onChange={set('notes')} /></Field>
        {correcting && <Field label="Motivo da correção" hint="Obrigatório: a classificação anterior é preservada."><input value={f.reason} onChange={set('reason')} required minLength={10} /></Field>}
      </div>
      <button className="btn sm primary" disabled={busy}>{correcting ? 'Registrar correção' : 'Classificar'}</button>
    </form>
  );
}

function EvidenceItem({ ev, meta, canWrite, onChange }) {
  const [open, setOpen] = useState(false);
  const c = ev.classification;
  return (
    <div className="checklist-item">
      <div className="ci-head">
        <div>
          <div style={{ fontWeight: 650 }}>{ev.originalFilename}</div>
          <div className="small muted">
            {ev.documentKindLabel || 'Não classificada'} · {EVIDENCE_STATE_LABEL[ev.state] || ev.state} · {formatBytes(ev.sizeBytes)} · evidência legada
            {c && <> · fonte: {(meta.sourceNatures || {})[c.sourceNature] || c.sourceNature}</>}
          </div>
          <div className="mono muted">sha256 {ev.sha256}</div>
          {ev.duplicateOf && <div className="assess">Arquivo idêntico a outra evidência já recebida: marcado como suspeito.</div>}
          {c && (c.certificateNumber || c.quantityWritten) && (
            <div className="small muted">Escrito no documento: {c.securityClassWritten || '—'} · nº {c.certificateNumber || '—'} · qtde {c.quantityWritten || '—'}</div>
          )}
        </div>
        <div className="ci-controls">
          <a className="btn sm" href={api.recovery.evidenceFileUrl(ev.id)} target="_blank" rel="noreferrer"><Icon name="download" size={13} /> Abrir</a>
          {canWrite && <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)}>{c ? 'Corrigir classificação' : 'Classificar'}</button>}
        </div>
      </div>
      {open && <ClassifyForm evidence={ev} meta={meta} onDone={() => { setOpen(false); onChange(); }} />}
    </div>
  );
}

function UploadForm({ claim, onDone }) {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const submit = async (e) => {
    e.preventDefault(); if (!file) return;
    setBusy(true); setErr(''); setInfo('');
    try {
      const out = await api.recovery.uploadEvidence({ file, claimId: claim.id, claimantId: claim.claimantId, notes });
      setInfo(out.duplicateOf ? 'Recebido, mas idêntico a outra evidência: marcado como suspeito.' : 'Evidência recebida e registrada com hash. Agora classifique o documento.');
      setFile(null); setNotes(''); e.target.reset();
      onDone();
    } catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="row" style={{ alignItems: 'flex-end', marginTop: 10 }}>
      <Field label="Arquivo (até 25 MB)"><input type="file" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
      <Field label="Observação"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: cautela de 1984" /></Field>
      <button className="btn sm primary" disabled={busy || !file} style={{ marginBottom: 15 }}><Icon name="upload" size={13} /> {busy ? 'Enviando…' : 'Enviar evidência'}</button>
      {err && <Banner>{err}</Banner>}
      {info && <Banner kind="info">{info}</Banner>}
    </form>
  );
}

function ValuationForm({ claim, evidence, onDone }) {
  const [f, setF] = useState({ valueType: 'claimed_value', amount: '', source: 'CLAIMANT', methodology: '', confidence: '0.1', evidenceId: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const legalStatus = f.valueType === 'historical_value' ? 'HISTORICAL_FACT' : 'SOURCE_CLAIM';
      await api.recovery.recordValuation(claim.id, { ...f, currency: 'BRL', legalStatus, evidenceId: f.evidenceId || null });
      onDone();
    } catch (e2) { setErr(friendly(e2.message)); }
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 10 }}>
      {err && <Banner>{err}</Banner>}
      <div className="form-grid">
        <Field label="Tipo de valor">
          <select value={f.valueType} onChange={set('valueType')}>
            {['claimed_value', 'historical_value', 'expert_estimate'].map((k) => <option key={k} value={k}>{VALUE_TYPE_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Valor (R$)"><input value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Fonte">
          <select value={f.source} onChange={set('source')}>
            {['CLAIMANT', 'PRIVATE_APPRAISAL', 'COURT_EXPERT', 'PETITION', 'CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Evidência de origem">
          <select value={f.evidenceId} onChange={set('evidenceId')}>
            <option value="">—</option>
            {evidence.map((ev) => <option key={ev.id} value={ev.id}>{ev.originalFilename}</option>)}
          </select>
        </Field>
        <Field label="Metodologia" hint="Como o número foi obtido."><input value={f.methodology} onChange={set('methodology')} required /></Field>
        <Field label="Confiança (0 a 1)"><input value={f.confidence} onChange={set('confidence')} required /></Field>
      </div>
      <button className="btn sm primary">Registrar valor</button>
    </form>
  );
}

export default function RecuperacaoDetail() {
  const { id } = useParams();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('recovery:write');
  const [view, setView] = useState(null);
  const [meta, setMeta] = useState({});
  const [err, setErr] = useState('');
  const [tr, setTr] = useState({ toState: '', reason: '' });
  const [trErr, setTrErr] = useState('');
  const [showVal, setShowVal] = useState(false);
  const load = useCallback(() => api.recovery.claim(id).then(setView).catch((e) => setErr(friendly(e.message))), [id]);
  useEffect(() => { load(); api.recovery.meta().then(setMeta).catch(() => {}); }, [load]);

  const doTransition = async (e) => {
    e.preventDefault(); setTrErr('');
    try { await api.recovery.transitionClaim(id, tr.toState, tr.reason); setTr({ toState: '', reason: '' }); load(); } catch (e2) { setTrErr(friendly(e2.message)); }
  };

  if (err) return <Banner>{err}</Banner>;
  if (!view) return <Loading />;
  const { claim, claimant, origin, evidence, valuations, missingEvidence, journey, allowedTransitions, transitions, notice } = view;

  return (
    <>
      <div className="crumbs"><Link to="/recuperacao">Reivindicações</Link> / {claimant ? claimant.displayName : claim.id.slice(0, 8)}</div>
      <div className="pgtitle row" style={{ gap: 12 }}>
        <h1>{CLAIM_KIND_LABEL[claim.claimKind] || claim.claimKind}</h1>
        <StageBadge stage={claim.stage} />
        <span className="pill">{CLAIM_STATE_LABEL[claim.state] || claim.state}</span>
      </div>
      {notice && <div className="assess">{notice}</div>}

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Reclamante e origem</h3>
          <p className="small">{claimant ? `${claimant.displayName} · ${PERSON_TYPE_LABEL[claimant.personType] || claimant.personType}` : '—'}</p>
          <p className="small">Origem: {origin ? origin.name : claim.assetOriginId}</p>
          {origin && origin.successor && <p className="small muted">Sucessor: {origin.successor.name} ({origin.successor.role})</p>}
          {(claim.claimedSecurityClass || claim.claimedQuantityWritten) && (
            <p className="small muted">Escrito nos documentos: {claim.claimedSecurityClass || '—'} · {claim.claimedQuantityWritten || '—'} (não é posição confirmada)</p>
          )}
          {claim.legacyCaseId && <p className="small muted">Migrada do caso de levantamento {claim.legacyCaseId.slice(0, 8)}.</p>}
        </div></div>
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Evidências faltantes</h3>
          {(missingEvidence || []).length === 0 ? <p className="small muted">Nenhuma pendência de F2.</p> : (
            <ul className="small" style={{ lineHeight: 1.6 }}>
              {missingEvidence.map((m) => <li key={m.key}>{m.label}{m.phase && <span className="pill" style={{ marginLeft: 6 }}>{m.phase}</span>}</li>)}
            </ul>
          )}
        </div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Jornada</h3>
        <p className="small muted">Etapas das fases F3 a F5 aparecem como não disponíveis: não existem nesta fase e nada é simulado.</p>
        <Journey steps={journey || []} />
      </div></div>

      <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Evidências legadas</h3>
        <p className="small muted">Cada arquivo recebe hash SHA-256 e é classificado. Evidência legada sustenta a reivindicação; não prova posição atual.</p>
        {(evidence || []).map((ev) => <EvidenceItem key={ev.id} ev={ev} meta={meta} canWrite={canWrite} onChange={load} />)}
        {canWrite && <UploadForm claim={claim} onDone={load} />}
      </div></div>

      <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15 }}>Valores registrados</h3>
          {canWrite && <button type="button" className="btn sm" onClick={() => setShowVal((o) => !o)}>Registrar valor alegado</button>}
        </div>
        <p className="small muted">Valor alegado, histórico ou de laudo é alegação de fonte. Nenhum deles é valor reconhecido ou de mercado.</p>
        {(valuations || []).length > 0 && (
          <table className="data" style={{ marginTop: 8 }}>
            <thead><tr><th>Tipo</th><th>Valor</th><th>Fonte</th><th>Natureza</th><th>Metodologia</th></tr></thead>
            <tbody>
              {valuations.map((v) => (
                <tr key={v.id}><td>{VALUE_TYPE_LABEL[v.valueType] || v.valueType}</td><td>{Number(v.amount).toLocaleString('pt-BR', { style: 'currency', currency: v.currency || 'BRL' })}</td><td>{v.source}</td><td><span className="badge b-amber">{v.legalStatus}</span></td><td className="small">{v.methodology}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {showVal && <ValuationForm claim={claim} evidence={evidence || []} onDone={() => { setShowVal(false); load(); }} />}
      </div></div>

      <div className="card"><div className="card-body">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Situação e histórico</h3>
        {canWrite && (allowedTransitions || []).length > 0 && (
          <form onSubmit={doTransition} className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Mudar para">
              <select value={tr.toState} onChange={(e) => setTr((o) => ({ ...o, toState: e.target.value }))} required>
                <option value="">—</option>
                {allowedTransitions.map((s) => <option key={s} value={s}>{CLAIM_STATE_LABEL[s] || s}</option>)}
              </select>
            </Field>
            <Field label="Motivo (mín. 10 caracteres)"><input value={tr.reason} onChange={(e) => setTr((o) => ({ ...o, reason: e.target.value }))} required minLength={10} /></Field>
            <button className="btn sm" style={{ marginBottom: 15 }}>Registrar</button>
          </form>
        )}
        {trErr && <Banner>{trErr}</Banner>}
        <table className="data">
          <thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Motivo</th></tr></thead>
          <tbody>
            {(transitions || []).map((t) => (
              <tr key={t.seq}><td className="small">{new Date(t.occurredAt).toLocaleString('pt-BR')}</td><td>{CLAIM_STATE_LABEL[t.fromState] || t.fromState}</td><td>{CLAIM_STATE_LABEL[t.toState] || t.toState}</td><td className="small">{t.reason}</td></tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
