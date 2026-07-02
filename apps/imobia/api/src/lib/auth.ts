// Auth do imobia sobre @flavioneto11/oidc-kit: access token stateless (JWT proprio) + login
// local (hash de senha) + validacao de token Keycloak (SSO realm nvit). RBAC por Membership.
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createAccessToken,
  verifyAccessToken,
  hashPassword,
  verifyPassword,
} from '@flavioneto11/oidc-kit';
import { env } from '../env';
import { prisma } from './prisma';
import type { MembershipRole } from '@prisma/client';

const PREFIX = 'imobia_access';

export interface Principal {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: MembershipRole;
}

export function issueToken(p: Principal): string {
  return createAccessToken(
    { sub: p.userId, email: p.email, name: p.name, orgId: p.organizationId, role: p.role },
    { secret: env.JWT_SECRET, ttlSeconds: env.ACCESS_TTL_SECONDS, prefix: PREFIX },
  );
}

export { hashPassword, verifyPassword };

/** Fastify preHandler: exige Bearer valido e injeta request.principal. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    reply.code(401).send({ error: 'unauthorized', message: 'token ausente' });
    return;
  }
  const result = verifyAccessToken(token, { secret: env.JWT_SECRET, prefix: PREFIX });
  if (!result.valid) {
    reply.code(401).send({ error: 'unauthorized', message: result.reason });
    return;
  }
  const p = result.payload;
  (req as any).principal = {
    userId: p.sub,
    email: p.email,
    name: p.name,
    organizationId: (p as any).orgId,
    role: (p as any).role,
  } as Principal;
}

/** Guard de papel — usar apos requireAuth. */
export function requireRole(...roles: MembershipRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const principal = (req as any).principal as Principal | undefined;
    if (!principal || (roles.length > 0 && !roles.includes(principal.role))) {
      reply.code(403).send({ error: 'forbidden', message: 'papel insuficiente' });
    }
  };
}

/** Resolve a membership ativa de um usuario (org + papel). Escolhe a 1a org por ora. */
export async function resolvePrincipal(userId: string): Promise<Principal | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, active: true },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) return null;
  return {
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
