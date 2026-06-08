import type { FastifyPluginAsync } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';
import { logAudit } from '../../lib/audit.js';

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

const createInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer']),
  scopeType: z.enum(['organization', 'unit', 'area']),
  scopeId: z.string().uuid(),
});

export const invitationRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /invitations ────────────────────────────────────────────────────────
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createInvitationSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

    const inviterId = request.user.sub;
    const { organizationId, email, role, scopeType, scopeId } = body.data;

    const canInvite = await hasOrgRole(inviterId, organizationId, ['owner', 'org_manager']);
    if (!canInvite)
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    // If user already exists, add membership directly
    const existingUser = await db.user.findUnique({ where: { email, deletedAt: null } });
    if (existingUser) {
      const existingMembership = await db.membership.findFirst({
        where: { userId: existingUser.id, organizationId, scopeType, scopeId, deletedAt: null },
      });

      if (!existingMembership) {
        await db.membership.create({
          data: { userId: existingUser.id, organizationId, scopeType, scopeId, role, grantedBy: inviterId },
        });
        void logAudit({ organizationId, userId: inviterId, action: 'membership.created', resourceType: 'membership', resourceId: existingUser.id, metadata: { email, role, scopeType } });
      }

      return reply.status(201).send({ data: { status: 'added_directly', email, userId: existingUser.id } });
    }

    // User not registered yet — create invitation token
    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Cancel any previous pending invite for same email+org
    await db.invitation.updateMany({
      where: { email, organizationId, status: 'pending' },
      data: { status: 'cancelled' },
    });

    const invitation = await db.invitation.create({
      data: { organizationId, email, role, scopeType, scopeId, tokenHash, invitedBy: inviterId, expiresAt },
    });

    void logAudit({ organizationId, userId: inviterId, action: 'invitation.sent', resourceType: 'invitation', resourceId: invitation.id, metadata: { email, role } });

    // Send invite email
    try {
      const { sendInvitation } = await import('../../lib/mailer.js');
      const inviter = await db.user.findUnique({ where: { id: inviterId }, select: { name: true } });
      const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
      await sendInvitation({ to: email, inviterName: inviter?.name ?? 'Alguém', orgName: org?.name ?? 'GymOps', token });
    } catch {
      // Email failure does not fail the invitation creation
    }

    return reply.status(201).send({ data: { id: invitation.id, email, status: invitation.status, expiresAt: invitation.expiresAt } });
  });

  // ── GET /invitations ─────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid(),
      status: z.enum(['pending', 'accepted', 'cancelled', 'expired']).optional(),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId required' } });

    const userId = request.user.sub;
    const { organizationId, status } = query.data;

    const isMember = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });

    const now = new Date();
    const invitations = await db.invitation.findMany({
      where: {
        organizationId,
        ...(status ? { status } : { status: { not: 'cancelled' } }),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-expire
    const result = invitations.map((inv) => ({
      ...inv,
      status: inv.status === 'pending' && inv.expiresAt < now ? 'expired' : inv.status,
    }));

    return reply.send({ data: result });
  });

  // ── GET /invitations/:token — public ─────────────────────────────────────────
  app.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const invitation = await db.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Invitation not found' } });

    if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      return reply.status(410).send({ error: { code: 'INVITATION_EXPIRED', message: 'Invitation expired or already used' } });
    }

    const org = await db.organization.findUnique({ where: { id: invitation.organizationId }, select: { name: true, slug: true } });

    return reply.send({ data: { email: invitation.email, role: invitation.role, organization: org, expiresAt: invitation.expiresAt } });
  });

  // ── POST /invitations/:token/accept — public ──────────────────────────────────
  const acceptSchema = z.object({
    name: z.string().min(2).max(100),
    password: z.string().min(8),
  });

  app.post('/:token/accept', async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const body = acceptSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const invitation = await db.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Invitation not found' } });

    if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      return reply.status(410).send({ error: { code: 'INVITATION_EXPIRED', message: 'Invitation expired or already used' } });
    }

    const existingUser = await db.user.findUnique({ where: { email: invitation.email, deletedAt: null } });
    if (existingUser) {
      // User exists: just add membership
      await db.membership.create({
        data: {
          userId: existingUser.id,
          organizationId: invitation.organizationId,
          scopeType: invitation.scopeType,
          scopeId: invitation.scopeId,
          role: invitation.role,
          grantedBy: invitation.invitedBy,
        },
      });
      await db.invitation.update({ where: { tokenHash }, data: { status: 'accepted', acceptedAt: new Date() } });
      void logAudit({ organizationId: invitation.organizationId, userId: existingUser.id, action: 'invitation.accepted', resourceType: 'invitation', resourceId: invitation.id });
      return reply.send({ data: { userId: existingUser.id } });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: body.data.name, email: invitation.email, passwordHash } });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          scopeType: invitation.scopeType,
          scopeId: invitation.scopeId,
          role: invitation.role,
          grantedBy: invitation.invitedBy,
        },
      });
      await tx.invitation.update({ where: { tokenHash }, data: { status: 'accepted', acceptedAt: new Date() } });
      return user;
    });

    void logAudit({ organizationId: invitation.organizationId, userId: result.id, action: 'invitation.accepted', resourceType: 'invitation', resourceId: invitation.id });

    return reply.status(201).send({ data: { userId: result.id } });
  });

  // ── DELETE /invitations/:id — cancel ─────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const invitation = await db.invitation.findUnique({ where: { id } });
    if (!invitation) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Invitation not found' } });

    const canCancel = await hasOrgRole(userId, invitation.organizationId, ['owner', 'org_manager']);
    if (!canCancel) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });

    await db.invitation.update({ where: { id }, data: { status: 'cancelled' } });
    void logAudit({ organizationId: invitation.organizationId, userId, action: 'invitation.cancelled', resourceType: 'invitation', resourceId: id });

    return reply.status(204).send();
  });
};
