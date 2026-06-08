import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { resolveActivityPermission } from '../../lib/rbac.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const commentRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /activities/:id/comments ─────────────────────────────────────────────
  app.get('/activities/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const query = z.object({
      after: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).safeParse(request.query);
    if (!query.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const comments = await db.activityComment.findMany({
      where: {
        activityId,
        deletedAt: null,
        ...(query.data.after && { id: { lt: query.data.after } }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.data.limit + 1,
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const hasMore = comments.length > query.data.limit;
    const page = hasMore ? comments.slice(0, query.data.limit) : comments;

    return reply.send({ data: page, meta: { nextCursor: hasMore ? page[page.length - 1]?.id : undefined } });
  });

  // ── POST /activities/:id/comments ────────────────────────────────────────────
  app.post('/activities/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const body = z.object({ body: z.string().min(1).max(10000) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const comment = await db.activityComment.create({
      data: { activityId, userId, body: body.data.body },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await db.activityEvent.create({
      data: { activityId, actorId: userId, eventType: 'commented', payload: { commentId: comment.id } },
    });

    return reply.status(201).send({ data: comment });
  });

  // ── PATCH /comments/:id ──────────────────────────────────────────────────────
  app.patch('/comments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const comment = await db.activityComment.findUnique({ where: { id, deletedAt: null } });
    if (!comment) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
    if (comment.userId !== userId) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Can only edit your own comments' } });

    const age = Date.now() - comment.createdAt.getTime();
    if (age > EDIT_WINDOW_MS) {
      return reply.status(403).send({ error: { code: 'EDIT_WINDOW_EXPIRED', message: 'Comments can only be edited within 15 minutes of posting' } });
    }

    const body = z.object({ body: z.string().min(1).max(10000) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const updated = await db.activityComment.update({
      where: { id },
      data: { body: body.data.body, editedAt: new Date() },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return reply.send({ data: updated });
  });

  // ── DELETE /comments/:id ─────────────────────────────────────────────────────
  app.delete('/comments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const comment = await db.activityComment.findUnique({ where: { id, deletedAt: null } });
    if (!comment) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });

    // Author or org manager can delete
    const canView = await resolveActivityPermission({ userId, activityId: comment.activityId, action: 'edit' });
    if (comment.userId !== userId && !canView) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    await db.activityComment.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
};
