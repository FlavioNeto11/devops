// Servico de autenticacao: registro (bootstrap org+admin), login local e login via Keycloak
// (SSO realm nvit, fail-soft). Access token stateless (oidc-kit). Multi-tenant por Membership.
import { validateKeycloakToken, claimsToProfile } from '@flavioneto11/oidc-kit';
import { prisma } from '../../lib/prisma';
import { env } from '../../env';
import { hashPassword, verifyPassword, issueToken, resolvePrincipal, type Principal } from '../../lib/auth';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

export interface AuthResult {
  token: string;
  principal: Principal;
  organization: { id: string; name: string; slug: string };
}

async function buildResult(principal: Principal): Promise<AuthResult> {
  const org = await prisma.organization.findUnique({ where: { id: principal.organizationId } });
  return {
    token: issueToken(principal),
    principal,
    organization: { id: org!.id, name: org!.name, slug: org!.slug },
  };
}

/** Bootstrap: cria Organization + User(admin) + Membership. */
export async function registerOrg(input: {
  orgName: string;
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error('e-mail ja cadastrado'), { statusCode: 409 });

  const slug = await uniqueSlug(input.orgName);
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: input.orgName, slug } });
    const user = await tx.user.create({
      data: { email, name: input.name, passwordHash: hashPassword(input.password) },
    });
    await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'admin' } });
    return { org, user };
  });

  return buildResult({
    userId: result.user.id,
    email: result.user.email,
    name: result.user.name,
    organizationId: result.org.id,
    role: 'admin',
  });
}

/** Login local (email + senha). */
export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
    throw Object.assign(new Error('credenciais invalidas'), { statusCode: 401 });
  }
  if (!user.active) throw Object.assign(new Error('usuario inativo'), { statusCode: 403 });
  const principal = await resolvePrincipal(user.id);
  if (!principal) throw Object.assign(new Error('usuario sem organizacao'), { statusCode: 403 });
  return buildResult(principal);
}

/** Login via Keycloak: valida o access token no /userinfo e emite a sessao do app.
 *  Self-serve: se o usuario SSO ainda nao tem org, cria uma org pessoal (admin). */
export async function keycloakLogin(input: { token: string }): Promise<AuthResult> {
  if (!env.hasKeycloak) {
    throw Object.assign(new Error('SSO nao configurado'), { statusCode: 503, code: 'SSO_NOT_CONFIGURED' });
  }
  const validated = await validateKeycloakToken(input.token, { userinfoUrl: env.KEYCLOAK_USERINFO_URL });
  if (!validated.ok) {
    throw Object.assign(new Error('token Keycloak invalido'), { statusCode: 401, code: validated.code });
  }
  const claims = validated.claims;
  const profile = claimsToProfile(claims);
  const sub = String(claims.sub || '');
  const email = (profile.email || '').toLowerCase();

  let user =
    (sub && (await prisma.user.findUnique({ where: { keycloakSub: sub } }))) ||
    (email && (await prisma.user.findUnique({ where: { email } }))) ||
    null;

  if (!user) {
    user = await prisma.user.create({
      data: { email: email || `${sub}@keycloak.local`, name: profile.name || email || 'Usuario', keycloakSub: sub || null },
    });
  } else if (sub && !user.keycloakSub) {
    user = await prisma.user.update({ where: { id: user.id }, data: { keycloakSub: sub } });
  }

  let principal = await resolvePrincipal(user.id);
  if (!principal) {
    // self-serve: cria org pessoal
    const slug = await uniqueSlug(profile.name || email || 'imobiliaria');
    const org = await prisma.organization.create({ data: { name: profile.name || 'Minha Imobiliaria', slug } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'admin' } });
    principal = { userId: user.id, email: user.email, name: user.name, organizationId: org.id, role: 'admin' };
  }
  return buildResult(principal);
}

/** Dados do usuario logado + org. */
export async function me(principal: Principal) {
  const [user, org, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: principal.userId } }),
    prisma.organization.findUnique({ where: { id: principal.organizationId } }),
    prisma.membership.findMany({ where: { userId: principal.userId, active: true }, include: { organization: true } }),
  ]);
  return {
    user: user ? { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } : null,
    organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    role: principal.role,
    organizations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })),
  };
}
