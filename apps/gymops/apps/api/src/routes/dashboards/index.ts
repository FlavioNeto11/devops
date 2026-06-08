import type { FastifyPluginAsync } from 'fastify';
import type { ActivityStatus } from '@gymops/db';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';
import { cacheGet, cacheSet } from '../../lib/redis.js';
import { z } from 'zod';

const OVERVIEW_TTL = 300; // 5 minutes

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /dashboards/overview ─────────────────────────────────────────────────
  app.get('/overview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });
    }

    const userId = request.user.sub;
    const { organizationId } = query.data;

    const canView = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!canView) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    // Redis cache (5 min TTL — overview query is heavy)
    const cacheKey = `overview:${organizationId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return reply.send(JSON.parse(cached) as object);
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const units = await db.unit.findMany({
      where: { organizationId, deletedAt: null, status: 'active' },
      select: { id: true, name: true },
    });

    const [unitsWithCriticalOverdue, totalOverdue, financialDueToday, maintenanceOpen] = await Promise.all([
      // Units with at least 1 critical overdue activity
      db.unit.count({
        where: {
          organizationId,
          deletedAt: null,
          activities: {
            some: {
              deletedAt: null,
              priority: 'critica',
              status: { notIn: ['concluido', 'cancelado'] },
              dueAt: { lt: now },
            },
          },
        },
      }),
      db.activity.count({
        where: { organizationId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, dueAt: { lt: now } },
      }),
      // Financial activities due today
      db.activity.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { notIn: ['concluido', 'cancelado'] },
          dueAt: { gte: today, lt: tomorrow },
          area: { key: 'financeiro' },
        },
      }),
      // Maintenance open
      db.activity.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { notIn: ['concluido', 'cancelado'] },
          area: { key: 'manutencao' },
        },
      }),
    ]);

    const byUnit = await Promise.all(
      units.map(async (unit) => {
        const [open, overdue, critical, unassigned] = await Promise.all([
          db.activity.count({ where: { unitId: unit.id, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] } } }),
          db.activity.count({ where: { unitId: unit.id, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, dueAt: { lt: now } } }),
          db.activity.count({ where: { unitId: unit.id, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, priority: 'critica' } }),
          db.activity.count({
            where: {
              unitId: unit.id,
              deletedAt: null,
              status: { notIn: ['concluido', 'cancelado'] },
              assignees: { none: { kind: 'responsible' } },
            },
          }),
        ]);
        return { unit, open, overdue, critical, unassigned };
      }),
    );

    const responseBody = {
      data: {
        kpis: { unitsWithCriticalOverdue, totalOverdue, financialDueToday, maintenanceOpen },
        byUnit: byUnit.sort((a, b) => b.overdue - a.overdue),
      },
    };
    void cacheSet(cacheKey, JSON.stringify(responseBody), OVERVIEW_TTL);
    return reply.send(responseBody);
  });

  // ── GET /me/activities ───────────────────────────────────────────────────────
  app.get('/me/activities', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        view: z.enum(['today', 'overdue', 'this_week', 'awaiting_my_return']).default('today'),
        organizationId: z.string().uuid(),
      })
      .safeParse(request.query);

    if (!query.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const userId = request.user.sub;
    const { view, organizationId } = query.data;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const CLOSED: ActivityStatus[] = ['concluido', 'cancelado'];

    const dateFilter =
      view === 'today'
        ? { dueAt: { gte: today, lt: tomorrow } }
        : view === 'overdue'
          ? { dueAt: { lt: today }, status: { notIn: CLOSED } }
          : view === 'this_week'
            ? { dueAt: { gte: today, lt: nextWeek } }
            : { status: 'aguardando_aprovacao' as ActivityStatus };

    // Pre-fetch area IDs where the user has a membership (polymorphic — no Prisma relation)
    const areaMemberships = await db.membership.findMany({
      where: { userId, organizationId, scopeType: 'area', deletedAt: null },
      select: { scopeId: true },
    });
    const userAreaIds = areaMemberships.map((m) => m.scopeId);

    const activities = await db.activity.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: CLOSED },
        ...dateFilter,
        OR: [
          { assignees: { some: { userId } } },
          { createdBy: userId },
          { areaId: { in: userAreaIds } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      take: 100,
      include: {
        unit: { select: { id: true, name: true } },
        area: { select: { id: true, name: true, color: true } },
        assignees: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        checklists: { include: { items: true } },
      },
    });

    const enriched = activities.map((a) => ({
      ...a,
      isOverdue: !!a.dueAt && a.dueAt < now && !['concluido', 'cancelado'].includes(a.status),
      checklistProgress: {
        total: a.checklists.flatMap((c) => c.items).length,
        done: a.checklists.flatMap((c) => c.items).filter((i) => i.done).length,
      },
    }));

    return reply.send({ data: enriched, meta: { total: enriched.length } });
  });
};
