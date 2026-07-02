// routes/income-expense.js — Receitas e Despesas PF/PJ (REQ-CONTAVIVA360-0002 AC3+AC4).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

const VALID_STATUS = ['pendente', 'pago', 'cancelado'];

export function registerIncomeExpenseRoutes(app) {
  app.get('/v1/income-expenses', async (req) => {
    const q = req.query || {};
    let sql = 'SELECT * FROM income_expenses WHERE tenant_id=$1';
    const params = [req.tenantId];
    let idx = 2;
    if (q.entity_type) { sql += ` AND entity_type=$${idx++}`; params.push(q.entity_type); }
    if (q.entity_id)   { sql += ` AND entity_id=$${idx++}`;   params.push(Number(q.entity_id)); }
    if (q.tipo)        { sql += ` AND tipo=$${idx++}`;         params.push(q.tipo); }
    if (q.categoria)   { sql += ` AND categoria=$${idx++}`;    params.push(q.categoria); }
    if (q.status)      { sql += ` AND status=$${idx++}`;       params.push(q.status); }
    if (q.period_start){ sql += ` AND data >= $${idx++}`;      params.push(q.period_start); }
    if (q.period_end)  { sql += ` AND data <= $${idx++}`;      params.push(q.period_end); }
    sql += ' ORDER BY data DESC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/income-expenses', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_income_expense', key);
    if (cached) return cached;
    if (!b.entity_type || !b.entity_id || !b.tipo || b.valor == null || !b.data) {
      reply.code(400); return { error: { message: 'entity_type, entity_id, tipo, valor e data são obrigatórios' } };
    }
    if (b.status && !VALID_STATUS.includes(b.status)) { reply.code(400); return { error: { message: 'status inválido: pendente|pago|cancelado' } }; }
    const { rows } = await pool.query(
      `INSERT INTO income_expenses(tenant_id,entity_type,entity_id,tipo,categoria,descricao,valor,data,recorrente,centro_custo,contraparte,status,comprovante_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.tenantId, b.entity_type, Number(b.entity_id), b.tipo, b.categoria||null, b.descricao||null, b.valor, b.data, b.recorrente||false, b.centro_custo||null, b.contraparte||null, b.status||'pendente', b.comprovante_url||null]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_income_expense', idempotencyKey: key, entityType: 'income_expense', entityId: result.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/income-expenses/:id', async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM income_expenses WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.put('/v1/income-expenses/:id', async (req, reply) => {
    const b = req.body || {};
    if (b.status && !VALID_STATUS.includes(b.status)) { reply.code(400); return { error: { message: 'status inválido' } }; }
    const { rows } = await pool.query(
      `UPDATE income_expenses SET
         categoria=COALESCE($1,categoria), descricao=COALESCE($2,descricao),
         valor=COALESCE($3,valor), data=COALESCE($4,data),
         recorrente=COALESCE($5,recorrente), centro_custo=COALESCE($6,centro_custo),
         contraparte=COALESCE($7,contraparte), status=COALESCE($8,status),
         comprovante_url=COALESCE($9,comprovante_url), updated_at=now()
       WHERE tenant_id=$10 AND id=$11 RETURNING *`,
      [b.categoria||null, b.descricao||null, b.valor??null, b.data||null, b.recorrente??null, b.centro_custo||null, b.contraparte||null, b.status||null, b.comprovante_url||null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/income-expenses/:id', async (req) => {
    await pool.query('DELETE FROM income_expenses WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });
}
