import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, SkeletonList, HelpCallout, Field, EnumSelect, formatBRL } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';

const PURPOSE_LABEL = { purchase: 'Compra', collateral: 'Caução', lease_backing: 'Lastro de aluguel' };
const LEASE_STATUS = {
  draft: { l: 'Rascunho', c: 'b-grey' }, active: { l: 'Ativo', c: 'b-green' },
  suspended: { l: 'Suspenso', c: 'b-amber' }, renewed: { l: 'Renovado', c: 'b-blue' },
  expired: { l: 'Expirado', c: 'b-grey' }, terminated: { l: 'Encerrado', c: 'b-grey' },
  written_off: { l: 'Baixado', c: 'b-red' },
};

// percentual mensal como "0,90% a.m."
function formatPct(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}% a.m.`;
}

function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/409/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Esta competência já foi fechada — fechar de novo não faz nada (é idempotente).';
  if (/403/.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Você não tem permissão para esta ação, ou o go-live ainda não foi liberado.';
  return m.replace(/^Erro \d+:?\s*/, '') || 'Não foi possível concluir a operação.';
}

// GESTÃO DE ALUGUÉIS (fees:read para ver; fees:write para criar/fechar competência).
// O aluguel é a RECEITA PRINCIPAL — o lucro que custeia toda a infra, inclusive a cripto.
export default function GestaoAlugueis() {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('fees:write');
  const [error, setError] = useState(null);
  const [leases, setLeases] = useState([]);

  useEffect(() => { api.finance.leases().then(setLeases).catch((e) => setError(e.message)); }, []);
  const addLease = (l) => setLeases((prev) => [l, ...prev.filter((x) => x.id !== l.id)]);

  return (
    <>
      <div className="crumbs"><Link to="/casos">Gestão</Link> / Aluguéis</div>
      <div className="pgtitle"><h1><Icon name="briefcase" size={22} /> Aluguéis</h1></div>

      <HelpCallout title="Aluguel de títulos — a receita principal">
        O <strong>aluguel</strong> é o lucro que custeia toda a infraestrutura da plataforma, inclusive as
        operações cripto (nós, custódia, ancoragem). Cada aluguel se apoia num <strong>contrato-lastro</strong>
        (finalidade <em>lastro de aluguel</em>) do título, de onde vem o <strong>valor de face congelado</strong>
        que serve de base de cálculo. A cobrança é por <strong>competência</strong>: você <strong>fecha</strong> o
        mês para gerar a fatura do aluguel. Fechar a mesma competência duas vezes <strong>não faz nada</strong> —
        é idempotente por construção.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      {canWrite
        ? <NewLeasePanel onError={setError} onCreated={addLease} />
        : <Banner kind="info">Você tem acesso de leitura ao financeiro. Criar aluguéis e fechar competências exige a permissão <strong>fees:write</strong>.</Banner>}

      <LeaseList leases={leases} canWrite={canWrite} onError={setError} />
    </>
  );
}

// ---- Criar aluguel: título → contrato-lastro → parâmetros ----
function NewLeasePanel({ onError, onCreated }) {
  const [titles, setTitles] = useState(null);
  const [titleId, setTitleId] = useState('');
  const [contracts, setContracts] = useState(null);
  const [contractId, setContractId] = useState('');
  const [lesseeUserId, setLesseeUserId] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [monthlyRatePct, setMonthlyRatePct] = useState('');
  const [adjustmentIndex, setAdjustmentIndex] = useState('ipca');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [billingDay, setBillingDay] = useState('5');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(null);

  useEffect(() => { api.mkt.titles().then((t) => setTitles(Array.isArray(t) ? t : [])).catch(() => setTitles([])); }, []);

  // ao trocar o título, carrega os contratos dele
  useEffect(() => {
    setContractId(''); setContracts(null);
    if (!titleId) return;
    api.mkt.contracts(titleId).then((c) => setContracts(Array.isArray(c) ? c : [])).catch(() => setContracts([]));
  }, [titleId]);

  const selectedContract = useMemo(
    () => (contracts || []).find((c) => c.id === contractId) || null,
    [contracts, contractId],
  );

  // ao escolher o contrato, pré-preenche a base com o valor de face congelado (editável)
  useEffect(() => {
    if (selectedContract && selectedContract.total_face_value != null) {
      setBaseAmount(String(selectedContract.total_face_value));
    }
  }, [selectedContract]);

  const monthly = useMemo(() => {
    const b = parseFloat(String(baseAmount).replace(',', '.'));
    const r = parseFloat(String(monthlyRatePct).replace(',', '.'));
    if (!(b > 0) || !(r >= 0)) return null;
    return Math.round(b * (r / 100) * 100) / 100;
  }, [baseAmount, monthlyRatePct]);

  const submit = async () => {
    const base = parseFloat(String(baseAmount).replace(',', '.'));
    const rate = parseFloat(String(monthlyRatePct).replace(',', '.'));
    if (!contractId) { onError('Selecione o contrato-lastro do aluguel.'); return; }
    if (!(base > 0)) { onError('Informe uma base de cálculo maior que zero.'); return; }
    if (!(rate >= 0)) { onError('Informe a taxa mensal (% a.m.).'); return; }
    if (!periodStart || !periodEnd) { onError('Informe o período (início e fim) do aluguel.'); return; }
    setBusy(true); onError(null); setOk(null);
    try {
      const lease = await api.finance.createLease(contractId, {
        lesseeUserId: lesseeUserId.trim() || undefined,
        baseAmount: base,
        monthlyRatePct: rate,
        adjustmentIndex,
        periodStart,
        periodEnd,
        billingDay: billingDay ? parseInt(billingDay, 10) : undefined,
      });
      setOk(`Aluguel ${lease.lease_code || lease.id} criado.`);
      onCreated(lease);
      // limpa parâmetros mas mantém o título selecionado
      setContractId(''); setLesseeUserId(''); setBaseAmount(''); setMonthlyRatePct('');
      setPeriodStart(''); setPeriodEnd('');
    } catch (e) { onError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head"><h3><Icon name="plus" size={15} /> Criar aluguel</h3></div>
      <div className="card-body">
        {ok && <Banner kind="info">{ok}</Banner>}
        {!titles && <SkeletonList count={1} lines={2} />}
        {titles && titles.length === 0 && (
          <Banner kind="info">Nenhum título cadastrado. Crie um título no <Link to="/gestao/titulos">marketplace</Link> e um contrato de <strong>lastro de aluguel</strong> antes de criar o aluguel.</Banner>
        )}
        {titles && titles.length > 0 && (
          <>
            <div className="form-grid">
              <Field label="Título">
                <select value={titleId} onChange={(e) => setTitleId(e.target.value)}>
                  <option value="">— selecione um título —</option>
                  {titles.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Contrato-lastro" hint="É o contrato do qual vem o valor de face congelado (base de cálculo).">
                <select value={contractId} onChange={(e) => setContractId(e.target.value)} disabled={!titleId || !contracts}>
                  <option value="">{titleId ? (contracts ? '— selecione um contrato —' : 'carregando…') : 'escolha um título primeiro'}</option>
                  {(contracts || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.contract_number || c.id)} · {PURPOSE_LABEL[c.purpose] || c.purpose} · {Number(c.quantity).toLocaleString('pt-BR')} tokens · {formatBRL(c.total_face_value)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {titleId && contracts && contracts.length === 0 && (
              <Banner kind="info">Este título não tem contratos. Emita um contrato de <strong>lastro de aluguel</strong> no detalhe do título antes de criar o aluguel.</Banner>
            )}

            <div className="form-grid">
              <Field label="Base de cálculo congelada (R$)" hint="Preenchida a partir do contrato; edite se necessário. base = tokens × valor de face travado.">
                <input type="number" min="0" step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Taxa mensal (% a.m.)" hint="Ex.: 0.90 significa 0,90% a.m. sobre a base congelada.">
                <input type="number" min="0" step="0.0001" value={monthlyRatePct} onChange={(e) => setMonthlyRatePct(e.target.value)} placeholder="0.90" />
              </Field>
              <Field label="Índice de reajuste" hint="Reajuste anual pelo índice (padrão IPCA).">
                <EnumSelect enumName="monetary_index" value={adjustmentIndex} onChange={setAdjustmentIndex} />
              </Field>
              <Field label="Dia de cobrança" hint="Dia do mês em que a fatura é emitida (1 a 28).">
                <input type="number" min="1" max="28" step="1" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
              </Field>
              <Field label="Início do período"><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
              <Field label="Fim do período"><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
              <div className="full">
                <Field label="Tomador (ID do usuário) — opcional" hint="Quem aluga. Deixe em branco se ainda não definido.">
                  <input value={lesseeUserId} onChange={(e) => setLesseeUserId(e.target.value)} placeholder="ID do usuário tomador" />
                </Field>
              </div>
            </div>

            {monthly != null && (
              <p className="small muted" style={{ marginTop: -4 }}>
                Estimativa de uma competência integral: <strong>{formatBRL(monthly)}</strong> ({formatPct(monthlyRatePct)} sobre {formatBRL(baseAmount)}).
                O valor real de cada competência é calculado no fechamento (pro-rata em caso de suspensão).
              </p>
            )}

            <div className="row">
              <button className="btn primary" disabled={busy || !contractId} onClick={submit}>
                {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Criar aluguel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Lista de aluguéis (desta sessão) + fechar competência ----
function LeaseList({ leases, canWrite, onError }) {
  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="briefcase" size={15} /> Aluguéis ({leases.length})</h3></div>
      <div className="card-body">
        <p className="small muted" style={{ marginTop: 0 }}>
          Esta lista mostra os aluguéis criados <strong>durante esta sessão</strong> — use-os para fechar
          competências logo após criá-los. (A base de aluguéis completa vive no backend.)
        </p>
        {leases.length === 0 && (
          <div className="empty"><p className="muted">Nenhum aluguel criado nesta sessão. Crie um acima para poder fechar competências.</p></div>
        )}
        {leases.map((l) => (
          <LeaseCard key={l.id} lease={l} canWrite={canWrite} onError={onError} />
        ))}
      </div>
    </div>
  );
}

function LeaseCard({ lease, canWrite, onError }) {
  const [competence, setCompetence] = useState('');
  const [suspendedFromDay, setSuspendedFromDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [accruals, setAccruals] = useState([]); // resultados de fechamento (histórico local)
  const st = LEASE_STATUS[lease.status] || { l: lease.status || '—', c: 'b-grey' };

  const closeCompetence = async () => {
    if (!competence) { onError('Informe a competência (mês) a fechar.'); return; }
    setBusy(true); onError(null);
    try {
      const r = await api.finance.closeCompetence(lease.id, {
        competence,
        suspendedFromDay: suspendedFromDay ? parseInt(suspendedFromDay, 10) : undefined,
      });
      setAccruals((prev) => [{ ...r, competence: r.competence || competence }, ...prev]);
      setSuspendedFromDay('');
    } catch (e) { onError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-body">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{lease.lease_code || lease.id}</div>
            <div className="small muted">
              Base {formatBRL(lease.base_amount_frozen != null ? lease.base_amount_frozen : lease.base_amount)}
              {' · '}{formatPct(lease.monthly_rate_pct)}
              {lease.period_start && lease.period_end ? ` · ${lease.period_start} → ${lease.period_end}` : ''}
            </div>
          </div>
          <span className={`badge ${st.c}`}>{st.l}</span>
        </div>

        {canWrite && (
          <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            <Field label="Competência a fechar (mês)">
              <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} />
            </Field>
            <Field label="Suspenso a partir do dia (opcional)" hint="Pro-rata: cobra só os dias até a véspera da suspensão.">
              <input type="number" min="1" max="31" step="1" value={suspendedFromDay} onChange={(e) => setSuspendedFromDay(e.target.value)} placeholder="ex.: 16" style={{ maxWidth: 120 }} />
            </Field>
            <button className="btn primary" disabled={busy} onClick={closeCompetence}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Fechar competência
            </button>
          </div>
        )}

        {accruals.length > 0 && (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Competência</th><th style={{ textAlign: 'right' }}>Dias do período</th><th style={{ textAlign: 'right' }}>Dias cobráveis</th><th style={{ textAlign: 'right' }}>Valor</th><th>Fatura</th></tr></thead>
              <tbody>
                {accruals.map((a, i) => (
                  <tr key={a.invoiceId || i}>
                    <td>{a.competence}</td>
                    <td style={{ textAlign: 'right' }}>{a.days_in_period != null ? a.days_in_period : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{a.days_billable != null ? a.days_billable : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(a.amount)}</td>
                    <td className="small" style={{ fontFamily: 'monospace' }}>{a.invoiceId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
              A fatura gerada aparece em <Link to="/gestao/financeiro">Financeiro → Faturas</Link>, onde você a marca como paga.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
