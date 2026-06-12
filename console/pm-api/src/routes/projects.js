import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncH, buildPatch, notFound, invalid } from './_util.js';
import { requireAdmin, allowedProjectIds, assertProjectAccess } from '../auth.js';

const r = Router();
const FIELDS = ['name', 'stack', 'repo_url', 'route', 'k8s_namespace', 'k8s_label_selector', 'status', 'description', 'app_type'];

// Lista escopada: admin vê todos; member vê só os projetos atribuídos a ele.
r.get('/projects', asyncH(async (req, res) => {
  const allowed = await allowedProjectIds(req); // null = admin/todos
  if (allowed === null) {
    const { rows } = await query('SELECT * FROM projects ORDER BY name');
    return res.json({ data: rows });
  }
  if (allowed.length === 0) return res.json({ data: [] });
  const { rows } = await query('SELECT * FROM projects WHERE id = ANY($1) ORDER BY name', [allowed]);
  res.json({ data: rows });
}));

r.get('/projects/:id', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.id))) return;
  const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!rows.length) return notFound(res, 'projeto');
  res.json({ data: rows[0] });
}));

// Criar/editar/excluir PROJETO é só de admin (member trabalha o board, não gerencia projetos).
r.post('/projects', requireAdmin, asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.key || !b.name) return invalid(res, 'key e name sao obrigatorios');
  const { rows } = await query(
    `INSERT INTO projects (key, name, stack, repo_url, route, k8s_namespace, k8s_label_selector, status, description, app_type)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'apps'),$7,COALESCE($8,'active')::project_status,$9,COALESCE($10,'product_software')::app_type) RETURNING *`,
    [b.key, b.name, b.stack, b.repo_url, b.route, b.k8s_namespace, b.k8s_label_selector, b.status, b.description, b.app_type],
  );
  res.status(201).json({ data: rows[0] });
}));

r.patch('/projects/:id', requireAdmin, asyncH(async (req, res) => {
  const { sets, values } = buildPatch(req.body || {}, FIELDS);
  if (!sets.length) return invalid(res, 'nada a atualizar');
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE projects SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return notFound(res, 'projeto');
  res.json({ data: rows[0] });
}));

r.delete('/projects/:id', requireAdmin, asyncH(async (req, res) => {
  const { rowCount } = await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  if (!rowCount) return notFound(res, 'projeto');
  res.status(204).end();
}));

export default r;
