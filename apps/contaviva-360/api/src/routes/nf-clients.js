// routes/nf-clients.js — Cadastro de Cliente PJ para emissão de NF (REQ-CONTAVIVA360-0006 AC1).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

const TIPOS_CLIENTE = ['empresa', 'consumidor_final', 'orgao_publico'];

export function registerNfClientRoutes(app) {
  app.get('/v1/nf-clients', async (req) => {
    const q = req.query || {};
    let sql = 'SELECT * FROM nf_clients WHERE tenant_id=$1';
    const params = [req.tenantId];
    let idx = 2;
    if (q.tipo_cliente) { sql += ` AND tipo_cliente=$${idx++}`; params.push(q.tipo_cliente); }
    if (q.cnpj) { sql += ` AND cnpj ILIKE $${idx++}`; params.push('%' + q.cnpj.replace(/\D/g, '') + '%'); }
    sql += ' ORDER BY id DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/nf-clients', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_nf_client', key);
    if (cached) return cached;
    if (!b.razao_social || !b.cnpj) {
      reply.code(400); return { error: { message: 'razao_social e cnpj são obrigatórios' } };
    }
    if (b.tipo_cliente && !TIPOS_CLIENTE.includes(b.tipo_cliente)) {
      reply.code(400); return { error: { message: `tipo_cliente deve ser: ${TIPOS_CLIENTE.join('|')}` } };
    }
    const { rows } = await pool.query(
      `INSERT INTO nf_clients(tenant_id,razao_social,cnpj,inscricao_estadual,inscricao_municipal,endereco,contato,tipo_cliente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId, b.razao_social, b.cnpj.replace(/\D/g, ''), b.inscricao_estadual || null, b.inscricao_municipal || null,
       JSON.stringify(b.endereco || {}), JSON.stringify(b.contato || {}), b.tipo_cliente || 'empresa']
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_nf_client', idempotencyKey: key, entityType: 'nf_client', entityId: result.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/nf-clients/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM nf_clients WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'cliente não encontrado' } }; }
    return rows[0];
  });

  app.put('/v1/nf-clients/:id', async (req, reply) => {
    const b = req.body || {};
    if (b.tipo_cliente && !TIPOS_CLIENTE.includes(b.tipo_cliente)) {
      reply.code(400); return { error: { message: `tipo_cliente deve ser: ${TIPOS_CLIENTE.join('|')}` } };
    }
    const { rows } = await pool.query(
      `UPDATE nf_clients SET
         razao_social=COALESCE($1,razao_social), inscricao_estadual=COALESCE($2,inscricao_estadual),
         inscricao_municipal=COALESCE($3,inscricao_municipal), endereco=COALESCE($4,endereco),
         contato=COALESCE($5,contato), tipo_cliente=COALESCE($6,tipo_cliente), updated_at=now()
       WHERE tenant_id=$7 AND id=$8 RETURNING *`,
      [b.razao_social || null, b.inscricao_estadual || null, b.inscricao_municipal || null,
       b.endereco ? JSON.stringify(b.endereco) : null, b.contato ? JSON.stringify(b.contato) : null,
       b.tipo_cliente || null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'cliente não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/nf-clients/:id', async (req) => {
    await pool.query('DELETE FROM nf_clients WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });
}
