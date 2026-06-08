import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';

export const userRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /users/search — search users in an organization ──────────────────────
  app.get('/search', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        q: z.string().min(1).max(100),
        organizationId: z.string().uuid(),
      })
      .safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'q and organizationId required' } });

    const requesterId = request.user.sub;
    const { q, organizationId } = query.data;

    // Requester must be a member of the org
    const isMember = await db.membership.findFirst({
      where: { userId: requesterId, organizationId, deletedAt: null },
    });
    if (!isMember)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // Find users who are members of this org, matching the search query
    const memberships = await db.membership.findMany({
      where: {
        organizationId,
        deletedAt: null,
        user: {
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      distinct: ['userId'],
      select: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      take: 20,
    });

    const users = memberships.map((m) => m.user);
    return reply.send({ data: users });
  });
};
