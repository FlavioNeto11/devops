import { db } from '../lib/prisma.js';
import { callAIAsync, chatJSON } from '../ai/ai.service.js';
import { DailySummarySchema, type StoredDailySummary } from '../ai/schemas/daily-summary.schema.js';
import { buildDailySummaryPrompt } from '../ai/prompts/daily-summary.prompt.js';
import { cacheSet } from '../lib/redis.js';
import { sendMail } from '../lib/mailer.js';
import { sendWhatsApp } from '../lib/whatsapp.js';

export async function generateAndStoreDailySummary(unitId: string): Promise<StoredDailySummary | null> {
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!unit) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  const tomorrow = new Date(today.getTime() + 86400000);
  const dateStr = today.toISOString().slice(0, 10);

  const [totalOpen, newSinceYesterday, completedYesterday, overdue, critical, dueToday] =
    await Promise.all([
      db.activity.count({ where: { unitId, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null } }),
      db.activity.count({ where: { unitId, createdAt: { gte: yesterday }, deletedAt: null } }),
      db.activity.count({ where: { unitId, status: 'concluido', updatedAt: { gte: yesterday, lt: today }, deletedAt: null } }),
      db.activity.count({ where: { unitId, dueAt: { lt: today }, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null } }),
      db.activity.count({ where: { unitId, priority: 'critica', status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null } }),
      db.activity.count({ where: { unitId, dueAt: { gte: today, lt: tomorrow }, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null } }),
    ]);

  // Per-area stats
  const areaStats = await db.activity.groupBy({
    by: ['areaId'],
    where: { unitId, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null },
    _count: { id: true },
  });

  const overdueByArea = await db.activity.groupBy({
    by: ['areaId'],
    where: { unitId, dueAt: { lt: today }, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null },
    _count: { id: true },
  });

  const areaIds = [...new Set(areaStats.map((a) => a.areaId).filter((id): id is string => !!id))];
  const areas = areaIds.length > 0
    ? await db.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } })
    : [];
  const areaNameMap = new Map(areas.map((a) => [a.id, a.name]));

  const byArea = areaStats.map((a) => ({
    areaName: a.areaId ? (areaNameMap.get(a.areaId) ?? 'Sem área') : 'Sem área',
    open: a._count.id,
    overdue: overdueByArea.find((o) => o.areaId === a.areaId)?._count.id ?? 0,
  }));

  // Top overdue activities
  const topOverdueActivities = await db.activity.findMany({
    where: { unitId, dueAt: { lt: today }, status: { notIn: ['concluido', 'cancelado'] }, deletedAt: null },
    orderBy: { dueAt: 'asc' },
    take: 3,
    select: { title: true, dueAt: true, area: { select: { name: true } } },
  });
  const topOverdue = topOverdueActivities.map((a) => ({
    title: a.title,
    areaName: a.area?.name ?? 'Sem área',
    daysSince: a.dueAt ? Math.floor((Date.now() - a.dueAt.getTime()) / 86400000) : 0,
  }));

  const prompt = buildDailySummaryPrompt({
    unitName: unit.name,
    date: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(today),
    stats: { totalOpen, newSinceYesterday, completedYesterday, overdue, critical, dueToday, byArea, topOverdue },
  });

  const fallback = {
    summary: `${unit.name} — ${dateStr}: ${totalOpen} atividades abertas, ${overdue} atrasadas, ${critical} críticas.`,
    highlights: [
      overdue > 0 ? `${overdue} atividades em atraso` : 'Sem atrasos',
      critical > 0 ? `${critical} atividades críticas abertas` : 'Sem críticas',
    ].filter(Boolean),
    alertCount: overdue + critical,
  };

  const raw = await callAIAsync(
    (client) => chatJSON(client, prompt),
    fallback,
  );

  const parsed = DailySummarySchema.safeParse(raw);
  const aiResult = parsed.success ? parsed.data : fallback;

  const stored: StoredDailySummary = {
    ...aiResult,
    unitName: unit.name,
    date: dateStr,
    generatedAt: new Date().toISOString(),
  };

  // Cache for 48h
  await cacheSet(`ai:summary:${unitId}:${dateStr}`, JSON.stringify(stored), 48 * 3600);

  // Notify unit managers
  const managers = await db.membership.findMany({
    where: {
      organizationId: unit.organizationId,
      role: { in: ['unit_manager', 'org_manager', 'owner'] },
      scopeType: { in: ['unit', 'organization'] },
      scopeId: { in: [unitId, unit.organizationId] },
      deletedAt: null,
    },
    include: { user: { select: { name: true, email: true, phone: true } } },
  });

  const emailHtml = `
    <h2>Resumo Diário — ${unit.name}</h2>
    <p>${stored.summary}</p>
    <ul>${stored.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>
  `;

  for (const m of managers) {
    const { user } = m;
    if (user.email) {
      await sendMail({
        to: user.email,
        subject: `📋 Resumo diário — ${unit.name}`,
        html: emailHtml,
      }).catch(() => {});
    }
    if (user.phone && stored.alertCount > 0) {
      const whatsappMsg = `📋 *Resumo ${unit.name}*\n${stored.summary}\n\n${stored.highlights.map((h) => `• ${h}`).join('\n')}`;
      await sendWhatsApp(user.phone, whatsappMsg).catch(() => {});
    }
  }

  return stored;
}

async function runDailySummaries(): Promise<void> {
  const now = new Date();
  if (now.getHours() !== 7) return;

  console.info('[ai-summary] Running daily summaries...');
  const units = await db.unit.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let generated = 0;
  for (const unit of units) {
    try {
      const result = await generateAndStoreDailySummary(unit.id);
      if (result) generated++;
    } catch (err) {
      console.warn(`[ai-summary] Failed for unit ${unit.id}:`, (err as Error).message);
    }
  }
  console.info(`[ai-summary] Generated ${generated}/${units.length} summaries`);
}

export function startAiSummaryWorker(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // hourly tick, generates only at 07h
  setInterval(() => void runDailySummaries(), INTERVAL_MS);
  console.info('[ai-summary] Worker started (hourly tick, runs at 07h)');
}
