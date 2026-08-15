import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, SkeletonList, HelpCallout, Field, ConfirmButton } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';

const GATE_STATUS = {
  pending: { l: 'Pendente', c: 'b-amber' },
  satisfied: { l: 'Satisfeito', c: 'b-green' },
  not_applicable: { l: 'Não se aplica', c: 'b-grey' },
  reopened: { l: 'Reaberto', c: 'b-red' },
};
// status que EXIGEM parecer de profissional habilitado (nome obrigatório)
const REQUIRES_PROFESSIONAL = ['satisfied', 'not_applicable'];

// As 4 operações destravadas pelo go-live (docs/evolution/10-gate-regulatorio.md §4).
const UNLOCKS = [
  'Marcar investidor como apto a operar valor real (além do modo demonstração).',
  'Remover o aviso “ambiente de demonstração” da área do investidor.',
  'Emitir faturas fora do piloto interno.',
  'Emissão on-chain real (a rede de teste da Fase 3 continua permitida).',
];

function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/409/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Ainda há itens regulatórios não resolvidos — resolva todos os 7 antes de liberar o go-live.';
  if (/403/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Você não tem permissão para gerenciar o gate regulatório.';
  return m.replace(/^Erro \d+:?\s*/, '') || 'Não foi possível concluir a operação.';
}

function fmtDateTime(s) { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR'); }

// GATE REGULATÓRIO BLOQUEANTE (fees:read para ver; gate:manage para gerenciar).
// Enquanto o gate não é liberado, go_live=false e a plataforma recusa operações de valor real.
export default function GateRegulatorio() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('gate:manage');
  const [gate, setGate] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    api.finance.gate().then(setGate).catch((e) => setError(friendly(e.message)));
  };
  useEffect(() => { load(); }, []);

  const goLive = !!(gate && gate.goLive);
  const allResolved = !!(gate && gate.allItemsResolved);

  const grant = async () => {
    setError(null);
    try { await api.finance.grantGoLive(); load(); } catch (e) { setError(friendly(e.message)); }
  };
  const revoke = async (reason) => {
    setError(null);
    try { await api.finance.revokeGoLive({ reason: reason || undefined }); load(); } catch (e) { setError(friendly(e.message)); }
  };

  return (
    <>
      <div className="crumbs"><Link to="/casos">Gestão</Link> / Gate regulatório</div>
      <div className="pgtitle"><h1><Icon name="shield" size={22} /> Gate regulatório</h1></div>

      {/* Banner GRANDE de estado do go-live */}
      {gate && <GoLiveBanner goLive={goLive} />}

      <HelpCallout title="A trava que separa a demonstração da operação real">
        Os <strong>7 itens regulatórios</strong> só são satisfeitos com <strong>parecer de profissional
        habilitado e identificado</strong> (CVM, BCB, LGPD, tributário…). Enquanto o conjunto não estiver
        aprovado, o flag <strong>go-live</strong> permanece desligado e o sistema <strong>recusa em código</strong>
        qualquer operação de valor real. <strong>“Satisfeito” e “Não se aplica” exigem parecer</strong> — “não se
        aplica” é uma conclusão jurídica, não uma omissão. <strong>Toda mudança aqui é auditada.</strong>
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      {!gate && !error && <SkeletonList count={4} lines={2} />}

      {gate && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <h3><Icon name="scale" size={15} /> Itens regulatórios ({(gate.items || []).length})</h3>
              <div className="spacer" style={{ flex: 1 }} />
              {allResolved
                ? <span className="badge b-green"><Icon name="check" size={12} /> Todos resolvidos</span>
                : <span className="badge b-amber"><Icon name="alert" size={12} /> Itens pendentes</span>}
            </div>
            <div className="card-body stack">
              {(gate.items || []).map((it) => (
                <GateItem key={it.key} item={it} canManage={canManage} onError={setError} onSaved={load} />
              ))}
            </div>
          </div>

          {/* Ações de go-live */}
          {canManage && (
            <div className="card">
              <div className="card-head"><h3><Icon name="lock" size={15} /> Liberação de go-live</h3></div>
              <div className="card-body">
                {!goLive && (
                  <>
                    <p style={{ marginTop: 0 }}>Liberar o go-live vai <strong>destravar</strong>:</p>
                    <ul className="md-body" style={{ marginTop: 0 }}>
                      {UNLOCKS.map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                    {!allResolved && (
                      <Banner kind="warn">
                        Ainda há itens <strong>não resolvidos</strong>. Resolva os 7 (satisfeito ou não se aplica,
                        cada um com parecer) para poder liberar.
                      </Banner>
                    )}
                    <div className="row">
                      {allResolved
                        ? <ConfirmButton className="btn primary" label="Liberar go-live" confirmLabel="Confirmar liberação do go-live?" onConfirm={grant} />
                        : <button className="btn primary" disabled title="Resolva todos os itens antes">Liberar go-live</button>}
                    </div>
                  </>
                )}
                {goLive && (
                  <>
                    <p style={{ marginTop: 0 }}>
                      O go-live está <strong>ativo</strong>. Se um parecer for superado (ex.: mudança regulatória),
                      revogue o go-live — as 4 operações de valor real voltam a ser travadas imediatamente.
                    </p>
                    <RevokeControl onRevoke={revoke} />
                  </>
                )}
                {gate.lastApproval && (
                  <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
                    Último ato: <strong>{gate.lastApproval.kind === 'revoked' ? 'revogação' : 'liberação'}</strong>
                    {gate.lastApproval.approved_by_name ? ` por ${gate.lastApproval.approved_by_name}` : ''}
                    {gate.lastApproval.occurred_at ? ` em ${fmtDateTime(gate.lastApproval.occurred_at)}` : ''}
                    {gate.lastApproval.notes ? ` — ${gate.lastApproval.notes}` : ''}.
                  </p>
                )}
                <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                  <Icon name="info" size={12} /> Cada liberação e revogação é registrada na trilha de auditoria com um
                  snapshot dos 7 pareceres — a decisão fica reconstituível para sempre.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// Banner grande e óbvio do estado do go-live.
function GoLiveBanner({ goLive }) {
  if (goLive) {
    return (
      <div role="status" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', marginBottom: 18,
        borderRadius: 'var(--radius-sm)', border: '1px solid #bfe3cf', borderLeft: '5px solid var(--green)',
        background: 'var(--green-soft)', color: 'var(--green)',
      }}>
        <Icon name="check" size={22} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>GO-LIVE ATIVO</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>As operações de valor real estão destravadas. Toda mudança de estado é auditada.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="demo-watermark" role="status" style={{ padding: '16px 20px', fontSize: 14, marginBottom: 18 }}>
      <span className="dw-ic" aria-hidden="true"><Icon name="alert" size={22} /></span>
      <span>
        <strong style={{ fontSize: 16 }}>MODO DEMONSTRAÇÃO</strong> — nenhum valor mobiliário é ofertado; a
        operação real está <strong>bloqueada</strong>. O go-live só liga quando os 7 itens regulatórios forem
        satisfeitos com parecer.
      </span>
    </div>
  );
}

// Um item regulatório: rótulo + status + profissional; edição para gate:manage.
function GateItem({ item, canManage, onError, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(item.status || 'pending');
  const [professionalName, setProfessionalName] = useState(item.professional_name || '');
  const [professionalRegistration, setProfessionalRegistration] = useState(item.professional_registration || '');
  const [opinionDocumentRef, setOpinionDocumentRef] = useState(
    typeof item.opinion_document_ref === 'string' ? item.opinion_document_ref : (item.opinion_document_ref ? JSON.stringify(item.opinion_document_ref) : ''),
  );
  const [notes, setNotes] = useState(item.notes || '');
  const [busy, setBusy] = useState(false);
  const st = GATE_STATUS[item.status] || { l: item.status || '—', c: 'b-grey' };
  const needsProfessional = REQUIRES_PROFESSIONAL.includes(status);

  const cancel = () => {
    setEditing(false);
    setStatus(item.status || 'pending');
    setProfessionalName(item.professional_name || '');
    setProfessionalRegistration(item.professional_registration || '');
    setNotes(item.notes || '');
  };

  const save = async () => {
    if (needsProfessional && !professionalName.trim()) {
      onError('“Satisfeito” e “Não se aplica” exigem o nome do profissional habilitado que emitiu o parecer.');
      return;
    }
    setBusy(true); onError(null);
    try {
      await api.finance.setGateItem(item.key, {
        status,
        professionalName: professionalName.trim() || undefined,
        professionalRegistration: professionalRegistration.trim() || undefined,
        opinionDocumentRef: opinionDocumentRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setEditing(false);
      onSaved();
    } catch (e) { onError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650 }}>{item.question_label}</div>
            <div className="small muted" style={{ marginTop: 3 }}>
              {item.professional_name
                ? <>Parecer de <strong>{item.professional_name}</strong>{item.professional_registration ? ` (${item.professional_registration})` : ''}</>
                : 'Sem parecer registrado.'}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${st.c}`}>{st.l}</span>
            {canManage && !editing && <button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" size={13} /> Editar</button>}
          </div>
        </div>

        {editing && (
          <div style={{ marginTop: 12 }}>
            <div className="form-grid">
              <Field label="Situação">
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(GATE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                </select>
              </Field>
              <Field label="Profissional habilitado" hint={needsProfessional ? 'Obrigatório para satisfeito / não se aplica.' : 'Nome de quem emitiu o parecer.'}>
                <input value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} placeholder="Ex.: Dra. Fulana de Tal" />
              </Field>
              <Field label="Registro profissional" hint="OAB / CRC / etc.">
                <input value={professionalRegistration} onChange={(e) => setProfessionalRegistration(e.target.value)} placeholder="Ex.: OAB/SC 12.345" />
              </Field>
              <Field label="Referência do parecer" hint="Documento/anexo do parecer emitido.">
                <input value={opinionDocumentRef} onChange={(e) => setOpinionDocumentRef(e.target.value)} placeholder="Ex.: parecer-cvm40-2026.pdf" />
              </Field>
              <div className="full">
                <Field label="Observações (opcional)">
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto, escopo ou ressalvas do parecer." />
                </Field>
              </div>
            </div>
            {needsProfessional && (
              <p className="small muted" style={{ marginTop: -4 }}>
                <Icon name="info" size={12} /> Para marcar como <strong>{GATE_STATUS[status].l.toLowerCase()}</strong> é preciso o parecer de um profissional habilitado, identificado.
              </p>
            )}
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Salvar</button>
              <button className="btn" disabled={busy} onClick={cancel}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Revogar go-live: pede motivo antes de confirmar.
function RevokeControl({ onRevoke }) {
  const [reason, setReason] = useState('');
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <Field label="Motivo da revogação (opcional)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: parecer tributário superado por mudança da RFB" style={{ minWidth: 320 }} />
      </Field>
      <ConfirmButton className="btn danger" label="Revogar go-live" confirmLabel="Confirmar revogação?" onConfirm={() => onRevoke(reason)} />
    </div>
  );
}
