import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';

const templateConfigSchema = z.object({
  defaultChecklist: z.array(z.string()).default([]),
  defaultPriority: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  defaultVisibility: z.enum(['inherited', 'restricted', 'shared']).default('inherited'),
  suggestedSlaDays: z.number().int().positive().optional(),
  specificFields: z.array(z.string()).default([]),
});

const createSchema = z.object({
  organizationId: z.string().uuid(),
  areaId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  config: templateConfigSchema.default({}),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  config: templateConfigSchema.partial().optional(),
});

export const activityTemplateRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /activity-templates ──────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      areaId: z.string().uuid().optional(),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const { organizationId, areaId } = query.data;

    const templates = await db.activityTemplate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(areaId ? { areaId } : {}),
      },
      include: { area: { select: { id: true, name: true, color: true, key: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return reply.send({ data: templates, meta: { total: templates.length } });
  });

  // ── POST /activity-templates ─────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

    const userId = request.user.sub;
    const { organizationId, ...rest } = body.data;

    const isManager = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!isManager)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    const template = await db.activityTemplate.create({
      data: {
        organizationId,
        areaId: rest.areaId,
        name: rest.name,
        description: rest.description,
        config: rest.config as object,
      },
      include: { area: { select: { id: true, name: true, color: true, key: true } } },
    });

    return reply.status(201).send({ data: template });
  });

  // ── PATCH /activity-templates/:id ────────────────────────────────────────────
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

    const userId = request.user.sub;

    const template = await db.activityTemplate.findUnique({ where: { id, deletedAt: null } });
    if (!template)
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });

    const isManager = await hasOrgRole(userId, template.organizationId, ['owner', 'org_manager']);
    if (!isManager)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    const { config, ...rest } = body.data;
    const mergedConfig = config ? { ...(template.config as object), ...config } : undefined;

    const updated = await db.activityTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(mergedConfig ? { config: mergedConfig } : {}),
      },
      include: { area: { select: { id: true, name: true, color: true, key: true } } },
    });

    return reply.send({ data: updated });
  });

  // ── DELETE /activity-templates/:id ───────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const template = await db.activityTemplate.findUnique({ where: { id, deletedAt: null } });
    if (!template)
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });

    if (template.isSystem)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot delete system templates' } });

    const isManager = await hasOrgRole(userId, template.organizationId, ['owner', 'org_manager']);
    if (!isManager)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    await db.activityTemplate.update({ where: { id }, data: { deletedAt: new Date() } });

    return reply.status(204).send();
  });

  // ── POST /activity-templates/:id/duplicate ───────────────────────────────────
  app.post('/:id/duplicate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const template = await db.activityTemplate.findUnique({
      where: { id, deletedAt: null },
      include: { area: { select: { id: true, name: true, color: true, key: true } } },
    });
    if (!template)
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });

    const isManager = await hasOrgRole(userId, template.organizationId, ['owner', 'org_manager']);
    if (!isManager)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Requires org_manager or higher' } });

    const duplicate = await db.activityTemplate.create({
      data: {
        organizationId: template.organizationId,
        areaId: template.areaId,
        name: `${template.name} (cópia)`,
        description: template.description,
        config: template.config as object,
        isSystem: false,
      },
      include: { area: { select: { id: true, name: true, color: true, key: true } } },
    });

    return reply.status(201).send({ data: duplicate });
  });
};
