// routes/pf.js — Cadastro de Pessoa Física (REQ-CONTAVIVA360-0002 AC1+AC3).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

export function registerPfRoutes(app) {
  app.get('/v1/pf', async (req) => {
    const { rows } = await pool.query(
      'SELECT * FROM physical_persons WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200',
      [req.tenantId]
    );
    return { data: rows };
  });

  app.post('/v1/pf', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_pf', key);
    if (cached) return cached;
    if (!b.cpf || !b.nome) { reply.code(400); return { error: { message: 'cpf e nome são obrigatórios' } }; }
    const { rows } = await pool.query(
      `INSERT INTO physical_persons(tenant_id,cpf,nome,data_nascimento,endereco,patrimonio_inicial)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId, b.cpf, b.nome, b.data_nascimento || null, JSON.stringify(b.endereco || {}), b.patrimonio_inicial || 0]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_pf', idempotencyKey: key, entityType: 'pf', entityId: result.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/pf/:id', async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM physical_persons WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const pf = rows[0];
    const [assets, liabilities] = await Promise.all([
      pool.query('SELECT * FROM pf_assets WHERE tenant_id=$1 AND pf_id=$2 ORDER BY id', [req.tenantId, pf.id]),
      pool.query('SELECT * FROM pf_liabilities WHERE tenant_id=$1 AND pf_id=$2 ORDER BY id', [req.tenantId, pf.id]),
    ]);
    return { ...pf, assets: assets.rows, liabilities: liabilities.rows };
  });

  app.put('/v1/pf/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE physical_persons SET
         nome=COALESCE($1,nome), data_nascimento=COALESCE($2,data_nascimento),
         endereco=COALESCE($3,endereco), patrimonio_inicial=COALESCE($4,patrimonio_inicial),
         updated_at=now()
       WHERE tenant_id=$5 AND id=$6 RETURNING *`,
      [b.nome||null, b.data_nascimento||null, b.endereco ? JSON.stringify(b.endereco) : null, b.patrimonio_inicial??null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/pf/:id', async (req) => {
    await pool.query('DELETE FROM physical_persons WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  app.post('/v1/pf/:id/assets', async (req, reply) => {
    const b = req.body || {};
    if (!b.tipo) { reply.code(400); return { error: { message: 'tipo obrigatório (carro|imovel|aplicacao)' } }; }
    const { rows } = await pool.query(
      'INSERT INTO pf_assets(tenant_id,pf_id,tipo,descricao,valor) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.tenantId, Number(req.params.id), b.tipo, b.descricao||null, b.valor||0]
    );
    reply.code(201); return rows[0];
  });

  app.delete('/v1/pf/:id/assets/:assetId', async (req) => {
    await pool.query('DELETE FROM pf_assets WHERE tenant_id=$1 AND pf_id=$2 AND id=$3', [req.tenantId, Number(req.params.id), Number(req.params.assetId)]);
    return { deleted: true };
  });

  app.post('/v1/pf/:id/liabilities', async (req, reply) => {
    const b = req.body || {};
    if (!b.tipo) { reply.code(400); return { error: { message: 'tipo obrigatório (financiamento|cartao|aluguel|pensao)' } }; }
    const { rows } = await pool.query(
      'INSERT INTO pf_liabilities(tenant_id,pf_id,tipo,descricao,valor,recorrente) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.tenantId, Number(req.params.id), b.tipo, b.descricao||null, b.valor||0, b.recorrente||false]
    );
    reply.code(201); return rows[0];
  });

  app.delete('/v1/pf/:id/liabilities/:liabilityId', async (req) => {
    await pool.query('DELETE FROM pf_liabilities WHERE tenant_id=$1 AND pf_id=$2 AND id=$3', [req.tenantId, Number(req.params.id), Number(req.params.liabilityId)]);
    return { deleted: true };
  });
}
