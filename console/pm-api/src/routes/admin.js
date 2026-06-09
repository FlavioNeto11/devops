import { Router } from 'express';
import { query, withTx } from '../db/pool.js';
import { asyncH, invalid, notFound } from './_util.js';
import { requireAdmin } from '../auth.js';
import * as kc from '../keycloak.js';

// Gestão dos usuários restritos (platform-admins). Identidade no Keycloak (grupo
// project-members); o mapa usuário->projeto vive aqui (pm_user_access).
const r = Router();
// requireAdmin ESCOPADO ao prefixo /admin — senão, como este router é montado na raiz da api,
// o middleware barraria também rotas de outros routers (ex.: GET /projects de um member).
r.use('/admin', requireAdmin);

/** Substitui o conjunto de projetos concedidos a um usuário (idempotente, transacional). */
async function setMemberProjects(email, projectIds) {
  const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
  await withTx(async (client) => {
    await client.query('DELETE FROM pm_user_access WHERE user_email = $1', [email]);
    for (const pid of ids) {
      await client.query(
        `INSERT INTO pm_user_access (user_email, project_id, can_edit)
         VALUES ($1, $2, true) ON CONFLICT (user_email, project_id) DO NOTHING`,
        [email, pid],
      );
    }
  });
  return ids;
}

// Lista usuários restritos + seus projetos. keycloakConfigured informa se a criação in-console está disponível.
r.get('/admin/members', asyncH(async (_req, res) => {
  const { rows: users } = await query(
    'SELECT email, display_name, keycloak_user_id, disabled, created_at FROM pm_users ORDER BY email',
  );
  const { rows: grants } = await query(
    `SELECT a.user_email, a.project_id, p.key, p.name
       FROM pm_user_access a JOIN projects p ON p.id = a.project_id`,
  );
  const byEmail = new Map();
  for (const u of users) {
    byEmail.set(u.email, {
      email: u.email,
      displayName: u.display_name,
      keycloakUserId: u.keycloak_user_id,
      disabled: u.disabled,
      createdAt: u.created_at,
      projects: [],
    });
  }
  for (const g of grants) {
    if (!byEmail.has(g.user_email)) {
      byEmail.set(g.user_email, { email: g.user_email, projects: [] });
    }
    byEmail.get(g.user_email).projects.push({ id: g.project_id, key: g.key, name: g.name });
  }
  res.json({ data: { members: [...byEmail.values()], keycloakConfigured: kc.isConfigured() } });
}));

// Cria/garante um usuário restrito. Com Keycloak configurado: cria no realm + grupo + senha
// temporária (devolvida 1x). Sem Keycloak: apenas registra o e-mail (vincula acesso a um usuário
// que já exista no Keycloak). Aceita projectIds inicial opcional.
r.post('/admin/members', asyncH(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!email) return invalid(res, 'email e obrigatorio');
  const displayName = String(b.name || b.displayName || '').trim() || email;

  let keycloakUserId = null;
  let tempPassword = null;
  const wantKeycloak = b.createInKeycloak !== false && kc.isConfigured();
  if (wantKeycloak) {
    const result = await kc.ensureMemberUser({ email, name: displayName });
    keycloakUserId = result.userId;
    tempPassword = result.tempPassword;
  }

  await query(
    `INSERT INTO pm_users (email, display_name, keycloak_user_id, disabled)
     VALUES ($1, $2, $3, false)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       keycloak_user_id = COALESCE(EXCLUDED.keycloak_user_id, pm_users.keycloak_user_id),
       disabled = false`,
    [email, displayName, keycloakUserId],
  );

  if (Array.isArray(b.projectIds)) await setMemberProjects(email, b.projectIds);

  res.status(201).json({
    data: { email, displayName, keycloakUserId, tempPassword, keycloakConfigured: kc.isConfigured() },
  });
}));

// Redefine (regenera) a senha temporária do usuário — para quando a senha do cadastro
// não foi anotada. Devolve a nova senha 1× (o usuário troca no próximo login).
r.post('/admin/members/:email/reset-password', asyncH(async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!kc.isConfigured()) {
    return res.status(503).json({ error: { code: 'KC_UNAVAILABLE', message: 'Keycloak não configurado para redefinir senha.' } });
  }
  const result = await kc.resetMemberPassword(email);
  res.json({ data: { email, tempPassword: result.tempPassword } });
}));

// Substitui os projetos concedidos ao usuário.
r.put('/admin/members/:email/projects', asyncH(async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const ids = await setMemberProjects(email, req.body?.projectIds);
  res.json({ data: { email, projectIds: ids } });
}));

// Habilita/desabilita o usuário (reflete no Keycloak quando configurado).
r.patch('/admin/members/:email', asyncH(async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const disabled = !!req.body?.disabled;
  const { rows } = await query('UPDATE pm_users SET disabled = $2 WHERE email = $1 RETURNING *', [email, disabled]);
  if (!rows.length) return notFound(res, 'usuario');
  if (kc.isConfigured() && rows[0].keycloak_user_id) {
    try {
      await kc.setEnabled(rows[0].keycloak_user_id, !disabled);
    } catch (e) {
      console.warn('[admin] setEnabled Keycloak falhou:', e.message);
    }
  }
  res.json({ data: { email, disabled } });
}));

// Remove acesso: apaga grants, tira do grupo e desabilita no Keycloak, e remove o registro local.
r.delete('/admin/members/:email', asyncH(async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT keycloak_user_id FROM pm_users WHERE email = $1', [email]);
  await query('DELETE FROM pm_user_access WHERE user_email = $1', [email]);
  if (kc.isConfigured() && rows[0]?.keycloak_user_id) {
    try {
      await kc.removeFromMemberGroup(rows[0].keycloak_user_id);
      await kc.setEnabled(rows[0].keycloak_user_id, false);
    } catch (e) {
      console.warn('[admin] remover do Keycloak falhou:', e.message);
    }
  }
  await query('DELETE FROM pm_users WHERE email = $1', [email]);
  res.status(204).end();
}));

export default r;
