// routes/documents.js — Gestão Documental com versioning (REQ-CONTAVIVA360-0002 AC5).
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';

export function registerDocumentRoutes(app) {
  app.get('/v1/documents', async (req) => {
    const q = req.query || {};
    let sql = `SELECT d.*, (SELECT COUNT(*)::int FROM document_versions WHERE document_id=d.id) AS version_count
               FROM documents d WHERE d.tenant_id=$1`;
    const params = [req.tenantId]; let idx = 2;
    if (q.entity_type) { sql += ` AND d.entity_type=$${idx++}`; params.push(q.entity_type); }
    if (q.entity_id)   { sql += ` AND d.entity_id=$${idx++}`;   params.push(Number(q.entity_id)); }
    if (q.tipo)        { sql += ` AND d.tipo=$${idx++}`;         params.push(q.tipo); }
    if (q.mes)         { sql += ` AND d.mes=$${idx++}`;          params.push(Number(q.mes)); }
    if (q.ano)         { sql += ` AND d.ano=$${idx++}`;          params.push(Number(q.ano)); }
    if (q.status)      { sql += ` AND d.status=$${idx++}`;       params.push(q.status); }
    sql += ' ORDER BY d.id DESC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  app.post('/v1/documents', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('create_document', key);
    if (cached) return cached;
    if (!b.tipo) { reply.code(400); return { error: { message: 'tipo obrigatório' } }; }
    const { rows } = await pool.query(
      'INSERT INTO documents(tenant_id,entity_type,entity_id,tipo,mes,ano,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.tenantId, b.entity_type||null, b.entity_id ? Number(b.entity_id) : null, b.tipo, b.mes||null, b.ano||null, b.status||'pendente']
    );
    const doc = rows[0];
    let currentVersion = null;
    if (b.filename) {
      const vr = await pool.query(
        'INSERT INTO document_versions(document_id,tenant_id,version,filename,content_type,file_size,uploaded_by) VALUES ($1,$2,1,$3,$4,$5,$6) RETURNING *',
        [doc.id, req.tenantId, b.filename, b.content_type||null, b.file_size||null, req.user||'local']
      );
      currentVersion = vr.rows[0];
    }
    const result = { ...doc, current_version: currentVersion };
    await rememberIdempotentResponse({ operation: 'create_document', idempotencyKey: key, entityType: 'document', entityId: doc.id, response: result });
    reply.code(201); return result;
  });

  app.get('/v1/documents/:id', async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM documents WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const doc = rows[0];
    const versions = await pool.query('SELECT * FROM document_versions WHERE document_id=$1 ORDER BY version DESC', [doc.id]);
    return { ...doc, versions: versions.rows };
  });

  app.put('/v1/documents/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE documents SET tipo=COALESCE($1,tipo), mes=COALESCE($2,mes), ano=COALESCE($3,ano),
         status=COALESCE($4,status), updated_at=now()
       WHERE tenant_id=$5 AND id=$6 RETURNING *`,
      [b.tipo||null, b.mes??null, b.ano??null, b.status||null, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  // Novo upload cria versão (versioning simples — AC5)
  app.post('/v1/documents/:id/versions', async (req, reply) => {
    const b = req.body || {};
    if (!b.filename) { reply.code(400); return { error: { message: 'filename obrigatório' } }; }
    const docId = Number(req.params.id);
    const { rows: dr } = await pool.query('SELECT id FROM documents WHERE tenant_id=$1 AND id=$2', [req.tenantId, docId]);
    if (!dr[0]) { reply.code(404); return { error: { message: 'documento não encontrado' } }; }
    const { rows: vr } = await pool.query('SELECT COALESCE(MAX(version),0)+1 AS next FROM document_versions WHERE document_id=$1', [docId]);
    const { rows } = await pool.query(
      'INSERT INTO document_versions(document_id,tenant_id,version,filename,content_type,file_size,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [docId, req.tenantId, vr[0].next, b.filename, b.content_type||null, b.file_size||null, req.user||'local']
    );
    await pool.query('UPDATE documents SET updated_at=now() WHERE id=$1', [docId]);
    reply.code(201); return rows[0];
  });

  // Histórico de versões — quem fez upload e quando (AC5)
  app.get('/v1/documents/:id/versions', async (req, reply) => {
    const docId = Number(req.params.id);
    const { rows: dr } = await pool.query('SELECT id FROM documents WHERE tenant_id=$1 AND id=$2', [req.tenantId, docId]);
    if (!dr[0]) { reply.code(404); return { error: { message: 'documento não encontrado' } }; }
    const { rows } = await pool.query('SELECT * FROM document_versions WHERE document_id=$1 ORDER BY version DESC', [docId]);
    return { data: rows };
  });

  app.delete('/v1/documents/:id', async (req) => {
    await pool.query('DELETE FROM documents WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });
}
