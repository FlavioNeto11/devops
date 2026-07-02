// routes/nf-products.js — Cadastro de Produto/Serviço para emissão de NF (REQ-CONTAVIVA360-0006 AC2).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

export function registerNfProductRoutes(app) {
  app.get('/v1/nf-products', async (req) => {
    const q = req.query || {};
    let sql = 'SELECT * FROM nf_products WHERE tenant_id=$1';
    const params = [req.tenantId];
    let idx = 2;
    if (q.codigo) { sql += ` AND codigo=$${idx++}`; params.push(q.codigo); }
    if (q.cfop) { sql += ` AND cfop=$${idx++}`; params.push(q.cfop); }
    sql += ' ORDER BY id DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/nf-products', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_nf_product', key);
    if (cached) return cached;
    if (!b.descricao || b.valor_unitario == null) {
      reply.code(400); return { error: { message: 'descricao e valor_unitario são obrigatórios' } };
    }
    const { rows } = await pool.query(
      `INSERT INTO nf_products(tenant_id,codigo,descricao,valor_unitario,aliquota_icms,aliquota_iss,aliquota_pis,aliquota_cofins,cfop,ncm_nbs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId, b.codigo || null, b.descricao, Number(b.valor_unitario),
       Number(b.aliquota_icms || 0), Number(b.aliquota_iss || 0),
       Number(b.aliquota_pis || 0), Number(b.aliquota_cofins || 0),
       b.cfop || '5102', b.ncm_nbs || null]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_nf_product', idempotencyKey: key, entityType: 'nf_product', entityId: result.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/nf-products/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM nf_products WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'produto não encontrado' } }; }
    return rows[0];
  });

  app.put('/v1/nf-products/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE nf_products SET
         codigo=COALESCE($1,codigo), descricao=COALESCE($2,descricao),
         valor_unitario=COALESCE($3,valor_unitario), aliquota_icms=COALESCE($4,aliquota_icms),
         aliquota_iss=COALESCE($5,aliquota_iss), aliquota_pis=COALESCE($6,aliquota_pis),
         aliquota_cofins=COALESCE($7,aliquota_cofins), cfop=COALESCE($8,cfop),
         ncm_nbs=COALESCE($9,ncm_nbs), updated_at=now()
       WHERE tenant_id=$10 AND id=$11 RETURNING *`,
      [b.codigo || null, b.descricao || null, b.valor_unitario != null ? Number(b.valor_unitario) : null,
       b.aliquota_icms != null ? Number(b.aliquota_icms) : null, b.aliquota_iss != null ? Number(b.aliquota_iss) : null,
       b.aliquota_pis != null ? Number(b.aliquota_pis) : null, b.aliquota_cofins != null ? Number(b.aliquota_cofins) : null,
       b.cfop || null, b.ncm_nbs || null,
       req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'produto não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/nf-products/:id', async (req) => {
    await pool.query('DELETE FROM nf_products WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });
}
