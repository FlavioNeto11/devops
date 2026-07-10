// Autenticacao (Fase 0): login local (bootstrap/fallback) + SSO Keycloak realm
// dedicado `besc` (client publico PKCE; backend valida o access_token no /userinfo
// e emite a sessao PROPRIA do app — padrao SICAT via @flavioneto11/oidc-kit).
// Auto-provisionamento restrito: 1o login SSO desconhecido vira `investor` e NADA
// mais; papeis qualificados so por convite/concessao do Gestor (auditado).
import { randomUUID, createHash } from 'node:crypto';
import {
  createAccessToken, createRefreshToken, hashTokenSha256,
  hashPassword, verifyPassword, validateKeycloakToken, claimsToProfile,
} from '@flavioneto11/oidc-kit';
import { config } from '../config.js';
import { query, tx, isDbReady } from '../db.js';
import { appendAudit } from './audit.js';
import { authorize, resolveUser, publicUser, invalidateRbacCache, bumpRbacVersion } from './rbac.js';

const now = () => new Date();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function issuePair(userId, userAgent) {
  const accessToken = createAccessToken({ sub: userId }, {
    secret: config.sessionSecret, ttlSeconds: config.accessTokenTtlSeconds, prefix: 'besc_access',
  });
  const refreshToken = createRefreshToken({ prefix: 'besc_refresh' });
  const expires = new Date(Date.now() + config.refreshTokenTtlDays * 86400_000);
  await query(
    `INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, expires_at) VALUES ($1,$2,$3,$4)`,
    [userId, hashTokenSha256(refreshToken), (userAgent || '').slice(0, 300), expires],
  );
  return { accessToken, refreshToken };
}

async function grantRole(userId, roleKey, grantedBy = null, client = null) {
  const q = client ? client.query.bind(client) : query;
  await q(
    `INSERT INTO user_roles (user_id, role_id, granted_by)
     SELECT $1, id, $3 FROM roles WHERE key = $2
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleKey, grantedBy],
  );
}

// Conta bootstrap do operador (manager+admin) — so cria se ainda nao existir.
export async function ensureBootstrapUser() {
  if (!config.bootstrapEmail || !config.bootstrapPassword) return;
  const { rows } = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [config.bootstrapEmail]);
  if (rows.length) return;
  const { rows: created } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Operador', $2) RETURNING id`,
    [config.bootstrapEmail, hashPassword(config.bootstrapPassword)],
  );
  await grantRole(created[0].id, 'manager');
  await grantRole(created[0].id, 'admin');
  console.log(`[auth] usuário bootstrap criado: ${config.bootstrapEmail} (manager+admin)`);
}

const dbGuard = (req, res) => {
  if (!isDbReady()) { res.status(503).json({ error: 'autenticação indisponível no momento; tente novamente' }); return false; }
  return true;
};

// Rate limit simples em memoria p/ endpoints de credencial (alem do rateLimit do Traefik).
const attempts = new Map(); // ip -> { count, resetAt }
function throttle(req, res) {
  const key = req.ip || 'unknown';
  const nowMs = Date.now();
  const slot = attempts.get(key);
  if (!slot || nowMs > slot.resetAt) { attempts.set(key, { count: 1, resetAt: nowMs + 60_000 }); return true; }
  if (slot.count >= 20) { res.status(429).json({ error: 'muitas tentativas; aguarde um minuto' }); return false; }
  slot.count += 1;
  return true;
}

export function installAuthRoutes(app) {
  app.get('/auth/config', (req, res) => {
    const issuer = config.keycloakIssuerPublic;
    res.json({
      ssoEnabled: !!issuer,
      authUrl: issuer ? `${issuer}/protocol/openid-connect/auth` : null,
      tokenUrl: issuer ? `${issuer}/protocol/openid-connect/token` : null,
      clientId: config.keycloakClientId,
    });
  });

  app.post('/auth/login', async (req, res) => {
    if (!dbGuard(req, res) || !throttle(req, res)) return;
    const { email, password } = req.body || {};
    const deny = async (reason) => {
      await appendAudit({ ip: req.ip, eventType: 'auth.login.denied', entityType: 'user', entityId: email || 'desconhecido', payload: { reason } });
      res.status(401).json({ error: 'e-mail ou senha inválidos' });
    };
    if (!email || !password) return deny('missing_credentials');
    const { rows } = await query('SELECT id, password_hash, is_active FROM users WHERE lower(email) = lower($1)', [email]);
    const u = rows[0];
    if (!u || !u.password_hash || !verifyPassword(password, u.password_hash)) return deny('bad_credentials');
    if (!u.is_active) return deny('inactive');
    const pair = await issuePair(u.id, req.get('user-agent'));
    const entry = await resolveUser(u.id);
    await appendAudit({ actorUserId: u.id, actorRole: entry.roles[0] || 'user', ip: req.ip, eventType: 'auth.login.succeeded', entityType: 'user', entityId: u.id, payload: { method: 'local' } });
    res.json({ ...pair, user: publicUser(entry) });
  });

  app.post('/auth/sso/exchange', async (req, res) => {
    if (!dbGuard(req, res) || !throttle(req, res)) return;
    const { accessToken } = req.body || {};
    if (!config.keycloakUserinfoUrl) return res.status(503).json({ error: 'SSO não configurado' });
    const v = await validateKeycloakToken(accessToken, { userinfoUrl: config.keycloakUserinfoUrl });
    if (!v.ok) {
      const status = v.code === 'KEYCLOAK_UNAVAILABLE' ? 502 : 401;
      await appendAudit({ ip: req.ip, eventType: 'auth.sso.denied', entityType: 'user', entityId: 'sso', payload: { code: v.code } });
      return res.status(status).json({ error: status === 502 ? 'Keycloak indisponível' : 'token SSO inválido' });
    }
    const claims = v.claims;
    const profile = claimsToProfile(claims);
    if (!claims.sub || !profile.email) return res.status(401).json({ error: 'token SSO sem identidade' });

    let userId;
    let created = false;
    const bySub = await query('SELECT id, is_active FROM users WHERE keycloak_sub = $1', [claims.sub]);
    if (bySub.rows.length) {
      userId = bySub.rows[0].id;
      if (!bySub.rows[0].is_active) return res.status(403).json({ error: 'conta desativada' });
    } else {
      const byEmail = await query('SELECT id, is_active FROM users WHERE lower(email) = lower($1)', [profile.email]);
      if (byEmail.rows.length) {
        userId = byEmail.rows[0].id;
        if (!byEmail.rows[0].is_active) return res.status(403).json({ error: 'conta desativada' });
        await query('UPDATE users SET keycloak_sub = $2, updated_at = now() WHERE id = $1', [userId, claims.sub]);
      } else {
        // auto-provisionamento RESTRITO: nasce investor pendente de aprovação, nada mais
        const ins = await query(
          `INSERT INTO users (email, name, keycloak_sub, approval_status) VALUES ($1,$2,$3,'pending_approval') RETURNING id`,
          [profile.email, profile.name || profile.email, claims.sub],
        );
        userId = ins.rows[0].id;
        await grantRole(userId, 'investor');
        created = true;
      }
    }
    const pair = await issuePair(userId, req.get('user-agent'));
    const entry = await resolveUser(userId);
    await appendAudit({ actorUserId: userId, actorRole: entry.roles[0] || 'investor', ip: req.ip, eventType: 'auth.sso.succeeded', entityType: 'user', entityId: userId, payload: { created } });
    res.json({ ...pair, user: publicUser(entry) });
  });

  app.post('/auth/refresh', async (req, res) => {
    if (!dbGuard(req, res) || !throttle(req, res)) return;
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(401).json({ error: 'refresh token ausente' });
    const h = hashTokenSha256(refreshToken);
    const { rows } = await query(
      `SELECT id, user_id FROM user_sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [h],
    );
    if (!rows.length) return res.status(401).json({ error: 'sessão expirada; entre novamente' });
    const session = rows[0];
    await query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1', [session.id]); // rotação
    const pair = await issuePair(session.user_id, req.get('user-agent'));
    const entry = await resolveUser(session.user_id);
    if (!entry || !entry.user.isActive) return res.status(401).json({ error: 'conta desativada' });
    await appendAudit({ actorUserId: session.user_id, actorRole: entry.roles[0] || 'user', ip: req.ip, eventType: 'auth.session.refreshed', entityType: 'user', entityId: session.user_id, payload: {} });
    res.json({ ...pair, user: publicUser(entry) });
  });

  app.post('/auth/logout', async (req, res) => {
    if (!dbGuard(req, res)) return;
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      const { rows } = await query(
        `UPDATE user_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL RETURNING user_id`,
        [hashTokenSha256(refreshToken)],
      );
      if (rows.length) {
        await appendAudit({ actorUserId: rows[0].user_id, actorRole: 'user', ip: req.ip, eventType: 'auth.session.revoked', entityType: 'user', entityId: rows[0].user_id, payload: { via: 'logout' } });
      }
    }
    res.json({ ok: true });
  });

  app.get('/auth/me', (req, res) => {
    if (req.authUnavailable) return res.status(503).json({ error: 'autenticação indisponível no momento' });
    if (!req.auth) return res.status(401).json({ error: 'não autenticado' });
    res.json({ user: publicUser(req.auth) });
  });

  // Convites p/ papeis qualificados (lawyer/judge/manager) — só quem tem rbac:invite.
  app.post('/auth/invitations', authorize('rbac:invite'), async (req, res) => {
    const { email, roleKey } = req.body || {};
    if (!email || !roleKey) return res.status(400).json({ error: 'email e roleKey são obrigatórios' });
    if (roleKey === 'admin') return res.status(403).json({ error: 'convite para admin não é permitido' });
    const { rows: roleRows } = await query('SELECT id FROM roles WHERE key = $1', [roleKey]);
    if (!roleRows.length) return res.status(404).json({ error: 'papel não encontrado' });
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    await query(
      `INSERT INTO invitations (email, role_id, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
      [email, roleRows[0].id, sha256(token), req.auth.user.id],
    );
    await appendAudit({ actorUserId: req.auth.user.id, actorRole: req.auth.roles[0], ip: req.ip, eventType: 'auth.invitation.created', entityType: 'user', entityId: email, payload: { roleKey } });
    // token exibido UMA vez (o Gestor repassa por canal proprio; sem SMTP na plataforma)
    res.status(201).json({ ok: true, token, expiresInDays: 7 });
  });

  app.post('/auth/invitations/:token/accept', async (req, res) => {
    if (!dbGuard(req, res) || !throttle(req, res)) return;
    const { name, password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'senha obrigatória (mínimo 8 caracteres)' });
    const h = sha256(req.params.token || '');
    const out = await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT i.id, i.email, i.role_id, r.key AS role_key FROM invitations i JOIN roles r ON r.id = i.role_id
         WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now() FOR UPDATE`,
        [h],
      );
      if (!rows.length) return null;
      const inv = rows[0];
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [inv.email]);
      let userId;
      if (existing.rows.length) {
        userId = existing.rows[0].id;
        await client.query('UPDATE users SET password_hash = COALESCE(password_hash, $2), updated_at = now() WHERE id = $1', [userId, hashPassword(password)]);
      } else {
        const ins = await client.query(
          `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
          [inv.email, name || inv.email, hashPassword(password)],
        );
        userId = ins.rows[0].id;
      }
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, inv.role_id, inv.invited_by],
      );
      await client.query('UPDATE invitations SET accepted_at = now(), accepted_user_id = $2 WHERE id = $1', [inv.id, userId]);
      await bumpRbacVersion(client);
      return { userId, email: inv.email, roleKey: inv.role_key };
    });
    if (!out) return res.status(404).json({ error: 'convite inválido ou expirado' });
    invalidateRbacCache();
    await appendAudit({ actorUserId: out.userId, actorRole: out.roleKey, ip: req.ip, eventType: 'auth.invitation.accepted', entityType: 'user', entityId: out.userId, payload: { roleKey: out.roleKey } });
    res.json({ ok: true, email: out.email, roleKey: out.roleKey });
  });
}
