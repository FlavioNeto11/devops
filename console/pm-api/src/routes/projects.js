import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncH, buildPatch, notFound, invalid } from './_util.js';
import { requireAdmin, allowedProjectIds, assertProjectAccess } from '../auth.js';

const r = Router();
const FIELDS = ['name', 'stack', 'repo_url', 'route', 'k8s_namespace', 'k8s_label_selector', 'status', 'description', 'app_type', 'related_project_id'];
const APP_TYPES = new Set(['product_software', 'cms_portal', 'platform_tool']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vínculo portal→produto: precisa ser UUID de um projeto existente que NÃO seja
// outro portal. Devolve { ok } ou { ok:false, message } para o handler responder 422.
async function checkRelatedProject(relatedId) {
  if (!UUID_RE.test(String(relatedId))) return { ok: false, message: 'related_project_id deve ser um UUID valido' };
  const rel = await query('SELECT id, app_type FROM projects WHERE id = $1', [relatedId]);
  if (!rel.rowCount) return { ok: false, message: 'related_project_id nao existe' };
  if (rel.rows[0].app_type === 'cms_portal') return { ok: false, message: 'o vinculo deve apontar para um produto/sistema, nao para outro portal' };
  return { ok: true };
}

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

// Criar PROJETO: admin cria qualquer tipo (nasce aprovado). Member pode criar
// APENAS portal CMS — nasce pending_approval e só vai ao ar após aprovação do
// dono/admin (a rota pública do CMS filtra por approval_status='approved').
r.post('/projects', asyncH(async (req, res) => {
  const b = req.body || {};
  const { email, isAdmin } = req.auth || {};
  if (!b.key || !b.name) return invalid(res, 'key e name sao obrigatorios');
  if (!/^[a-z][a-z0-9-]*$/.test(b.key)) return invalid(res, 'key deve ser kebab-case (minusculas, numeros e hifens)');
  const appType = b.app_type || 'product_software';
  if (!isAdmin && appType !== 'cms_portal') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'membros so podem criar portais CMS' } });
  }

  // Key é identidade: um portal novo NUNCA reutiliza a chave de um app existente.
  const dup = await query('SELECT 1 FROM projects WHERE key = $1', [b.key]);
  if (dup.rowCount) return res.status(409).json({ error: { code: 'CONFLICT', message: `ja existe um projeto com a chave "${b.key}" — escolha outra` } });

  if (!APP_TYPES.has(appType)) return invalid(res, 'app_type invalido (cms_portal | product_software | platform_tool)');

  // Vínculo opcional com produto/sistema: relacional (contexto/IA/governança),
  // não muda a identidade do portal. Só aponta para produto/ferramenta existente.
  const relatedId = b.related_project_id || null;
  if (relatedId) {
    const check = await checkRelatedProject(relatedId);
    if (!check.ok) return invalid(res, check.message);
  }

  const approval = isAdmin ? 'approved' : 'pending_approval';
  const { rows } = await query(
    `INSERT INTO projects (key, name, stack, repo_url, route, k8s_namespace, k8s_label_selector, status, description, app_type,
                           approval_status, created_by, approved_by, approved_at, related_project_id)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'apps'),$7,COALESCE($8,'active')::project_status,$9,COALESCE($10,'product_software')::app_type,
             $11::approval_status, $12, $13, CASE WHEN $11 = 'approved' THEN now() END, $14)
     RETURNING *`,
    [b.key, b.name, b.stack, b.repo_url, b.route, b.k8s_namespace, b.k8s_label_selector, b.status, b.description, appType,
      approval, email || null, isAdmin ? (email || null) : null, relatedId],
  );
  const project = rows[0];

  // Member que criou o portal ganha acesso a ele (senão criaria e não veria).
  if (!isAdmin && email) {
    await query(
      `INSERT INTO pm_user_access (user_email, project_id, can_edit)
       VALUES ($1, $2, true) ON CONFLICT (user_email, project_id) DO NOTHING`,
      [email, project.id],
    );
  }
  res.status(201).json({ data: project });
}));

// Aprovar/rejeitar portal pendente — decisão do dono/admin, com rastreio de quem/quando.
r.post('/projects/:id/approve', requireAdmin, asyncH(async (req, res) => {
  const { rows } = await query(
    `UPDATE projects SET approval_status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [req.params.id, req.auth?.email || null],
  );
  if (!rows.length) return notFound(res, 'projeto');
  res.json({ data: rows[0] });
}));

r.post('/projects/:id/reject', requireAdmin, asyncH(async (req, res) => {
  const { rows } = await query(
    `UPDATE projects SET approval_status = 'rejected', approved_by = $2, approved_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [req.params.id, req.auth?.email || null],
  );
  if (!rows.length) return notFound(res, 'projeto');
  res.json({ data: rows[0] });
}));

r.patch('/projects/:id', requireAdmin, asyncH(async (req, res) => {
  const b = req.body || {};
  // Mesmas regras de negócio do POST: enum de tipo e vínculo só para produto.
  if (b.app_type !== undefined && !APP_TYPES.has(b.app_type)) {
    return invalid(res, 'app_type invalido (cms_portal | product_software | platform_tool)');
  }
  if (b.related_project_id === '') b.related_project_id = null; // '' viraria erro de uuid
  if (b.related_project_id !== undefined && b.related_project_id !== null) {
    const check = await checkRelatedProject(b.related_project_id);
    if (!check.ok) return invalid(res, check.message);
    if (b.related_project_id === req.params.id) return invalid(res, 'um projeto nao pode se vincular a si mesmo');
  }
  const { sets, values } = buildPatch(b, FIELDS);
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
