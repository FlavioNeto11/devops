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

    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      // Desabilitar (soft): checklist sai do progresso e fica somente leitura.
      disabled: z.boolean().optional(),
    }).refine((value) => value.title !== undefined || value.disabled !== undefined, {
      message: 'Nothing to update',
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const updated = await db.activityChecklist.update({
      where: { id },
      data: {
        ...(body.data.title !== undefined && { title: body.data.title }),
        ...(body.data.disabled === true && !checklist.disabledAt && { disabledAt: new Date() }),
        ...(body.data.disabled === false && checklist.disabledAt && { disabledAt: null }),
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (body.data.disabled === true && !checklist.disabledAt) {
      await db.activityEvent.create({
        data: {
          activityId: checklist.activityId,
          actorId: userId,
          eventType: 'checklist_disabled',
          payload: { checklistId: id, title: checklist.title } as Prisma.InputJsonValue,
        },
      });
    } else if (body.data.disabled === false && checklist.disabledAt) {
      await db.activityEvent.create({
        data: {
          activityId: checklist.activityId,
          actorId: userId,
          eventType: 'checklist_enabled',
          payload: { checklistId: id, title: checklist.title } as Prisma.InputJsonValue,
        },
      });
    }

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

    await db.activityEvent.create({
      data: {
        activityId: checklist.activityId,
        actorId: userId,
        eventType: 'checklist_removed',
        payload: { checklistId: id, title: checklist.title } as Prisma.InputJsonValue,
      },
    });

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
      // Comentário curto e único do item (null limpa).
      comment: z.string().max(1000).nullable().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const normalizedComment = body.data.comment === undefined
      ? undefined
      : (body.data.comment?.trim() || null);

    const now = new Date();
    const updated = await db.activityChecklistItem.update({
      where: { id },
      data: {
        ...(body.data.done !== undefined && { done: body.data.done }),
        ...(body.data.text !== undefined && { text: body.data.text }),
        ...(body.data.order !== undefined && { order: body.data.order }),
        ...(normalizedComment !== undefined && { comment: normalizedComment }),
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

    // Comentário novo/alterado (não-vazio) vira evento no histórico.
    if (normalizedComment && normalizedComment !== item.comment) {
      await db.activityEvent.create({
        data: {
          activityId: item.checklist.activityId,
          actorId: userId,
          eventType: 'checklist_item_commented',
          payload: { itemId: id, text: item.text, comment: normalizedComment } as Prisma.InputJsonValue,
        },
      });
    }

    return reply.send({ data: updated });
  });

  // ── POST /checklists/:id/apply-revision ─────────────────────────────────────
  // Aplica ATOMICAMENTE uma revisão confirmada pelo usuário (fluxo da IA: o
  // rascunho vem de /ai/checklists/:id/revise; quem decide aplicar é o humano).
  app.post('/checklists/:id/apply-revision', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: checklistId } = request.params as { id: string };
    const userId = request.user.sub;

    const checklist = await db.activityChecklist.findUnique({
      where: { id: checklistId },
      include: { items: { select: { id: true, text: true, order: true } } },
    });
    if (!checklist) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Checklist not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: checklist.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      items: z.array(z.object({
        id: z.string().uuid().nullable().optional(),
        text: z.string().min(1).max(500),
      })).min(1).max(50),
      removeIds: z.array(z.string().uuid()).max(50).default([]),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    // Ids referenciados precisam pertencer a ESTE checklist.
    const knownIds = new Set(checklist.items.map((item) => item.id));
    const referenced = [
      ...body.data.items.flatMap((item) => (item.id ? [item.id] : [])),
      ...body.data.removeIds,
    ];
    if (referenced.some((refId) => !knownIds.has(refId))) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Item does not belong to this checklist' } });
    }

    const textById = new Map(checklist.items.map((item) => [item.id, item.text]));
    const maxOrder = checklist.items.reduce((max, item) => Math.max(max, item.order), -1);

    let added = 0;
    let updatedCount = 0;
    await db.$transaction(async (tx) => {
      if (body.data.removeIds.length) {
        await tx.activityChecklistItem.deleteMany({
          where: { id: { in: body.data.removeIds }, checklistId },
        });
      }
      let nextOrder = maxOrder + 1;
      for (const item of body.data.items) {
        if (item.id) {
          if (textById.get(item.id) !== item.text) {
            await tx.activityChecklistItem.update({ where: { id: item.id }, data: { text: item.text } });
            updatedCount += 1;
          }
        } else {
          await tx.activityChecklistItem.create({
            data: { checklistId, text: item.text, order: nextOrder },
          });
          nextOrder += 1;
          added += 1;
        }
      }
    });

    await db.activityEvent.create({
      data: {
        activityId: checklist.activityId,
        actorId: userId,
        eventType: 'checklist_revised',
        payload: {
          checklistId,
          title: checklist.title,
          added,
          updated: updatedCount,
          removed: body.data.removeIds.length,
        } as Prisma.InputJsonValue,
      },
    });

    const result = await db.activityChecklist.findUnique({
      where: { id: checklistId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    return reply.send({ data: result });
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
