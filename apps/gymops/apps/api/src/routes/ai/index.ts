import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, resolveActivityPermission } from '../../lib/rbac.js';
import { callAI, chatJSON } from '../../ai/ai.service.js';
import { ActivityDraftSchema } from '../../ai/schemas/activity-draft.schema.js';
import { ChecklistSuggestionSchema } from '../../ai/schemas/checklist.schema.js';
import { DelayAnalysisSchema } from '../../ai/schemas/delay-analysis.schema.js';
import { DailySummarySchema } from '../../ai/schemas/daily-summary.schema.js';
import { buildActivityDraftPrompt } from '../../ai/prompts/activity-draft.prompt.js';
import { buildChecklistPrompt } from '../../ai/prompts/checklist.prompt.js';
import { buildDelayAnalysisPrompt } from '../../ai/prompts/delay-analysis.prompt.js';
import { buildDailySummaryPrompt } from '../../ai/prompts/daily-summary.prompt.js';
import { cacheGet, cacheSet } from '../../lib/redis.js';
import { generateAndStoreDailySummary } from '../../workers/ai-summary-worker.js';

export const aiRoutes: FastifyPluginAsync = async (app) => {
  const AI_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

  // ── POST /ai/activities/draft ─────────────────────────────────────────────────
  app.post('/activities/draft', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      text: z.string().min(3).max(1000),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    // RBAC — any member may use draft
    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // Fetch org context
    const org = await db.organization.findUnique({
      where: { id: body.data.organizationId },
      select: { name: true },
    });
    const areas = await db.area.findMany({
      where: { organizationId: body.data.organizationId },
      select: { key: true, name: true },
    });
    const templates = await db.activityTemplate.findMany({
      where: { organizationId: body.data.organizationId, deletedAt: null },
      include: { area: { select: { key: true } } },
    });

    const prompt = buildActivityDraftPrompt({
      userText: body.data.text,
      organizationName: org?.name ?? 'Organização',
      availableAreas: areas,
      availableTemplates: templates.map((t) => ({
        name: t.name,
        areaKey: t.area?.key ?? '',
      })),
    });

    const fallback = {
      title: body.data.text.slice(0, 200),
      areaKey: areas[0]?.key ?? 'administrativo',
      priority: 'media' as const,
      suggestedDueDays: 7,
      checklist: [],
      confidence: 0,
    };

    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
    );

    const parsed = ActivityDraftSchema.safeParse(raw);
    const draft = parsed.success ? parsed.data : fallback;

    return reply.send({ data: draft });
  });

  // ── POST /ai/activities/checklist ─────────────────────────────────────────────
  app.post('/activities/checklist', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const body = z.object({ activityId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const canView = await resolveActivityPermission({ userId: request.user.sub, activityId: body.data.activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const activity = await db.activity.findUnique({
      where: { id: body.data.activityId },
      include: {
        area: { select: { name: true, key: true } },
        template: { select: { name: true, config: true } },
      },
    });
    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const templateConfig = activity.template?.config as { defaultChecklist?: string[] } | null;
    const prompt = buildChecklistPrompt({
      activityTitle: activity.title,
      activityDescription: activity.description ?? undefined,
      areaName: activity.area?.name ?? 'Geral',
      templateChecklist: templateConfig?.defaultChecklist,
    });

    const fallback = { items: [] };
    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
    );

    const parsed = ChecklistSuggestionSchema.safeParse(raw);
    const suggestion = parsed.success ? parsed.data : fallback;

    return reply.send({ data: suggestion });
  });

  // ── POST /ai/activities/delay-analysis ───────────────────────────────────────
  app.post('/activities/delay-analysis', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const body = z.object({ activityId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const canView = await resolveActivityPermission({ userId: request.user.sub, activityId: body.data.activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const activity = await db.activity.findUnique({
      where: { id: body.data.activityId },
      include: {
        area: { select: { name: true } },
        checklists: {
          include: { items: { select: { done: true } } },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const now = new Date();
    const daysOverdue = activity.dueAt
      ? Math.max(0, Math.floor((now.getTime() - activity.dueAt.getTime()) / 86400000))
      : 0;

    const lastEvent = await db.activityEvent.findFirst({
      where: { activityId: body.data.activityId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const daysSinceLastUpdate = lastEvent
      ? Math.floor((now.getTime() - lastEvent.createdAt.getTime()) / 86400000)
      : 0;

    const allItems = activity.checklists.flatMap((c) => c.items);
    const doneItems = allItems.filter((i) => i.done).length;

    const recentCommentsCount = await db.activityComment.count({
      where: { activityId: body.data.activityId, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
    });

    const prompt = buildDelayAnalysisPrompt({
      activityTitle: activity.title,
      areaName: activity.area?.name ?? 'Geral',
      priority: activity.priority,
      daysOverdue,
      daysSinceLastUpdate,
      checklistProgress: { done: doneItems, total: allItems.length },
      recentCommentCount: recentCommentsCount,
      hasAttachments: activity._count.attachments > 0,
    });

    const fallback = {
      summary: `Atividade com ${daysOverdue} dias de atraso sem resolução registrada.`,
      riskLevel: daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'high' : 'medium' as 'medium',
      possibleReasons: ['Prazo não foi atualizado após início do trabalho'],
      suggestedActions: ['Contatar responsável para status atualizado'],
    };

    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
    );

    const parsed = DelayAnalysisSchema.safeParse(raw);
    const analysis = parsed.success ? parsed.data : fallback;

    return reply.send({ data: analysis });
  });

  // ── POST /ai/summaries/daily ──────────────────────────────────────────────────
  // Manual trigger for testing; same logic as the cron worker
  app.post('/summaries/daily', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      unitId: z.string().uuid(),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isAdmin = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager', 'unit_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const stored = await generateAndStoreDailySummary(body.data.unitId);
    if (!stored) return reply.status(503).send({ error: { code: 'AI_UNAVAILABLE', message: 'AI not configured or generation failed' } });

    return reply.send({ data: stored });
  });

  // ── GET /ai/summaries/daily ───────────────────────────────────────────────────
  app.get('/summaries/daily', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { unitId } = z.object({ unitId: z.string().uuid() }).parse(request.query);
    const today = new Date().toISOString().slice(0, 10);
    const cached = await cacheGet(`ai:summary:${unitId}:${today}`);
    if (!cached) return reply.send({ data: null });
    try {
      return reply.send({ data: JSON.parse(cached) });
    } catch {
      return reply.send({ data: null });
    }
  });
};
