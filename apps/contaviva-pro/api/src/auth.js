// auth.js — fundação de autenticação própria (bloco contas-acesso). Gerado pela Forge (gymops-style).
// Hash de senha: bcryptjs (puro JS). Tokens: jsonwebtoken. Refresh: guardado como hash sha256.
// SSO Keycloak ADITIVO e OPCIONAL: só ativa se OIDC_ISSUER estiver setado; nunca quebra o boot.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { pool } from './db.js';

// JWT_SECRET é FAIL-CLOSED em produção: sem ele NÃO emite/valida token (não cai num literal
// previsível). Resolvido SOB DEMANDA (lazy) — não no topo do módulo — para que processos que
// importam auth.js transitivamente (ex.: o worker via db.js -> hashPassword) mas NUNCA assinam/
// verificam token não quebrem no boot por falta da chave (eles não precisam dela).
function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET obrigatório em produção');
  return 'dev-secret-change-me';
}
const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const RANK = { admin: 3, manager: 2, member: 1 };

// --- hashing de senha (nunca plaintext, nunca logado) ---
export async function hashPassword(plain) { return bcrypt.hash(String(plain), 10); }
export async function verifyPassword(plain, hash) { if (!hash) return false; try { return await bcrypt.compare(String(plain), hash); } catch { return false; } }

// --- JWT de acesso (curto) ---
export function signAccess(user) { return jwt.sign({ sub: String(user.id), email: user.email, role: user.role, tenantId: user.tenant_id || 1 }, jwtSecret(), { algorithm: 'HS256', expiresIn: ACCESS_TTL }); }
export function verifyAccess(token) { try { return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }); } catch { return null; } }

// --- sessões / refresh (token cru ao cliente; HASH sha256 no banco) ---
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
export async function issueSession(userId) {
  const refresh = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + REFRESH_TTL_MS);
  await pool.query('INSERT INTO sessions(user_id,refresh_hash,expires_at) VALUES ($1,$2,$3)', [userId, sha256(refresh), expires]);
  return refresh;
}
// rotaciona: valida o refresh, revoga o usado e emite um novo (retorna { user, refresh } ou null).
export async function rotateSession(refresh) {
  if (!refresh) return null;
  const { rows } = await pool.query('SELECT s.id, s.user_id, s.expires_at, s.revoked_at FROM sessions s WHERE s.refresh_hash=$1', [sha256(refresh)]);
  const s = rows[0];
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() < Date.now()) return null;
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [s.id]);
  const u = (await pool.query('SELECT id,tenant_id,email,name,role,is_active FROM users WHERE id=$1', [s.user_id])).rows[0];
  if (!u || !u.is_active) return null;
  const next = await issueSession(u.id);
  return { user: u, refresh: next };
}
export async function revokeSession(refresh) { if (!refresh) return; await pool.query('UPDATE sessions SET revoked_at=now() WHERE refresh_hash=$1 AND revoked_at IS NULL', [sha256(refresh)]); }

// --- preHandlers Fastify ---
export async function requireAuth(req, reply) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const claims = verifyAccess(token);
  if (!claims) { reply.code(401).send({ error: { message: 'não autenticado' } }); return reply; }
  req.authUser = { id: Number(claims.sub), email: claims.email, role: claims.role, tenantId: Number(claims.tenantId) || 1 };
}
export function requireRole(role) {
  return async (req, reply) => {
    const r = req.authUser && req.authUser.role;
    if ((RANK[r] || 0) < (RANK[role] || 99)) { reply.code(403).send({ error: { message: 'acesso negado (precisa de ' + role + ')' } }); return reply; }
  };
}

// --- auditoria best-effort (nunca quebra o fluxo) ---
export async function audit(tenantId, actor, action, entity, entityId) {
  try { await pool.query('INSERT INTO audit_logs(tenant_id,actor,action,entity,entity_id) VALUES ($1,$2,$3,$4,$5)', [tenantId || 1, actor || null, action, entity || null, entityId != null ? String(entityId) : null]); } catch {}
}

// --- helpers de usuário ---
export function publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role }; }
export async function findUserByEmail(email) { return (await pool.query('SELECT * FROM users WHERE email=$1', [String(email || '').toLowerCase()])).rows[0] || null; }

// --- SSO Keycloak ADITIVO/OPCIONAL ---
export function ssoConfig() {
  const issuer = process.env.OIDC_ISSUER || '';
  return { enabled: !!issuer, issuer: issuer || undefined, clientId: process.env.OIDC_CLIENT_ID || undefined };
}
// valida o accessToken do IdP no endpoint userinfo do issuer; retorna o perfil (email/name) ou null.
export async function ssoUserinfo(accessToken) {
  const issuer = process.env.OIDC_ISSUER || '';
  if (!issuer || !accessToken) return null;
  const url = issuer.replace(/\/$/, '') + '/protocol/openid-connect/userinfo';
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    // exige email VERIFICADO como chave de identidade — NUNCA preferred_username (spoofável).
    if (!j.email || j.email_verified !== true) return null;
    return { email: String(j.email).toLowerCase(), name: j.name || j.preferred_username || j.email };
  } catch { return null; }
}
// upsert (provisioning) do usuário SSO por email; 1o login => role member.
export async function ssoUpsertUser(profile) {
  const existing = await findUserByEmail(profile.email);
  if (existing) { if (!existing.is_active) return null; return existing; }
  return (await pool.query('INSERT INTO users(tenant_id,email,name,role) VALUES (1,$1,$2,$3) RETURNING *', [profile.email, profile.name, 'member'])).rows[0];
}
