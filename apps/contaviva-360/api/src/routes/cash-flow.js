// routes/cash-flow.js — Fluxo de Caixa (REQ-CONTAVIVA360-0005 AC3).
import { pool } from '../db.js';

export function registerCashFlowRoutes(app) {
  app.get('/v1/cash-flow', async (req) => {
    const q = req.query || {};
    const horizon = Math.min(Math.max(Number(q.horizon) || 30, 1), 90);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + horizon);
    const endStr = endDate.toISOString().slice(0, 10);

    // Saldo realizado até hoje
    const { rows: realRows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo='receita' AND status IN ('recebido','pago') THEN valor ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN tipo='despesa' AND status IN ('pago') THEN valor ELSE 0 END), 0) AS saldo_atual
       FROM income_expenses WHERE tenant_id=$1 AND data <= $2`,
      [req.tenantId, todayStr]
    );
    const saldoAtual = Number(realRows[0]?.saldo_atual || 0);

    // Entradas e saídas futuras agrupadas por dia (pendente ou vencido)
    const { rows: dailyRows } = await pool.query(
      `SELECT data::text AS dia, tipo, SUM(valor) AS total
       FROM income_expenses
       WHERE tenant_id=$1 AND data > $2 AND data <= $3
         AND status IN ('pendente','vencido')
       GROUP BY data, tipo ORDER BY data ASC`,
      [req.tenantId, todayStr, endStr]
    );

    const byDay = {};
    for (const row of dailyRows) {
      if (!byDay[row.dia]) byDay[row.dia] = { entradas: 0, saidas: 0 };
      if (row.tipo === 'receita') byDay[row.dia].entradas += Number(row.total);
      else byDay[row.dia].saidas += Number(row.total);
    }

    let saldoAcum = saldoAtual;
    const dias = [];
    const cur = new Date(today);
    cur.setDate(cur.getDate() + 1);
    while (cur <= endDate) {
      const dStr = cur.toISOString().slice(0, 10);
      const entradas = byDay[dStr]?.entradas || 0;
      const saidas = byDay[dStr]?.saidas || 0;
      saldoAcum += entradas - saidas;
      dias.push({ dia: dStr, entradas, saidas, saldo_dia: entradas - saidas, saldo_acumulado: saldoAcum });
      cur.setDate(cur.getDate() + 1);
    }

    const getAt = (n) => {
      const idx = Math.min(n, dias.length) - 1;
      return idx >= 0 ? dias[idx].saldo_acumulado : saldoAtual;
    };

    return {
      saldo_atual: saldoAtual,
      saldo_previsto_final: dias.length ? dias[dias.length - 1].saldo_acumulado : saldoAtual,
      horizon,
      data_inicio: todayStr,
      data_fim: endStr,
      dias,
      resumo_saldo: { 30: getAt(30), 60: getAt(60), 90: getAt(90) },
    };
  });
}
