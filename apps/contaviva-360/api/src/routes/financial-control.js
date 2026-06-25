// routes/financial-control.js — Contas a Pagar e Contas a Receber (REQ-CONTAVIVA360-0005 AC1+AC2).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

const VALID_STATUS_AP = ['pendente', 'pago', 'vencido', 'cancelado'];
const VALID_STATUS_AR = ['pendente', 'recebido', 'vencido', 'cancelado'];
const VALID_FORMA_PAGAMENTO = ['cheque', 'TED', 'cartão', 'boleto', 'dinheiro'];

export function registerFinancialControlRoutes(app) {
  // ── Contas a Pagar (AP — tipo='despesa') ────────────────────────────────────

  app.get('/v1/accounts-payable', async (req) => {
    const q = req.query || {};
    let sql = `SELECT * FROM income_expenses WHERE tenant_id=$1 AND tipo='despesa'`;
    const params = [req.tenantId];
    let idx = 2;
    if (q.status)       { sql += ` AND status=$${idx++}`;                    params.push(q.status); }
    if (q.categoria)    { sql += ` AND categoria=$${idx++}`;                  params.push(q.categoria); }
    if (q.centro_custo) { sql += ` AND centro_custo=$${idx++}`;               params.push(q.centro_custo); }
    if (q.contraparte)  { sql += ` AND contraparte ILIKE $${idx++}`;          params.push('%' + q.contraparte + '%'); }
    if (q.period_start) { sql += ` AND data >= $${idx++}`;                   params.push(q.period_start); }
    if (q.period_end)   { sql += ` AND data <= $${idx++}`;                   params.push(q.period_end); }
    sql += ' ORDER BY data ASC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/accounts-payable', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_ap', key);
    if (cached) return cached;
    if (!b.contraparte || b.valor == null || !b.data) {
      reply.code(400);
      return { error: { message: 'contraparte (fornecedor), valor e data são obrigatórios' } };
    }
    if (b.status && !VALID_STATUS_AP.includes(b.status)) {
      reply.code(400);
      return { error: { message: 'status inválido: pendente|pago|vencido|cancelado' } };
    }
    if (b.forma_pagamento && !VALID_FORMA_PAGAMENTO.includes(b.forma_pagamento)) {
      reply.code(400);
      return { error: { message: 'forma_pagamento inválida: cheque|TED|cartão|boleto|dinheiro' } };
    }
    const entityType = b.entity_type || 'pj';
    const entityId = Number(b.entity_id) || 0;
    const { rows } = await pool.query(
      `INSERT INTO income_expenses(tenant_id,entity_type,entity_id,tipo,categoria,descricao,valor,data,
         recorrente,recorrencia_tipo,centro_custo,contraparte,forma_pagamento,status,comprovante_url)
       VALUES ($1,$2,$3,'despesa',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.tenantId, entityType, entityId, b.categoria||null, b.descricao||null,
       b.valor, b.data, b.recorrente||false, b.recorrencia_tipo||null,
       b.centro_custo||null, b.contraparte, b.forma_pagamento||null,
       b.status||'pendente', b.comprovante_url||null]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_ap', idempotencyKey: key, entityType: 'income_expense', entityId: result.id, response: result });
    reply.code(201);
    return result;
  });

  app.get('/v1/accounts-payable/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM income_expenses WHERE tenant_id=$1 AND id=$2 AND tipo='despesa'`,
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.put('/v1/accounts-payable/:id', async (req, reply) => {
    const b = req.body || {};
    if (b.status && !VALID_STATUS_AP.includes(b.status)) {
      reply.code(400); return { error: { message: 'status inválido: pendente|pago|vencido|cancelado' } };
    }
    const { rows } = await pool.query(
      `UPDATE income_expenses SET
         categoria=COALESCE($1,categoria), descricao=COALESCE($2,descricao),
         valor=COALESCE($3,valor), data=COALESCE($4,data),
         recorrente=COALESCE($5,recorrente), recorrencia_tipo=COALESCE($6,recorrencia_tipo),
         centro_custo=COALESCE($7,centro_custo), contraparte=COALESCE($8,contraparte),
         forma_pagamento=COALESCE($9,forma_pagamento), status=COALESCE($10,status),
         data_pagamento_realizado=COALESCE($11,data_pagamento_realizado),
         comprovante_url=COALESCE($12,comprovante_url), updated_at=now()
       WHERE tenant_id=$13 AND id=$14 AND tipo='despesa' RETURNING *`,
      [b.categoria||null, b.descricao||null, b.valor??null, b.data||null,
       b.recorrente??null, b.recorrencia_tipo||null, b.centro_custo||null,
       b.contraparte||null, b.forma_pagamento||null, b.status||null,
       b.data_pagamento_realizado||null, b.comprovante_url||null,
       req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/accounts-payable/:id', async (req) => {
    await pool.query(
      `DELETE FROM income_expenses WHERE tenant_id=$1 AND id=$2 AND tipo='despesa'`,
      [req.tenantId, Number(req.params.id)]
    );
    return { deleted: true };
  });

  // ── Contas a Receber (AR — tipo='receita') ──────────────────────────────────

  app.get('/v1/accounts-receivable', async (req) => {
    const q = req.query || {};
    let sql = `SELECT * FROM income_expenses WHERE tenant_id=$1 AND tipo='receita'`;
    const params = [req.tenantId];
    let idx = 2;
    if (q.status)       { sql += ` AND status=$${idx++}`;                    params.push(q.status); }
    if (q.categoria)    { sql += ` AND categoria=$${idx++}`;                  params.push(q.categoria); }
    if (q.contraparte)  { sql += ` AND contraparte ILIKE $${idx++}`;          params.push('%' + q.contraparte + '%'); }
    if (q.period_start) { sql += ` AND data >= $${idx++}`;                   params.push(q.period_start); }
    if (q.period_end)   { sql += ` AND data <= $${idx++}`;                   params.push(q.period_end); }
    sql += ' ORDER BY data ASC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/accounts-receivable', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_ar', key);
    if (cached) return cached;
    if (!b.contraparte || b.valor == null || !b.data) {
      reply.code(400);
      return { error: { message: 'contraparte (cliente), valor e data são obrigatórios' } };
    }
    if (b.status && !VALID_STATUS_AR.includes(b.status)) {
      reply.code(400);
      return { error: { message: 'status inválido: pendente|recebido|vencido|cancelado' } };
    }
    const entityType = b.entity_type || 'pf';
    const entityId = Number(b.entity_id) || 0;
    const { rows } = await pool.query(
      `INSERT INTO income_expenses(tenant_id,entity_type,entity_id,tipo,categoria,descricao,valor,data,
         recorrente,recorrencia_tipo,contraparte,forma_recebimento,status,comprovante_url)
       VALUES ($1,$2,$3,'receita',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.tenantId, entityType, entityId, b.categoria||null, b.descricao||null,
       b.valor, b.data, b.recorrente||false, b.recorrencia_tipo||null,
       b.contraparte, b.forma_recebimento||null, b.status||'pendente', b.comprovante_url||null]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_ar', idempotencyKey: key, entityType: 'income_expense', entityId: result.id, response: result });
    reply.code(201);
    return result;
  });

  app.get('/v1/accounts-receivable/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM income_expenses WHERE tenant_id=$1 AND id=$2 AND tipo='receita'`,
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.put('/v1/accounts-receivable/:id', async (req, reply) => {
    const b = req.body || {};
    if (b.status && !VALID_STATUS_AR.includes(b.status)) {
      reply.code(400); return { error: { message: 'status inválido: pendente|recebido|vencido|cancelado' } };
    }
    const { rows } = await pool.query(
      `UPDATE income_expenses SET
         categoria=COALESCE($1,categoria), descricao=COALESCE($2,descricao),
         valor=COALESCE($3,valor), data=COALESCE($4,data),
         recorrente=COALESCE($5,recorrente), contraparte=COALESCE($6,contraparte),
         forma_recebimento=COALESCE($7,forma_recebimento), status=COALESCE($8,status),
         comprovante_url=COALESCE($9,comprovante_url), updated_at=now()
       WHERE tenant_id=$10 AND id=$11 AND tipo='receita' RETURNING *`,
      [b.categoria||null, b.descricao||null, b.valor??null, b.data||null,
       b.recorrente??null, b.contraparte||null, b.forma_recebimento||null,
       b.status||null, b.comprovante_url||null,
       req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/accounts-receivable/:id', async (req) => {
    await pool.query(
      `DELETE FROM income_expenses WHERE tenant_id=$1 AND id=$2 AND tipo='receita'`,
      [req.tenantId, Number(req.params.id)]
    );
    return { deleted: true };
  });
}
