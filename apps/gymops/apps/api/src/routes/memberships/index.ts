import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, hasUnitRole } from '../../lib/rbac.js';

const createMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer']),
  scopeType: z.enum(['organization', 'unit', 'area']),
  scopeId: z.string().uuid(),
});

export const membershipRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /memberships ─────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid().optional(),
        scopeType: z.enum(['organization', 'unit', 'area']).optional(),
        scopeId: z.string().uuid().optional(),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });
    }

    const requesterId = request.user.sub;
    const { organizationId, userId, scopeType, scopeId } = query.data;

    // Must have some role in the org
    const isMember = await db.membership.findFirst({
      where: { userId: requesterId, organizationId, deletedAt: null },
    });
    if (!isMember) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });
    }

    const memberships = await db.membership.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(userId ? { userId } : {}),
        ...(scopeType ? { scopeType } : {}),
        ...(scopeId ? { scopeId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ data: memberships });
  });

  // ── POST /memberships ────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createMembershipSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
    }

    const granterId = request.user.sub;
    const { organizationId, userId, role, scopeType, scopeId } = body.data;

    // Validate granter permissions
    if (scopeType === 'organization') {
      const isOwner = await hasOrgRole(granterId, organizationId, ['owner']);
      if (!isOwner) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only owners can grant org-level roles' } });
    } else if (scopeType === 'unit') {
      const canGrant = await hasUnitRole(granterId, scopeId, organizationId, ['unit_manager']);
      if (!canGrant) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions to grant unit role' } });
    } else {
      // area — need at least unit_manager or org_manager
      const canGrant = await hasOrgRole(granterId, organizationId, ['owner', 'org_manager']);
      if (!canGrant) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions to grant area role' } });
    }

    // Ensure target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!targetUser) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    // Upsert membership (soft-deleted or new)
    const existing = await db.membership.findFirst({
      where: { userId, organizationId, scopeType, scopeId, deletedAt: null },
    });

    if (existing) {
      // Update role if changed
      const updated = await db.membership.update({
        where: { id: existing.id },
        data: { role, grantedBy: granterId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
      return reply.send({ data: updated });
    }

    const membership = await db.membership.create({
      data: { userId, organizationId, scopeType, scopeId, role, grantedBy: granterId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    return reply.status(201).send({ data: membership });
  });

  // ── DELETE /memberships/:id ──────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const revokerId = request.user.sub;

    const membership = await db.membership.findUnique({
      where: { id, deletedAt: null },
    });
    if (!membership) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Membership not found' } });

    // Can't revoke own owner membership
    if (membership.userId === revokerId && membership.role === 'owner') {
      return reply.status(400).send({ error: { code: 'CANNOT_REVOKE_OWN_OWNERSHIP', message: "Cannot revoke your own owner role" } });
    }

    const canRevoke = await hasOrgRole(revokerId, membership.organizationId, ['owner', 'org_manager']);
    if (!canRevoke) {
      // unit_manager can revoke unit-scope memberships
      if (membership.scopeType === 'unit') {
        const isUnitMgr = await hasUnitRole(revokerId, membership.scopeId, membership.organizationId, ['unit_manager']);
        if (!isUnitMgr) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      } else {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }
    }

    await db.membership.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });

  // ── POST /memberships/invite-by-email ────────────────────────────────────────
  const inviteSchema = z.object({
    email: z.string().email(),
    organizationId: z.string().uuid(),
    role: z.enum(['unit_manager', 'area_leader', 'executor', 'viewer']),
    scopeType: z.enum(['organization', 'unit', 'area']),
    scopeId: z.string().uuid(),
  });

  app.post('/invite-by-email', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = inviteSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const granterId = request.user.sub;
    const { email, organizationId, role, scopeType, scopeId } = body.data;

    const canGrant = await hasOrgRole(granterId, organizationId, ['owner', 'org_manager']);
    if (!canGrant) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    // Find or note user doesn't exist yet (return pending info)
    const user = await db.user.findUnique({ where: { email, deletedAt: null } });
    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'No user with this email. Ask them to register first.' } });
    }

    const existing = await db.membership.findFirst({
      where: { userId: user.id, organizationId, scopeType, scopeId, deletedAt: null },
    });

    if (existing) {
      return reply.send({ data: { ...existing, user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } }, meta: { alreadyMember: true } });
    }

    const membership = await db.membership.create({
      data: { userId: user.id, organizationId, scopeType, scopeId, role, grantedBy: granterId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    return reply.status(201).send({ data: membership });
  });
};
