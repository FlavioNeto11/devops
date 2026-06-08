import { db } from '../lib/prisma.js';
import { cacheGet, cacheSet } from '../lib/redis.js';
import { enqueueNotification } from '../lib/queues.js';

const FLAG_TTL = 2 * 60 * 60; // 2 hours — notify once per 2h per activity

export async function runDelayScan(): Promise<void> {
  const now = new Date();

  const overdue = await db.activity.findMany({
    where: {
      dueAt: { lt: now },
      status: { notIn: ['concluido', 'cancelado'] },
      priority: { in: ['critica', 'alta'] },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      priority: true,
      dueAt: true,
      assignees: { select: { userId: true } },
    },
    take: 200,
  });

  let flagged = 0;
  for (const activity of overdue) {
    const flagKey = `delay:activity:${activity.id}`;
    const alreadyFlagged = await cacheGet(flagKey);
    if (alreadyFlagged) continue;

    // Set flag before sending to avoid duplicate notifications
    await cacheSet(flagKey, '1', FLAG_TTL);

    for (const assignee of activity.assignees) {
      await enqueueNotification({
        type: 'overdue',
        activityId: activity.id,
        userId: assignee.userId,
        activityTitle: activity.title,
        dueAt: activity.dueAt!.toISOString(),
      });
    }
    flagged++;
  }

  if (flagged > 0) {
    console.info(`[delay-scan] Flagged ${flagged} newly-overdue activities`);
  }
}

export function startDelayScanWorker(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // hourly

  void runDelayScan();
  setInterval(() => void runDelayScan(), INTERVAL_MS);
  console.info('[delay-scan] Worker started (hourly scan for overdue activities)');
}
