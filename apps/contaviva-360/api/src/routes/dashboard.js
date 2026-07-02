// routes/dashboard.js — Dashboard por PF (REQ-CONTAVIVA360-0002 AC6).
import { pool } from '../db.js';

export function registerDashboardRoutes(app) {
  app.get('/v1/dashboard/pf/:id', async (req, reply) => {
    const pfId = Number(req.params.id);
    const { period_start, period_end } = req.query || {};

    const { rows: pfRows } = await pool.query(
      'SELECT * FROM physical_persons WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, pfId]
    );
    if (!pfRows[0]) { reply.code(404); return { error: { message: 'PF não encontrada' } }; }
    const pf = pfRows[0];

    const [assets, liabilities] = await Promise.all([
      pool.query('SELECT tipo, SUM(valor) AS total FROM pf_assets WHERE tenant_id=$1 AND pf_id=$2 GROUP BY tipo', [req.tenantId, pfId]),
      pool.query('SELECT tipo, SUM(valor) AS total FROM pf_liabilities WHERE tenant_id=$1 AND pf_id=$2 GROUP BY tipo', [req.tenantId, pfId]),
    ]);

    const totalAssets = assets.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalLiabilities = liabilities.rows.reduce((s, r) => s + Number(r.total), 0);
    const patrimonioLiquido = Number(pf.patrimonio_inicial) + totalAssets - totalLiabilities;

    // Receitas vs despesas por período
    let ieSql = `SELECT tipo, categoria, SUM(valor) AS total FROM income_expenses
                 WHERE tenant_id=$1 AND entity_type='pf' AND entity_id=$2`;
    const ieParams = [req.tenantId, pfId]; let idx = 3;
    if (period_start) { ieSql += ` AND data >= $${idx++}`; ieParams.push(period_start); }
    if (period_end)   { ieSql += ` AND data <= $${idx++}`; ieParams.push(period_end); }
    ieSql += ' GROUP BY tipo, categoria';
    const ie = await pool.query(ieSql, ieParams);

    const receitas = ie.rows.filter(r => r.tipo === 'receita');
    const despesas = ie.rows.filter(r => r.tipo === 'despesa');
    const totalReceitas = receitas.reduce((s, r) => s + Number(r.total), 0);
    const totalDespesas = despesas.reduce((s, r) => s + Number(r.total), 0);
    const despesasPorCategoria = despesas.reduce((acc, r) => {
      acc[r.categoria || 'outros'] = (acc[r.categoria || 'outros'] || 0) + Number(r.total);
      return acc;
    }, {});

    // Evolução patrimonial mensal (saldo acumulado)
    const evol = await pool.query(
      `SELECT DATE_TRUNC('month', data) AS mes,
              SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END) AS saldo_mes
       FROM income_expenses
       WHERE tenant_id=$1 AND entity_type='pf' AND entity_id=$2
       GROUP BY mes ORDER BY mes`,
      [req.tenantId, pfId]
    );
    let saldoAcum = Number(pf.patrimonio_inicial);
    const evolucaoPatrimonial = evol.rows.map(r => {
      saldoAcum += Number(r.saldo_mes);
      return { mes: r.mes, saldo: saldoAcum };
    });

    return {
      pf: { id: pf.id, nome: pf.nome, cpf: pf.cpf },
      patrimonio: {
        inicial: Number(pf.patrimonio_inicial),
        ativos_total: totalAssets,
        passivos_total: totalLiabilities,
        liquido: patrimonioLiquido,
        por_tipo_ativo: assets.rows.reduce((a, r) => { a[r.tipo] = Number(r.total); return a; }, {}),
        por_tipo_passivo: liabilities.rows.reduce((a, r) => { a[r.tipo] = Number(r.total); return a; }, {}),
      },
      periodo: { start: period_start || null, end: period_end || null },
      receitas_total: totalReceitas,
      despesas_total: totalDespesas,
      saldo_periodo: totalReceitas - totalDespesas,
      despesas_por_categoria: despesasPorCategoria,
      evolucao_patrimonial: evolucaoPatrimonial,
    };
  });
}
