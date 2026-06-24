// services/dashboard-service.js — agregações de receita/despesa por clínica.
import { pool } from '../db.js';

export async function getRevenueDashboard({ tenantId, dateFrom, dateTo, professionalId, patientId, page = 1, limit = 50 }) {
  const conditions = ['c.tenant_id=$1'];
  const params = [tenantId];
  let i = 2;

  if (dateFrom) { conditions.push(`c.scheduled_at >= $${i++}`); params.push(dateFrom); }
  if (dateTo)   { conditions.push(`c.scheduled_at <= $${i++}`); params.push(dateTo); }
  if (professionalId) { conditions.push(`c.professional_id=$${i++}`); params.push(professionalId); }
  if (patientId)      { conditions.push(`c.patient_id=$${i++}`); params.push(patientId); }

  const where = conditions.join(' AND ');
  const offset = (Math.max(1, page) - 1) * limit;

  const [rows, totals] = await Promise.all([
    pool.query(
      `SELECT c.id, c.patient_id, c.professional_id, c.scheduled_at, c.amount_cents, c.currency,
              c.payment_status, c.status, c.created_by, c.created_at
       FROM consultations c WHERE ${where} ORDER BY c.scheduled_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN c.payment_status='authorized' THEN c.amount_cents ELSE 0 END), 0)::bigint AS revenue_cents
       FROM consultations c WHERE ${where}`,
      params
    ),
  ]);

  return {
    data: rows.rows,
    meta: {
      total: totals.rows[0].total,
      revenue_cents: Number(totals.rows[0].revenue_cents),
      page: Number(page),
      limit,
    },
  };
}
