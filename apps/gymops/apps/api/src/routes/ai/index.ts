import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, resolveActivityPermission } from '../../lib/rbac.js';
import { callAI, chatJSON, chatText } from '../../ai/ai.service.js';
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
      { stage: 'draft' },
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
      { stage: 'checklist' },
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
      { stage: 'delay-analysis' },
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

  // ── POST /ai/chat — assistente conversacional do operador ─────────────────────
  app.post('/chat', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      message: z.string().min(1).max(2000),
      organizationId: z.string().uuid(),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
        .max(12)
        .optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // Contexto REAL da organização (visão consolidada; o usuário é membro).
    const now = new Date();
    const [org, units, areaCount, statusGroups, overdueCount, recent] = await Promise.all([
      db.organization.findUnique({ where: { id: body.data.organizationId }, select: { name: true } }),
      db.unit.findMany({ where: { organizationId: body.data.organizationId }, select: { name: true }, take: 30 }),
      db.area.count({ where: { organizationId: body.data.organizationId } }),
      db.activity.groupBy({ by: ['status'], where: { organizationId: body.data.organizationId }, _count: { _all: true } }),
      db.activity.count({ where: { organizationId: body.data.organizationId, dueAt: { lt: now } } }),
      db.activity.findMany({
        where: { organizationId: body.data.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { title: true, status: true, priority: true, dueAt: true },
      }),
    ]);

    const statusLine = statusGroups.map((g) => `${g.status}: ${g._count._all}`).join(', ') || 'sem atividades';
    const recentLine = recent
      .map((a) => `- "${a.title}" [${a.status}, ${a.priority}${a.dueAt ? `, prazo ${a.dueAt.toISOString().slice(0, 10)}` : ''}]`)
      .join('\n') || '(nenhuma)';
    const context = `ORGANIZAÇÃO: ${org?.name ?? 'GymOps'}
UNIDADES (${units.length}): ${units.map((u) => u.name).join(', ') || '—'}
ÁREAS: ${areaCount}
ATIVIDADES POR STATUS: ${statusLine}
ATIVIDADES COM PRAZO VENCIDO: ${overdueCount}
ATIVIDADES RECENTES:
${recentLine}`;

    const system = `Você é o Assistente Operacional do GymOps — um copiloto que ajuda o operador a entender o que está acontecendo e a operar o sistema (modelo Organização → Unidade → Área → Atividade) com clareza e sem erros.

Regras:
- Responda SEMPRE em português, de forma clara, objetiva e generativa (linguagem natural).
- Use o CONTEXTO abaixo (dados REAIS da organização) para responder sobre o estado atual. Não invente números além do contexto.
- Quando o operador pedir para fazer algo no sistema, EXPLIQUE o passo a passo no GymOps e, se faltar informação, FAÇA PERGUNTAS objetivas antes de assumir.
- Seja proativo: aponte riscos (atrasos, prioridades críticas) e próximos passos recomendados.
- Você é consultivo: não executa ações; orienta o operador a executá-las.

CONTEXTO ATUAL:
${context}`;

    const messages = [
      { role: 'system' as const, content: system },
      ...(body.data.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: body.data.message },
    ];

    const fallback =
      'No momento não consegui falar com a IA. Tente novamente em instantes — enquanto isso, você pode usar o painel para ver atividades, unidades e prazos.';
    const replyText = await callAI((client) => chatText(client, messages), fallback, { stage: 'chat' });

    return reply.send({ data: { reply: replyText } });
  });
};
