import type { FastifyPluginAsync } from 'fastify';
import type { ActivityStatus, ActivityPriority, RecurrenceFrequency } from '@gymops/db';
import { Prisma } from '@gymops/db';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { resolveActivityPermission, hasOrgRole, hasUnitRole } from '../../lib/rbac.js';
import { enqueueNotification } from '../../lib/queues.js';

const CLOSED: ActivityStatus[] = ['concluido', 'cancelado'];

// Valid status transitions
const VALID_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  novo: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'concluido', 'cancelado'],
  aguardando_aprovacao: ['em_andamento', 'concluido', 'cancelado'],
  concluido: ['em_andamento'],
  cancelado: ['novo'],
};

const createActivitySchema = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  areaId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  dueAt: z.string().datetime().optional(),
  visibilityMode: z.enum(['inherited', 'restricted', 'shared']).default('inherited'),
  metadata: z.record(z.unknown()).default({}),
  assigneeIds: z.array(z.string().uuid()).default([]),
  watcherIds: z.array(z.string().uuid()).default([]),
});

const patchActivitySchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['novo', 'em_andamento', 'aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado']).optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  visibilityMode: z.enum(['inherited', 'restricted', 'shared']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function buildChecklistProgress(checklists: Array<{ items: Array<{ done: boolean }> }>) {
  const allItems = checklists.flatMap((c) => c.items);
  return { total: allItems.length, done: allItems.filter((i) => i.done).length };
}

function calcNextRunAt(
  frequency: RecurrenceFrequency,
  interval: number,
  weekdays: number[] | null,
  baseDueAt: Date | null,
): Date {
  const base = baseDueAt ?? new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'diaria':
      next.setDate(next.getDate() + interval);
      break;
    case 'semanal': {
      if (weekdays && weekdays.length > 0) {
        // Advance by 1 day until we land on a matching weekday
        const sorted = [...weekdays].sort((a, b) => a - b);
        next.setDate(next.getDate() + 1);
        while (!sorted.includes(next.getDay())) next.setDate(next.getDate() + 1);
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;
    }
    case 'mensal':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'intervalo_customizado':
      next.setDate(next.getDate() + interval);
      break;
  }

  return next;
}

async function generateRecurringActivity(sourceActivityId: string, ruleId: string): Promise<void> {
  const source = await db.activity.findUnique({
    where: { id: sourceActivityId },
    include: {
      recurrenceRule: true,
      checklists: { include: { items: { orderBy: { order: 'asc' } } } },
      assignees: true,
    },
  });
  if (!source?.recurrenceRule) return;

  const rule = source.recurrenceRule;
  const nextDueAt = calcNextRunAt(rule.frequency, rule.interval, rule.weekdays as number[] | null, source.dueAt);

  const newActivity = await db.activity.create({
    data: {
      organizationId: source.organizationId,
      unitId: source.unitId,
      areaId: source.areaId,
      templateId: source.templateId,
      title: source.title,
      description: source.description,
      priority: source.priority,
      visibilityMode: source.visibilityMode,
      dueAt: nextDueAt,
      metadata: source.metadata as Prisma.InputJsonValue,
      createdBy: source.createdBy,
      assignees: {
        createMany: {
          data: source.assignees.map((a) => ({ userId: a.userId, kind: a.kind })),
          skipDuplicates: true,
        },
      },
    },
  });

  // Copy checklists (fresh, undone)
  for (const cl of source.checklists) {
    const newCl = await db.activityChecklist.create({
      data: { activityId: newActivity.id, title: cl.title, order: cl.order },
    });
    if (cl.items.length > 0) {
      await db.activityChecklistItem.createMany({
        data: cl.items.map((item) => ({
          checklistId: newCl.id,
          text: item.text,
          order: item.order,
        })),
      });
    }
  }

  // Carry recurrence rule to new activity
  await db.recurrenceRule.create({
    data: {
      activityId: newActivity.id,
      frequency: rule.frequency,
      interval: rule.interval,
      weekdays: rule.weekdays ?? Prisma.JsonNull,
      generationMode: rule.generationMode,
      preGenerateN: rule.preGenerateN,
      nextRunAt: calcNextRunAt(rule.frequency, rule.interval, rule.weekdays as number[] | null, nextDueAt),
    },
  });

  await db.activityEvent.create({
    data: {
      activityId: sourceActivityId,
      eventType: 'recurrence_triggered',
      payload: { newActivityId: newActivity.id, nextDueAt: nextDueAt.toISOString() } as Prisma.InputJsonValue,
    },
  });

  // Also update original rule's nextRunAt
  await db.recurrenceRule.update({
    where: { id: ruleId },
    data: { nextRunAt: nextDueAt },
  });
}

export const activityRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /activities ──────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid().optional(),
      areaId: z.string().uuid().optional(),
      status: z.enum(['novo', 'em_andamento', 'aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado']).optional(),
      priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
      assigneeId: z.string().uuid().optional(),
      overdue: z.enum(['true', 'false']).optional(),
      after: z.string().optional(),
      search: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(request.query);

    if (!query.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' } });
    }

    const userId = request.user.sub;
    const { organizationId, unitId, areaId, status, priority, assigneeId, overdue, after, search, limit } = query.data;
    const searchTerm = search?.trim();
    const now = new Date();

    // Resolve which units/areas this user can see
    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    const filters: Prisma.ActivityWhereInput[] = [
      {
        organizationId,
        deletedAt: null,
        ...(unitId && { unitId }),
        ...(areaId && { areaId }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(assigneeId && { assignees: { some: { userId: assigneeId } } }),
        ...(overdue === 'true' && { dueAt: { lt: now }, status: { notIn: CLOSED } }),
        ...(after && { id: { gt: after } }),
      },
    ];

    if (!isOrgLevel) {
      if (unitId) {
        const canSeeUnit = await hasUnitRole(userId, unitId, organizationId, ['unit_manager', 'area_leader', 'executor', 'viewer']);
        if (!canSeeUnit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'No access to this unit' } });
      } else {
        const unitMemberships = await db.membership.findMany({
          where: { userId, organizationId, scopeType: 'unit', deletedAt: null },
          select: { scopeId: true },
        });
        const areaMemberships = await db.membership.findMany({
          where: { userId, organizationId, scopeType: 'area', deletedAt: null },
          select: { scopeId: true },
        });
        filters.push({
          OR: [
            { unitId: { in: unitMemberships.map((m) => m.scopeId) } },
            { areaId: { in: areaMemberships.map((m) => m.scopeId) } },
            { assignees: { some: { userId } } },
            { createdBy: userId },
          ],
        });
      }
    }

    if (searchTerm) {
      filters.push({
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ActivityWhereInput = filters.length === 1 ? filters[0]! : { AND: filters };

    const [activities, total] = await Promise.all([
      db.activity.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: limit + 1,
        include: {
          unit: { select: { id: true, name: true } },
          area: { select: { id: true, name: true, color: true } },
          assignees: {
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          },
          checklists: { include: { items: { select: { done: true } } } },
        },
      }),
      db.activity.count({ where }),
    ]);

    const hasMore = activities.length > limit;
    const page = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    return reply.send({
      data: page.map((a) => ({
        ...a,
        isOverdue: !!a.dueAt && a.dueAt < now && !CLOSED.includes(a.status),
        checklistProgress: buildChecklistProgress(a.checklists),
        assignees: a.assignees.map((as) => ({
          userId: as.userId,
          name: as.user.name,
          avatarUrl: as.user.avatarUrl,
          kind: as.kind,
        })),
      })),
      meta: { total, nextCursor },
    });
  });

  // ── POST /activities ─────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createActivitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    const userId = request.user.sub;
    const { organizationId, unitId, areaId, assigneeIds, watcherIds, ...rest } = body.data;

    // Validate unit belongs to org
    const unit = await db.unit.findUnique({ where: { id: unitId, organizationId, deletedAt: null } });
    if (!unit) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Unit not found in this organization' } });
    }

    // Caller must be able to create in this unit
    const canCreate = await hasUnitRole(userId, unitId, organizationId, ['unit_manager', 'area_leader', 'executor']);
    if (!canCreate) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions to create activity' } });
    }

    // Resolve template config (apply defaults + SLA)
    let templateConfig: { defaultChecklist?: string[]; defaultPriority?: string; defaultVisibility?: string; suggestedSlaDays?: number } = {};
    if (rest.templateId) {
      const tmpl = await db.activityTemplate.findUnique({ where: { id: rest.templateId, deletedAt: null } });
      if (tmpl) templateConfig = tmpl.config as typeof templateConfig;
    }

    const effectivePriority = (rest.priority ?? templateConfig.defaultPriority ?? 'media') as ActivityPriority;
    const effectiveVisibility = (rest.visibilityMode ?? templateConfig.defaultVisibility ?? 'inherited') as 'inherited' | 'restricted' | 'shared';
    const effectiveDueAt = rest.dueAt
      ? new Date(rest.dueAt)
      : templateConfig.suggestedSlaDays
        ? new Date(Date.now() + templateConfig.suggestedSlaDays * 86_400_000)
        : undefined;

    const activity = await db.activity.create({
      data: {
        organizationId,
        unitId,
        areaId,
        templateId: rest.templateId,
        title: rest.title,
        description: rest.description,
        priority: effectivePriority,
        visibilityMode: effectiveVisibility,
        dueAt: effectiveDueAt,
        metadata: rest.metadata as Prisma.InputJsonValue,
        createdBy: userId,
        assignees: {
          createMany: {
            data: [
              ...assigneeIds.map((uid) => ({ userId: uid, kind: 'responsible' as const })),
              ...watcherIds.map((uid) => ({ userId: uid, kind: 'watcher' as const })),
            ],
            skipDuplicates: true,
          },
        },
      },
      include: {
        unit: { select: { id: true, name: true } },
        area: { select: { id: true, name: true, color: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });

    // Pre-fill checklist from template
    if (templateConfig.defaultChecklist && templateConfig.defaultChecklist.length > 0) {
      const checklist = await db.activityChecklist.create({
        data: { activityId: activity.id, title: 'Checklist padrão', order: 0 },
      });
      await db.activityChecklistItem.createMany({
        data: templateConfig.defaultChecklist.map((text, i) => ({
          checklistId: checklist.id,
          text,
          order: i,
        })),
      });
    }

    // Audit event
    await db.activityEvent.create({
      data: {
        activityId: activity.id,
        actorId: userId,
        eventType: 'created',
        payload: { title: activity.title, priority: activity.priority },
      },
    });

    // Notify assignees
    const creator = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    for (const assignee of activity.assignees) {
      if (assignee.userId === userId) continue;
      void enqueueNotification({
        type: 'activity_assigned',
        activityId: activity.id,
        userId: assignee.userId,
        activityTitle: activity.title,
        assignerName: creator?.name ?? 'Alguém',
      });
    }

    return reply.status(201).send({ data: activity });
  });

  // ── GET /activities/:id ──────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId: id, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const activity = await db.activity.findUnique({
      where: { id, deletedAt: null },
      include: {
        unit: { select: { id: true, name: true } },
        area: { select: { id: true, name: true, color: true } },
        template: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        checklists: {
          orderBy: { order: 'asc' },
          include: { items: { orderBy: { order: 'asc' } } },
        },
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
    });

    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const now = new Date();
    return reply.send({
      data: {
        ...activity,
        isOverdue: !!activity.dueAt && activity.dueAt < now && !CLOSED.includes(activity.status),
        checklistProgress: buildChecklistProgress(activity.checklists),
        commentCount: activity._count.comments,
      },
    });
  });

  // ── PATCH /activities/:id ────────────────────────────────────────────────────
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId: id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const current = await db.activity.findUnique({ where: { id, deletedAt: null } });
    if (!current) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const body = patchActivitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    // Validate status transition
    if (body.data.status && body.data.status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(body.data.status)) {
        return reply.status(422).send({
          error: { code: 'INVALID_TRANSITION', message: `Cannot change status from ${current.status} to ${body.data.status}` },
        });
      }
    }

    const updated = await db.activity.update({
      where: { id },
      data: {
        ...(body.data.title !== undefined && { title: body.data.title }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.status !== undefined && { status: body.data.status }),
        ...(body.data.priority !== undefined && { priority: body.data.priority }),
        ...(body.data.visibilityMode !== undefined && { visibilityMode: body.data.visibilityMode }),
        ...(body.data.dueAt !== undefined && { dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null }),
        ...(body.data.metadata !== undefined && { metadata: body.data.metadata as Prisma.InputJsonValue }),
      },
    });

    // Generate audit events for each changed field
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    if (body.data.status && body.data.status !== current.status) {
      events.push({ eventType: 'status_changed', payload: { from: current.status, to: body.data.status } });
    }
    if (body.data.priority && body.data.priority !== current.priority) {
      events.push({ eventType: 'priority_changed', payload: { from: current.priority, to: body.data.priority } });
    }
    if (body.data.dueAt !== undefined && String(body.data.dueAt) !== String(current.dueAt)) {
      events.push({ eventType: 'due_date_changed', payload: { from: current.dueAt, to: body.data.dueAt } });
    }
    if (body.data.title && body.data.title !== current.title) {
      events.push({ eventType: 'title_changed', payload: { from: current.title, to: body.data.title } });
    }

    if (events.length > 0) {
      await db.activityEvent.createMany({
        data: events.map((e) => ({
          activityId: id,
          actorId: userId,
          eventType: e.eventType,
          payload: e.payload as Prisma.InputJsonValue,
        })),
      });
    }

    // If completed + has on_complete recurrence rule → generate next occurrence
    if (body.data.status === 'concluido' && current.status !== 'concluido') {
      const rule = await db.recurrenceRule.findUnique({ where: { activityId: id } });
      if (rule && rule.generationMode === 'on_complete') {
        void generateRecurringActivity(id, rule.id);
      }
    }

    return reply.send({ data: updated });
  });

  // ── DELETE /activities/:id (soft) ────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canDelete = await resolveActivityPermission({ userId, activityId: id, action: 'delete' });
    if (!canDelete) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.activity.update({ where: { id }, data: { deletedAt: new Date() } });
    await db.activityEvent.create({
      data: { activityId: id, actorId: userId, eventType: 'deleted', payload: {} },
    });

    return reply.status(204).send();
  });

  // ── POST /activities/:id/assign ──────────────────────────────────────────────
  app.post('/:id/assign', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId: id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      add: z.array(z.object({ userId: z.string().uuid(), kind: z.enum(['responsible', 'participant', 'watcher']) })).default([]),
      remove: z.array(z.string().uuid()).default([]),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    if (body.data.remove.length > 0) {
      await db.activityAssignee.deleteMany({ where: { activityId: id, userId: { in: body.data.remove } } });
    }
    if (body.data.add.length > 0) {
      await db.activityAssignee.createMany({
        data: body.data.add.map((a) => ({ activityId: id, userId: a.userId, kind: a.kind })),
        skipDuplicates: true,
      });
    }

    await db.activityEvent.create({
      data: {
        activityId: id,
        actorId: userId,
        eventType: 'assignees_changed',
        payload: { added: body.data.add, removed: body.data.remove } as Prisma.InputJsonValue,
      },
    });

    const assignees = await db.activityAssignee.findMany({
      where: { activityId: id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return reply.send({ data: assignees });
  });

  // ── POST /activities/:id/share ───────────────────────────────────────────────
  app.post('/:id/share', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId: id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      userId: z.string().uuid(),
      accessLevel: z.enum(['view', 'edit']).default('view'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const permission = await db.activityPermission.upsert({
      where: { activityId_userId: { activityId: id, userId: body.data.userId } },
      update: { accessLevel: body.data.accessLevel },
      create: { activityId: id, userId: body.data.userId, accessLevel: body.data.accessLevel, grantedBy: userId },
    });

    return reply.send({ data: permission });
  });

  // ── POST /activities/:id/recurrence ─────────────────────────────────────────
  app.post('/:id/recurrence', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId: id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      frequency: z.enum(['diaria', 'semanal', 'mensal', 'intervalo_customizado']),
      interval: z.number().int().positive().default(1),
      weekdays: z.array(z.number().int().min(0).max(6)).optional(),
      generationMode: z.enum(['on_complete', 'pre_generate']).default('on_complete'),
      preGenerateN: z.number().int().positive().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const activity = await db.activity.findUnique({ where: { id, deletedAt: null }, select: { dueAt: true } });
    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const nextRunAt = calcNextRunAt(body.data.frequency as RecurrenceFrequency, body.data.interval, body.data.weekdays ?? null, activity.dueAt);

    const rule = await db.recurrenceRule.upsert({
      where: { activityId: id },
      update: { ...body.data, weekdays: body.data.weekdays ?? Prisma.JsonNull, nextRunAt },
      create: { activityId: id, ...body.data, weekdays: body.data.weekdays ?? Prisma.JsonNull, nextRunAt },
    });

    await db.activityEvent.create({
      data: { activityId: id, actorId: userId, eventType: 'recurrence_configured', payload: body.data as Prisma.InputJsonValue },
    });

    return reply.send({ data: rule });
  });

  // ── DELETE /activities/:id/recurrence ────────────────────────────────────────
  app.delete('/:id/recurrence', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canEdit = await resolveActivityPermission({ userId, activityId: id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const rule = await db.recurrenceRule.findUnique({ where: { activityId: id } });
    if (!rule) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No recurrence rule found' } });

    await db.recurrenceRule.delete({ where: { activityId: id } });
    await db.activityEvent.create({
      data: { activityId: id, actorId: userId, eventType: 'recurrence_removed', payload: {} },
    });

    return reply.status(204).send();
  });

  // ── GET /activities/:id/events ───────────────────────────────────────────────
  app.get('/:id/events', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId: id, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const query = z.object({
      after: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(50),
    }).safeParse(request.query);
    if (!query.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const events = await db.activityEvent.findMany({
      where: { activityId: id, ...(query.data.after && { id: { lt: query.data.after } }) },
      orderBy: { createdAt: 'desc' },
      take: query.data.limit + 1,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const hasMore = events.length > query.data.limit;
    const page = hasMore ? events.slice(0, query.data.limit) : events;

    return reply.send({ data: page, meta: { nextCursor: hasMore ? page[page.length - 1]?.id : undefined } });
  });

  // ── POST /activities/bulk-update ─────────────────────────────────────────────
  app.post('/bulk-update', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      organizationId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum(['novo', 'em_andamento', 'aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado']).optional(),
      priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
      dueAt: z.string().datetime().nullable().optional(),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const userId = request.user.sub;
    const { organizationId, ids, ...fields } = body.data;

    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!isOrgLevel) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    const updateData: Record<string, unknown> = {};
    if (fields.status !== undefined) updateData.status = fields.status;
    if (fields.priority !== undefined) updateData.priority = fields.priority;
    if (fields.dueAt !== undefined) updateData.dueAt = fields.dueAt ? new Date(fields.dueAt) : null;

    if (Object.keys(updateData).length === 0)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });

    const result = await db.activity.updateMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      data: updateData,
    });

    return reply.send({ data: { updated: result.count } });
  });

  // ── POST /activities/bulk-assign ─────────────────────────────────────────────
  app.post('/bulk-assign', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      organizationId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(100),
      assigneeId: z.string().uuid(),
      kind: z.enum(['responsible', 'participant', 'watcher']).default('responsible'),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const userId = request.user.sub;
    const { organizationId, ids, assigneeId, kind } = body.data;

    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!isOrgLevel) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    await db.activityAssignee.createMany({
      data: ids.map((activityId) => ({ activityId, userId: assigneeId, kind })),
      skipDuplicates: true,
    });

    return reply.send({ data: { assigned: ids.length } });
  });

  // ── GET /activities/export ────────────────────────────────────────────────────
  app.get('/export', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      format: z.enum(['csv']).default('csv'),
      unitId: z.string().uuid().optional(),
      areaId: z.string().uuid().optional(),
      status: z.enum(['novo', 'em_andamento', 'aguardando_terceiro', 'aguardando_aprovacao', 'concluido', 'cancelado']).optional(),
      priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
      overdue: z.enum(['true', 'false']).optional(),
      search: z.string().max(200).optional(),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const userId = request.user.sub;
    const { organizationId, unitId, areaId, status, priority, overdue, search } = query.data;
    const searchTerm = search?.trim();
    const now = new Date();

    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    const filters: Prisma.ActivityWhereInput[] = [
      {
        organizationId,
        deletedAt: null,
        ...(unitId && { unitId }),
        ...(areaId && { areaId }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(overdue === 'true' && { dueAt: { lt: now }, status: { notIn: CLOSED } }),
      },
    ];

    if (!isOrgLevel) {
      if (unitId) {
        const canSeeUnit = await hasUnitRole(userId, unitId, organizationId, ['unit_manager', 'area_leader', 'executor', 'viewer']);
        if (!canSeeUnit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'No access to this unit' } });
      } else {
        const unitMemberships = await db.membership.findMany({
          where: { userId, organizationId, scopeType: 'unit', deletedAt: null },
          select: { scopeId: true },
        });
        const areaMemberships = await db.membership.findMany({
          where: { userId, organizationId, scopeType: 'area', deletedAt: null },
          select: { scopeId: true },
        });
        filters.push({
          OR: [
            { unitId: { in: unitMemberships.map((m) => m.scopeId) } },
            { areaId: { in: areaMemberships.map((m) => m.scopeId) } },
            { assignees: { some: { userId } } },
            { createdBy: userId },
          ],
        });
      }
    }

    if (searchTerm) {
      filters.push({
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ActivityWhereInput = filters.length === 1 ? filters[0]! : { AND: filters };

    const count = await db.activity.count({ where });
    if (count > 10000) {
      return reply.status(422).send({ error: { code: 'TOO_MANY_RECORDS', message: 'Export limited to 10.000 records. Apply filters to narrow down.' } });
    }

    const activities = await db.activity.findMany({
      where,
      include: {
        unit: { select: { name: true } },
        area: { select: { name: true } },
        assignees: { include: { user: { select: { name: true } } }, where: { kind: 'responsible' }, take: 1 },
      },
      orderBy: [{ unitId: 'asc' }, { areaId: 'asc' }, { createdAt: 'desc' }],
    });

    const formatDate = (d: Date | null) => d ? new Intl.DateTimeFormat('pt-BR').format(d) : '';

    const rows = [
      ['ID', 'Título', 'Unidade', 'Área', 'Status', 'Prioridade', 'Prazo', 'Responsável', 'Criado em', 'Concluído em'],
      ...activities.map((a) => [
        a.id,
        a.title,
        a.unit.name,
        a.area.name,
        a.status,
        a.priority,
        formatDate(a.dueAt),
        a.assignees[0]?.user.name ?? '',
        formatDate(a.createdAt),
        a.status === 'concluido' ? formatDate(a.updatedAt) : '',
      ]),
    ];

    const csvContent = '﻿' + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');

    void reply.header('Content-Type', 'text/csv; charset=utf-8');
    void reply.header('Content-Disposition', 'attachment; filename="atividades.csv"');
    return reply.send(csvContent);
  });
};
