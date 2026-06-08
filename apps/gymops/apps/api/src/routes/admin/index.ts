import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@gymops/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../lib/prisma.js';
import { logAudit } from '../../lib/audit.js';
import { bootstrapOrganization } from '../../lib/bootstrap-organization.js';
import { requirePlatformAdmin } from '../../lib/platform-admin.js';

/**
 * Rotas da PLATAFORMA — exclusivas do super-admin (isPlatformAdmin).
 * Visão acima das academias: gerenciar organizações (criar/editar/ativar/inativar)
 * e gerenciar outros usuários master. NÃO impersona / não entra na operação interna.
 * "Inativar" academia = soft-delete (deletedAt) — reversível; bloqueia login dos seus usuários.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const guard = { preHandler: [app.authenticate, requirePlatformAdmin] };

  // ─────────────────────────────────────────────────────────────── Organizações
  // GET /admin/organizations?status=active|inactive|all&q=
  app.get('/organizations', guard, async (request, reply) => {
    const q = z.object({
      status: z.enum(['active', 'inactive', 'all']).optional(),
      q: z.string().trim().optional(),
    }).parse(request.query);

    const where: Prisma.OrganizationWhereInput = {};
    if (q.status === 'active') where.deletedAt = null;
    else if (q.status === 'inactive') where.deletedAt = { not: null };
    // status omitido/'all' => sem filtro de deletedAt (master vê TODAS, inclusive inativas)
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { slug: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const orgs = await db.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { units: true, memberships: true, activities: true } } },
    });

    return reply.send({
      data: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logoUrl,
        createdAt: o.createdAt,
        deletedAt: o.deletedAt,
        isActive: o.deletedAt === null,
        counts: { units: o._count.units, members: o._count.memberships, activities: o._count.activities },
      })),
    });
  });

  // GET /admin/organizations/:id — detalhe + plano + owners
  app.get('/organizations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const org = await db.organization.findUnique({
      where: { id },
      include: {
        plan: true,
        _count: { select: { units: true, memberships: true, activities: true } },
      },
    });
    if (!org) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Academia não encontrada' } });

    const owners = await db.membership.findMany({
      where: { organizationId: id, role: 'owner', scopeType: 'organization', deletedAt: null },
      select: { user: { select: { id: true, name: true, email: true } } },
    });

    return reply.send({
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        settings: org.settings,
        createdAt: org.createdAt,
        deletedAt: org.deletedAt,
        isActive: org.deletedAt === null,
        plan: org.plan,
        counts: { units: org._count.units, members: org._count.memberships, activities: org._count.activities },
        owners: owners.map((m) => m.user),
      },
    });
  });

  // POST /admin/organizations — cria academia + owner (reusa bootstrapOrganization)
  const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug deve ser minúsculo alfanumérico com hifens'),
    ownerEmail: z.string().email(),
    ownerName: z.string().min(2).max(100),
    ownerPassword: z.string().min(8),
    initialUnit: z.object({
      name: z.string().min(1).max(100),
      code: z.string().max(20).optional(),
      address: z.string().max(255).optional(),
    }).optional(),
  });

  app.post('/organizations', guard, async (request, reply) => {
    const body = createOrgSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Entrada inválida', details: body.error.flatten() } });

    const { name, slug, ownerEmail, ownerName, ownerPassword, initialUnit } = body.data;

    if (await db.organization.findUnique({ where: { slug } }))
      return reply.status(422).send({ error: { code: 'SLUG_TAKEN', message: 'Slug já em uso' } });
    if (await db.user.findUnique({ where: { email: ownerEmail, deletedAt: null } }))
      return reply.status(422).send({ error: { code: 'EMAIL_TAKEN', message: 'E-mail já registrado' } });

    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const result = await bootstrapOrganization({
      name, slug, owner: { name: ownerName, email: ownerEmail, passwordHash }, initialUnit,
    });

    return reply.status(201).send({
      data: { organizationId: result.organizationId, organizationSlug: slug, ownerUserId: result.ownerUserId },
    });
  });

  // PATCH /admin/organizations/:id — editar / ativar / inativar
  const patchOrgSchema = z.object({
    name: z.string().min(2).optional(),
    logoUrl: z.string().url().nullable().optional(),
    settings: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
  });

  app.patch('/organizations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchOrgSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Entrada inválida', details: body.error.flatten() } });

    const existing = await db.organization.findUnique({ where: { id }, select: { deletedAt: true } });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Academia não encontrada' } });

    const { name, logoUrl, settings, isActive } = body.data;
    const data: Prisma.OrganizationUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (settings !== undefined) data.settings = settings as unknown as Prisma.InputJsonValue;
    if (isActive !== undefined) data.deletedAt = isActive ? null : new Date();

    const org = await db.organization.update({ where: { id }, data });

    const action = isActive === undefined ? 'platform.org.updated'
      : isActive ? 'platform.org.activated' : 'platform.org.deactivated';
    void logAudit({ organizationId: id, userId: request.user.sub, action, resourceType: 'organization', resourceId: id });

    return reply.send({ data: { id: org.id, name: org.name, slug: org.slug, isActive: org.deletedAt === null } });
  });

  // ─────────────────────────────────────────────────────────────── Masters
  // GET /admin/masters
  app.get('/masters', guard, async (_request, reply) => {
    const masters = await db.user.findMany({
      where: { isPlatformAdmin: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return reply.send({ data: masters });
  });

  // POST /admin/masters — cria OU promove um usuário a master
  const createMasterSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(100).optional(),
    password: z.string().min(8).optional(),
  });

  app.post('/masters', guard, async (request, reply) => {
    const body = createMasterSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Entrada inválida', details: body.error.flatten() } });

    const email = body.data.email.trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });

    let user;
    if (existing) {
      user = await db.user.update({
        where: { id: existing.id },
        data: {
          isPlatformAdmin: true,
          ...(body.data.name ? { name: body.data.name } : {}),
          ...(body.data.password ? { passwordHash: await bcrypt.hash(body.data.password, 10) } : {}),
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } else {
      if (!body.data.password)
        return reply.status(422).send({ error: { code: 'PASSWORD_REQUIRED', message: 'Senha obrigatória para criar um novo master' } });
      user = await db.user.create({
        data: {
          email,
          name: body.data.name ?? email,
          passwordHash: await bcrypt.hash(body.data.password, 10),
          isPlatformAdmin: true,
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    }

    return reply.status(201).send({ data: user });
  });

  // DELETE /admin/masters/:id — revoga o papel de master (não deleta o usuário)
  app.delete('/masters/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (id === request.user.sub)
      return reply.status(422).send({ error: { code: 'CANNOT_SELF_REVOKE', message: 'Você não pode revogar seu próprio acesso master' } });

    const total = await db.user.count({ where: { isPlatformAdmin: true, deletedAt: null } });
    if (total <= 1)
      return reply.status(422).send({ error: { code: 'LAST_MASTER', message: 'Não é possível revogar o último master da plataforma' } });

    const target = await db.user.findUnique({ where: { id }, select: { id: true, isPlatformAdmin: true } });
    if (!target || !target.isPlatformAdmin)
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Master não encontrado' } });

    await db.user.update({ where: { id }, data: { isPlatformAdmin: false } });
    return reply.status(204).send();
  });
};
