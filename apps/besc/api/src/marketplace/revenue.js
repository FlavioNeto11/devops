// Receita (Fase 4 — docs/evolution/06 + apendice D). first-transfer fee (so na saida
// da treasury), aluguel por competencia, contabilidade de dupla entrada (append-only),
// custos e relatorios. Invariantes I1-I7. Sem gateway: modela obrigacoes/lancamentos.
import { randomUUID } from 'node:crypto';
import { query, tx } from '../db.js';
import { appendAudit } from '../foundation/audit.js';

const money = (n) => Number(n).toFixed(2);
// arredondamento half-up 2 casas (evita vies do Number.toFixed em .xx5)
const roundHalfUp = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Lancamento contabil (sempre 1 debito + 1 credito; append-only)
// ---------------------------------------------------------------------------
async function postLedger(client, { debit, credit, amount, sourceType, sourceId, competence, memo, createdBy, reversalOfSeq = null }) {
  await client.query(
    `INSERT INTO ledger_entry (debit_account, credit_account, amount, source_type, source_id, competence_period, memo, reversal_of_seq, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [debit, credit, money(amount), sourceType, String(sourceId), competence || null, memo || null, reversalOfSeq, createdBy]);
}

// ---------------------------------------------------------------------------
// Fee da 1a transferencia — chamado por contractTokens quando a origem e a treasury.
// I1: so a saida da treasury cobra; I7: unique parcial garante 1 por contrato.
// Roda DENTRO da transacao da contratacao (recebe o client).
// ---------------------------------------------------------------------------
export async function chargeFirstTransferFee(client, { contract, actor }) {
  const fs = await client.query(`SELECT * FROM fee_schedule WHERE status = 'active' LIMIT 1`);
  if (!fs.rows.length) return null; // sem tarifa ativa -> sem fee (nao bloqueia a contratacao)
  const sched = fs.rows[0];
  const face = Number(contract.total_face_value);
  let amount;
  let basis;
  if (sched.first_transfer_fee_type === 'percent_of_face') {
    amount = roundHalfUp(face * (Number(sched.first_transfer_fee_value) / 100));
    basis = `pct:${sched.first_transfer_fee_value}|floor:${money(sched.min_fee_per_operation)}`;
  } else {
    amount = Number(sched.first_transfer_fee_value);
    basis = `fixed:${money(amount)}`;
  }
  if (Number(sched.min_fee_per_operation) > amount) amount = Number(sched.min_fee_per_operation);
  if (sched.max_fee_per_operation && amount > Number(sched.max_fee_per_operation)) amount = Number(sched.max_fee_per_operation);

  const invCode = 'INV-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 8);
  const inv = await client.query(
    `INSERT INTO invoice (invoice_code, counterparty_user_id, invoice_type, source_type, source_id, amount, fee_schedule_snapshot)
     VALUES ($1,$2,'first_transfer_fee','token_contract',$3,$4,$5) RETURNING id`,
    [invCode, contract.holder_user_id, contract.id, money(amount), JSON.stringify(sched)]);
  await client.query(
    `INSERT INTO fee (contract_id, kind, amount, basis, invoice_id) VALUES ($1,'first_transfer',$2,$3,$4)`,
    [contract.id, money(amount), basis, inv.rows[0].id]);
  // D accounts_receivable / C revenue_first_transfer_fee
  await postLedger(client, { debit: 'accounts_receivable', credit: 'revenue_first_transfer_fee', amount, sourceType: 'invoice', sourceId: inv.rows[0].id, memo: `fee 1a transferência ${contract.contract_number}`, createdBy: actor.userId });
  return { invoiceId: inv.rows[0].id, amount };
}

// ---------------------------------------------------------------------------
// Marcar fatura paga (Gestor, com comprovante) -> D cash / C accounts_receivable
// ---------------------------------------------------------------------------
export async function markInvoicePaid(invoiceId, { evidenceRef }, actor) {
  const out = await tx(async (client) => {
    const { rows } = await client.query(`SELECT * FROM invoice WHERE id = $1 FOR UPDATE`, [invoiceId]);
    if (!rows.length) return { status: 404, body: { error: 'fatura não encontrada' } };
    if (rows[0].status !== 'issued') return { status: 409, body: { error: `fatura não está em aberto (${rows[0].status})` } };
    const inv = rows[0];
    await client.query(`UPDATE invoice SET status = 'paid', paid_at = now(), paid_marked_by = $2, payment_evidence_ref = $3 WHERE id = $1`, [invoiceId, actor.userId, evidenceRef || null]);
    await client.query(`UPDATE fee SET status = 'paid', settled_at = now() WHERE invoice_id = $1`, [invoiceId]);
    await postLedger(client, { debit: 'cash_manual', credit: 'accounts_receivable', amount: inv.amount, sourceType: 'invoice', sourceId: invoiceId, competence: inv.competence_period, memo: `pagamento ${inv.invoice_code}`, createdBy: actor.userId });
    return { status: 200, body: { id: invoiceId, status: 'paid' } };
  });
  return out;
}

// ---------------------------------------------------------------------------
// Aluguel: criar contrato de locacao + fechar competencia (accrual idempotente)
// ---------------------------------------------------------------------------
export async function createLease(titleContractId, { lesseeUserId, baseAmount, monthlyRatePct, adjustmentIndex, periodStart, periodEnd, billingDay }, actor) {
  const base = Number(baseAmount);
  if (!(base > 0)) return { status: 400, body: { error: 'baseAmount deve ser > 0' } };
  const code = 'LSE-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 8);
  const { rows } = await query(
    `INSERT INTO lease (lease_code, contract_id, lessee_user_id, base_amount_frozen, monthly_rate_pct, adjustment_index, period_start, period_end, billing_day, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [code, titleContractId, lesseeUserId || actor.userId, money(base), Number(monthlyRatePct || 0), adjustmentIndex || 'ipca', periodStart, periodEnd, parseInt(billingDay || 5, 10), actor.userId]);
  await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'rental.contract.created', entityType: 'lease', entityId: rows[0].id, payload: { code, base } });
  return { status: 201, body: rows[0] };
}

// dias corridos billable no mes considerando suspensao juridica (pro-rata I6)
function daysInMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export async function closeCompetence(leaseId, { competence, suspendedFromDay }, actor) {
  if (!/^\d{4}-\d{2}$/.test(competence || '')) return { status: 400, body: { error: 'competence deve ser YYYY-MM' } };
  const out = await tx(async (client) => {
    const l = await client.query(`SELECT * FROM lease WHERE id = $1 FOR UPDATE`, [leaseId]);
    if (!l.rows.length) return { status: 404, body: { error: 'aluguel não encontrado' } };
    const lease = l.rows[0];
    const dim = daysInMonth(competence);
    // dias billable: se suspenso a partir do dia X, cobra dias 1..X-1 (pro-rata dias corridos)
    const billable = suspendedFromDay ? Math.max(0, Math.min(dim, parseInt(suspendedFromDay, 10) - 1)) : dim;
    const base = Number(lease.base_amount_frozen);
    const rate = Number(lease.monthly_rate_pct) / 100;
    const full = roundHalfUp(base * rate);
    const amount = roundHalfUp(full * (billable / dim));
    const invCode = 'INV-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 8);
    try {
      await client.query(
        `INSERT INTO lease_accrual (lease_id, competence_period, days_in_period, days_billable, base_applied, rate_applied_pct, amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [leaseId, competence, dim, billable, money(base), Number(lease.monthly_rate_pct), money(amount), actor.userId]);
    } catch (e) {
      if (/duplicate|unique/i.test(e.message)) return { status: 409, body: { error: 'competência já fechada' } };
      throw e;
    }
    let invoiceId = null;
    if (amount > 0) {
      const inv = await client.query(
        `INSERT INTO invoice (invoice_code, counterparty_user_id, invoice_type, source_type, source_id, competence_period, amount)
         VALUES ($1,$2,'lease_rental','lease',$3,$4,$5) RETURNING id`,
        [invCode, lease.lessee_user_id, leaseId, competence, money(amount)]);
      invoiceId = inv.rows[0].id;
      await postLedger(client, { debit: 'accounts_receivable', credit: 'revenue_lease', amount, sourceType: 'invoice', sourceId: invoiceId, competence, memo: `aluguel ${lease.lease_code} ${competence}`, createdBy: actor.userId });
    }
    return { status: 201, body: { competence, days_in_period: dim, days_billable: billable, amount: money(amount), invoiceId } };
  });
  if (out.status === 201) await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'rental.payment.recorded', entityType: 'lease', entityId: leaseId, payload: out.body });
  return out;
}

// ---------------------------------------------------------------------------
// Custos + relatorios
// ---------------------------------------------------------------------------
export async function addCost({ category, description, amount, competence, evidenceRef }, actor) {
  const val = Number(amount);
  if (!(val > 0)) return { status: 400, body: { error: 'amount deve ser > 0' } };
  const out = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO cost_entry (category, description, amount, competence_period, evidence_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [category, description, money(val), competence, evidenceRef || null, actor.userId]);
    const acct = category === 'crypto_ops' ? 'expense_crypto_ops' : category === 'infra_hosting' ? 'expense_infra' : 'expense_other';
    // D expense_* / C cash_manual
    await postLedger(client, { debit: acct, credit: 'cash_manual', amount: val, sourceType: 'cost_entry', sourceId: rows[0].id, competence, memo: description, createdBy: actor.userId });
    return { status: 201, body: { id: rows[0].id } };
  });
  return out;
}

export async function trialBalance() {
  const { rows } = await query(
    `SELECT account, SUM(debit) AS debit, SUM(credit) AS credit FROM (
       SELECT debit_account AS account, amount AS debit, 0 AS credit FROM ledger_entry
       UNION ALL SELECT credit_account, 0, amount FROM ledger_entry
     ) x GROUP BY account ORDER BY account`);
  const totalD = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalC = rows.reduce((s, r) => s + Number(r.credit), 0);
  return { accounts: rows, totalDebit: money(totalD), totalCredit: money(totalC), balanced: Math.abs(totalD - totalC) < 0.005 };
}

export async function revenueVsCost({ from, to } = {}) {
  const cond = [];
  const params = [];
  if (from) { params.push(from); cond.push(`competence_period >= $${params.length}`); }
  if (to) { params.push(to); cond.push(`competence_period <= $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE credit_account = 'revenue_first_transfer_fee'),0) AS revenue_fee,
       COALESCE(SUM(amount) FILTER (WHERE credit_account = 'revenue_lease'),0) AS revenue_lease,
       COALESCE(SUM(amount) FILTER (WHERE debit_account = 'expense_infra'),0) AS expense_infra,
       COALESCE(SUM(amount) FILTER (WHERE debit_account = 'expense_crypto_ops'),0) AS expense_crypto,
       COALESCE(SUM(amount) FILTER (WHERE debit_account = 'expense_other'),0) AS expense_other
     FROM ledger_entry ${where}`, params);
  const r = rows[0];
  const revenue = Number(r.revenue_fee) + Number(r.revenue_lease);
  const cost = Number(r.expense_infra) + Number(r.expense_crypto) + Number(r.expense_other);
  return {
    revenue_first_transfer_fee: money(r.revenue_fee), revenue_lease: money(r.revenue_lease), total_revenue: money(revenue),
    expense_infra: money(r.expense_infra), expense_crypto_ops: money(r.expense_crypto), expense_other: money(r.expense_other), total_cost: money(cost),
    result: money(revenue - cost),
  };
}

export async function listInvoices({ status } = {}) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE status = $1'; }
  const { rows } = await query(`SELECT * FROM invoice ${where} ORDER BY issue_date DESC, created_at DESC LIMIT 500`, params);
  return rows;
}

export async function listLeases() {
  const { rows } = await query(
    `SELECT l.*, t.label AS title_label, t.legal_status,
            (SELECT COALESCE(json_agg(json_build_object('competence', a.competence_period, 'amount', a.amount) ORDER BY a.competence_period), '[]')
             FROM lease_accrual a WHERE a.lease_id = l.id) AS accruals
     FROM lease l
     JOIN token_contract c ON c.id = l.contract_id
     JOIN security_title t ON t.id = c.title_id
     ORDER BY l.created_at DESC LIMIT 500`);
  return rows;
}
