import { db } from '../lib/prisma.js';
import { Prisma } from '@gymops/db';
import type { RecurrenceFrequency } from '@gymops/db';

function calcNextRunAt(
  frequency: RecurrenceFrequency,
  interval: number,
  weekdays: number[] | null,
  base: Date,
): Date {
  const next = new Date(base);
  switch (frequency) {
    case 'diaria':
      next.setDate(next.getDate() + interval);
      break;
    case 'semanal': {
      if (weekdays && weekdays.length > 0) {
        const sorted = [...weekdays].sort((a, b) => a - b);
        next.setDate(next.getDate() + 1);
        while (!sorted.includes(next.getDay())) next.setDate(next.getDate() + 1);
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;
    }
    case 'mensal':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'intervalo_customizado':
      next.setDate(next.getDate() + interval);
      break;
  }
  return next;
}

async function runRecurrenceTick(): Promise<void> {
  const now = new Date();

  const dueRules = await db.recurrenceRule.findMany({
    where: { nextRunAt: { lte: now }, generationMode: 'pre_generate' },
    include: {
      activity: {
        include: {
          checklists: { include: { items: { orderBy: { order: 'asc' } } } },
          assignees: true,
        },
      },
    },
    take: 50,
  });

  for (const rule of dueRules) {
    const source = rule.activity;
    if (!source || source.deletedAt) continue;

    const nextDueAt = calcNextRunAt(rule.frequency, rule.interval, rule.weekdays as number[] | null, rule.nextRunAt ?? new Date());

    const newActivity = await db.activity.create({
      data: {
        organizationId: source.organizationId,
        unitId: source.unitId,
        areaId: source.areaId,
        templateId: source.templateId,
        title: source.title,
        description: source.description,
        priority: source.priority,
        visibilityMode: source.visibilityMode,
        dueAt: nextDueAt,
        metadata: source.metadata as Prisma.InputJsonValue,
        createdBy: source.createdBy,
        assignees: {
          createMany: {
            data: source.assignees.map((a) => ({ userId: a.userId, kind: a.kind })),
            skipDuplicates: true,
          },
        },
      },
    });

    for (const cl of source.checklists) {
      const newCl = await db.activityChecklist.create({
        data: { activityId: newActivity.id, title: cl.title, order: cl.order },
      });
      if (cl.items.length > 0) {
        await db.activityChecklistItem.createMany({
          data: cl.items.map((item) => ({ checklistId: newCl.id, text: item.text, order: item.order })),
        });
      }
    }

    // Carry recurrence to the new activity
    const futureNextRunAt = calcNextRunAt(rule.frequency, rule.interval, rule.weekdays as number[] | null, nextDueAt);
    await db.recurrenceRule.create({
      data: {
        activityId: newActivity.id,
        frequency: rule.frequency,
        interval: rule.interval,
        weekdays: rule.weekdays ?? Prisma.JsonNull,
        generationMode: rule.generationMode,
        preGenerateN: rule.preGenerateN,
        nextRunAt: futureNextRunAt,
      },
    });

    // Update the source rule nextRunAt
    await db.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextRunAt: nextDueAt },
    });

    await db.activityEvent.create({
      data: {
        activityId: source.id,
        eventType: 'recurrence_triggered',
        payload: { newActivityId: newActivity.id, nextDueAt: nextDueAt.toISOString() },
      },
    });
  }

  if (dueRules.length > 0) {
    console.info(`[recurrence] Generated ${dueRules.length} recurring activities`);
  }
}

export function startRecurrenceWorker(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // hourly

  void runRecurrenceTick();
  setInterval(() => void runRecurrenceTick(), INTERVAL_MS);
  console.info('[recurrence] Worker started (hourly tick)');
}
