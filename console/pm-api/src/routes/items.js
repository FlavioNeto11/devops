import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncH, buildPatch, notFound, invalid } from './_util.js';

const r = Router();
const FIELDS = ['type', 'title', 'description', 'status', 'priority', 'external_ref', 'git_url', 'pr_url'];

r.get('/projects/:projectId/items', asyncH(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM items WHERE project_id = $1 ORDER BY priority, created_at DESC',
    [req.params.projectId],
  );
  res.json({ data: rows });
}));

r.get('/items/:id', asyncH(async (req, res) => {
  const { rows } = await query('SELECT * FROM items WHERE id = $1', [req.params.id]);
  if (!rows.length) return notFound(res, 'item');
  res.json({ data: rows[0] });
}));

r.post('/projects/:projectId/items', asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.type || !b.title) return invalid(res, 'type e title sao obrigatorios');
  const { rows } = await query(
    `INSERT INTO items (project_id, type, title, description, status, priority, external_ref, git_url, pr_url)
     VALUES ($1,$2,$3,$4,COALESCE($5,'backlog')::item_status,COALESCE($6,'P2')::item_priority,$7,$8,$9) RETURNING *`,
    [req.params.projectId, b.type, b.title, b.description, b.status, b.priority, b.external_ref, b.git_url, b.pr_url],
  );
  res.status(201).json({ data: rows[0] });
}));

r.patch('/items/:id', asyncH(async (req, res) => {
  const { sets, values } = buildPatch(req.body || {}, FIELDS);
  if (!sets.length) return invalid(res, 'nada a atualizar');
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE items SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return notFound(res, 'item');
  res.json({ data: rows[0] });
}));

r.delete('/items/:id', asyncH(async (req, res) => {
  const { rowCount } = await query('DELETE FROM items WHERE id = $1', [req.params.id]);
  if (!rowCount) return notFound(res, 'item');
  res.status(204).end();
}));

export default r;
