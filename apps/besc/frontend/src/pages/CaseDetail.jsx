import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  StatusBadge, RiskBadge, Progress, Field, EnumSelect, Banner, Loading,
  ConfirmButton, formatMoney, useLabel, useMeta,
} from '../ui.jsx';

// input que salva no blur (evita chamada por tecla)
function BlurInput({ value, onSave, textarea, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { if (v !== (value ?? '')) onSave(v); };
  const El = textarea ? 'textarea' : 'input';
  return <El {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />;
}

const TAB_FOR_RESOLVE = { case: 'dados', documents: 'documentos', lawsuits: 'processos', legal: 'juridico', tokenization: 'tokenizacao', collateral: 'caucao' };
const SEV = { blocker: { c: 'b-red', l: 'Bloqueante' }, high: { c: 'b-amber', l: 'Alta' }, medium: { c: 'b-blue', l: 'Média' }, info: { c: 'b-grey', l: 'Informativa' } };

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('resumo');

  const load = () => api.get(id).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const patch = async (promise) => {
    setError(null);
    try { setC(await promise); } catch (e) { setError(e.message); }
  };

  if (!c) return error ? <Banner>{error}</Banner> : <Loading />;

  const d = c.derived;
  const pendApplicableDocs = (c.documents || []).length;
  const tabs = [
    { k: 'resumo', label: 'Resumo' },
    { k: 'dados', label: 'Dados' },
    { k: 'processos', label: 'Processos', count: (c.lawsuits || []).length },
    { k: 'documentos', label: 'Documentos', count: `${d.docPct}%` },
    { k: 'juridico', label: 'Jurídico' },
    { k: 'tokenizacao', label: 'Tokenização' },
    { k: 'caucao', label: 'Caução' },
    { k: 'pendencias', label: 'Pendências', count: d.pendencyCount, warn: d.blockerCount > 0 },
    { k: 'relatorios', label: 'Relatórios' },
  ];

  const goResolve = (resolve) => setTab(TAB_FOR_RESOLVE[resolve] || 'resumo');

  return (
    <>
      <div className="crumbs"><Link to="/">Casos</Link> / {c.holder_name || '(sem titular)'}</div>
      <div className="pgtitle">
        <h1>{c.holder_name || '(sem titular)'}</h1>
        <StatusBadge status={c.status} />
        <RiskBadge level={d.risk.level} />
        <div className="spacer" style={{ flex: 1 }} />
        <Link className="btn sm" to={`/cases/${id}/edit`}>Editar dados</Link>
        <a className="btn sm" href={api.reportHtmlUrl(id, 'full_case_report')} target="_blank" rel="noreferrer">Relatório completo</a>
      </div>

      <Banner kind="err">{error}</Banner>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {tabs.map((t) => (
          <button key={t.k} className={tab === t.k ? 'active' : ''} onClick={() => setTab(t.k)}>
            {t.label}
            {t.count !== undefined && t.count !== 0 && <span className={`tab-count ${t.warn ? 'warn' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'resumo' && <ResumoTab c={c} patch={patch} id={id} goResolve={goResolve} />}
      {tab === 'dados' && <DadosTab c={c} />}
      {tab === 'processos' && <ProcessosTab c={c} id={id} patch={patch} />}
      {tab === 'documentos' && <DocumentosTab c={c} id={id} patch={patch} />}
      {tab === 'juridico' && <JuridicoTab c={c} id={id} patch={patch} />}
      {tab === 'tokenizacao' && <TokenizacaoTab c={c} id={id} patch={patch} />}
      {tab === 'caucao' && <CaucaoTab c={c} id={id} patch={patch} />}
      {tab === 'pendencias' && <PendenciasTab c={c} goResolve={goResolve} />}
      {tab === 'relatorios' && <RelatoriosTab c={c} id={id} />}
    </>
  );
}

function ResumoTab({ c, patch, id, goResolve }) {
  const label = useLabel();
  const d = c.derived;
  const setStatus = (s) => patch(api.setStatus(id, s));
  const differs = d.suggestedStatus !== c.status;
  return (
    <div className="stack">
      <div className="grid2">
        <div className="card"><div className="card-body stat"><span className="k">Documentação concluída</span><span className="v">{d.docPct}%</span><Progress pct={d.docPct} /></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Pendências abertas</span><span className="v" style={{ color: d.blockerCount ? 'var(--red)' : undefined }}>{d.pendencyCount}</span><span className="small muted">{d.blockerCount} bloqueante(s)</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Valor estimado</span><span className="v">{formatMoney(d.estimatedValue)}</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Risco jurídico</span><span className="v" style={{ fontSize: 16 }}><RiskBadge level={d.risk.level} /></span><span className="small muted">indicativo — requer validação</span></div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Status do caso</h3><div className="spacer" style={{ flex: 1 }} /><StatusBadge status={c.status} /></div>
        <div className="card-body stack">
          {differs && <Banner kind="info">Status sugerido pelo sistema: <strong>{label('case_status', d.suggestedStatus)}</strong> (transições rumo a “apto” exigem sua confirmação).</Banner>}
          <div className="row">
            <button className="btn primary" disabled={!d.canConfirmReady} onClick={() => setStatus('ready_for_structuring')} title={!d.canConfirmReady ? 'Ainda há pendências bloqueantes/altas' : ''}>Marcar apto para estruturação</button>
            <button className="btn" onClick={() => setStatus('ready_with_caveats')}>Apto com ressalvas</button>
            <ConfirmButton className="btn danger" label="Não apto" confirmLabel="Confirmar não apto?" onConfirm={() => setStatus('not_eligible')} />
            {c.status !== 'archived'
              ? <ConfirmButton className="btn" label="Arquivar" confirmLabel="Confirmar arquivamento?" onConfirm={() => setStatus('archived')} />
              : <button className="btn" onClick={() => setStatus('docs_incomplete')}>Reabrir</button>}
          </div>
          {!d.canConfirmReady && <span className="small muted">Para declarar “apto para estruturação” não pode haver pendências bloqueantes ou altas abertas.</span>}
        </div>
      </div>

      {d.pendencies.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Principais pendências</h3></div>
          <div className="card-body">
            {d.pendencies.slice(0, 5).map((p) => (
              <div key={p.key} className="between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <span><span className={`badge ${SEV[p.severity].c}`} style={{ marginRight: 8 }}>{SEV[p.severity].l}</span>{p.message}{p.requiresLegal && <span className="pill legal" style={{ marginLeft: 8 }}>requer validação jurídica</span>}</span>
                <button className="btn sm ghost" onClick={() => goResolve(p.resolve)}>Resolver →</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DadosTab({ c }) {
  const label = useLabel();
  const F = ({ k, v }) => (<><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></>);
  return (
    <div className="card"><div className="card-body">
      <dl className="kv">
        <F k="Titular" v={c.holder_name} />
        <F k="CPF/CNPJ" v={c.holder_tax_id} />
        <F k="Tipo de titular" v={label('holder_type', c.holder_type)} />
        <F k="Contato" v={c.contact} />
        <F k="Origem das ações/direitos" v={c.origin} />
        <F k="Data de aquisição" v={c.acquisition_date} />
        <F k="Quantidade de ações" v={c.share_quantity} />
        <F k="Classe das ações" v={label('share_class', c.share_class)} />
        <F k="Nº de certificados" v={c.certificate_count} />
        <F k="Banco/escriturador" v={c.registrar} />
        <F k="Tipo de direito" v={label('right_type', c.right_type)} />
        <F k="Situação de liquidez" v={label('liquidity_status', c.liquidity_status)} />
        <F k="Valor estimado" v={formatMoney(c.estimated_value)} />
        <F k="Resumo do caso" v={c.summary} />
        <F k="Observações" v={c.notes} />
      </dl>
      <div className="row" style={{ marginTop: 14 }}><Link className="btn sm" to={`/cases/${c.id}/edit`}>Editar dados</Link></div>
    </div></div>
  );
}

const LAWSUIT_EMPTY = { number: '', court: '', chamber: '', comarca: '', type: '', parties: '', lawyer: '', phase: 'desconhecida', transited: false, claimed_value: '', updated_value: '', risk: 'undetermined', next_steps: '' };

function ProcessosTab({ c, id, patch }) {
  const label = useLabel();
  const [editing, setEditing] = useState(null); // lawsuit id ou 'new'
  const [form, setForm] = useState(LAWSUIT_EMPTY);
  const openNew = () => { setForm(LAWSUIT_EMPTY); setEditing('new'); };
  const openEdit = (l) => { setForm({ ...LAWSUIT_EMPTY, ...l }); setEditing(l.id); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = async () => {
    if (editing === 'new') await patch(api.addLawsuit(id, form));
    else await patch(api.updateLawsuit(id, editing, form));
    setEditing(null);
  };
  return (
    <div className="stack">
      <div className="between"><span className="section-title">Processos judiciais ({(c.lawsuits || []).length})</span>{!editing && <button className="btn sm primary" onClick={openNew}>+ Adicionar processo</button>}</div>

      {editing && (
        <div className="card"><div className="card-body">
          <div className="form-grid">
            <Field label="Número do processo"><input value={form.number} onChange={set('number')} placeholder="0000000-00.0000.0.00.0000" /></Field>
            <Field label="Tribunal"><input value={form.court} onChange={set('court')} /></Field>
            <Field label="Vara"><input value={form.chamber} onChange={set('chamber')} /></Field>
            <Field label="Comarca"><input value={form.comarca} onChange={set('comarca')} /></Field>
            <Field label="Tipo de ação"><input value={form.type} onChange={set('type')} /></Field>
            <Field label="Advogado responsável"><input value={form.lawyer} onChange={set('lawyer')} /></Field>
            <Field label="Partes envolvidas"><input value={form.parties} onChange={set('parties')} /></Field>
            <Field label="Fase atual"><EnumSelect enumName="procedural_phase" value={form.phase} onChange={set('phase')} /></Field>
            <Field label="Valor pedido"><input value={form.claimed_value} onChange={set('claimed_value')} /></Field>
            <Field label="Valor estimado atualizado"><input value={form.updated_value} onChange={set('updated_value')} /></Field>
            <Field label="Risco jurídico"><EnumSelect enumName="legal_risk" value={form.risk} onChange={set('risk')} /></Field>
            <Field label="Trânsito em julgado"><label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.transited} onChange={set('transited')} /> Houve trânsito em julgado</label></Field>
            <div className="full"><Field label="Próximos passos"><textarea value={form.next_steps} onChange={set('next_steps')} rows={2} /></Field></div>
          </div>
          <div className="row"><button className="btn primary" onClick={save}>Salvar processo</button><button className="btn" onClick={() => setEditing(null)}>Cancelar</button></div>
        </div></div>
      )}

      {(c.lawsuits || []).length === 0 && !editing && <div className="card"><div className="empty"><h3>Nenhum processo cadastrado</h3><p className="muted">Cadastre o processo judicial de origem do direito, se houver.</p></div></div>}

      {(c.lawsuits || []).map((l) => (
        <div key={l.id} className="card"><div className="card-body">
          <div className="between">
            <div><strong>{l.number || '(sem número)'}</strong> <span className="pill">{label('procedural_phase', l.phase)}</span> {l.transited && <span className="pill" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>trânsito em julgado</span>}</div>
            <div className="row"><button className="btn sm" onClick={() => openEdit(l)}>Editar</button><ConfirmButton label="Excluir" confirmLabel="Confirmar?" onConfirm={() => patch(api.deleteLawsuit(id, l.id))} /></div>
          </div>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Tribunal / Vara / Comarca</dt><dd>{[l.court, l.chamber, l.comarca].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Tipo de ação</dt><dd>{l.type || '—'}</dd>
            <dt>Advogado</dt><dd>{l.lawyer || '—'}</dd>
            <dt>Valor atualizado</dt><dd>{formatMoney(l.updated_value)}</dd>
            <dt>Risco</dt><dd>{label('legal_risk', l.risk)}</dd>
            {l.next_steps && <><dt>Próximos passos</dt><dd>{l.next_steps}</dd></>}
          </dl>
        </div></div>
      ))}
    </div>
  );
}

function groupBy(items, key) {
  const g = {};
  (items || []).forEach((it) => { (g[it[key]] = g[it[key]] || []).push(it); });
  return g;
}

function DocumentosTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.docCategories) || {};
  const groups = groupBy(c.documents, 'category');
  const REQ = { required: 'Obrigatório', conditional: 'Condicional', optional: 'Opcional' };
  return (
    <div className="stack">
      <Banner kind="info">Documentação {c.derived.docPct}% concluída (validados / aplicáveis). Marque o status de cada documento conforme recebido e validado.</Banner>
      {Object.keys(cats).map((cat) => groups[cat] && (
        <div className="card" key={cat}>
          <div className="card-head"><h3>{cats[cat]}</h3></div>
          <div className="card-body">
            {groups[cat].map((doc) => (
              <div className="checklist-item" key={doc.key}>
                <div className="ci-head">
                  <div>
                    <div style={{ fontWeight: 600 }}>{doc.label} <span className="pill">{REQ[doc.requirement]}</span></div>
                    <BlurInput className="small" style={{ marginTop: 6 }} placeholder="Fonte / origem do documento (opcional)" value={doc.source} onSave={(v) => patch(api.updateDocument(id, doc.key, { source: v }))} />
                  </div>
                  <div className="ci-controls">
                    <select className="inline-select" value={doc.status} onChange={(e) => patch(api.updateDocument(id, doc.key, { status: e.target.value }))}>
                      {Object.entries(meta.enums.document_status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <BlurInput textarea className="small" style={{ marginTop: 8 }} rows={1} placeholder="Observações…" value={doc.notes} onSave={(v) => patch(api.updateDocument(id, doc.key, { notes: v }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistAnswer({ value, onChange }) {
  const { meta } = useMeta();
  return (
    <select className="inline-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(meta.enums.checklist_answer).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function JuridicoTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.legalCategories) || {};
  const groups = groupBy(c.legal, 'category');
  return (
    <div className="stack">
      <Banner kind="warn">Checklist jurídico — respostas de levantamento. Todos os itens <strong>requerem validação jurídica</strong> por profissional habilitado; o sistema não conclui mérito.</Banner>
      {Object.keys(cats).map((cat) => groups[cat] && (
        <div className="card" key={cat}>
          <div className="card-head"><h3>{cats[cat]}</h3></div>
          <div className="card-body">
            {groups[cat].map((it) => (
              <div className="checklist-item" key={it.key}>
                <div className="ci-head">
                  <div style={{ fontWeight: 600 }}>{it.label}</div>
                  <div className="ci-controls"><ChecklistAnswer value={it.answer} onChange={(v) => patch(api.updateLegal(id, it.key, { answer: v }))} /></div>
                </div>
                <BlurInput textarea className="small" rows={1} style={{ marginTop: 8 }} placeholder="Observações / evidência…" value={it.notes} onSave={(v) => patch(api.updateLegal(id, it.key, { notes: v }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TokenizacaoTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.tokenizationCategories) || {};
  const groups = groupBy(c.tokenization, 'category');
  return (
    <div className="stack">
      <Banner kind="info">Checklist técnico de tokenização + regulatório (levantamento). O sistema não executa tokenização; itens regulatórios <strong>requerem validação</strong>.</Banner>
      {Object.keys(cats).map((cat) => groups[cat] && (
        <div className="card" key={cat}>
          <div className="card-head"><h3>{cats[cat]}</h3></div>
          <div className="card-body">
            {groups[cat].map((it) => (
              <div className="checklist-item" key={it.key}>
                <div className="ci-head">
                  <div style={{ fontWeight: 600 }}>{it.label} {it.requiresLegal && <span className="pill legal">requer validação</span>}</div>
                  <div className="ci-controls"><ChecklistAnswer value={it.answer} onChange={(v) => patch(api.updateTokenization(id, it.key, { answer: v }))} /></div>
                </div>
                <BlurInput className="small" style={{ marginTop: 8 }} placeholder="Definição / valor (ex.: o que será tokenizado, lastro, custodiante)…" value={it.value} onSave={(v) => patch(api.updateTokenization(id, it.key, { value: v }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CaucaoTab({ c, id, patch }) {
  const col = c.collateral || {};
  const [form, setForm] = useState(col);
  useEffect(() => { setForm(c.collateral || {}); }, [c]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = () => patch(api.updateCollateral(id, form));
  const coverage = (() => {
    const debt = parseFloat(String(form.debt_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    const guar = parseFloat(String(form.required_guarantee_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(debt) || Number.isNaN(guar) || debt === 0) return '—';
    return `${Math.round((guar / debt) * 100)}%`;
  })();
  return (
    <div className="card"><div className="card-body">
      <Banner kind="warn">Avaliação de uso do direito como caução/garantia em processos de terceiros. Levantamento — a aceitação depende de decisão judicial (requer validação jurídica).</Banner>
      <label className="row" style={{ gap: 8, marginBottom: 14 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.active} onChange={set('active')} /> <strong>Ativar avaliação de caução para este caso</strong></label>
      <div className="form-grid">
        <Field label="Tipo de processo de destino"><EnumSelect enumName="collateral_process_type" value={form.process_type} onChange={set('process_type')} allowEmpty /></Field>
        <Field label="Valor da dívida"><input value={form.debt_value || ''} onChange={set('debt_value')} /></Field>
        <Field label="Valor necessário de garantia"><input value={form.required_guarantee_value || ''} onChange={set('required_guarantee_value')} /></Field>
        <Field label="Percentual de cobertura" hint="Calculado (garantia / dívida)"><input value={coverage} readOnly /></Field>
        <Field label="Prazo de uso"><input value={form.usage_term || ''} onChange={set('usage_term')} /></Field>
        <Field label="Remuneração pelo uso"><input value={form.remuneration || ''} onChange={set('remuneration')} /></Field>
        <Field label="Risco de recusa judicial"><EnumSelect enumName="refusal_risk" value={form.refusal_risk} onChange={set('refusal_risk')} /></Field>
        <Field label="Quem assume o risco se não aceito"><input value={form.risk_bearer || ''} onChange={set('risk_bearer')} /></Field>
        <Field label="Contrato necessário"><label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.contract_needed} onChange={set('contract_needed')} /> Exige contrato de caução/cessão</label></Field>
        <div className="full"><Field label="Documentos necessários para apresentar ao juiz"><textarea value={form.docs_for_judge || ''} onChange={set('docs_for_judge')} rows={2} /></Field></div>
        <div className="full"><Field label="Observações"><textarea value={form.notes || ''} onChange={set('notes')} rows={2} /></Field></div>
      </div>
      <div className="row"><button className="btn primary" onClick={save}>Salvar avaliação de caução</button></div>
    </div></div>
  );
}

function PendenciasTab({ c, goResolve }) {
  const p = c.derived.pendencies;
  if (p.length === 0) return <div className="card"><div className="empty"><h3>Sem pendências abertas</h3><p className="muted">Todos os itens essenciais levantados foram preenchidos.</p></div></div>;
  return (
    <div className="card">
      <div className="card-head"><h3>Pendências automáticas ({p.length})</h3><span className="small muted" style={{ marginLeft: 8 }}>recalculadas a cada alteração</span></div>
      <table className="data">
        <thead><tr><th>Severidade</th><th>Pendência</th><th>Validação jurídica</th><th></th></tr></thead>
        <tbody>
          {p.map((x) => (
            <tr key={x.key}>
              <td><span className={`badge ${SEV[x.severity].c}`}>{SEV[x.severity].l}</span></td>
              <td>{x.message}</td>
              <td>{x.requiresLegal ? <span className="pill legal">requer</span> : <span className="muted small">—</span>}</td>
              <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={() => goResolve(x.resolve)}>Resolver →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelatoriosTab({ c, id }) {
  const { meta } = useMeta();
  const types = (meta && meta.reportTypes) || {};
  return (
    <div className="stack">
      <Banner kind="info">Cada relatório abre em nova aba pronto para impressão/PDF. Todos trazem o aviso legal.</Banner>
      <div className="grid2">
        {Object.entries(types).map(([k, label]) => (
          <div className="card" key={k}><div className="card-body between">
            <span style={{ fontWeight: 600 }}>{label}</span>
            <a className="btn sm primary" href={api.reportHtmlUrl(id, k)} target="_blank" rel="noreferrer">Gerar</a>
          </div></div>
        ))}
      </div>
    </div>
  );
}
