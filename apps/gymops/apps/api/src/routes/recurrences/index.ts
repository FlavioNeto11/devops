import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, hasUnitRole } from '../../lib/rbac.js';

export const recurrenceRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /recurrences ─────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid().optional(),
      areaId: z.string().uuid().optional(),
      status: z.enum(['active', 'paused']).optional(),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId required' } });

    const userId = request.user.sub;
    const { organizationId, unitId, areaId, status } = query.data;

    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);

    let unitFilter: string[] | undefined;
    if (!isOrgLevel) {
      const unitMemberships = await db.membership.findMany({
        where: { userId, organizationId, scopeType: 'unit', deletedAt: null, role: 'unit_manager' },
        select: { scopeId: true },
      });
      unitFilter = unitMemberships.map((m) => m.scopeId);
      if (unitFilter.length === 0)
        return reply.send({ data: [], meta: { total: 0 } });
    }

    const rules = await db.recurrenceRule.findMany({
      where: {
        ...(status ? { status } : {}),
        activity: {
          organizationId,
          deletedAt: null,
          ...(unitId ? { unitId } : unitFilter ? { unitId: { in: unitFilter } } : {}),
          ...(areaId ? { areaId } : {}),
        },
      },
      include: {
        activity: {
          select: {
            id: true,
            title: true,
            unitId: true,
            areaId: true,
            unit: { select: { id: true, name: true } },
            area: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { nextRunAt: 'asc' },
    });

    return reply.send({ data: rules, meta: { total: rules.length } });
  });

  // ── PATCH /recurrences/:id ────────────────────────────────────────────────────
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const rule = await db.recurrenceRule.findUnique({
      where: { id },
      include: { activity: { select: { organizationId: true, unitId: true, dueAt: true } } },
    });
    if (!rule) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurrence not found' } });

    const canEdit = await hasOrgRole(userId, rule.activity.organizationId, ['owner', 'org_manager'])
      || await hasUnitRole(userId, rule.activity.unitId, rule.activity.organizationId, ['unit_manager']);
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      status: z.enum(['active', 'paused']).optional(),
      frequency: z.enum(['diaria', 'semanal', 'mensal', 'intervalo_customizado']).optional(),
      interval: z.number().int().min(1).optional(),
      weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const { status, frequency, interval, weekdays } = body.data;

    let nextRunAt = rule.nextRunAt;
    if (frequency || interval !== undefined) {
      const base = rule.activity.dueAt ?? new Date();
      const next = new Date(base);
      const freq = frequency ?? rule.frequency;
      const ivl = interval ?? rule.interval;
      const wdays = weekdays !== undefined ? weekdays : rule.weekdays as number[] | null;

      switch (freq) {
        case 'diaria': next.setDate(next.getDate() + ivl); break;
        case 'semanal': {
          if (wdays && wdays.length > 0) {
            const sorted = [...wdays].sort((a, b) => a - b);
            next.setDate(next.getDate() + 1);
            while (!sorted.includes(next.getDay())) next.setDate(next.getDate() + 1);
          } else {
            next.setDate(next.getDate() + 7 * ivl);
          }
          break;
        }
        case 'mensal': next.setMonth(next.getMonth() + ivl); break;
        default: next.setDate(next.getDate() + ivl);
      }
      nextRunAt = next;
    }

    const updated = await db.recurrenceRule.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(frequency ? { frequency } : {}),
        ...(interval ? { interval } : {}),
        ...(weekdays !== undefined ? { weekdays: weekdays as object } : {}),
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    return reply.send({ data: updated });
  });

  // ── DELETE /recurrences/:id ───────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const rule = await db.recurrenceRule.findUnique({
      where: { id },
      include: { activity: { select: { organizationId: true, unitId: true } } },
    });
    if (!rule) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurrence not found' } });

    const canDelete = await hasOrgRole(userId, rule.activity.organizationId, ['owner', 'org_manager'])
      || await hasUnitRole(userId, rule.activity.unitId, rule.activity.organizationId, ['unit_manager']);
    if (!canDelete) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.recurrenceRule.delete({ where: { id } });

    return reply.status(204).send();
  });
};
