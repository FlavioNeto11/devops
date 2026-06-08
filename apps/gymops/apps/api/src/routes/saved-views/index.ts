import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';

export const savedViewRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /saved-views ─────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query);
    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId required' } });

    const userId = request.user.sub;
    const views = await db.savedView.findMany({
      where: { organizationId: query.data.organizationId, userId },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ data: views });
  });

  // ── POST /saved-views ─────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(100),
      filtersJson: z.record(z.unknown()),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const userId = request.user.sub;
    const view = await db.savedView.create({
      data: {
        organizationId: body.data.organizationId,
        userId,
        name: body.data.name,
        filtersJson: body.data.filtersJson as object,
      },
    });

    return reply.status(201).send({ data: view });
  });

  // ── DELETE /saved-views/:id ───────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const view = await db.savedView.findUnique({ where: { id } });
    if (!view || view.userId !== userId)
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'View not found' } });

    await db.savedView.delete({ where: { id } });
    return reply.status(204).send();
  });
};
