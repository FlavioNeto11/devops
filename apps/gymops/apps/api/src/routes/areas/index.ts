import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';
import { logAudit } from '../../lib/audit.js';

const createAreaSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  key: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, 'key must be lowercase alphanumeric with underscores'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  visibilityDefault: z.enum(['inherited', 'restricted', 'shared']).default('inherited'),
});

export const areaRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /areas ───────────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });
    }

    const userId = request.user.sub;
    const { organizationId } = query.data;

    const isMember = await db.membership.findFirst({
      where: { userId, organizationId, deletedAt: null },
    });
    if (!isMember) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this organization' } });
    }

    const areas = await db.area.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    return reply.send({ data: areas });
  });

  // ── POST /areas ──────────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createAreaSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    const userId = request.user.sub;
    const canCreate = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager']);
    if (!canCreate) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    const existing = await db.area.findUnique({
      where: { organizationId_key: { organizationId: body.data.organizationId, key: body.data.key } },
    });
    if (existing) {
      return reply.status(409).send({ error: { code: 'DUPLICATE_KEY', message: 'Area key already exists in this organization' } });
    }

    const area = await db.area.create({ data: body.data });
    return reply.status(201).send({ data: area });
  });

  // ── PATCH /areas/:id ─────────────────────────────────────────────────────────
  const patchAreaSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    visibilityDefault: z.enum(['inherited', 'restricted', 'shared']).optional(),
  });

  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const area = await db.area.findUnique({ where: { id } });
    if (!area) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Area not found' } });

    const canEdit = await hasOrgRole(userId, area.organizationId, ['owner', 'org_manager']);
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const body = patchAreaSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const updated = await db.area.update({ where: { id }, data: body.data });
    return reply.send({ data: updated });
  });

  // ── GET /areas (update to filter deleted) ── already filters none, fix here
  // Note: the GET / handler above already exists; we only add DELETE

  // ── DELETE /areas/:id — archive ──────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const area = await db.area.findUnique({ where: { id, deletedAt: null } });
    if (!area) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Area not found' } });

    const canDelete = await hasOrgRole(userId, area.organizationId, ['owner', 'org_manager']);
    if (!canDelete) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.area.update({ where: { id }, data: { deletedAt: new Date() } });
    void logAudit({ organizationId: area.organizationId, userId, action: 'area.archived', resourceType: 'area', resourceId: id });

    return reply.status(204).send();
  });
};
