import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './prisma.js';

/**
 * preHandler: exige que o usuário autenticado seja super-admin da PLATAFORMA.
 * Reconsulta o banco (fonte da verdade) — não confia em claim do JWT, para que
 * revogar `isPlatformAdmin` tenha efeito imediato. Use sempre após `app.authenticate`.
 */
export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const u = await db.user.findUnique({
    where: { id: request.user.sub },
    select: { isPlatformAdmin: true, deletedAt: true },
  });
  if (!u || u.deletedAt || !u.isPlatformAdmin) {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Acesso restrito ao administrador da plataforma' },
    });
  }
}
