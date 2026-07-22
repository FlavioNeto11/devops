import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  StatusBadge, RiskBadge, Progress, Field, EnumSelect, Banner, Loading,
  ConfirmButton, formatMoney, formatBytes, useLabel, useMeta, HelpCallout,
  LegalStatusBadge, friendly,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';

// input que salva no blur (evita chamada por tecla)
function BlurInput({ value, onSave, textarea, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { if (v !== (value ?? '')) onSave(v); };
  const El = textarea ? 'textarea' : 'input';
  return <El {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />;
}

const TAB_FOR_RESOLVE = { case: 'dados', documents: 'documentos', lawsuits: 'processos', legal: 'juridico', tokenization: 'tokenizacao', collateral: 'caucao', pericia: 'pericia' };
const SEV = { blocker: { c: 'b-red', l: 'Bloqueante' }, high: { c: 'b-amber', l: 'Alta' }, medium: { c: 'b-blue', l: 'Média' }, info: { c: 'b-grey', l: 'Informativa' } };
// tipo de credor-alvo do caso -> categoria da jurisprudencia (p/ deep-link cruzado)
const CREDITOR_TO_CATEGORY = {
  banco_do_brasil: 'banco_do_brasil', banco_privado: 'bancos_privados', caixa: 'caixa_economica',
  empresa_privada: 'empresas_privadas', tributo_federal: 'tributos_federais',
  tributo_estadual: 'tributos_estaduais', tributo_municipal: 'tributos_municipais',
};

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('resumo');
  const label = useLabel();

  const load = () => api.get(id).then(setC).catch((e) => setError(friendly(e.message)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const patch = async (promise) => {
    setError(null);
    try { setC(await promise); } catch (e) { setError(friendly(e.message)); }
  };

  if (!c) return error ? <Banner>{error}</Banner> : <Loading />;

  const d = c.derived;
  const tabs = [
    { k: 'resumo', label: 'Resumo', icon: 'gauge' },
    { k: 'dados', label: 'Dados', icon: 'user' },
    { k: 'processos', label: 'Processos', icon: 'briefcase', count: (c.lawsuits || []).length },
    { k: 'documentos', label: 'Documentos', icon: 'file', count: `${d.docPct}%` },
    { k: 'juridico', label: 'Jurídico', icon: 'landmark' },
    { k: 'pericia', label: 'Perícia', icon: 'scale' },
    { k: 'tokenizacao', label: 'Tokenização', icon: 'coins' },
    { k: 'caucao', label: 'Caução', icon: 'shield' },
    { k: 'pendencias', label: 'Pendências', icon: 'alert', count: d.pendencyCount, warn: d.blockerCount > 0 },
    { k: 'relatorios', label: 'Relatórios', icon: 'report' },
  ];

  const goResolve = (resolve) => setTab(TAB_FOR_RESOLVE[resolve] || 'resumo');
  const name = c.holder_name || '(sem titular)';

  return (
    <>
      <div className="crumbs"><Link to="/casos">Casos</Link> / {name}</div>

      <div className="case-summary">
        <div className="cs-top">
          <div className="cs-title">
            <h1>{name}</h1>
            <span className="cs-sub">{c.holder_tax_id || 'sem CPF/CNPJ'} · {label('holder_type', c.holder_type)}{c.origin ? ` · ${c.origin}` : ''}</span>
          </div>
          <div className="cs-actions">
            <Link className="btn sm" to={`/cases/${id}/edit`}><Icon name="edit" /> Editar</Link>
            <a className="btn sm" href={api.reportHtmlUrl(id, 'full_case_report')} target="_blank" rel="noreferrer"><Icon name="report" /> Relatório</a>
            <ConfirmButton
              className="btn danger sm"
              label={<><Icon name="trash" /> Excluir</>}
              confirmLabel="Confirmar exclusão?"
              onConfirm={async () => { setError(null); try { await api.remove(id); navigate('/casos'); } catch (e) { setError(friendly(e.message)); } }}
            />
          </div>
        </div>
        <div className="cs-metrics">
          <div className="cs-metric"><span className="m-k">Status</span><span className="m-v"><StatusBadge status={c.status} /></span></div>
          <div className="cs-metric"><span className="m-k">Risco jurídico</span><span className="m-v"><RiskBadge level={d.risk.level} /></span></div>
          <div className="cs-metric"><span className="m-k">Documentação</span><span className="m-v"><Progress pct={d.docPct} /></span></div>
          <div className="cs-metric"><span className="m-k">Mecanismo</span><span className="m-v" style={{ fontSize: 14 }}>{label('mechanism', c.mechanism)}</span></div>
          <div className="cs-metric"><span className="m-k">Pendências</span><span className="m-v">{d.pendencyCount}{d.blockerCount ? ` · ${d.blockerCount} bloq.` : ''}</span></div>
          <div className="cs-metric"><span className="m-k">Valor estimado</span><span className="m-v">{formatMoney(d.estimatedValue)}</span></div>
        </div>
      </div>

      <MarketplaceBridge caseId={id} c={c} />

      <Banner kind="err">{error}</Banner>

      <div className="detail-layout">
        <nav className="tab-rail">
          {tabs.map((t) => (
            <button key={t.k} className={tab === t.k ? 'active' : ''} aria-current={tab === t.k ? 'true' : undefined} onClick={() => setTab(t.k)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.count !== undefined && t.count !== 0 && <span className={`tab-count ${t.warn ? 'warn' : ''}`}>{t.count}</span>}
            </button>
          ))}
        </nav>
        <div className="detail-content">
          {tab === 'resumo' && <ResumoTab c={c} patch={patch} id={id} goResolve={goResolve} />}
          {tab === 'dados' && <DadosTab c={c} />}
          {tab === 'processos' && <ProcessosTab c={c} id={id} patch={patch} />}
          {tab === 'documentos' && <DocumentosTab c={c} id={id} patch={patch} />}
          {tab === 'juridico' && <JuridicoTab c={c} id={id} patch={patch} />}
          {tab === 'pericia' && <PericiaTab c={c} id={id} patch={patch} />}
          {tab === 'tokenizacao' && <TokenizacaoTab c={c} id={id} patch={patch} />}
          {tab === 'caucao' && <CaucaoTab c={c} id={id} patch={patch} />}
          {tab === 'pendencias' && <PendenciasTab c={c} goResolve={goResolve} />}
          {tab === 'relatorios' && <RelatoriosTab c={c} id={id} />}
        </div>
      </div>
    </>
  );
}

// Ponte caso -> marketplace (só para quem tem titles:create, i.e. Gestor/admin). Tanto criar o
// título quanto "Abrir título →" levam à área de GESTÃO (gated por titles:create); auditor com
// titles:read só de leitura não deve ver esta ponte (cairia em "Acesso restrito"). Ver UX-BESC-002.
// Se o caso já originou um título, linka para o detalhe; se é elegível, permite criar; senão, explica.
function MarketplaceBridge({ caseId, c }) {
  const { hasPerm } = useAuth();
  const navigate = useNavigate();
  const canManage = hasPerm('titles:create');
  const [title, setTitle] = useState(undefined); // undefined = carregando · null = nenhum
  const [err, setErr] = useState(null);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) { setTitle(null); return undefined; }
    let alive = true;
    api.mkt.titles()
      .then((ts) => { if (alive) setTitle((ts || []).find((t) => t.case_id === caseId) || null); })
      .catch(() => { if (alive) setTitle(null); });
    return () => { alive = false; };
  }, [caseId, canManage]);

  if (!canManage) return null;

  const eligible = c.status === 'ready_for_structuring' || c.status === 'ready_with_caveats';
  const withCaveats = c.status === 'ready_with_caveats';

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const t = await api.mkt.createTitle({ caseId, label: c.holder_name || undefined, override });
      navigate(`/gestao/titulos/${t.id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><h3><Icon name="coins" size={16} /> Tokenização (marketplace)</h3></div>
      <div className="card-body">
        {title === undefined && <span className="small muted">Verificando título…</span>}
        {title && (
          <div className="between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span>Este caso já originou o título <strong>{title.label}</strong> <LegalStatusBadge status={title.legal_status} /></span>
            <Link className="btn sm primary" to={`/gestao/titulos/${title.id}`}>Abrir título →</Link>
          </div>
        )}
        {title === null && eligible && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Este caso está apto e ainda não tem título no marketplace.</p>
            <Banner kind="err">{err}</Banner>
            {withCaveats && (
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={override} onChange={(e) => setOverride(e.target.checked)} />
                <span>Caso <em>apto com ressalvas</em>: aceito as ressalvas para originar o título.</span>
              </label>
            )}
            <div className="row">
              <button className="btn primary" disabled={busy || (withCaveats && !override)} onClick={create}>{busy ? <span className="spinner" /> : <Icon name="plus" size={14} />} Criar título do marketplace</button>
            </div>
          </div>
        )}
        {title === null && !eligible && (
          <p className="small muted" style={{ margin: 0 }}>
            Para originar um título, o caso precisa estar <strong>Apto para estruturação</strong> (ou <strong>Apto com ressalvas</strong>).
            Status atual: <StatusBadge status={c.status} />.
          </p>
        )}
      </div>
    </div>
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
  const [busy, setBusy] = useState(false);
  const openNew = () => { setForm(LAWSUIT_EMPTY); setEditing('new'); };
  const openEdit = (l) => { setForm({ ...LAWSUIT_EMPTY, ...l }); setEditing(l.id); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (editing === 'new') await patch(api.addLawsuit(id, form));
      else await patch(api.updateLawsuit(id, editing, form));
      setEditing(null);
    } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <HelpCallout title="Processo judicial de origem">
        Cadastre o processo que dá origem ao direito, se houver. O <strong>número no padrão CNJ</strong> tem
        20 dígitos. Ex.: <em>0001234-56.2010.8.24.0023</em>. Marque a fase (inicial / com sentença / trânsito
        em julgado) — casos com trânsito em julgado tendem a ter risco menor.
      </HelpCallout>
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
          <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : null} Salvar processo</button><button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancelar</button></div>
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

function DocItem({ c, id, doc, patch, statusOptions, REQ }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setUploading(true);
    await patch(api.uploadAttachment(id, doc.key, f));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const atts = doc.attachments || [];
  return (
    <div className="checklist-item">
      <div className="ci-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{doc.label} <span className="pill">{REQ[doc.requirement]}</span></div>
          <BlurInput className="small" style={{ marginTop: 6 }} placeholder="Fonte / origem do documento (opcional)" value={doc.source} onSave={(v) => patch(api.updateDocument(id, doc.key, { source: v }))} />
        </div>
        <div className="ci-controls">
          <button type="button" className="btn sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : <Icon name="upload" size={14} />} Anexar
          </button>
          <input ref={fileRef} type="file" className="file-input" onChange={onFile} />
          <select className="inline-select" value={doc.status} onChange={(e) => patch(api.updateDocument(id, doc.key, { status: e.target.value }))}>
            {statusOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {atts.length > 0 && (
        <div className="attach-list">
          {atts.map((a) => (
            <div className="attach-item" key={a.id}>
              <span className="att-ic"><Icon name="paperclip" size={14} /></span>
              <a className="att-name" href={api.attachmentDownloadUrl(id, doc.key, a.id)} target="_blank" rel="noreferrer">{a.filename}</a>
              <span className="att-meta">{formatBytes(a.size)}</span>
              <span className="att-sp" />
              <a className="btn ghost sm" href={api.attachmentDownloadUrl(id, doc.key, a.id)} target="_blank" rel="noreferrer" title="Baixar / abrir"><Icon name="download" size={14} /></a>
              <ConfirmButton className="btn danger sm" label={<Icon name="trash" size={14} />} confirmLabel="Remover?" onConfirm={() => patch(api.deleteAttachment(id, doc.key, a.id))} />
            </div>
          ))}
        </div>
      )}
      {(doc.refs || []).length > 0 && (
        <div className="attach-list">
          {doc.refs.map((r) => (
            <div className="attach-item" key={r.jurisprudenceId}>
              <span className="att-ic"><Icon name="gavel" size={14} /></span>
              <a className="att-name" href={api.jurisprudenceFileUrl(r.jurisprudenceId)} target="_blank" rel="noreferrer">{r.title || 'Documento judicial vinculado'}</a>
              <span className="att-meta">documento judicial</span>
              <span className="att-sp" />
              <a className="btn ghost sm" href={api.jurisprudenceFileUrl(r.jurisprudenceId)} target="_blank" rel="noreferrer" title="Abrir o PDF"><Icon name="download" size={14} /></a>
              <a className="btn ghost sm" href={`/besc/jurisprudencia/${r.jurisprudenceId}`} target="_blank" rel="noreferrer" title="Ficha completa">Ficha</a>
            </div>
          ))}
        </div>
      )}
      <BlurInput textarea className="small" style={{ marginTop: 8 }} rows={1} placeholder="Observações…" value={doc.notes} onSave={(v) => patch(api.updateDocument(id, doc.key, { notes: v }))} />
    </div>
  );
}

function DocumentosTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.docCategories) || {};
  const groups = groupBy(c.documents, 'category');
  const REQ = { required: 'Obrigatório', conditional: 'Condicional', optional: 'Opcional' };
  const statusOptions = Object.entries((meta && meta.enums.document_status) || {});
  return (
    <div className="stack">
      <JudicialDocsPanel precedents={c.precedents} title="Documentos judiciais do caso" hint="Peças e decisões judiciais deste caso (das ações do BESC). Abra ou baixe o PDF diretamente aqui." />
      <HelpCallout title={`Documentação ${c.derived.docPct}% concluída (validados ÷ aplicáveis)`}>
        Avance o status conforme o andamento: <strong>Pendente → Recebido → Em análise → Validado</strong>.
        Anexe o arquivo (PDF, imagem, etc.) em cada documento com o botão <strong>Anexar</strong> — ao anexar, o
        status vira “Recebido” automaticamente. Alguns documentos são condicionais (ex.: certidão de óbito e formal
        de partilha só para espólio/herdeiros).
      </HelpCallout>
      {Object.keys(cats).map((cat) => groups[cat] && (
        <div className="card" key={cat}>
          <div className="card-head"><h3>{cats[cat]}</h3></div>
          <div className="card-body">
            {groups[cat].map((doc) => (
              <DocItem key={doc.key} c={c} id={id} doc={doc} patch={patch} statusOptions={statusOptions} REQ={REQ} />
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

// Painel de documentos judiciais vinculados ao caso (peças/decisões — os PDFs vivem na
// coleção de jurisprudência no PVC; aqui damos acesso direto a Ver PDF + Ficha).
function JudicialDocsPanel({ precedents, title = 'Documentos judiciais do caso', hint }) {
  const [items, setItems] = useState(null);
  const label = useLabel();
  useEffect(() => {
    let alive = true;
    if (!precedents || precedents.length === 0) { setItems([]); return; }
    Promise.all(precedents.map((pid) => api.jurisprudenceGet(pid).catch(() => null)))
      .then((r) => { if (alive) setItems(r.filter(Boolean)); });
    return () => { alive = false; };
  }, [precedents]);
  if (!precedents || precedents.length === 0) return null;
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="tab-count" style={{ marginLeft: 4 }}>{precedents.length}</span></div>
      <div className="card-body">
        {hint && <p className="small muted" style={{ margin: '-4px 0 12px' }}>{hint}</p>}
        {!items && <span className="small muted">Carregando…</span>}
        {items && items.map((j) => (
          <div key={j.id} className="between" style={{ padding: '11px 0', borderBottom: '1px solid var(--line-soft)', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{j.title}</div>
              <div className="small muted" style={{ marginTop: 3 }}>{[label('tribunal', j.tribunal), j.instancia && label('instancia', j.instancia), j.year, j.processNumber].filter(Boolean).join(' · ')}</div>
              <div className="chip-row" style={{ marginTop: 7 }}>
                {(j.mechanism || []).map((m) => <span key={m} className="chip">{label('mechanism', m)}</span>)}
                {j.outcome && <span className={`badge ${{ favoravel: 'b-green', parcial: 'b-amber', desfavoravel: 'b-red', indefinido: 'b-grey' }[j.outcome] || 'b-grey'}`}>{label('outcome', j.outcome)}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexShrink: 0 }}>
              {j.fileRef && j.fileRef.stored && <a className="btn sm" href={api.jurisprudenceFileUrl(j.id)} target="_blank" rel="noreferrer" title="Abrir o PDF do documento"><Icon name="file" size={13} /> Ver PDF</a>}
              {j.fileRef && j.fileRef.stored && <a className="btn ghost sm" href={api.jurisprudenceFileUrl(j.id)} download title="Baixar o PDF"><Icon name="download" size={13} /></a>}
              <a className="btn ghost sm" href={`/besc/jurisprudencia/${j.id}`} target="_blank" rel="noreferrer" title="Abrir a ficha completa (ementa)">Ficha</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JuridicoTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.legalCategories) || {};
  const groups = groupBy(c.legal, 'category');
  return (
    <div className="stack">
      <JudicialDocsPanel precedents={c.precedents} title="Jurisprudência de apoio vinculada" hint="Decisões vinculadas a este caso — servem de fundamento jurídico." />
      <HelpCallout title="Perguntas de levantamento (requerem validação jurídica)">
        Responda o que já se sabe: <strong>Sim / Não / Parcial / Não avaliado / Não se aplica</strong>. Deixar
        “Não avaliado” é honesto e vira pendência para lembrar de resolver. Ex.: em “Pode ser cedido?”, se ainda
        não há confirmação, deixe <em>Não avaliado</em> e anote nas observações “aguardando parecer”. O sistema
        não conclui mérito jurídico.
      </HelpCallout>
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
                {it.key === 'favorable_case_law' && (
                  <Link className="btn ghost sm" style={{ marginTop: 6 }} to={`/jurisprudencia?outcome=favoravel${c.target_creditor_type && c.target_creditor_type !== 'outro' ? `&creditorCategory=${CREDITOR_TO_CATEGORY[c.target_creditor_type] || ''}` : ''}`}>
                    <Icon name="gavel" size={13} /> Ver jurisprudência favorável no acervo →
                  </Link>
                )}
                <BlurInput textarea className="small" rows={1} style={{ marginTop: 8 }} placeholder="Observações / evidência…" value={it.notes} onSave={(v) => patch(api.updateLegal(id, it.key, { notes: v }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PericiaTab({ c, id, patch }) {
  const [form, setForm] = useState(c.pericia || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(c.pericia || {}); }, [c]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = async () => { if (busy) return; setBusy(true); try { await patch(api.updatePericia(id, form)); } finally { setBusy(false); } };
  const agio = (() => {
    const a = parseFloat(String(form.acquisition_price || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    const u = parseFloat(String(form.updated_value_pericial || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(a) || Number.isNaN(u)) return null;
    return u - a;
  })();
  return (
    <div className="card"><div className="card-body">
      <HelpCallout title="Perícia e atualização monetária (registro do laudo)">
        A perícia confirma a <strong>autenticidade da cártula</strong> e apura a <strong>atualização monetária</strong>
        do valor pago na aquisição até hoje — que gera o <strong>ágio</strong>. O sistema <strong>registra</strong> o
        laudo informado; não calcula o valor oficial. A atualização baseia-se na data e no preço de aquisição, não no
        valor de conversão da AGE do Banco do Brasil.
      </HelpCallout>
      <label className="row" style={{ gap: 8, marginBottom: 14 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.active} onChange={set('active')} /> <strong>Ativar módulo de perícia para este caso</strong></label>
      <div className="form-grid">
        <Field label="Preço de aquisição (R$)" help="Valor pago na época da aquisição — base da atualização." example="Comprou por R$ 5.000 em 1998."><input value={form.acquisition_price || ''} onChange={set('acquisition_price')} /></Field>
        <Field label="Data-base de aquisição" example="1998 ou 03/1998"><input value={form.acquisition_date || ''} onChange={set('acquisition_date')} /></Field>
        <Field label="Índice de atualização"><EnumSelect enumName="monetary_index" value={form.monetary_index} onChange={set('monetary_index')} allowEmpty /></Field>
        <Field label="Valor atualizado no laudo (R$)" hint="Informado pelo laudo pericial"><input value={form.updated_value_pericial || ''} onChange={set('updated_value_pericial')} /></Field>
        <Field label="Ágio (R$)" hint={agio != null ? `sugerido: ${formatMoney(agio)}` : 'valor - aquisição'}><input value={form.agio || ''} onChange={set('agio')} /></Field>
        <Field label="Perito / entidade"><input value={form.perito || ''} onChange={set('perito')} /></Field>
        <Field label="Status do laudo"><EnumSelect enumName="laudo_status" value={form.laudo_status} onChange={set('laudo_status')} /></Field>
        <Field label="Autenticidade da cártula"><EnumSelect enumName="authenticity_status" value={form.authenticity_status} onChange={set('authenticity_status')} /></Field>
        <div className="full"><Field label="Observações"><textarea value={form.notes || ''} onChange={set('notes')} rows={2} /></Field></div>
      </div>
      <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : null} Salvar perícia</button></div>
    </div></div>
  );
}

function TokenizacaoTab({ c, id, patch }) {
  const { meta } = useMeta();
  const cats = (meta && meta.catalogs.tokenizationCategories) || {};
  const groups = groupBy(c.tokenization, 'category');
  return (
    <div className="stack">
      <HelpCallout title="O que seria tokenizado + enquadramento (levantamento)">
        Descreva <strong>o que</strong> o token representaria e o <strong>lastro</strong>; responda as escolhas
        técnicas (fracionamento, blockchain, whitelist, KYC…). No campo de definição, escreva o conteúdo — ex.:
        em “O que será tokenizado”: <em>“direito creditório reconhecido na sentença do processo nº … — parcela de
        X ações ON”</em>. Itens <span className="pill legal">requer validação</span> são regulatórios (CVM/BCB/LGPD).
        O sistema não executa tokenização.
      </HelpCallout>
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
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(c.collateral || {}); }, [c]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = async () => { if (busy) return; setBusy(true); try { await patch(api.updateCollateral(id, form)); } finally { setBusy(false); } };
  const coverage = (() => {
    const debt = parseFloat(String(form.debt_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    const guar = parseFloat(String(form.required_guarantee_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(debt) || Number.isNaN(guar) || debt === 0) return '—';
    return `${Math.round((guar / debt) * 100)}%`;
  })();
  return (
    <div className="card"><div className="card-body">
      <HelpCallout title="Oferecer o direito como garantia em outro processo">
        Ative se pretende usar o direito como <strong>caução/garantia</strong> (execução fiscal, trabalhista,
        cível, substituição de penhora…). Ex.: dívida de execução fiscal de <em>R$ 200.000</em> → “valor
        necessário de garantia” R$ 200.000; a cobertura % é calculada. Direitos ilíquidos/litigiosos costumam
        ser recusados — laudo, trânsito em julgado e parecer reduzem o risco. A aceitação é decisão do juízo
        (requer validação jurídica).
      </HelpCallout>
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
      <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : null} Salvar avaliação de caução</button></div>
    </div></div>
  );
}

function PendenciasTab({ c, goResolve }) {
  const p = c.derived.pendencies;
  if (p.length === 0) return <div className="card"><div className="empty"><h3>Sem pendências abertas</h3><p className="muted">Todos os itens essenciais levantados foram preenchidos.</p></div></div>;
  return (
    <div className="card">
      <div className="card-head"><h3>Pendências automáticas ({p.length})</h3><span className="small muted" style={{ marginLeft: 8 }}>recalculadas a cada alteração</span></div>
      <div style={{ overflowX: 'auto' }}>
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
