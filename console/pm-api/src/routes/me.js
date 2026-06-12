import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncH } from './_util.js';

// Quem sou eu + o que posso ver. O frontend usa isto para decidir o gating de telas
// (admin vê tudo; member vê só Projetos & Tarefas) e para filtrar os projetos.
const r = Router();

r.get('/me', asyncH(async (req, res) => {
  const { email, isAdmin, isMember } = req.auth || {};
  let projects = [];
  if (isAdmin) {
    const { rows } = await query(
      'SELECT id, key, name, app_type AS "appType", route, approval_status AS "approvalStatus" FROM projects ORDER BY name',
    );
    projects = rows.map((p) => ({ ...p, canEdit: true }));
  } else if (email) {
    const { rows } = await query(
      `SELECT p.id, p.key, p.name, p.app_type AS "appType", p.route, p.approval_status AS "approvalStatus", a.can_edit AS "canEdit"
         FROM pm_user_access a
         JOIN projects p ON p.id = a.project_id
        WHERE a.user_email = $1
        ORDER BY p.name`,
      [email],
    );
    projects = rows;
  }
  res.json({ data: { email: email || null, isAdmin: !!isAdmin, isMember: !!isMember, projects } });
}));

export default r;
