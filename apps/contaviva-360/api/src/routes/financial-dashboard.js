// routes/financial-dashboard.js — Dashboard Financeiro (REQ-CONTAVIVA360-0005 AC5).
import { pool } from '../db.js';

export function registerFinancialDashboardRoutes(app) {
  app.get('/v1/dashboard/financial', async (req) => {
    const q = req.query || {};
    const period_start = q.period_start || null;
    const period_end = q.period_end || null;

    const [arRes, apRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(valor),0) AS total FROM income_expenses
         WHERE tenant_id=$1 AND tipo='receita' AND status IN ('pendente','vencido')`,
        [req.tenantId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(valor),0) AS total FROM income_expenses
         WHERE tenant_id=$1 AND tipo='despesa' AND status IN ('pendente','vencido')`,
        [req.tenantId]
      ),
    ]);
    const totalAReceber = Number(arRes.rows[0].total);
    const totalAPagar = Number(apRes.rows[0].total);

    // Gráfico de fluxo mensal
    let flowSql = `SELECT DATE_TRUNC('month', data) AS mes,
                          SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END) AS entradas,
                          SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END) AS saidas
                   FROM income_expenses WHERE tenant_id=$1`;
    const flowParams = [req.tenantId];
    let fi = 2;
    if (period_start) { flowSql += ` AND data >= $${fi++}`; flowParams.push(period_start); }
    if (period_end)   { flowSql += ` AND data <= $${fi++}`; flowParams.push(period_end); }
    flowSql += ` GROUP BY mes ORDER BY mes`;
    const { rows: flowRows } = await pool.query(flowSql, flowParams);

    // Top 5 fornecedores por despesa pendente/vencida
    const { rows: top5Fornecedores } = await pool.query(
      `SELECT contraparte, SUM(valor) AS total FROM income_expenses
       WHERE tenant_id=$1 AND tipo='despesa' AND status IN ('pendente','vencido') AND contraparte IS NOT NULL
       GROUP BY contraparte ORDER BY total DESC LIMIT 5`,
      [req.tenantId]
    );

    // Top 5 clientes por receita pendente/vencida
    const { rows: top5Clientes } = await pool.query(
      `SELECT contraparte, SUM(valor) AS total FROM income_expenses
       WHERE tenant_id=$1 AND tipo='receita' AND status IN ('pendente','vencido') AND contraparte IS NOT NULL
       GROUP BY contraparte ORDER BY total DESC LIMIT 5`,
      [req.tenantId]
    );

    return {
      resumo: {
        total_a_receber: totalAReceber,
        total_a_pagar: totalAPagar,
        saldo_liquido: totalAReceber - totalAPagar,
      },
      fluxo_mensal: flowRows.map(r => ({
        mes: r.mes,
        entradas: Number(r.entradas),
        saidas: Number(r.saidas),
        saldo: Number(r.entradas) - Number(r.saidas),
      })),
      top5_fornecedores: top5Fornecedores.map(r => ({ contraparte: r.contraparte, total: Number(r.total) })),
      top5_clientes: top5Clientes.map(r => ({ contraparte: r.contraparte, total: Number(r.total) })),
    };
  });
}
