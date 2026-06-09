// =============================================================================
// Cliente mínimo da Keycloak Admin REST API (client_credentials) para gerir os
// usuários restritos (criar, pôr no grupo project-members, senha temporária,
// habilitar/desabilitar). Usado SOMENTE pelas rotas admin do pm-api.
//
// Degrada graciosamente: sem KC_SVC_CLIENT_ID/SECRET, isConfigured()=false e os
// chamadores pulam o Keycloak (a gestão de ACESSO por e-mail continua funcionando;
// só a CRIAÇÃO de usuário pelo console fica indisponível). A chave do client vem de
// Secret (Sealed Secret) — NUNCA em plaintext no git.
// =============================================================================
import { randomBytes } from 'node:crypto';

const BASE = (process.env.KEYCLOAK_BASE || 'http://keycloak.identity.svc.cluster.local:8080/auth').replace(/\/+$/, '');
const REALM = process.env.KC_REALM || 'nvit';
const CLIENT_ID = process.env.KC_SVC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.KC_SVC_CLIENT_SECRET || '';
const MEMBER_GROUP = process.env.PM_MEMBER_GROUP || 'project-members';

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

async function adminToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`${BASE}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Keycloak token falhou (${res.status})`);
  return (await res.json()).access_token;
}

async function kcFetch(path, { method = 'GET', token, body } = {}) {
  return fetch(`${BASE}/admin/realms/${REALM}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function findUserByEmail(token, email) {
  const res = await kcFetch(`/users?email=${encodeURIComponent(email)}&exact=true`, { token });
  if (!res.ok) return null;
  const arr = await res.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function memberGroupId(token) {
  const res = await kcFetch(`/groups?search=${encodeURIComponent(MEMBER_GROUP)}`, { token });
  if (!res.ok) return null;
  const arr = await res.json();
  const found = (Array.isArray(arr) ? arr : []).find((g) => g.name === MEMBER_GROUP);
  return found?.id || null;
}

function genTempPassword() {
  // Senha temporária forte (o usuário troca no 1º login — temporary:true).
  return `Pm-${randomBytes(12).toString('base64url')}!`;
}

/**
 * Garante um usuário no realm dentro do grupo project-members, com senha temporária.
 * Idempotente: se o usuário já existe, apenas garante grupo + reseta a senha temporária.
 * @returns {{ userId: string, tempPassword: string }}
 */
export async function ensureMemberUser({ email, name }) {
  const token = await adminToken();
  let user = await findUserByEmail(token, email);
  if (!user) {
    const createRes = await kcFetch('/users', {
      method: 'POST',
      token,
      body: { email, username: email, enabled: true, emailVerified: true, firstName: name || email },
    });
    if (!createRes.ok && createRes.status !== 409) {
      throw new Error(`Keycloak: criar usuário falhou (${createRes.status})`);
    }
    user = await findUserByEmail(token, email);
  }
  const userId = user?.id;
  if (!userId) throw new Error('Keycloak: usuário não resolvido após criação');

  const gid = await memberGroupId(token);
  if (gid) await kcFetch(`/users/${userId}/groups/${gid}`, { method: 'PUT', token });

  const tempPassword = genTempPassword();
  const pwdRes = await kcFetch(`/users/${userId}/reset-password`, {
    method: 'PUT',
    token,
    body: { type: 'password', value: tempPassword, temporary: true },
  });
  if (!pwdRes.ok) throw new Error(`Keycloak: definir senha falhou (${pwdRes.status})`);

  return { userId, tempPassword };
}

export async function setEnabled(userId, enabled) {
  const token = await adminToken();
  await kcFetch(`/users/${userId}`, { method: 'PUT', token, body: { enabled: !!enabled } });
}

export async function removeFromMemberGroup(userId) {
  const token = await adminToken();
  const gid = await memberGroupId(token);
  if (gid) await kcFetch(`/users/${userId}/groups/${gid}`, { method: 'DELETE', token });
}
