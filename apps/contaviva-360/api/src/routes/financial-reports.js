// routes/financial-reports.js — Relatório Financeiro (REQ-CONTAVIVA360-0005 AC4).
import { pool } from '../db.js';
import { enqueueFinancialReport } from '../queue.js';

function periodBounds(periodType, periodStart, periodEnd) {
  if (periodStart && periodEnd) return { start: periodStart, end: periodEnd };
  const now = new Date();
  if (periodType === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  }
  if (periodType === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const qs = q * 3;
    const start = new Date(now.getFullYear(), qs, 1);
    const end = new Date(now.getFullYear(), qs + 3, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  // default: mês corrente
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function registerFinancialReportRoutes(app) {
  app.get('/v1/reports/financial', async (req, reply) => {
    const q = req.query || {};
    const format = q.format || 'json';
    const bounds = periodBounds(q.period_type, q.period_start, q.period_end);

    let sql = `SELECT tipo, categoria, centro_custo, status, SUM(valor) AS total, COUNT(*) AS count
               FROM income_expenses WHERE tenant_id=$1 AND data >= $2 AND data <= $3`;
    const params = [req.tenantId, bounds.start, bounds.end];
    let idx = 4;
    if (q.categoria)    { sql += ` AND categoria=$${idx++}`;    params.push(q.categoria); }
    if (q.centro_custo) { sql += ` AND centro_custo=$${idx++}`; params.push(q.centro_custo); }
    sql += ' GROUP BY tipo, categoria, centro_custo, status ORDER BY tipo, categoria';

    const { rows } = await pool.query(sql, params);

    let totalReceitas = 0, totalDespesas = 0;
    const despesasPorCategoria = {}, despesasPorCentroCusto = {};
    for (const r of rows) {
      const tot = Number(r.total);
      if (r.tipo === 'receita') totalReceitas += tot;
      else {
        totalDespesas += tot;
        const cat = r.categoria || 'outros';
        despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + tot;
        const cc = r.centro_custo || 'geral';
        despesasPorCentroCusto[cc] = (despesasPorCentroCusto[cc] || 0) + tot;
      }
    }

    const linhas = rows.map(r => ({
      tipo: r.tipo, categoria: r.categoria, centro_custo: r.centro_custo,
      status: r.status, total: Number(r.total), count: Number(r.count),
    }));

    if (format === 'csv' || format === 'xlsx') {
      const csvLines = ['tipo,categoria,centro_custo,status,total,count'];
      for (const l of linhas) {
        csvLines.push([l.tipo, l.categoria||'', l.centro_custo||'', l.status, l.total, l.count].join(','));
      }
      const mime = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8';
      reply.header('Content-Type', mime);
      reply.header('Content-Disposition', `attachment; filename="relatorio-financeiro-${bounds.start}_${bounds.end}.${format}"`);
      return reply.send(csvLines.join('\n'));
    }

    return {
      periodo: bounds,
      resumo: {
        total_receitas: totalReceitas,
        total_despesas: totalDespesas,
        saldo_liquido: totalReceitas - totalDespesas,
      },
      despesas_por_categoria: despesasPorCategoria,
      despesas_por_centro_custo: despesasPorCentroCusto,
      linhas,
    };
  });

  // Enfileira geração assíncrona para exportações pesadas
  app.post('/v1/reports/financial/generate', async (req, reply) => {
    const b = req.body || {};
    const bounds = periodBounds(b.period_type, b.period_start, b.period_end);
    const jobKey = `fin-report-${req.tenantId}-${bounds.start}-${bounds.end}`;
    const result = await enqueueFinancialReport(jobKey, {
      tenantId: req.tenantId,
      ...bounds,
      format: b.format || 'json',
    });
    reply.code(202);
    return { jobKey, enqueued: !result.inline, inline: result.inline, periodo: bounds };
  });
}
