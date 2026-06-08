import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncH, buildPatch, notFound, invalid } from './_util.js';

const r = Router();

r.get('/items/:itemId/tasks', asyncH(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM tasks WHERE item_id = $1 ORDER BY status, position, created_at',
    [req.params.itemId],
  );
  res.json({ data: rows });
}));

r.post('/items/:itemId/tasks', asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return invalid(res, 'title e obrigatorio');
  const { rows: maxRows } = await query(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE item_id = $1 AND status = COALESCE($2,'todo')::task_status",
    [req.params.itemId, b.status],
  );
  const { rows } = await query(
    `INSERT INTO tasks (item_id, title, status, position, assignee, estimate)
     VALUES ($1,$2,COALESCE($3,'todo')::task_status,$4,$5,$6) RETURNING *`,
    [req.params.itemId, b.title, b.status, maxRows[0].pos, b.assignee, b.estimate],
  );
  res.status(201).json({ data: rows[0] });
}));

// PATCH cobre tambem mover/reordenar no kanban (status + position) e o ciclo begin->end.
r.patch('/tasks/:id', asyncH(async (req, res) => {
  const b = req.body || {};
  const { sets, values } = buildPatch(b, ['title', 'status', 'position', 'assignee', 'estimate']);
  // Ciclo de vida: marca started_at no 1o in_progress; completed_at ao concluir; limpa se reabrir.
  if (b.status === 'in_progress') sets.push('started_at = COALESCE(started_at, now())');
  if (b.status === 'done') sets.push('completed_at = now()');
  if (b.status && b.status !== 'done') sets.push('completed_at = NULL');
  if (!sets.length) return invalid(res, 'nada a atualizar');
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return notFound(res, 'task');
  res.json({ data: rows[0] });
}));

r.delete('/tasks/:id', asyncH(async (req, res) => {
  const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  if (!rowCount) return notFound(res, 'task');
  res.status(204).end();
}));

export default r;
