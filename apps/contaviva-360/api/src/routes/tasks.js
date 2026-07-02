// routes/tasks.js — Controle de Tarefas e Colaboração (REQ-CONTAVIVA360-0004).
import { pool } from '../db.js';
import { requireRole } from '../rbac.js';
import { enqueueTaskNotification } from '../queue.js';

const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'];
const STATUS_TASKS = ['aberta', 'em_progresso', 'aguardando_cliente', 'aguardando_contador', 'concluida', 'cancelada'];

// AC6: transições válidas de status
const VALID_TRANSITIONS = {
  aberta: ['em_progresso', 'aguardando_cliente', 'concluida', 'cancelada'],
  em_progresso: ['aguardando_cliente', 'aguardando_contador', 'concluida', 'cancelada'],
  aguardando_cliente: ['em_progresso', 'aguardando_contador', 'concluida', 'cancelada'],
  aguardando_contador: ['em_progresso', 'concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};

// AC5: alertas de prazo (3 dias → amarelo, 1 dia → laranja, hoje → vermelho, após → critico)
export function calcNivelAlertaTarefa(dueAt) {
  if (!dueAt) return null;
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const dueStr = typeof dueAt === 'string' ? dueAt.slice(0, 10) : new Date(dueAt).toLocaleDateString('sv-SE');
  if (dueStr < todayStr) return 'critico';
  if (dueStr === todayStr) return 'vermelho';
  const diffDays = Math.round((new Date(dueStr + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000);
  if (diffDays <= 1) return 'laranja';
  if (diffDays <= 3) return 'amarelo';
  return null;
}

export function registerTaskRoutes(app) {
  // ---- CRUD (AC1) ----

  app.get('/v1/tasks', async (req) => {
    const { status, priority, assignee, entity_type, entity_id } = req.query || {};
    let sql = 'SELECT * FROM tasks WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (status)      { sql += ` AND status=$${idx++}`;      params.push(status); }
    if (priority)    { sql += ` AND priority=$${idx++}`;    params.push(priority); }
    if (assignee)    { sql += ` AND assignee=$${idx++}`;    params.push(assignee); }
    if (entity_type) { sql += ` AND entity_type=$${idx++}`; params.push(entity_type); }
    if (entity_id)   { sql += ` AND entity_id=$${idx++}`;   params.push(Number(entity_id)); }
    sql += ' ORDER BY due_at ASC NULLS LAST, created_at DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    return { data: rows.map(r => ({ ...r, nivel_alerta: calcNivelAlertaTarefa(r.due_at) })) };
  });

  app.post('/v1/tasks', async (req, reply) => {
    const b = req.body || {};
    if (!b.title) { reply.code(400); return { error: { message: 'title é obrigatório' } }; }
    if (b.priority && !PRIORIDADES.includes(b.priority)) {
      reply.code(400); return { error: { message: `priority deve ser ${PRIORIDADES.join('|')}` } };
    }
    if (b.status && !STATUS_TASKS.includes(b.status)) {
      reply.code(400); return { error: { message: `status inválido: use ${STATUS_TASKS.join('|')}` } };
    }
    const { rows } = await pool.query(
      `INSERT INTO tasks(tenant_id,title,description,assignee,assignee_role,due_at,priority,status,entity_type,entity_id,obligation_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.tenantId, b.title, b.description || null, b.assignee || null,
       b.assignee_role || 'member', b.due_at || null, b.priority || 'media',
       b.status || 'aberta', b.entity_type || null, b.entity_id || null,
       b.obligation_id || null, req.user || 'local']
    );
    const task = rows[0];
    // AC4: notificação de atribuição enfileirada
    if (task.assignee) {
      await enqueueTaskNotification(task.id, 'assigned', {
        assignee: task.assignee, title: task.title, dueAt: task.due_at, tenantId: task.tenant_id,
      }).catch(() => {});
    }
    reply.code(201); return { ...task, nivel_alerta: calcNivelAlertaTarefa(task.due_at) };
  });

  app.get('/v1/tasks/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM tasks WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const task = rows[0];
    const [cmt, att] = await Promise.all([
      pool.query('SELECT * FROM task_comments WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at ASC', [req.tenantId, task.id]),
      pool.query('SELECT * FROM task_attachments WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at ASC', [req.tenantId, task.id]),
    ]);
    return { ...task, nivel_alerta: calcNivelAlertaTarefa(task.due_at), comments: cmt.rows, attachments: att.rows };
  });

  // AC6: atualização com validação de transição de status + notificações
  app.patch('/v1/tasks/:id', async (req, reply) => {
    const b = req.body || {};
    const id = Number(req.params.id);
    const { rows: cur } = await pool.query(
      'SELECT * FROM tasks WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, id]
    );
    if (!cur[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const prev = cur[0];

    if (b.status && b.status !== prev.status) {
      const allowed = VALID_TRANSITIONS[prev.status] || [];
      if (!allowed.includes(b.status)) {
        reply.code(400); return { error: { message: `transição inválida: ${prev.status} → ${b.status}` } };
      }
    }
    if (b.priority && !PRIORIDADES.includes(b.priority)) {
      reply.code(400); return { error: { message: `priority deve ser ${PRIORIDADES.join('|')}` } };
    }

    const { rows } = await pool.query(
      `UPDATE tasks SET
         title=COALESCE($1,title), description=COALESCE($2,description),
         assignee=COALESCE($3,assignee), assignee_role=COALESCE($4,assignee_role),
         due_at=COALESCE($5,due_at), priority=COALESCE($6,priority),
         status=COALESCE($7,status), entity_type=COALESCE($8,entity_type),
         entity_id=COALESCE($9,entity_id), obligation_id=COALESCE($10,obligation_id),
         updated_at=now()
       WHERE tenant_id=$11 AND id=$12 RETURNING *`,
      [b.title||null, b.description||null, b.assignee||null, b.assignee_role||null,
       b.due_at||null, b.priority||null, b.status||null,
       b.entity_type||null, b.entity_id||null, b.obligation_id||null,
       req.tenantId, id]
    );
    const updated = rows[0];

    // AC4: nova atribuição → notificação enfileirada
    if (b.assignee && b.assignee !== prev.assignee) {
      await enqueueTaskNotification(updated.id, 'assigned', {
        assignee: updated.assignee, title: updated.title, dueAt: updated.due_at, tenantId: updated.tenant_id,
      }).catch(() => {});
    }
    // AC6: notificar nas transições de status relevantes
    if (b.status && b.status !== prev.status) {
      if (b.status === 'aguardando_cliente') {
        await enqueueTaskNotification(updated.id, 'aguardando_cliente', {
          assignee: updated.assignee, title: updated.title, tenantId: updated.tenant_id,
        }).catch(() => {});
      } else if (b.status === 'aguardando_contador') {
        await enqueueTaskNotification(updated.id, 'aguardando_contador', {
          assignee: updated.assignee, title: updated.title, tenantId: updated.tenant_id,
        }).catch(() => {});
      }
    }

    return { ...updated, nivel_alerta: calcNivelAlertaTarefa(updated.due_at) };
  });

  app.delete('/v1/tasks/:id', { preHandler: requireRole('admin') }, async (req) => {
    await pool.query('DELETE FROM tasks WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // ---- COMENTÁRIOS em thread (AC2) ----

  app.get('/v1/tasks/:id/comments', async (req, reply) => {
    const taskId = Number(req.params.id);
    const { rows: tr } = await pool.query('SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2', [req.tenantId, taskId]);
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    const { rows } = await pool.query(
      'SELECT * FROM task_comments WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at ASC',
      [req.tenantId, taskId]
    );
    return { data: rows };
  });

  app.post('/v1/tasks/:id/comments', async (req, reply) => {
    const b = req.body || {};
    if (!b.content) { reply.code(400); return { error: { message: 'content é obrigatório' } }; }
    const taskId = Number(req.params.id);
    const { rows: tr } = await pool.query('SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2', [req.tenantId, taskId]);
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    // AC2: metadata de marcação de contador
    const metadata = {};
    if (b.resposta_esperada) metadata.resposta_esperada = true;
    if (b.info_fornecida) metadata.info_fornecida = true;
    const { rows } = await pool.query(
      `INSERT INTO task_comments(tenant_id,task_id,author,content,metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.tenantId, taskId, req.user || 'local', b.content, JSON.stringify(metadata)]
    );
    reply.code(201); return rows[0];
  });

  // AC2: editar próprio comentário
  app.patch('/v1/tasks/:id/comments/:cid', async (req, reply) => {
    const b = req.body || {};
    if (!b.content) { reply.code(400); return { error: { message: 'content é obrigatório' } }; }
    const cid = Number(req.params.cid);
    const { rows: cr } = await pool.query('SELECT * FROM task_comments WHERE tenant_id=$1 AND id=$2', [req.tenantId, cid]);
    if (!cr[0]) { reply.code(404); return { error: { message: 'comentário não encontrado' } }; }
    const comment = cr[0];
    if (comment.author !== (req.user || 'local') && req.role !== 'admin') {
      reply.code(403); return { error: { message: 'apenas o autor pode editar o comentário' } };
    }
    const metadata = Object.assign({}, comment.metadata || {});
    if (b.resposta_esperada !== undefined) metadata.resposta_esperada = b.resposta_esperada;
    if (b.info_fornecida !== undefined) metadata.info_fornecida = b.info_fornecida;
    const { rows } = await pool.query(
      `UPDATE task_comments SET content=$1, metadata=$2, edited_at=now() WHERE tenant_id=$3 AND id=$4 RETURNING *`,
      [b.content, JSON.stringify(metadata), req.tenantId, cid]
    );
    return rows[0];
  });

  // ---- ANEXOS (AC3) ----

  app.get('/v1/tasks/:id/attachments', async (req, reply) => {
    const taskId = Number(req.params.id);
    const { rows: tr } = await pool.query('SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2', [req.tenantId, taskId]);
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    const { rows } = await pool.query(
      'SELECT * FROM task_attachments WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at ASC',
      [req.tenantId, taskId]
    );
    return { data: rows };
  });

  // AC3: versioning de anexos — próxima versão auto-incrementada por task
  app.post('/v1/tasks/:id/attachments', async (req, reply) => {
    const b = req.body || {};
    if (!b.filename) { reply.code(400); return { error: { message: 'filename é obrigatório' } }; }
    const taskId = Number(req.params.id);
    const { rows: tr } = await pool.query('SELECT id FROM tasks WHERE tenant_id=$1 AND id=$2', [req.tenantId, taskId]);
    if (!tr[0]) { reply.code(404); return { error: { message: 'tarefa não encontrada' } }; }
    const { rows: vr } = await pool.query(
      'SELECT COALESCE(MAX(version),0) AS max_v FROM task_attachments WHERE tenant_id=$1 AND task_id=$2',
      [req.tenantId, taskId]
    );
    const nextVersion = Number(vr[0].max_v) + 1;
    const { rows } = await pool.query(
      `INSERT INTO task_attachments(tenant_id,task_id,version,filename,content_type,file_size,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId, taskId, nextVersion, b.filename,
       b.content_type || null, b.file_size || null, req.user || 'local']
    );
    reply.code(201); return rows[0];
  });

  // AC5: scan e enfileira alertas de prazo
  app.post('/v1/tasks/scan-deadlines', { preHandler: requireRole('admin') }, async (req) => {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE tenant_id=$1 AND status NOT IN ('concluida','cancelada')
       AND due_at IS NOT NULL AND due_at <= (CURRENT_DATE + INTERVAL '3 days')`,
      [req.tenantId]
    );
    const enqueued = [];
    for (const task of rows) {
      const nivel = calcNivelAlertaTarefa(task.due_at);
      if (nivel) {
        await enqueueTaskNotification(task.id, 'deadline_alert', {
          assignee: task.assignee, title: task.title, dueAt: task.due_at, nivel, tenantId: task.tenant_id,
        }).catch(() => {});
        enqueued.push({ id: task.id, title: task.title, nivel });
      }
    }
    return { scanned: rows.length, enqueued };
  });
}
