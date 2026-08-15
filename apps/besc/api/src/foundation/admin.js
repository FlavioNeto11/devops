// Administracao de RBAC/usuarios (Fase 0). Fluxo "papel novo sem deploy":
// POST /admin/roles + PUT /admin/roles/:id/permissions (matriz vinda de
// GET /meta/permissions) — tudo auditado, com guardas anti-lockout.
import { query, tx } from '../db.js';
import { appendAudit } from './audit.js';
import { authorize, bumpRbacVersion, invalidateRbacCache, PERMISSION_CATALOG } from './rbac.js';

const audit = (req, eventType, entityId, payload) => appendAudit({
  actorUserId: req.auth.user.id, actorRole: req.auth.roles[0], ip: req.ip,
  eventType, entityType: 'rbac', entityId, payload,
});

async function countActiveManagers(client) {
  const { rows } = await client.query(
    `SELECT count(DISTINCT u.id)::int AS n FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.key IN ('manager','admin') AND u.is_active`,
  );
  return rows[0].n;
}

export function installAdminRoutes(app) {
  // Catalogo p/ a UI de administracao (matriz permissao × escopo)
  app.get('/meta/permissions', authorize('rbac:manage'), async (req, res) => {
    const { rows: roles } = await query(
      `SELECT r.id, r.key, r.label, r.description, r.is_system,
              COALESCE(json_agg(json_build_object('key', rp.permission_key, 'scope', rp.scope))
                       FILTER (WHERE rp.permission_key IS NOT NULL), '[]') AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
       GROUP BY r.id ORDER BY r.key`,
    );
    res.json({ catalog: PERMISSION_CATALOG, scopes: ['own', 'linked', 'all'], roles });
  });

  app.post('/admin/roles', authorize('rbac:manage'), async (req, res) => {
    const { key, label, description } = req.body || {};
    if (!key || !/^[a-z][a-z0-9_]{1,40}$/.test(key)) return res.status(400).json({ error: 'key inválida (minúsculas/underscore)' });
    if (!label) return res.status(400).json({ error: 'label é obrigatório' });
    const { rows } = await query(
      `INSERT INTO roles (key, label, description, created_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO NOTHING RETURNING id, key, label`,
      [key, label, description || null, req.auth.user.id],
    );
    if (!rows.length) return res.status(409).json({ error: 'papel já existe' });
    await query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
    invalidateRbacCache();
    await audit(req, 'rbac.role.created', key, { label });
    res.status(201).json(rows[0]);
  });

  app.put('/admin/roles/:id/permissions', authorize('rbac:manage'), async (req, res) => {
    const perms = (req.body || {}).permissions;
    if (!Array.isArray(perms)) return res.status(400).json({ error: 'permissions deve ser uma lista de {key, scope}' });
    const valid = new Set([...PERMISSION_CATALOG.map((p) => p.key), '*']);
    for (const p of perms) {
      if (!p || !valid.has(p.key)) return res.status(400).json({ error: `permissão desconhecida: ${p && p.key}` });
      if (!['own', 'linked', 'all'].includes(p.scope || 'all')) return res.status(400).json({ error: `scope inválido: ${p.scope}` });
    }
    const out = await tx(async (client) => {
      const { rows } = await client.query('SELECT id, key FROM roles WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!rows.length) return { status: 404, body: { error: 'papel não encontrado' } };
      const role = rows[0];
      const before = (await client.query('SELECT permission_key, scope FROM role_permissions WHERE role_id = $1 ORDER BY permission_key', [role.id])).rows;
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [role.id]);
      for (const p of perms) {
        await client.query('INSERT INTO role_permissions (role_id, permission_key, scope) VALUES ($1,$2,$3)', [role.id, p.key, p.scope || 'all']);
      }
      await bumpRbacVersion(client);
      return { status: 200, body: { ok: true }, roleKey: role.key, before };
    });
    if (out.status !== 200) return res.status(out.status).json(out.body);
    invalidateRbacCache();
    await audit(req, 'rbac.permissions.changed', out.roleKey, { before: out.before, after: perms });
    res.json(out.body);
  });

  app.delete('/admin/roles/:id', authorize('rbac:manage'), async (req, res) => {
    const { rows } = await query('SELECT id, key, is_system FROM roles WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'papel não encontrado' });
    if (rows[0].is_system) return res.status(403).json({ error: 'papéis de sistema não podem ser excluídos' });
    await query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    await query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
    invalidateRbacCache();
    await audit(req, 'rbac.role.deleted', rows[0].key, {});
    res.json({ ok: true });
  });

  app.get('/admin/users', authorize('users:manage'), async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.is_active, u.approval_status, u.kyc_status, u.created_at,
              COALESCE(json_agg(r.key) FILTER (WHERE r.key IS NOT NULL), '[]') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`,
    );
    res.json(rows);
  });

  app.post('/admin/users/:id/roles', authorize('rbac:manage'), async (req, res) => {
    const { roleKey } = req.body || {};
    if (!roleKey) return res.status(400).json({ error: 'roleKey é obrigatório' });
    // anti-auto-elevação: só admin concede papel a si mesmo
    if (req.params.id === req.auth.user.id && !req.auth.roles.includes('admin')) {
      return res.status(403).json({ error: 'conceder papel a si mesmo exige admin' });
    }
    const { rows } = await query(
      `INSERT INTO user_roles (user_id, role_id, granted_by)
       SELECT $1, id, $3 FROM roles WHERE key = $2
       ON CONFLICT (user_id, role_id) DO NOTHING RETURNING user_id`,
      [req.params.id, roleKey, req.auth.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'papel ou usuário não encontrado' });
    // "1 ação: escolher o perfil" — conceder papel LIBERA o acesso: aprova a conta pendente
    // e garante que ela esteja ativa. O operador não precisa clicar "Aprovar" separado.
    const appr = await query(
      `UPDATE users SET approval_status = 'active', is_active = true, updated_at = now()
       WHERE id = $1 AND (approval_status <> 'active' OR is_active = false) RETURNING id`,
      [req.params.id],
    );
    await query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
    invalidateRbacCache();
    await audit(req, 'rbac.role.granted', req.params.id, { roleKey, applied: true, autoApproved: appr.rows.length > 0 });
    res.json({ ok: true, autoApproved: appr.rows.length > 0 });
  });

  app.delete('/admin/users/:id/roles/:roleKey', authorize('rbac:manage'), async (req, res) => {
    const out = await tx(async (client) => {
      if (['manager', 'admin'].includes(req.params.roleKey)) {
        const n = await countActiveManagers(client);
        // não deixa o último gestor ativo se auto-trancar fora (anti-lockout)
        if (n <= 1) return { status: 409, body: { error: 'não é possível remover o último gestor ativo' } };
      }
      await client.query(
        `DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE key = $2)`,
        [req.params.id, req.params.roleKey],
      );
      await bumpRbacVersion(client);
      return { status: 200, body: { ok: true } };
    });
    if (out.status !== 200) return res.status(out.status).json(out.body);
    invalidateRbacCache();
    await audit(req, 'rbac.role.revoked', req.params.id, { roleKey: req.params.roleKey });
    res.json(out.body);
  });

  app.patch('/admin/users/:id', authorize('users:manage'), async (req, res) => {
    const { isActive, approvalStatus } = req.body || {};
    const out = await tx(async (client) => {
      if (isActive === false) {
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = $1 AND r.key IN ('manager','admin')`, [req.params.id]);
        if (rows[0].n > 0 && (await countActiveManagers(client)) <= 1) {
          return { status: 409, body: { error: 'não é possível desativar o último gestor ativo' } };
        }
      }
      const sets = [];
      const params = [req.params.id];
      if (typeof isActive === 'boolean') { params.push(isActive); sets.push(`is_active = $${params.length}`); }
      if (approvalStatus && ['pending_approval', 'active', 'rejected'].includes(approvalStatus)) {
        params.push(approvalStatus); sets.push(`approval_status = $${params.length}`);
      }
      if (!sets.length) return { status: 400, body: { error: 'nada para atualizar' } };
      const { rowCount } = await client.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      if (!rowCount) return { status: 404, body: { error: 'usuário não encontrado' } };
      await bumpRbacVersion(client);
      return { status: 200, body: { ok: true } };
    });
    if (out.status !== 200) return res.status(out.status).json(out.body);
    invalidateRbacCache();
    await audit(req, 'rbac.user.updated', req.params.id, { isActive, approvalStatus });
    res.json(out.body);
  });
}
