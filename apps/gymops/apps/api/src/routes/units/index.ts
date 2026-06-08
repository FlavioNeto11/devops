import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, hasUnitRole } from '../../lib/rbac.js';
import { logAudit } from '../../lib/audit.js';

const createUnitSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
});

const patchUnitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const unitRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /units ───────────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        organizationId: z.string().uuid(),
        status: z.enum(['active', 'inactive']).optional(),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });
    }

    const userId = request.user.sub;
    const { organizationId, status } = query.data;

    // Determine which units this user can see
    const isOrgLevel = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);

    let unitFilter: object;
    if (isOrgLevel) {
      unitFilter = { organizationId, deletedAt: null };
    } else {
      // Only units where the user has a membership
      const unitMemberships = await db.membership.findMany({
        where: { userId, organizationId, scopeType: 'unit', deletedAt: null },
        select: { scopeId: true },
      });
      const unitIds = unitMemberships.map((m) => m.scopeId);
      unitFilter = { organizationId, id: { in: unitIds }, deletedAt: null };
    }

    const units = await db.unit.findMany({
      where: { ...unitFilter, ...(status ? { status } : {}) },
      orderBy: { name: 'asc' },
    });

    return reply.send({ data: units, meta: { total: units.length } });
  });

  // ── POST /units ──────────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createUnitSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    const userId = request.user.sub;
    const canCreate = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager']);
    if (!canCreate) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    const unit = await db.unit.create({ data: body.data });
    return reply.status(201).send({ data: unit });
  });

  // ── GET /units/:id ───────────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({
      where: { id, deletedAt: null },
      include: {
        unitAreas: {
          where: { enabled: true },
          orderBy: { order: 'asc' },
          include: { area: true },
        },
      },
    });

    if (!unit) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });
    }

    const canView = await hasUnitRole(userId, id, unit.organizationId, ['unit_manager', 'area_leader', 'executor', 'viewer']);
    if (!canView) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });
    }

    return reply.send({ data: unit });
  });

  // ── PATCH /units/:id ─────────────────────────────────────────────────────────
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canEdit = await hasUnitRole(userId, id, unit.organizationId, ['unit_manager']);
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = patchUnitSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    const updated = await db.unit.update({ where: { id }, data: body.data });
    return reply.send({ data: updated });
  });

  // ── POST /units/:id/areas ────────────────────────────────────────────────────
  app.post('/:id/areas', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: unitId } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canManage = await hasOrgRole(userId, unit.organizationId, ['owner', 'org_manager']);
    if (!canManage) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({ areaId: z.string().uuid(), order: z.number().int().default(0) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const unitArea = await db.unitArea.upsert({
      where: { unitId_areaId: { unitId, areaId: body.data.areaId } },
      update: { enabled: true, order: body.data.order },
      create: { unitId, areaId: body.data.areaId, order: body.data.order },
      include: { area: true },
    });

    return reply.status(201).send({ data: unitArea });
  });

  // ── DELETE /units/:id/areas/:areaId ─────────────────────────────────────────
  app.delete('/:id/areas/:areaId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: unitId, areaId } = request.params as { id: string; areaId: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canManage = await hasOrgRole(userId, unit.organizationId, ['owner', 'org_manager']);
    if (!canManage) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.unitArea.update({
      where: { unitId_areaId: { unitId, areaId } },
      data: { enabled: false },
    });

    return reply.status(204).send();
  });

  // ── DELETE /units/:id — archive ──────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canArchive = await hasOrgRole(userId, unit.organizationId, ['owner', 'org_manager']);
    if (!canArchive) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.unit.update({ where: { id }, data: { deletedAt: new Date(), status: 'inactive' } });
    void logAudit({ organizationId: unit.organizationId, userId, action: 'unit.archived', resourceType: 'unit', resourceId: id });

    return reply.status(204).send();
  });

  // ── PATCH /units/:id/areas/reorder ───────────────────────────────────────────
  app.patch('/:id/areas/reorder', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: unitId } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canManage = await hasOrgRole(userId, unit.organizationId, ['owner', 'org_manager']);
    if (!canManage) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = z.object({
      order: z.array(z.object({ areaId: z.string().uuid(), order: z.number().int() })),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    await Promise.all(
      body.data.order.map(({ areaId, order }) =>
        db.unitArea.updateMany({ where: { unitId, areaId }, data: { order } }),
      ),
    );

    return reply.status(204).send();
  });

  // ── GET /units/:id/dashboard ─────────────────────────────────────────────────
  app.get('/:id/dashboard', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: unitId } = request.params as { id: string };
    const userId = request.user.sub;

    const unit = await db.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unit not found' } });

    const canView = await hasUnitRole(userId, unitId, unit.organizationId, ['unit_manager', 'area_leader']);
    if (!canView) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [total, overdue, critical, dueToday] = await Promise.all([
      db.activity.count({ where: { unitId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] } } }),
      db.activity.count({ where: { unitId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, dueAt: { lt: now } } }),
      db.activity.count({ where: { unitId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, priority: 'critica' } }),
      db.activity.count({ where: { unitId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] }, dueAt: { gte: today, lt: tomorrow } } }),
    ]);

    const unitAreas = await db.unitArea.findMany({
      where: { unitId, enabled: true },
      orderBy: { order: 'asc' },
      include: {
        area: {
          include: {
            activities: {
              where: { unitId, deletedAt: null, status: { notIn: ['concluido', 'cancelado'] } },
              orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
              take: 20,
              include: {
                assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
                checklists: { include: { items: true } },
              },
            },
          },
        },
      },
    });

    const byArea = unitAreas.map(({ area }) => ({
      area: { id: area.id, name: area.name, color: area.color },
      activities: area.activities.map((a) => ({
        ...a,
        isOverdue: !!a.dueAt && a.dueAt < now,
        checklistProgress: {
          total: a.checklists.flatMap((c) => c.items).length,
          done: a.checklists.flatMap((c) => c.items).filter((i) => i.done).length,
        },
      })),
    }));

    return reply.send({
      data: {
        unit: { id: unit.id, name: unit.name },
        summary: { total, overdue, critical, dueToday },
        byArea,
      },
    });
  });
};
