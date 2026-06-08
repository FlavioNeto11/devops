import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@gymops/db';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { resolveActivityPermission } from '../../lib/rbac.js';

export const checklistRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /activities/:id/checklists ──────────────────────────────────────────
  app.post('/activities/:id/checklists', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      title: z.string().min(1).max(200),
      items: z.array(z.object({ text: z.string().min(1), order: z.number().int().default(0) })).default([]),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const maxOrder = await db.activityChecklist.findFirst({
      where: { activityId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const checklist = await db.activityChecklist.create({
      data: {
        activityId,
        title: body.data.title,
        order: (maxOrder?.order ?? -1) + 1,
        items: {
          createMany: {
            data: body.data.items.map((item, idx) => ({ text: item.text, order: item.order || idx })),
          },
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    return reply.status(201).send({ data: checklist });
  });

  // ── PATCH /checklists/:id ────────────────────────────────────────────────────
  app.patch('/checklists/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const checklist = await db.activityChecklist.findUnique({ where: { id } });
    if (!checklist) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Checklist not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({ title: z.string().min(1).max(200) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const updated = await db.activityChecklist.update({ where: { id }, data: body.data, include: { items: true } });
    return reply.send({ data: updated });
  });

  // ── DELETE /checklists/:id ───────────────────────────────────────────────────
  app.delete('/checklists/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const checklist = await db.activityChecklist.findUnique({ where: { id } });
    if (!checklist) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Checklist not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.activityChecklistItem.deleteMany({ where: { checklistId: id } });
    await db.activityChecklist.delete({ where: { id } });

    return reply.status(204).send();
  });

  // ── POST /checklists/:id/items ───────────────────────────────────────────────
  app.post('/checklists/:id/items', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: checklistId } = request.params as { id: string };
    const userId = request.user.sub;

    const checklist = await db.activityChecklist.findUnique({ where: { id: checklistId } });
    if (!checklist) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Checklist not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      text: z.string().min(1).max(500),
      order: z.number().int().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const maxOrder = await db.activityChecklistItem.findFirst({
      where: { checklistId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const item = await db.activityChecklistItem.create({
      data: { checklistId, text: body.data.text, order: body.data.order ?? (maxOrder?.order ?? -1) + 1 },
    });

    return reply.status(201).send({ data: item });
  });

  // ── PATCH /checklist-items/:id ───────────────────────────────────────────────
  app.patch('/checklist-items/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const item = await db.activityChecklistItem.findUnique({
      where: { id },
      include: { checklist: true },
    });
    if (!item) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Item not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: item.checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      done: z.boolean().optional(),
      text: z.string().min(1).max(500).optional(),
      order: z.number().int().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const now = new Date();
    const updated = await db.activityChecklistItem.update({
      where: { id },
      data: {
        ...body.data,
        ...(body.data.done === true && !item.done && { doneBy: userId, doneAt: now }),
        ...(body.data.done === false && item.done && { doneBy: null, doneAt: null }),
      },
    });

    // Emit event when checked
    if (body.data.done === true && !item.done) {
      await db.activityEvent.create({
        data: {
          activityId: item.checklist.activityId,
          actorId: userId,
          eventType: 'checklist_checked',
          payload: { itemId: id, text: item.text } as Prisma.InputJsonValue,
        },
      });
    }

    return reply.send({ data: updated });
  });

  // ── DELETE /checklist-items/:id ──────────────────────────────────────────────
  app.delete('/checklist-items/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const item = await db.activityChecklistItem.findUnique({
      where: { id },
      include: { checklist: true },
    });
    if (!item) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Item not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: item.checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.activityChecklistItem.delete({ where: { id } });
    return reply.status(204).send();
  });
};
