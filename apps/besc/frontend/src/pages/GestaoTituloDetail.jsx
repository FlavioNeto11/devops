import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Banner, Loading, Field, ConfirmButton, HelpCallout, useLabel,
  LegalStatusBadge, ListingBadge, AvailableBadge, formatBRL, LEGAL_STATUS_LABEL,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';

const PURPOSE_LABEL = { purchase: 'Compra', collateral: 'Caução', lease_backing: 'Lastro de aluguel' };
const CONTRACT_STATUS = {
  active: { l: 'Ativo', c: 'b-green' }, suspended: { l: 'Suspenso', c: 'b-amber' },
  substituted: { l: 'Substituído', c: 'b-blue' }, written_off: { l: 'Baixado', c: 'b-red' },
  settled: { l: 'Liquidado', c: 'b-grey' }, terminated: { l: 'Encerrado', c: 'b-grey' },
};
const PARAM_STATUS = { draft: { l: 'Rascunho', c: 'b-grey' }, active: { l: 'Ativa', c: 'b-green' }, superseded: { l: 'Substituída', c: 'b-grey' } };

function fmtDateTime(s) { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR'); }
function fmtDate(s) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR');
}

// nº de tokens já emitidos (exclui lotes queimados/falhos) — espelha a invariante de supply da API
function emittedTokens(batches) {
  return (batches || []).filter((b) => !['burned', 'failed'].includes(b.status)).reduce((s, b) => s + Number(b.quantity || 0), 0);
}

// efeito-cascata esperado da transição (espelha cascadeFor em api/src/marketplace/states.js)
function cascadeDesc(to) {
  if (to === 'ruled_against' || to === 'under_appeal') return 'Suspende os contratos ativos (congela obrigações; o já devido permanece devido) e bloqueia novas contratações.';
  if (to === 'reinstated' || to === 'ruled_favorable' || to === 'unjudged') return 'Reativa os contratos suspensos e volta a permitir contratações (se o título estiver publicado).';
  if (to === 'defeated') return 'O título "cai": os contratos entram em resolução (substituição ou baixa) e novas contratações ficam bloqueadas definitivamente.';
  if (to === 'archived') return 'Retira o título do catálogo (organização) — por si só não altera contratos vigentes.';
  return '';
}

const TABS = [
  { k: 'resumo', label: 'Resumo', icon: 'gauge' },
  { k: 'valor', label: 'Valor de mercado', icon: 'coins' },
  { k: 'parametros', label: 'Parâmetros', icon: 'layers' },
  { k: 'emissoes', label: 'Emissões', icon: 'briefcase' },
  { k: 'contratos', label: 'Contratos', icon: 'file' },
  { k: 'juridico', label: 'Estado jurídico', icon: 'landmark' },
  { k: 'publicacao', label: 'Publicação', icon: 'report' },
];

export default function GestaoTituloDetail() {
  const { id } = useParams();
  const [title, setTitle] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [mktMeta, setMktMeta] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('resumo');

  const load = () => {
    setError(null);
    return Promise.all([api.mkt.title(id), api.mkt.contracts(id).catch(() => [])])
      .then(([t, cs]) => { setTitle(t); setContracts(cs); })
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { api.mkt.meta().then(setMktMeta).catch(() => setMktMeta({ legalStatuses: LEGAL_STATUS_LABEL, transitions: {} })); }, []);

  // ação que salva e recarrega, exibindo erro amigável
  const run = async (promise) => {
    setError(null);
    try { await promise; await load(); return true; } catch (e) { setError(e.message); return false; }
  };

  if (!title) return error ? <Banner>{error}</Banner> : <Loading label="Carregando título…" />;

  const activeParam = (title.parameters || []).find((p) => p.status === 'active') || null;
  const factor = activeParam ? Number(activeParam.tokens_per_share) : null;
  const emitted = emittedTokens(title.batches);
  const totalCap = factor != null ? Number(title.share_quantity) * factor : null;
  const remaining = totalCap != null ? totalCap - emitted : null;
  const supply = { activeParam, factor, emitted, totalCap, remaining };

  const counts = {
    valor: (title.valuations || []).length,
    parametros: (title.parameters || []).length,
    emissoes: (title.batches || []).length,
    contratos: contracts.length,
    juridico: (title.legalHistory || []).length,
  };

  return (
    <>
      <div className="crumbs"><Link to="/gestao/titulos">Gestão de títulos</Link> / {title.label}</div>

      <div className="case-summary">
        <div className="cs-top">
          <div className="cs-title">
            <h1>{title.label}</h1>
            <span className="cs-sub">
              {title.case_id ? <Link to={`/cases/${title.case_id}`}>ver caso de origem</Link> : 'sem caso'}
              {' · '}{title.share_quantity} ação(ões)
            </span>
          </div>
          <div className="cs-actions">
            <LegalStatusBadge status={title.legal_status} />
            <ListingBadge status={title.listing_status} />
            <AvailableBadge available={title.available} />
          </div>
        </div>
        <div className="cs-metrics">
          <div className="cs-metric"><span className="m-k">Valor unitário ativo</span><span className="m-v">{formatBRL(activeParam ? activeParam.unit_face_value : null)}</span></div>
          <div className="cs-metric"><span className="m-k">Fator (tokens/ação)</span><span className="m-v">{factor != null ? factor.toLocaleString('pt-BR') : '—'}</span></div>
          <div className="cs-metric"><span className="m-k">Supply emitido</span><span className="m-v">{emitted.toLocaleString('pt-BR')}{totalCap != null ? ` / ${totalCap.toLocaleString('pt-BR')}` : ''}</span></div>
          <div className="cs-metric"><span className="m-k">Última avaliação</span><span className="m-v">{formatBRL((title.valuations || [])[0] && title.valuations[0].value_per_share)}</span></div>
        </div>
      </div>

      <Banner kind="err">{error}</Banner>

      <div className="detail-layout">
        <nav className="tab-rail">
          {TABS.map((t) => (
            <button key={t.k} className={tab === t.k ? 'active' : ''} aria-current={tab === t.k ? 'true' : undefined} onClick={() => setTab(t.k)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {counts[t.k] !== undefined && counts[t.k] !== 0 && <span className="tab-count">{counts[t.k]}</span>}
            </button>
          ))}
        </nav>
        <div className="detail-content">
          {tab === 'resumo' && <ResumoTab title={title} supply={supply} />}
          {tab === 'valor' && <ValorTab title={title} run={run} />}
          {tab === 'parametros' && <ParametrosTab title={title} supply={supply} run={run} />}
          {tab === 'emissoes' && <EmissoesTab title={title} supply={supply} run={run} />}
          {tab === 'contratos' && <ContratosTab title={title} contracts={contracts} run={run} />}
          {tab === 'juridico' && <JuridicoTab title={title} mktMeta={mktMeta} run={run} />}
          {tab === 'publicacao' && <PublicacaoTab title={title} run={run} />}
        </div>
      </div>
    </>
  );
}

function ResumoTab({ title, supply }) {
  const label = useLabel();
  const snap = title.eligibility_snapshot || {};
  const F = ({ k, v }) => (<><dt>{k}</dt><dd>{v || v === 0 ? v : <span className="muted">—</span>}</dd></>);
  return (
    <div className="stack">
      <div className="grid2">
        <div className="card"><div className="card-body stat"><span className="k">Supply emitido</span><span className="v">{supply.emitted.toLocaleString('pt-BR')}</span><span className="small muted">{supply.totalCap != null ? `de ${supply.totalCap.toLocaleString('pt-BR')} · restam ${supply.remaining.toLocaleString('pt-BR')}` : 'sem parâmetro ativo'}</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Valor unitário ativo</span><span className="v">{formatBRL(supply.activeParam ? supply.activeParam.unit_face_value : null)}</span><span className="small muted">{supply.activeParam ? `parâmetro v${supply.activeParam.version}` : 'nenhum ativo'}</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Disponibilidade</span><span className="v" style={{ fontSize: 16 }}><AvailableBadge available={title.available} /></span><span className="small muted">derivada de estado jurídico + publicação</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Estado jurídico</span><span className="v" style={{ fontSize: 16 }}><LegalStatusBadge status={title.legal_status} /></span></div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Dados do título</h3></div>
        <div className="card-body">
          <dl className="kv">
            <F k="Nome" v={title.label} />
            <F k="Classe das ações" v={label('share_class', title.share_class)} />
            <F k="Quantidade de ações" v={title.share_quantity} />
            <F k="Estado jurídico" v={<LegalStatusBadge status={title.legal_status} />} />
            <F k="Publicação" v={<ListingBadge status={title.listing_status} />} />
            <F k="Disponível p/ contratação" v={<AvailableBadge available={title.available} />} />
            <F k="Criado em" v={fmtDateTime(title.created_at)} />
            <F k="Caso de origem" v={title.case_id ? <Link to={`/cases/${title.case_id}`}>abrir caso</Link> : '—'} />
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Snapshot de elegibilidade</h3><span className="small muted" style={{ marginLeft: 8 }}>congelado no cadastro</span></div>
        <div className="card-body">
          <HelpCallout title="Com que base este ativo entrou no marketplace">
            Retrato do caso no momento em que o título foi criado — não muda depois. Serve de auditoria permanente.
          </HelpCallout>
          <dl className="kv" style={{ marginTop: 10 }}>
            <F k="Status do caso" v={snap.caseStatus ? label('case_status', snap.caseStatus) : '—'} />
            <F k="Risco jurídico" v={snap.risk || '—'} />
            <F k="Documentação" v={snap.docPct != null ? `${snap.docPct}%` : '—'} />
            <F k="Pendências abertas" v={snap.pendencyCount} />
            <F k="Aceito com ressalvas (override)" v={title.eligibility_override ? 'Sim' : 'Não'} />
            <F k="Registrado em" v={snap.at ? fmtDateTime(snap.at) : '—'} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ValorTab({ title, run }) {
  const [form, setForm] = useState({ valuePerShare: '', valuationDate: '', source: 'manual', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    const ok = await run(api.mkt.addValuation(title.id, {
      valuePerShare: Number(form.valuePerShare),
      valuationDate: form.valuationDate || undefined,
      source: form.source || undefined,
      notes: form.notes || undefined,
    }));
    setBusy(false);
    if (ok) setForm({ valuePerShare: '', valuationDate: '', source: 'manual', notes: '' });
  };
  const vals = title.valuations || [];
  return (
    <div className="stack">
      <HelpCallout title="Valor de mercado da ação (série append-only)">
        Cada registro é a <strong>opinião de mercado</strong> por ação numa data, sempre citando a fonte. É informativo:
        não muda contratos já celebrados. O valor de <em>prateleira</em> do token vem dos <strong>Parâmetros</strong>,
        derivado destas avaliações. Registros antigos nunca são editados nem apagados.
      </HelpCallout>

      <div className="card">
        <div className="card-head"><h3>Nova avaliação</h3></div>
        <div className="card-body">
          <div className="form-grid">
            <Field label="Valor por ação (R$)" help="Valor de mercado unitário da ação, apurado por perícia ou avaliação." example="1000 ou 1500.50"><input inputMode="decimal" value={form.valuePerShare} onChange={set('valuePerShare')} placeholder="0,00" /></Field>
            <Field label="Data da avaliação" hint="Se vazio, usa hoje"><input type="date" value={form.valuationDate} onChange={set('valuationDate')} /></Field>
            <Field label="Fonte"><select value={form.source} onChange={set('source')}><option value="manual">Manual</option><option value="pericia">Perícia</option></select></Field>
            <div className="full"><Field label="Observações"><textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Ex.: laudo pericial nº …, evidência anexada ao caso." /></Field></div>
          </div>
          <div className="row"><button className="btn primary" disabled={busy || !(Number(form.valuePerShare) > 0)} onClick={save}>{busy ? <span className="spinner" /> : null} Registrar avaliação</button></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Histórico de avaliações ({vals.length})</h3></div>
        {vals.length === 0
          ? <div className="empty"><p className="muted">Nenhuma avaliação registrada ainda.</p></div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Data</th><th>Valor por ação</th><th>Fonte</th><th>Observações</th></tr></thead>
                <tbody>
                  {vals.map((v) => (
                    <tr key={v.id}>
                      <td>{fmtDate(v.valuation_date)}</td>
                      <td>{formatBRL(v.value_per_share)}</td>
                      <td>{v.source === 'pericia' ? 'Perícia' : 'Manual'}</td>
                      <td>{v.notes || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

function ParametrosTab({ title, supply, run }) {
  const hasEmission = supply.emitted > 0;
  const lastFactor = (title.parameters || [])[0] ? Number(title.parameters[0].tokens_per_share) : '';
  const [form, setForm] = useState({ tokensPerShare: '', unitFaceValue: '', basedOnValuationId: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // fator congela após a 1ª emissão: força o valor vigente e trava o campo
  useEffect(() => { if (hasEmission && lastFactor) setForm((f) => ({ ...f, tokensPerShare: String(lastFactor) })); }, [hasEmission, lastFactor]);

  const save = async () => {
    setBusy(true);
    const ok = await run(api.mkt.addParameter(title.id, {
      tokensPerShare: parseInt(form.tokensPerShare, 10),
      unitFaceValue: Number(form.unitFaceValue),
      basedOnValuationId: form.basedOnValuationId || undefined,
    }));
    setBusy(false);
    if (ok) setForm({ tokensPerShare: hasEmission ? String(lastFactor) : '', unitFaceValue: '', basedOnValuationId: '' });
  };

  const params = title.parameters || [];
  const vals = title.valuations || [];
  return (
    <div className="stack">
      <HelpCallout title="Parâmetros de tokenização (versionados)">
        Definem o <strong>fator ação→tokens</strong> e o <strong>valor unitário</strong> de contratação. Só existe
        <strong> uma versão ativa</strong> por vez; ativar uma nova encerra a anterior. <strong>Atenção:</strong> o fator
        <em> congela após a 1ª emissão</em> — a partir daí, novas versões só podem mudar o valor unitário.
      </HelpCallout>

      <div className="card">
        <div className="card-head"><h3>Nova versão de parâmetro</h3></div>
        <div className="card-body">
          {hasEmission && <Banner kind="info">Já houve emissão: o fator (tokens/ação) está travado em <strong>{lastFactor}</strong>. Nesta versão só é possível alterar o valor unitário.</Banner>}
          <div className="form-grid">
            <Field label="Fator (tokens por ação)" help="Quantos tokens cada ação vira. Imutável após a 1ª emissão." example="100"><input inputMode="numeric" value={form.tokensPerShare} onChange={set('tokensPerShare')} readOnly={hasEmission} placeholder="Ex.: 100" /></Field>
            <Field label="Valor unitário do token (R$)" help="Preço de prateleira de cada token na contratação." example="10 ou 12.50"><input inputMode="decimal" value={form.unitFaceValue} onChange={set('unitFaceValue')} placeholder="0,00" /></Field>
            <Field label="Baseado na avaliação (opcional)" hint="Rastreia qual avaliação motivou o preço">
              <select value={form.basedOnValuationId} onChange={set('basedOnValuationId')}>
                <option value="">—</option>
                {vals.map((v) => <option key={v.id} value={v.id}>{fmtDate(v.valuation_date)} · {formatBRL(v.value_per_share)}/ação</option>)}
              </select>
            </Field>
          </div>
          <div className="row"><button className="btn primary" disabled={busy || !(parseInt(form.tokensPerShare, 10) > 0) || !(Number(form.unitFaceValue) > 0)} onClick={save}>{busy ? <span className="spinner" /> : null} Criar versão (rascunho)</button></div>
          <p className="small muted" style={{ marginTop: 8 }}>A versão nasce como <strong>rascunho</strong>. Ative-a na lista abaixo para que ela passe a valer.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Versões ({params.length})</h3></div>
        {params.length === 0
          ? <div className="empty"><p className="muted">Nenhum parâmetro criado. Crie e ative uma versão antes de emitir tokens.</p></div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Versão</th><th>Fator</th><th>Valor unitário</th><th>Status</th><th>Vigência</th><th></th></tr></thead>
                <tbody>
                  {params.map((p) => {
                    const s = PARAM_STATUS[p.status] || { l: p.status, c: 'b-grey' };
                    return (
                      <tr key={p.id}>
                        <td>v{p.version}</td>
                        <td>{Number(p.tokens_per_share).toLocaleString('pt-BR')}</td>
                        <td>{formatBRL(p.unit_face_value)}</td>
                        <td><span className={`badge ${s.c}`}>{s.l}</span></td>
                        <td className="small muted">{p.effective_from ? `${fmtDateTime(p.effective_from)}${p.effective_to ? ` → ${fmtDateTime(p.effective_to)}` : ' → vigente'}` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'draft' && <ConfirmButton className="btn primary sm" label="Ativar" confirmLabel="Confirmar ativação?" onConfirm={() => run(api.mkt.activateParameter(p.id))} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

function EmissoesTab({ title, supply, run }) {
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(api.mkt.addBatch(title.id, { quantity: parseInt(qty, 10) }));
    setBusy(false);
    if (ok) setQty('');
  };
  const batches = title.batches || [];
  const noParam = !supply.activeParam;
  const q = parseInt(qty, 10);
  const overflow = supply.remaining != null && q > 0 && q > supply.remaining;
  return (
    <div className="stack">
      <HelpCallout title="Emissão de lotes de tokens">
        Cada emissão exige um <strong>parâmetro ativo</strong> e respeita o teto de supply:
        <strong> nº de ações × fator</strong>. Os tokens nascem na tesouraria do emissor e ficam disponíveis para
        contratação.
      </HelpCallout>

      <div className="grid2">
        <div className="card"><div className="card-body stat"><span className="k">Supply emitido</span><span className="v">{supply.emitted.toLocaleString('pt-BR')}</span></div></div>
        <div className="card"><div className="card-body stat"><span className="k">Supply restante</span><span className="v">{supply.remaining != null ? supply.remaining.toLocaleString('pt-BR') : '—'}</span><span className="small muted">{supply.totalCap != null ? `teto ${supply.totalCap.toLocaleString('pt-BR')} = ${title.share_quantity} × ${supply.factor}` : 'defina e ative um parâmetro'}</span></div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Emitir lote</h3></div>
        <div className="card-body">
          {noParam && <Banner kind="info">Nenhum parâmetro ativo. Crie e ative um parâmetro na aba <strong>Parâmetros</strong> antes de emitir.</Banner>}
          <div className="form-grid">
            <Field label="Quantidade de tokens" hint={supply.remaining != null ? `restam ${supply.remaining.toLocaleString('pt-BR')}` : ''}><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ex.: 1000" disabled={noParam} /></Field>
          </div>
          {overflow && <Banner kind="err">Quantidade acima do supply restante ({supply.remaining.toLocaleString('pt-BR')}).</Banner>}
          <div className="row"><button className="btn primary" disabled={busy || noParam || !(q > 0) || overflow} onClick={save}>{busy ? <span className="spinner" /> : null} Emitir lote</button></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Lotes emitidos ({batches.length})</h3></div>
        {batches.length === 0
          ? <div className="empty"><p className="muted">Nenhum lote emitido ainda.</p></div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Quantidade</th><th>Valor unit. na emissão</th><th>Status</th><th>Emitido em</th><th>Referência (sim)</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>{Number(b.quantity).toLocaleString('pt-BR')}</td>
                      <td>{formatBRL(b.unit_face_value_at_issuance)}</td>
                      <td><span className={`badge ${b.status === 'minted' ? 'b-green' : b.status === 'burned' || b.status === 'failed' ? 'b-red' : 'b-grey'}`}>{b.status}</span></td>
                      <td>{fmtDateTime(b.issued_at || b.created_at)}</td>
                      <td className="small muted" style={{ fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.chain_tx_hash || ''}>{b.chain_tx_hash ? b.chain_tx_hash.slice(0, 18) + '…' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

function ContratosTab({ title, contracts, run }) {
  const isDefeated = title.legal_status === 'defeated';
  const [destTitles, setDestTitles] = useState(null);
  const [subFor, setSubFor] = useState(null); // contract id em modo substituir
  const [dest, setDest] = useState('');

  useEffect(() => {
    if (!isDefeated) return;
    api.mkt.titles()
      .then((ts) => setDestTitles(ts.filter((t) => t.id !== title.id && t.available)))
      .catch(() => setDestTitles([]));
  }, [isDefeated, title.id]);

  const openSub = (cid) => { setSubFor(cid); setDest(''); };
  const doSub = async (cid) => {
    if (!dest) return;
    const ok = await run(api.mkt.substituteContract(cid, { toTitleId: dest }));
    if (ok) { setSubFor(null); setDest(''); }
  };

  return (
    <div className="stack">
      <HelpCallout title="Contratos com valor de face travado">
        Ao contratar, o valor unitário do parâmetro vigente é <strong>congelado</strong> no contrato — não muda mais,
        para cima ou para baixo. Quando o título é <strong>definitivamente negado</strong>, cada contrato entra em
        resolução: o titular pode <strong>substituir</strong> por outro título disponível (preservando o montante) ou
        <strong> dar baixa</strong> (nada além do já devido).
      </HelpCallout>

      {isDefeated && <Banner kind="err">Este título foi <strong>definitivamente negado</strong>. Resolva os contratos suspensos abaixo por substituição ou baixa.</Banner>}

      <div className="card">
        <div className="card-head"><h3>Contratos ({contracts.length})</h3></div>
        {contracts.length === 0
          ? <div className="empty"><p className="muted">Nenhum contrato para este título.</p></div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Contrato</th><th>Finalidade</th><th>Qtde</th><th>Valor travado</th><th>Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {contracts.map((c) => {
                    const st = CONTRACT_STATUS[c.status] || { l: c.status, c: 'b-grey' };
                    const resolvable = isDefeated && (c.status === 'suspended' || c.status === 'active');
                    return (
                      <React.Fragment key={c.id}>
                        <tr>
                          <td><span style={{ fontFamily: 'monospace' }}>{c.contract_number}</span></td>
                          <td>{PURPOSE_LABEL[c.purpose] || c.purpose}</td>
                          <td>{Number(c.quantity).toLocaleString('pt-BR')}</td>
                          <td>{formatBRL(c.unit_face_value_frozen)}</td>
                          <td>{formatBRL(c.total_face_value)}</td>
                          <td><span className={`badge ${st.c}`}>{st.l}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {resolvable && (
                              <>
                                <button className="btn sm" onClick={() => openSub(c.id)}><Icon name="layers" size={13} /> Substituir</button>{' '}
                                <ConfirmButton className="btn danger sm" label="Dar baixa" confirmLabel="Confirmar baixa?" onConfirm={() => run(api.mkt.writeOffContract(c.id))} />
                              </>
                            )}
                          </td>
                        </tr>
                        {subFor === c.id && (
                          <tr>
                            <td colSpan={7}>
                              <div className="card" style={{ margin: '4px 0' }}><div className="card-body">
                                <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                  <Field label="Título destino (disponível)">
                                    <select value={dest} onChange={(e) => setDest(e.target.value)} style={{ minWidth: 260 }}>
                                      <option value="">— selecione —</option>
                                      {(destTitles || []).map((t) => <option key={t.id} value={t.id}>{t.label} · {formatBRL(t.active_unit_value)}/token</option>)}
                                    </select>
                                  </Field>
                                  <ConfirmButton className="btn primary sm" label="Substituir contrato" confirmLabel="Confirmar substituição?" onConfirm={() => doSub(c.id)} />
                                  <button className="btn sm" onClick={() => setSubFor(null)}>Cancelar</button>
                                </div>
                                {destTitles && destTitles.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>Nenhum título disponível para receber a substituição.</p>}
                                <p className="small muted" style={{ marginTop: 8 }}>Preserva-se o <strong>montante travado</strong> ({formatBRL(c.total_face_value)}); a nova quantidade = montante ÷ valor unitário do título destino (o residual vira crédito do titular).</p>
                              </div></div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

function JuridicoTab({ title, mktMeta, run }) {
  const [toStatus, setToStatus] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const transitions = (mktMeta && mktMeta.transitions) || {};
  const allowed = transitions[title.legal_status] || [];
  const history = title.legalHistory || [];

  const apply = async () => {
    if (!toStatus || reason.trim().length < 3) return;
    const ok = await run(api.mkt.transitionLegal(title.id, {
      toStatus,
      reason: reason.trim(),
      evidenceRef: evidence.trim() ? { ref: evidence.trim() } : undefined,
    }));
    if (ok) { setToStatus(''); setReason(''); setEvidence(''); }
  };

  return (
    <div className="stack">
      <HelpCallout title="Máquina de estado jurídico (transição sensível)">
        A transição governa a <strong>disponibilidade</strong> do título e dispara efeitos em cascata sobre os
        contratos. Só o Gestor transiciona, sempre com <strong>justificativa</strong> obrigatória e, de preferência,
        uma <strong>evidência</strong>. Só aparecem os destinos permitidos a partir do estado atual.
      </HelpCallout>

      <div className="card">
        <div className="card-head"><h3>Estado atual</h3><div className="spacer" style={{ flex: 1 }} /><LegalStatusBadge status={title.legal_status} /></div>
        <div className="card-body">
          {allowed.length === 0
            ? <Banner kind="info">Não há transições disponíveis a partir do estado atual.</Banner>
            : (
              <>
                <div className="form-grid">
                  <Field label="Novo estado">
                    <select value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                      <option value="">— selecione —</option>
                      {allowed.map((s) => <option key={s} value={s}>{(mktMeta.legalStatuses && mktMeta.legalStatuses[s]) || s}</option>)}
                    </select>
                  </Field>
                  <Field label="Evidência (opcional)" hint="Nº do processo/decisão ou referência do anexo"><input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ex.: proc. 0001234-56.2010.8.24.0023" /></Field>
                  <div className="full"><Field label="Justificativa (obrigatória)"><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo da transição." /></Field></div>
                </div>
                {toStatus && <Banner kind="info"><strong>Efeito esperado:</strong> {cascadeDesc(toStatus)}</Banner>}
                <div className="row">
                  <ConfirmButton
                    className="btn danger"
                    label="Aplicar transição"
                    confirmLabel="Confirmar transição?"
                    onConfirm={apply}
                  />
                  {(!toStatus || reason.trim().length < 3) && <span className="small muted">Selecione o destino e escreva a justificativa (mín. 3 caracteres).</span>}
                </div>
              </>
            )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Linha do tempo ({history.length})</h3></div>
        <div className="card-body">
          {history.length === 0
            ? <p className="muted">Sem histórico.</p>
            : history.map((h) => (
              <div key={h.id} className="between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div>
                    {h.from_status && h.from_status !== 'none' && <><LegalStatusBadge status={h.from_status} /> <Icon name="chevronRight" size={12} /> </>}
                    <LegalStatusBadge status={h.to_status} />
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>{h.reason}</div>
                  <div className="small muted" style={{ marginTop: 3 }}>{fmtDateTime(h.occurred_at || h.created_at)} · origem: {h.source === 'court_integration' ? 'integração' : 'manual'}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function PublicacaoTab({ title, run }) {
  const cur = title.listing_status;
  return (
    <div className="stack">
      <HelpCallout title="Publicação no catálogo">
        Publicar coloca o título no catálogo e, junto com um estado jurídico favorável, o torna
        <strong> disponível para contratação</strong>. Despublicar o retira do catálogo (deixa de estar disponível),
        sem alterar os contratos vigentes.
      </HelpCallout>

      <div className="card">
        <div className="card-head"><h3>Situação</h3><div className="spacer" style={{ flex: 1 }} /><ListingBadge status={cur} /></div>
        <div className="card-body">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={cur === 'listed'} onClick={() => run(api.mkt.setListing(title.id, 'listed'))}><Icon name="check" size={14} /> Publicar</button>
            <ConfirmButton className="btn" label="Despublicar" confirmLabel="Confirmar despublicação?" onConfirm={() => run(api.mkt.setListing(title.id, 'delisted'))} />
            {cur !== 'draft' && <button className="btn" onClick={() => run(api.mkt.setListing(title.id, 'draft'))}>Voltar a rascunho</button>}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Disponibilidade atual: <AvailableBadge available={title.available} />. Para ficar disponível é preciso estar
            <strong> publicado</strong> e com estado jurídico em {'{'} não julgado, favorável, reativado {'}'}.
          </p>
        </div>
      </div>
    </div>
  );
}
