// routes/pj.js — Cadastro de Pessoa Jurídica (REQ-CONTAVIVA360-0002 AC2+AC4).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

const REGIMES = ['simples', 'lucro_presumido', 'lucro_real'];

export function registerPjRoutes(app) {
  app.get('/v1/pj', async (req) => {
    const { rows } = await pool.query('SELECT * FROM legal_persons WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId]);
    return { data: rows };
  });

  app.post('/v1/pj', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_pj', key);
    if (cached) return cached;
    if (!b.cnpj || !b.razao_social) { reply.code(400); return { error: { message: 'cnpj e razao_social são obrigatórios' } }; }
    if (b.regime_tributario && !REGIMES.includes(b.regime_tributario)) { reply.code(400); return { error: { message: 'regime_tributario inválido: use simples|lucro_presumido|lucro_real' } }; }
    const { rows } = await pool.query(
      `INSERT INTO legal_persons(tenant_id,razao_social,cnpj,inscricao_estadual,inscricao_municipal,regime_tributario,cnae,dados_bancarios)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId, b.razao_social, b.cnpj, b.inscricao_estadual||null, b.inscricao_municipal||null, b.regime_tributario||'simples', b.cnae||null, JSON.stringify(b.dados_bancarios||{})]
    );
    const result = rows[0];
    await rememberIdempotentResponse({ operation: 'create_pj', idempotencyKey: key, entityType: 'pj', entityId: result.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/pj/:id', async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM legal_persons WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const pj = rows[0];
    const partners = await pool.query('SELECT * FROM pj_partners WHERE tenant_id=$1 AND pj_id=$2 ORDER BY id', [req.tenantId, pj.id]);
    return { ...pj, socios: partners.rows };
  });

  app.put('/v1/pj/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE legal_persons SET razao_social=COALESCE($1,razao_social),
         inscricao_estadual=COALESCE($2,inscricao_estadual), inscricao_municipal=COALESCE($3,inscricao_municipal),
         regime_tributario=COALESCE($4,regime_tributario), cnae=COALESCE($5,cnae),
         dados_bancarios=COALESCE($6,dados_bancarios), updated_at=now()
       WHERE tenant_id=$7 AND id=$8 RETURNING *`,
      [b.razao_social||null, b.inscricao_estadual||null, b.inscricao_municipal||null, b.regime_tributario||null, b.cnae||null, b.dados_bancarios ? JSON.stringify(b.dados_bancarios) : null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/pj/:id', async (req) => {
    await pool.query('DELETE FROM legal_persons WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  app.post('/v1/pj/:id/partners', async (req, reply) => {
    const b = req.body || {};
    if (!b.nome || !b.cpf) { reply.code(400); return { error: { message: 'nome e cpf são obrigatórios' } }; }
    const { rows } = await pool.query(
      'INSERT INTO pj_partners(tenant_id,pj_id,nome,cpf,participacao_pct) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.tenantId, Number(req.params.id), b.nome, b.cpf, b.participacao_pct||0]
    );
    reply.code(201); return rows[0];
  });

  app.delete('/v1/pj/:id/partners/:partnerId', async (req) => {
    await pool.query('DELETE FROM pj_partners WHERE tenant_id=$1 AND pj_id=$2 AND id=$3', [req.tenantId, Number(req.params.id), Number(req.params.partnerId)]);
    return { deleted: true };
  });
}
