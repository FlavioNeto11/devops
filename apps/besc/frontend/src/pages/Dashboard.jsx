import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { StatusBadge, RiskBadge, Progress, Loading, Banner, formatMoney, useLabel } from '../ui.jsx';

export default function Dashboard() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const label = useLabel();

  useEffect(() => {
    api.list().then(setCases).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!cases) return [];
    return cases.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (q) {
        const hay = `${c.holder_name || ''} ${c.holder_tax_id || ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [cases, q, statusFilter]);

  const stats = useMemo(() => {
    const s = { total: 0, blockers: 0, ready: 0, pend: 0 };
    (cases || []).forEach((c) => {
      s.total++;
      s.blockers += c.blockerCount || 0;
      s.pend += c.pendencyCount || 0;
      if (c.status === 'ready_for_structuring' || c.status === 'ready_with_caveats') s.ready++;
    });
    return s;
  }, [cases]);

  return (
    <>
      <div className="pgtitle between">
        <h1>Casos</h1>
        <Link className="btn primary" to="/cases/new">+ Novo caso</Link>
      </div>

      <Banner kind="err">{error}</Banner>

      {cases && cases.length > 0 && (
        <div className="grid2" style={{ marginBottom: 18 }}>
          <div className="card"><div className="card-body stat"><span className="k">Casos cadastrados</span><span className="v">{stats.total}</span></div></div>
          <div className="card"><div className="card-body stat"><span className="k">Aptos (com/sem ressalvas)</span><span className="v">{stats.ready}</span></div></div>
          <div className="card"><div className="card-body stat"><span className="k">Pendências abertas</span><span className="v">{stats.pend}</span></div></div>
          <div className="card"><div className="card-body stat"><span className="k">Pendências bloqueantes</span><span className="v" style={{ color: stats.blockers ? 'var(--red)' : 'var(--green)' }}>{stats.blockers}</span></div></div>
        </div>
      )}

      {!cases && !error && <Loading label="Carregando casos…" />}

      {cases && cases.length === 0 && (
        <div className="card"><div className="empty">
          <h3>Nenhum caso cadastrado</h3>
          <p className="muted">Comece cadastrando um caso ligado às ações do antigo BESC. Primeira vez aqui? Veja como o sistema funciona.</p>
          <div className="row" style={{ marginTop: 8, justifyContent: 'center' }}>
            <Link className="btn primary" to="/cases/new">+ Cadastrar primeiro caso</Link>
            <Link className="btn" to="/ajuda">Como funciona?</Link>
          </div>
        </div></div>
      )}

      {cases && cases.length > 0 && (
        <div className="card">
          <div className="card-head">
            <input placeholder="Buscar por titular ou CPF/CNPJ…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">Todos os status</option>
              {['new', 'docs_incomplete', 'legal_review', 'awaiting_calculation', 'awaiting_opinion', 'ready_for_structuring', 'ready_with_caveats', 'not_eligible', 'archived'].map((s) => (
                <option key={s} value={s}>{label('case_status', s)}</option>
              ))}
            </select>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="small muted">{filtered.length} de {cases.length}</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Titular</th><th>Status</th><th>Documentação</th><th>Pendências</th><th>Valor estimado</th><th>Risco</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.holder_name || <span className="muted">(sem titular)</span>}</div>
                    <div className="small muted">{c.holder_tax_id || '—'} · {label('holder_type', c.holder_type)}</div>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td style={{ minWidth: 140 }}><Progress pct={c.docPct} /></td>
                  <td>
                    {c.pendencyCount > 0
                      ? <span className={`pill ${c.blockerCount ? 'legal' : ''}`}>{c.pendencyCount}{c.blockerCount ? ` · ${c.blockerCount} bloq.` : ''}</span>
                      : <span className="muted small">—</span>}
                  </td>
                  <td>{formatMoney(c.estimatedValue)}</td>
                  <td><RiskBadge level={c.risk} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link className="btn sm" to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()}>Abrir</Link>{' '}
                    <a className="btn sm" href={api.reportHtmlUrl(c.id, 'full_case_report')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Relatório</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
