import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';

export const auditLogRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /audit-logs ───────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      action: z.string().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId required' } });

    const userId = request.user.sub;
    const { organizationId, action, dateFrom, dateTo, page } = query.data;

    const isOwner = await hasOrgRole(userId, organizationId, ['owner']);
    if (!isOwner) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only owners can view audit logs' } });

    const LIMIT = 50;
    const skip = (page - 1) * LIMIT;

    const where = {
      organizationId,
      ...(action ? { action } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo) } : {}),
        },
      } : {}),
    };

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: LIMIT,
      }),
      db.auditLog.count({ where }),
    ]);

    return reply.send({ data: logs, meta: { total, page, limit: LIMIT, pages: Math.ceil(total / LIMIT) } });
  });
};
