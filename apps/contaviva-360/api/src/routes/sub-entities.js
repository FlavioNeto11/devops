// routes/sub-entities.js — Rotas de entidades secundárias como recursos de topo (REQ-CONTAVIVA360-0002/0004/0007/0009).
// Garante que cada entidade do inventário tenha /v1/<name> próprio (CRUD completo com paginação).
// As rotas aninhadas (ex.: /v1/pf/:id/assets) continuam existindo — estas são acessos diretos.
import { pool } from '../db.js';

// Helper: paginação padrão com sort/dir
function buildPagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const allowedCols = new Set(['id', 'created_at', 'updated_at', 'pf_id', 'pj_id', 'task_id', 'tipo', 'valor', 'nome', 'gateway', 'logged_at']);
  const sort = allowedCols.has(query.sort) ? query.sort : 'id';
  const dir = (query.dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { page, pageSize, offset, sort, dir };
}

export function registerSubEntityRoutes(app) {

  // ─────────────────────────────────────────────────────────────────────────────
  // PF-ASSETS — Bens (Ativos de Pessoa Física)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/pf-assets', async (req) => {
    const { pageSize, offset, sort, dir } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM pf_assets WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.pf_id) { sql += ` AND pf_id=$${idx++}`; params.push(Number(q.pf_id)); }
    if (q.tipo)  { sql += ` AND tipo=$${idx++}`;   params.push(q.tipo); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY ${sort} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/pf-assets/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM pf_assets WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.post('/v1/pf-assets', async (req, reply) => {
    const b = req.body || {};
    if (!b.pf_id || !b.tipo) {
      reply.code(400); return { error: { message: 'pf_id e tipo são obrigatórios' } };
    }
    const { rows } = await pool.query(
      'INSERT INTO pf_assets(tenant_id,pf_id,tipo,descricao,valor) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.tenantId, Number(b.pf_id), b.tipo, b.descricao || null, b.valor || 0]
    );
    reply.code(201); return rows[0];
  });

  app.put('/v1/pf-assets/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE pf_assets SET tipo=COALESCE($1,tipo), descricao=COALESCE($2,descricao), valor=COALESCE($3,valor)
       WHERE tenant_id=$4 AND id=$5 RETURNING *`,
      [b.tipo || null, b.descricao || null, b.valor ?? null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/pf-assets/:id', async (req) => {
    await pool.query('DELETE FROM pf_assets WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PF-LIABILITIES — Dívidas (Passivos de Pessoa Física)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/pf-liabilities', async (req) => {
    const { pageSize, offset, sort, dir } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM pf_liabilities WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.pf_id) { sql += ` AND pf_id=$${idx++}`; params.push(Number(q.pf_id)); }
    if (q.tipo)  { sql += ` AND tipo=$${idx++}`;   params.push(q.tipo); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY ${sort} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/pf-liabilities/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM pf_liabilities WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.post('/v1/pf-liabilities', async (req, reply) => {
    const b = req.body || {};
    if (!b.pf_id || !b.tipo) {
      reply.code(400); return { error: { message: 'pf_id e tipo são obrigatórios' } };
    }
    const { rows } = await pool.query(
      `INSERT INTO pf_liabilities(tenant_id,pf_id,tipo,descricao,valor,recorrente)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId, Number(b.pf_id), b.tipo, b.descricao || null, b.valor || 0, b.recorrente || false]
    );
    reply.code(201); return rows[0];
  });

  app.put('/v1/pf-liabilities/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE pf_liabilities SET tipo=COALESCE($1,tipo), descricao=COALESCE($2,descricao),
         valor=COALESCE($3,valor), recorrente=COALESCE($4,recorrente)
       WHERE tenant_id=$5 AND id=$6 RETURNING *`,
      [b.tipo || null, b.descricao || null, b.valor ?? null, b.recorrente ?? null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/pf-liabilities/:id', async (req) => {
    await pool.query('DELETE FROM pf_liabilities WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PJ-PARTNERS — Sócios de Pessoa Jurídica
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/pj-partners', async (req) => {
    const { pageSize, offset, sort, dir } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM pj_partners WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.pj_id) { sql += ` AND pj_id=$${idx++}`; params.push(Number(q.pj_id)); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY ${sort} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/pj-partners/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM pj_partners WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.post('/v1/pj-partners', async (req, reply) => {
    const b = req.body || {};
    if (!b.pj_id || !b.nome || !b.cpf) {
      reply.code(400); return { error: { message: 'pj_id, nome e cpf são obrigatórios' } };
    }
    const { rows } = await pool.query(
      `INSERT INTO pj_partners(tenant_id,pj_id,nome,cpf,participacao_pct)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.tenantId, Number(b.pj_id), b.nome, b.cpf, b.participacao_pct || 0]
    );
    reply.code(201); return rows[0];
  });

  app.put('/v1/pj-partners/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE pj_partners SET nome=COALESCE($1,nome), cpf=COALESCE($2,cpf),
         participacao_pct=COALESCE($3,participacao_pct)
       WHERE tenant_id=$4 AND id=$5 RETURNING *`,
      [b.nome || null, b.cpf || null, b.participacao_pct ?? null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/pj-partners/:id', async (req) => {
    await pool.query('DELETE FROM pj_partners WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TASK-COMMENTS — Comentários de Tarefas (acesso direto, sem passar pelo id da task)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/task-comments', async (req) => {
    const { pageSize, offset, sort, dir } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM task_comments WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.task_id) { sql += ` AND task_id=$${idx++}`; params.push(Number(q.task_id)); }
    if (q.author)  { sql += ` AND author=$${idx++}`;  params.push(q.author); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY ${sort} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/task-comments/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM task_comments WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.post('/v1/task-comments', async (req, reply) => {
    const b = req.body || {};
    if (!b.task_id || !b.content) {
      reply.code(400); return { error: { message: 'task_id e content são obrigatórios' } };
    }
    const { rows: tr } = await pool.query(
      'SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(b.task_id)]
    );
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    const { rows } = await pool.query(
      `INSERT INTO task_comments(tenant_id,task_id,author,content,metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.tenantId, Number(b.task_id), b.author || req.user || 'local', b.content, JSON.stringify({})]
    );
    reply.code(201); return rows[0];
  });

  app.put('/v1/task-comments/:id', async (req, reply) => {
    const b = req.body || {};
    if (!b.content) { reply.code(400); return { error: { message: 'content é obrigatório' } }; }
    const { rows } = await pool.query(
      `UPDATE task_comments SET content=$1, edited_at=now() WHERE tenant_id=$2 AND id=$3 RETURNING *`,
      [b.content, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/task-comments/:id', async (req) => {
    await pool.query('DELETE FROM task_comments WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TASK-ATTACHMENTS — Anexos de Tarefas (acesso direto, sem passar pelo id da task)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/task-attachments', async (req) => {
    const { pageSize, offset, sort, dir } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM task_attachments WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.task_id) { sql += ` AND task_id=$${idx++}`; params.push(Number(q.task_id)); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY ${sort} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/task-attachments/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM task_attachments WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.post('/v1/task-attachments', async (req, reply) => {
    const b = req.body || {};
    if (!b.task_id || !b.filename) {
      reply.code(400); return { error: { message: 'task_id e filename são obrigatórios' } };
    }
    const { rows: tr } = await pool.query(
      'SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(b.task_id)]
    );
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    const { rows: vr } = await pool.query(
      'SELECT COALESCE(MAX(version),0) AS max_v FROM task_attachments WHERE tenant_id=$1 AND task_id=$2',
      [req.tenantId, Number(b.task_id)]
    );
    const nextVersion = Number(vr[0].max_v) + 1;
    const { rows } = await pool.query(
      `INSERT INTO task_attachments(tenant_id,task_id,version,filename,content_type,file_size,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId, Number(b.task_id), b.version || nextVersion, b.filename,
       b.content_type || null, b.file_size || null, req.user || 'local']
    );
    reply.code(201); return rows[0];
  });

  app.put('/v1/task-attachments/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE task_attachments SET filename=COALESCE($1,filename), content_type=COALESCE($2,content_type),
         file_size=COALESCE($3,file_size), version=COALESCE($4,version)
       WHERE tenant_id=$5 AND id=$6 RETURNING *`,
      [b.filename || null, b.content_type || null, b.file_size ?? null, b.version ?? null,
       req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/task-attachments/:id', async (req) => {
    await pool.query('DELETE FROM task_attachments WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSISTANT-AUDIT — Log de auditoria do Assistente IA (REQ-CONTAVIVA360-0007/0009)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/assistant-audit', async (req) => {
    const { pageSize, offset } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM assistant_audit_log WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (q.conversation_id) { sql += ` AND conversation_id=$${idx++}`; params.push(q.conversation_id); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/assistant-audit/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM assistant_audit_log WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  // POST — inserção manual de registro de auditoria (ex.: testes, replay)
  app.post('/v1/assistant-audit', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO assistant_audit_log(tenant_id,conversation_id,question,answer,tools_used,duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId, b.conversation_id || null,
       b.question ? String(b.question).slice(0, 4000) : null,
       b.answer   ? String(b.answer).slice(0, 4000)   : null,
       JSON.stringify(b.tools_used || []),
       b.duration_ms || null]
    );
    reply.code(201); return rows[0];
  });

  app.delete('/v1/assistant-audit/:id', async (req) => {
    await pool.query('DELETE FROM assistant_audit_log WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATEWAY-AUDIT — Trilha de auditoria de Gateways Fiscais (REQ-CONTAVIVA360-0009)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get('/v1/gateway-audit', async (req) => {
    const { pageSize, offset } = buildPagination(req.query || {});
    const q = req.query || {};
    let sql = 'SELECT * FROM gateway_audit_log WHERE 1=1';
    const params = []; let idx = 1;
    if (q.gateway)         { sql += ` AND gateway=$${idx++}`;         params.push(q.gateway); }
    if (q.error_code)      { sql += ` AND error_code=$${idx++}`;      params.push(q.error_code); }
    if (q.response_status) { sql += ` AND response_status=$${idx++}`; params.push(Number(q.response_status)); }
    if (q.period_start)    { sql += ` AND logged_at >= $${idx++}`;    params.push(q.period_start); }
    if (q.period_end)      { sql += ` AND logged_at <= $${idx++}`;    params.push(q.period_end); }
    const countSql = sql.replace('SELECT *', 'SELECT count(*)::int');
    sql += ` ORDER BY logged_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);
    const [{ rows }, { rows: cr }] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params.slice(0, params.length - 2)),
    ]);
    return { data: rows, total: cr[0].count };
  });

  app.get('/v1/gateway-audit/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM gateway_audit_log WHERE id=$1',
      [Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  // POST — inserção manual de registro de auditoria de gateway (ex.: testes)
  app.post('/v1/gateway-audit', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO gateway_audit_log(gateway,method,endpoint,request_payload_sanitized,response_status,
         response_snippet,duration_ms,attempts,user_id,error_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.gateway || null, b.method || 'GET', b.endpoint || '/',
       b.request_payload_sanitized || null, b.response_status || null,
       b.response_snippet || null, b.duration_ms || null,
       b.attempts || 1, b.user_id || null, b.error_code || null]
    );
    reply.code(201); return rows[0];
  });

  app.delete('/v1/gateway-audit/:id', async (req) => {
    await pool.query('DELETE FROM gateway_audit_log WHERE id=$1', [Number(req.params.id)]);
    return { deleted: true };
  });
}
