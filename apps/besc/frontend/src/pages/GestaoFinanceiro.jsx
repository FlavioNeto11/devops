import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, SkeletonList, HelpCallout, Field, formatBRL } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';

// ---- rótulos (pt-BR) dos enums financeiros (docs/evolution/06-modelo-receita.md) ----
const INVOICE_TYPE = {
  first_transfer_fee: 'Fee de 1ª transferência',
  lease_rental: 'Aluguel',
  adjustment: 'Ajuste',
};
const INVOICE_STATUS = {
  issued: { l: 'Emitida', c: 'b-amber' },
  paid: { l: 'Paga', c: 'b-green' },
  cancelled: { l: 'Cancelada', c: 'b-grey' },
  written_off: { l: 'Baixada', c: 'b-red' },
};
const COST_CATEGORY = {
  infra_hosting: 'Infraestrutura / hospedagem',
  crypto_ops: 'Operações cripto',
  legal_regulatory: 'Jurídico / regulatório',
  custody: 'Custódia',
  other: 'Outros',
};
// plano de contas mínimo (§4): rótulos das 8 contas do balancete
const ACCOUNT = {
  accounts_receivable: 'Contas a receber',
  cash_manual: 'Caixa (conciliado)',
  revenue_first_transfer_fee: 'Receita — fee de 1ª transferência',
  revenue_lease: 'Receita — aluguel',
  expense_infra: 'Despesa — infraestrutura',
  expense_crypto_ops: 'Despesa — operações cripto',
  expense_other: 'Despesa — outros',
  adjustments: 'Ajustes',
};

// mensagem de erro amigável (rede / 409 / 403)
function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/409/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Esta operação já foi feita ou conflita com o estado atual.';
  if (/403/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Você não tem permissão para esta ação, ou o go-live ainda não foi liberado.';
  return m.replace(/^Erro \d+:?\s*/, '') || 'Não foi possível concluir a operação.';
}

function fmtDate(s) { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR'); }

// GESTÃO FINANCEIRA (fees:read para ver; fees:write para lançar/marcar).
// DRE (receita × custo), faturas, lançamento de custos e balancete contábil.
export default function GestaoFinanceiro() {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('fees:write');
  const [error, setError] = useState(null);

  return (
    <>
      <div className="crumbs"><Link to="/casos">Gestão</Link> / Financeiro</div>
      <div className="pgtitle"><h1><Icon name="coins" size={22} /> Financeiro</h1></div>

      <HelpCallout title="Receita, custos e contabilidade da plataforma">
        As duas receitas do marketplace são a <strong>fee de 1ª transferência</strong> (cobre o custo
        operacional) e o <strong>aluguel de títulos</strong> (o lucro que custeia toda a infraestrutura,
        inclusive as operações cripto). Aqui você acompanha o <strong>resultado (DRE)</strong> por período,
        confere e <strong>marca faturas como pagas</strong>, lança <strong>custos</strong> e valida o
        <strong> balancete</strong>. Não há gateway de pagamento — a liquidação é externa e você concilia
        anexando o comprovante.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      <DreCards onError={setError} />
      <TrialBalance onError={setError} />
      {canWrite && <CostForm onError={setError} onSaved={() => window.dispatchEvent(new CustomEvent('besc:finance-refresh'))} />}
      <InvoicesTable canWrite={canWrite} onError={setError} />
    </>
  );
}

// ---- DRE (revenue-vs-cost) com filtro de período (competência YYYY-MM) ----
function DreCards({ onError }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.finance.revenueVsCost({ from, to })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { onError(friendly(e.message)); setLoading(false); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('besc:finance-refresh', h);
    return () => window.removeEventListener('besc:finance-refresh', h);
  });

  const result = data ? Number(data.result) : 0;
  const positive = result >= 0;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3><Icon name="report" size={15} /> Resultado do período (DRE)</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8 }}>
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            De <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Até <input type="month" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <button className="btn sm" onClick={load}><Icon name="filter" size={13} /> Aplicar</button>
        </div>
      </div>
      <div className="card-body">
        {loading && !data && <SkeletonList count={1} lines={3} />}
        {data && (
          <>
            <div className="grid2">
              <StatCard label="Receita — fee de 1ª transferência" value={data.revenue_first_transfer_fee} />
              <StatCard label="Receita — aluguel" value={data.revenue_lease} />
              <StatCard label="Receita total" value={data.total_revenue} strong />
              <StatCard label="Custo total" value={data.total_cost} />
              <StatCard
                label="Resultado do período"
                value={data.result}
                strong
                color={positive ? 'var(--green)' : 'var(--red)'}
              />
            </div>
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Detalhe dos custos: infraestrutura {formatBRL(data.expense_infra)} · operações cripto {formatBRL(data.expense_crypto_ops)} · outros {formatBRL(data.expense_other)}.
              {' '}Resultado {positive ? 'positivo' : 'negativo'} — o aluguel precisa <strong>provadamente</strong> cobrir a infraestrutura, inclusive a cripto.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, strong, color }) {
  return (
    <div className="card"><div className="card-body stat">
      <span className="k">{label}</span>
      <span className="v" style={{ color: color || undefined, fontSize: strong ? 26 : 22 }}>{formatBRL(value)}</span>
    </div></div>
  );
}

// ---- Balancete (trial-balance): débito/crédito por conta + selo Fecha/Não fecha ----
function TrialBalance({ onError }) {
  const [tb, setTb] = useState(null);
  const load = () => api.finance.trialBalance().then(setTb).catch((e) => onError(friendly(e.message)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('besc:finance-refresh', h);
    return () => window.removeEventListener('besc:finance-refresh', h);
  });

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3><Icon name="scale" size={15} /> Balancete</h3>
        <div className="spacer" style={{ flex: 1 }} />
        {tb && (
          tb.balanced
            ? <span className="badge b-green"><Icon name="check" size={12} /> Fecha</span>
            : <span className="badge b-red"><Icon name="alert" size={12} /> Não fecha</span>
        )}
      </div>
      <div className="card-body">
        {!tb && <SkeletonList count={1} lines={4} />}
        {tb && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Conta</th><th style={{ textAlign: 'right' }}>Débito</th><th style={{ textAlign: 'right' }}>Crédito</th></tr></thead>
              <tbody>
                {(tb.accounts || []).map((a) => (
                  <tr key={a.account}>
                    <td>{ACCOUNT[a.account] || a.account}</td>
                    <td style={{ textAlign: 'right' }}>{formatBRL(a.debit)}</td>
                    <td style={{ textAlign: 'right' }}>{formatBRL(a.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Total</td>
                  <td style={{ textAlign: 'right' }}>{formatBRL(tb.totalDebit)}</td>
                  <td style={{ textAlign: 'right' }}>{formatBRL(tb.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              A contabilidade é por <strong>dupla entrada</strong>: a soma dos débitos deve igualar a soma dos
              créditos (invariante I7). Correções só por estorno — nada é apagado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Lançar custo (fees:write) ----
function CostForm({ onError, onSaved }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('infra_hosting');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [competence, setCompetence] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(null);

  const submit = async () => {
    const val = parseFloat(String(amount).replace(',', '.'));
    if (!description.trim()) { onError('Descreva o custo.'); return; }
    if (!competence) { onError('Informe a competência (mês) do custo.'); return; }
    if (!(val > 0)) { onError('Informe um valor maior que zero.'); return; }
    setBusy(true); onError(null); setOk(null);
    try {
      await api.finance.addCost({
        category,
        description: description.trim(),
        amount: val,
        competence,
        evidenceRef: evidenceRef.trim() || undefined,
      });
      setOk(`Custo de ${formatBRL(val)} lançado na competência ${competence}.`);
      setDescription(''); setAmount(''); setEvidenceRef('');
      onSaved && onSaved();
    } catch (e) { onError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3><Icon name="plus" size={15} /> Lançar custo</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => { setOpen((o) => !o); setOk(null); }}>{open ? 'Fechar' : 'Lançar custo'}</button>
      </div>
      {open && (
        <div className="card-body">
          <p className="small muted" style={{ marginTop: 0 }}>
            Cada custo gera um lançamento contábil (despesa) e alimenta o DRE — é o que prova que o aluguel
            cobre a infraestrutura. Anexe a referência do comprovante quando houver.
          </p>
          {ok && <Banner kind="info">{ok}</Banner>}
          <div className="form-grid">
            <Field label="Categoria">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(COST_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Competência (mês)" hint="Competência ≠ caixa — é o mês a que o custo se refere.">
              <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} />
            </Field>
            <div className="full">
              <Field label="Descrição">
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Hospedagem do cluster — julho" />
              </Field>
            </div>
            <Field label="Valor (R$)" hint="Use ponto para os centavos (ex.: 320.00).">
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Referência do comprovante (opcional)">
              <input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} placeholder="Ex.: NF 12345 / anexo do PVC" />
            </Field>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Lançar custo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Faturas (filtro por status) + marcar paga (fees:write) ----
function InvoicesTable({ canWrite, onError }) {
  const [status, setStatus] = useState('');
  const [invoices, setInvoices] = useState(null);

  const load = () => {
    setInvoices(null);
    api.finance.invoices(status).then((r) => setInvoices(Array.isArray(r) ? r : [])).catch((e) => onError(friendly(e.message)));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('besc:finance-refresh', h);
    return () => window.removeEventListener('besc:finance-refresh', h);
  });

  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="file" size={15} /> Faturas</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas</option>
            {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
        </label>
      </div>
      {!invoices && <div className="card-body"><SkeletonList count={3} lines={2} /></div>}
      {invoices && invoices.length === 0 && (
        <div className="empty"><p className="muted">Nenhuma fatura {status ? `com status “${INVOICE_STATUS[status]?.l}”` : ''}.</p></div>
      )}
      {invoices && invoices.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr><th>Fatura</th><th>Tipo</th><th>Competência</th><th>Emissão</th><th style={{ textAlign: 'right' }}>Valor</th><th>Status</th>{canWrite && <th style={{ textAlign: 'right' }}>Ações</th>}</tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} canWrite={canWrite} onError={onError} reload={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ inv, canWrite, onError, reload }) {
  const [paying, setPaying] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const st = INVOICE_STATUS[inv.status] || { l: inv.status, c: 'b-grey' };

  const pay = async () => {
    setBusy(true); onError(null);
    try {
      await api.finance.payInvoice(inv.id, { evidenceRef: evidence.trim() || undefined });
      setPaying(false); setEvidence('');
      reload();
    } catch (e) { onError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <>
      <tr>
        <td><span style={{ fontFamily: 'monospace' }}>{inv.invoice_code || inv.id}</span></td>
        <td>{INVOICE_TYPE[inv.invoice_type] || inv.invoice_type}</td>
        <td>{inv.competence_period || '—'}</td>
        <td className="small">{fmtDate(inv.issue_date)}</td>
        <td style={{ textAlign: 'right' }}>{formatBRL(inv.amount)}</td>
        <td><span className={`badge ${st.c}`}>{st.l}</span></td>
        {canWrite && (
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {inv.status === 'issued' && !paying && (
              <button className="btn sm" onClick={() => setPaying(true)}><Icon name="check" size={13} /> Marcar paga</button>
            )}
          </td>
        )}
      </tr>
      {paying && (
        <tr>
          <td colSpan={canWrite ? 7 : 6}>
            <div className="card" style={{ margin: '4px 0' }}><div className="card-body">
              <p className="small muted" style={{ marginTop: 0 }}>
                A liquidação é <strong>externa</strong> (transferência/PIX manual). Anexe a referência do
                comprovante e marque a fatura como paga — isso gera o lançamento de caixa.
              </p>
              <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Referência do comprovante (opcional)">
                  <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ex.: comprovante PIX 2026-07-05" style={{ minWidth: 260 }} />
                </Field>
                <button className="btn primary" disabled={busy} onClick={pay}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Confirmar pagamento</button>
                <button className="btn" disabled={busy} onClick={() => { setPaying(false); setEvidence(''); }}>Cancelar</button>
              </div>
            </div></div>
          </td>
        </tr>
      )}
    </>
  );
}
