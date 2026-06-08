import type { FastifyPluginAsync } from 'fastify';
import type { ActivityStatus, Prisma, TutorialStatus, VisibilityMode } from '@gymops/db';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { env } from '../../env.js';

const CLOSED: ActivityStatus[] = ['concluido', 'cancelado'];
const OPEN_VISIBILITY: VisibilityMode[] = ['inherited', 'shared'];
const TUTORIAL_ID_REGEX = /^[a-z0-9-]{1,64}$/;

const tutorialIdSchema = z.string().regex(TUTORIAL_ID_REGEX);
const tutorialStatusSchema = z.enum(['not_started', 'in_progress', 'completed', 'skipped', 'deferred']);
const tutorialStepIdSchema = z.string().regex(TUTORIAL_ID_REGEX);

type TutorialProgressRecord = {
  id: string;
  tutorialId: string;
  status: TutorialStatus;
  currentStepId: string | null;
  completedSteps: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  updatedAt: Date;
};

function readCompletedSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((step): step is string => typeof step === 'string');
}

function serializeTutorialProgress(row: TutorialProgressRecord) {
  return {
    id: row.id,
    tutorialId: row.tutorialId,
    status: row.status,
    currentStepId: row.currentStepId,
    completedSteps: readCompletedSteps(row.completedSteps),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    skippedAt: row.skippedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function buildRbacOR(
  userId: string,
  organizationId: string,
): Promise<Prisma.ActivityWhereInput['OR'] | undefined> {
  const isOrgLevel = !!(await db.membership.findFirst({
    where: { userId, organizationId, scopeType: 'organization', role: { in: ['owner', 'org_manager'] }, deletedAt: null },
  }));

  if (isOrgLevel) return undefined;

  const [unitMemberships, areaMemberships] = await Promise.all([
    db.membership.findMany({
      where: { userId, organizationId, scopeType: 'unit', deletedAt: null },
      select: { scopeId: true },
    }),
    db.membership.findMany({
      where: { userId, organizationId, scopeType: 'area', deletedAt: null },
      select: { scopeId: true },
    }),
  ]);

  const or: Prisma.ActivityWhereInput[] = [
    { assignees: { some: { userId } } },
    { createdBy: userId },
    { unitId: { in: unitMemberships.map((m) => m.scopeId) } },
    {
      visibilityMode: { in: OPEN_VISIBILITY },
      areaId: { in: areaMemberships.map((m) => m.scopeId) },
    },
  ];

  return or;
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /me/activities ───────────────────────────────────────────────────────
  app.get('/activities', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        view: z.enum(['today', 'overdue', 'this_week', 'awaiting_my_return']).default('today'),
        organizationId: z.string().uuid(),
      })
      .safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const userId = request.user.sub;
    const { view, organizationId } = query.data;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rbacOR = await buildRbacOR(userId, organizationId);

    const dateFilter: Prisma.ActivityWhereInput =
      view === 'today'
        ? { dueAt: { gte: today, lt: tomorrow }, status: { notIn: CLOSED } }
        : view === 'overdue'
          ? { dueAt: { lt: today }, status: { notIn: CLOSED } }
          : view === 'this_week'
            ? { dueAt: { gte: today, lt: nextWeek }, status: { notIn: CLOSED } }
            : { status: 'aguardando_aprovacao' as ActivityStatus };

    const where: Prisma.ActivityWhereInput = {
      organizationId,
      deletedAt: null,
      ...dateFilter,
      ...(rbacOR ? { OR: rbacOR } : {}),
    };

    const activities = await db.activity.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      take: 100,
      include: {
        unit: { select: { id: true, name: true } },
        area: { select: { id: true, name: true, color: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        checklists: { include: { items: { select: { done: true } } } },
      },
    });

    const enriched = activities.map((a) => ({
      ...a,
      isOverdue: !!a.dueAt && a.dueAt < now && !CLOSED.includes(a.status),
      checklistProgress: {
        total: a.checklists.flatMap((c) => c.items).length,
        done: a.checklists.flatMap((c) => c.items).filter((i) => i.done).length,
      },
      assignees: a.assignees.map((as) => ({
        userId: as.userId,
        name: as.user.name,
        avatarUrl: as.user.avatarUrl,
        kind: as.kind,
      })),
    }));

    return reply.send({ data: enriched, meta: { total: enriched.length } });
  });

  // ── GET /me/counts ───────────────────────────────────────────────────────────
  app.get('/counts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query);
    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });

    const userId = request.user.sub;
    const { organizationId } = query.data;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rbacOR = await buildRbacOR(userId, organizationId);
    const base: Prisma.ActivityWhereInput = {
      organizationId,
      deletedAt: null,
      ...(rbacOR ? { OR: rbacOR } : {}),
    };

    const [todayCount, overdueCount, thisWeekCount, awaitingCount] = await Promise.all([
      db.activity.count({ where: { ...base, dueAt: { gte: today, lt: tomorrow }, status: { notIn: CLOSED } } }),
      db.activity.count({ where: { ...base, dueAt: { lt: today }, status: { notIn: CLOSED } } }),
      db.activity.count({ where: { ...base, dueAt: { gte: today, lt: nextWeek }, status: { notIn: CLOSED } } }),
      db.activity.count({ where: { ...base, status: 'aguardando_aprovacao' as ActivityStatus } }),
    ]);

    return reply.send({ data: { today: todayCount, overdue: overdueCount, thisWeek: thisWeekCount, awaitingMyReturn: awaitingCount } });
  });

  // ── GET /me/role ─────────────────────────────────────────────────────────────
  app.get('/role', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query);
    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'organizationId is required' } });

    const userId = request.user.sub;
    const { organizationId } = query.data;

    const orgMembership = await db.membership.findFirst({
      where: { userId, organizationId, scopeType: 'organization', deletedAt: null },
      select: { role: true },
    });

    if (orgMembership) {
      return reply.send({ data: { role: orgMembership.role, primaryUnitId: null } });
    }

    const unitMembership = await db.membership.findFirst({
      where: { userId, organizationId, scopeType: 'unit', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { role: true, scopeId: true },
    });

    if (unitMembership) {
      return reply.send({ data: { role: unitMembership.role, primaryUnitId: unitMembership.scopeId } });
    }

    const areaMembership = await db.membership.findFirst({
      where: { userId, organizationId, scopeType: 'area', deletedAt: null },
      select: { role: true },
    });

    return reply.send({ data: { role: areaMembership?.role ?? null, primaryUnitId: null } });
  });

  // ── GET /me/tutorial-progress ───────────────────────────────────────────────
  app.get('/tutorial-progress', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const rows = await db.tutorialProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tutorialId: true,
        status: true,
        currentStepId: true,
        completedSteps: true,
        startedAt: true,
        completedAt: true,
        skippedAt: true,
        updatedAt: true,
      },
    });

    return reply.send({ data: rows.map((row) => serializeTutorialProgress(row)) });
  });

  // ── PATCH /me/tutorial-progress/:tutorialId ────────────────────────────────
  app.patch('/tutorial-progress/:tutorialId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ tutorialId: tutorialIdSchema }).safeParse(request.params);
    if (!params.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'tutorialId inválido', details: params.error.flatten() } });
    }

    const body = z.object({
      status: tutorialStatusSchema.optional(),
      currentStepId: z.union([tutorialStepIdSchema, z.null()]).optional(),
      completedSteps: z.array(tutorialStepIdSchema).max(200).optional(),
    }).safeParse(request.body ?? {});

    if (!body.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Corpo inválido', details: body.error.flatten() } });
    }

    const userId = request.user.sub;
    const tutorialId = params.data.tutorialId;
    const now = new Date();

    const existing = await db.tutorialProgress.findUnique({
      where: { userId_tutorialId: { userId, tutorialId } },
      select: { status: true, startedAt: true, completedAt: true, skippedAt: true },
    });

    const nextStatus = body.data.status ?? (existing?.status ?? 'in_progress');

    const startedAt = nextStatus === 'in_progress'
      ? (existing?.startedAt ?? now)
      : (existing?.startedAt ?? (body.data.status ? now : null));

    const completedAt = body.data.status
      ? (nextStatus === 'completed' ? now : null)
      : (existing?.completedAt ?? null);

    const skippedAt = body.data.status
      ? (nextStatus === 'skipped' ? now : null)
      : (existing?.skippedAt ?? null);

    const row = await db.tutorialProgress.upsert({
      where: { userId_tutorialId: { userId, tutorialId } },
      create: {
        userId,
        tutorialId,
        status: nextStatus,
        currentStepId: body.data.currentStepId ?? null,
        completedSteps: (body.data.completedSteps ?? []) as unknown as Prisma.InputJsonValue,
        startedAt,
        completedAt,
        skippedAt,
      },
      update: {
        status: nextStatus,
        ...(body.data.currentStepId !== undefined ? { currentStepId: body.data.currentStepId } : {}),
        ...(body.data.completedSteps !== undefined
          ? { completedSteps: body.data.completedSteps as unknown as Prisma.InputJsonValue }
          : {}),
        startedAt,
        completedAt,
        skippedAt,
      },
      select: {
        id: true,
        tutorialId: true,
        status: true,
        currentStepId: true,
        completedSteps: true,
        startedAt: true,
        completedAt: true,
        skippedAt: true,
        updatedAt: true,
      },
    });

    return reply.send({ data: serializeTutorialProgress(row) });
  });

  // ── POST /me/tutorial-progress/:tutorialId/restart ─────────────────────────
  app.post('/tutorial-progress/:tutorialId/restart', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ tutorialId: tutorialIdSchema }).safeParse(request.params);
    if (!params.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'tutorialId inválido', details: params.error.flatten() } });
    }

    const userId = request.user.sub;
    const tutorialId = params.data.tutorialId;
    const now = new Date();

    const row = await db.tutorialProgress.upsert({
      where: { userId_tutorialId: { userId, tutorialId } },
      create: {
        userId,
        tutorialId,
        status: 'in_progress',
        currentStepId: null,
        completedSteps: [] as unknown as Prisma.InputJsonValue,
        startedAt: now,
        completedAt: null,
        skippedAt: null,
      },
      update: {
        status: 'in_progress',
        currentStepId: null,
        completedSteps: [] as unknown as Prisma.InputJsonValue,
        startedAt: now,
        completedAt: null,
        skippedAt: null,
      },
      select: {
        id: true,
        tutorialId: true,
        status: true,
        currentStepId: true,
        completedSteps: true,
        startedAt: true,
        completedAt: true,
        skippedAt: true,
        updatedAt: true,
      },
    });

    return reply.send({ data: serializeTutorialProgress(row) });
  });

  // ── PATCH /me/profile ────────────────────────────────────────────────────────
  app.patch('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const body = z.object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().max(30).nullable().optional(),
      timezone: z.string().max(50).optional(),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

    const user = await db.user.update({
      where: { id: userId },
      data: body.data,
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
    });

    return reply.send({ data: user });
  });

  // ── GET /me/profile ──────────────────────────────────────────────────────────
  app.get('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
    });
    if (!user) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    return reply.send({ data: user });
  });

  // ── POST /me/avatar/presign ──────────────────────────────────────────────────
  app.post('/avatar/presign', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    }).safeParse(request.body);

    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid mime type' } });

    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
      return reply.status(503).send({ error: { code: 'R2_NOT_CONFIGURED', message: 'Storage not configured' } });
    }

    const userId = request.user.sub;
    const ext = body.data.mimeType.split('/')[1];
    const objectKey = `avatars/${userId}.${ext}`;

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey, ContentType: body.data.mimeType }),
      { expiresIn: 300 },
    );

    return reply.send({ data: { uploadUrl, objectKey, expiresIn: 300 } });
  });

  // ── POST /me/avatar ──────────────────────────────────────────────────────────
  app.post('/avatar', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const body = z.object({ objectKey: z.string().min(1) }).safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'objectKey required' } });

    const publicBase = env.R2_PUBLIC_URL ?? '';
    const avatarUrl = publicBase ? `${publicBase}/${body.data.objectKey}` : null;

    const user = await db.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
    });

    return reply.send({ data: user });
  });
};
