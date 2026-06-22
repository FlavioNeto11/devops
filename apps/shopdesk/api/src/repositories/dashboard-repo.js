// dashboard-repo.js — agregações do painel (camada repository; sem SQL nas rotas).
import { pool } from '../db.js';

const PAID = ['pago', 'aprovado', 'paid', 'approved', 'concluido', 'concluído'];

function isoDay(d) { return d.toISOString(); }

export async function summary(tenantId) {
  const now = new Date();
  const todayStart  = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const monthStart  = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const yearStart   = isoDay(new Date(now.getFullYear(), 0, 1));
  const sparkStart  = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13));

  const [todayR, monthR, yearR, totalR, criticalR, sparkR] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS revenue FROM orders WHERE tenant_id=$1 AND payment_status=ANY($2::text[]) AND created_at>=$3`,
      [tenantId, PAID, todayStart]
    ),
    pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS revenue, COUNT(*)::int AS count FROM orders WHERE tenant_id=$1 AND payment_status=ANY($2::text[]) AND created_at>=$3`,
      [tenantId, PAID, monthStart]
    ),
    pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS revenue FROM orders WHERE tenant_id=$1 AND payment_status=ANY($2::text[]) AND created_at>=$3`,
      [tenantId, PAID, yearStart]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM orders WHERE tenant_id=$1`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM inventory WHERE tenant_id=$1 AND quantity<=reorder_point AND reorder_point>0`,
      [tenantId]
    ),
    pool.query(
      `SELECT DATE_TRUNC('day', created_at) AS day, COALESCE(SUM(total),0)::float AS revenue FROM orders WHERE tenant_id=$1 AND payment_status=ANY($2::text[]) AND created_at>=$3 GROUP BY 1 ORDER BY 1`,
      [tenantId, PAID, sparkStart]
    ),
  ]);

  const monthRevenue = Number(monthR.rows[0].revenue);
  const monthCount   = Number(monthR.rows[0].count);

  const sparkByDay = {};
  for (const row of sparkR.rows) {
    const d = new Date(row.day);
    const key = d.toISOString().slice(0, 10);
    sparkByDay[key] = Number(row.revenue);
  }
  const salesSeries = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    salesSeries.push({ date: key, revenue: sparkByDay[key] || 0 });
  }

  return {
    revenue:      { today: Number(todayR.rows[0].revenue), month: monthRevenue, year: Number(yearR.rows[0].revenue) },
    orders:       { count: Number(totalR.rows[0].count), avgTicket: monthCount > 0 ? monthRevenue / monthCount : 0 },
    criticalStock: Number(criticalR.rows[0].count),
    salesSeries,
  };
}

export async function recent(tenantId, limit = 8) {
  const r = await pool.query(
    `SELECT * FROM orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return r.rows;
}

export async function exportSalesCsv(tenantId) {
  const r = await pool.query(
    `SELECT code, customer_name, customer_email, total, status, payment_status, tracking_code, created_at FROM orders WHERE tenant_id=$1 ORDER BY created_at DESC`,
    [tenantId]
  );
  const header = 'Pedido,Cliente,Email,Total,Status,Pagamento,Rastreio,Data';
  const rows = r.rows.map((row) =>
    [row.code, row.customer_name, row.customer_email, row.total, row.status, row.payment_status, row.tracking_code, row.created_at]
      .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')
  );
  return [header, ...rows].join('\r\n');
}

export async function exportStockCsv(tenantId) {
  const r = await pool.query(
    `SELECT sku, product_name, quantity, reorder_point, location, status FROM inventory WHERE tenant_id=$1 ORDER BY quantity ASC`,
    [tenantId]
  );
  const header = 'SKU,Produto,Quantidade,Ponto de Reposição,Localização,Status';
  const rows = r.rows.map((row) =>
    [row.sku, row.product_name, row.quantity, row.reorder_point, row.location, row.status]
      .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')
  );
  return [header, ...rows].join('\r\n');
}
