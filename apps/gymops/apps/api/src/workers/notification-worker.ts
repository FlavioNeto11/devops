import type { Job } from 'bullmq';
import { createWorker, getNotificationQueue, type NotificationJob } from '../lib/queues.js';
import { db } from '../lib/prisma.js';
import { sendActivityAssigned, sendDueReminder, sendOverdueAlert } from '../lib/mailer.js';
import { sendPushNotification } from '../lib/push.js';
import { sendWhatsApp } from '../lib/whatsapp.js';

async function processNotification(job: Job): Promise<void> {
  const data = job.data as NotificationJob;

  const user = await db.user.findUnique({
    where: { id: data.userId, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!user) return;

  const [emailPref, pushPref, whatsappPref] = await Promise.all([
    db.notificationPreference.findUnique({ where: { userId_channel: { userId: user.id, channel: 'email' } } }),
    db.notificationPreference.findUnique({ where: { userId_channel: { userId: user.id, channel: 'push' } } }),
    db.notificationPreference.findUnique({ where: { userId_channel: { userId: user.id, channel: 'whatsapp' } } }),
  ]);

  const emailEnabled = emailPref?.enabled ?? true;
  const pushEnabled = pushPref?.enabled ?? false;
  const whatsappEnabled = (whatsappPref?.enabled ?? false) && !!user.phone;

  if (data.type === 'activity_assigned') {
    if (emailEnabled) {
      await sendActivityAssigned({
        to: user.email,
        name: user.name,
        activityTitle: data.activityTitle,
        assignerName: data.assignerName,
        activityId: data.activityId,
      });
    }
    if (pushEnabled && pushPref?.config) {
      await sendPushNotification(
        pushPref.config as { endpoint: string; keys: { p256dh: string; auth: string } },
        { title: 'Nova atividade atribuída', body: data.activityTitle, url: `/activities/${data.activityId}` },
      );
    }
    // WhatsApp only for critical priority
    if (whatsappEnabled) {
      const activity = await db.activity.findUnique({ where: { id: data.activityId }, select: { priority: true } });
      if (activity?.priority === 'critica') {
        await sendWhatsApp(user.phone!, `🚨 Nova atividade CRÍTICA atribuída a você:\n"${data.activityTitle}"\nAtribuída por: ${data.assignerName}`);
      }
    }
  }

  if (data.type === 'due_reminder') {
    if (emailEnabled) {
      await sendDueReminder({
        to: user.email,
        name: user.name,
        activityTitle: data.activityTitle,
        dueAt: data.dueAt,
        activityId: data.activityId,
      });
    }
    if (pushEnabled && pushPref?.config) {
      await sendPushNotification(
        pushPref.config as { endpoint: string; keys: { p256dh: string; auth: string } },
        { title: 'Atividade vence amanhã', body: data.activityTitle, url: `/activities/${data.activityId}` },
      );
    }
  }

  if (data.type === 'overdue') {
    if (emailEnabled) {
      await sendOverdueAlert({
        to: user.email,
        name: user.name,
        activityTitle: data.activityTitle,
        dueAt: data.dueAt,
        activityId: data.activityId,
      });
    }
    if (pushEnabled && pushPref?.config) {
      await sendPushNotification(
        pushPref.config as { endpoint: string; keys: { p256dh: string; auth: string } },
        { title: '⚠️ Atividade atrasada', body: data.activityTitle, url: `/activities/${data.activityId}` },
      );
    }
    // WhatsApp for critical overdue
    if (whatsappEnabled) {
      const activity = await db.activity.findUnique({ where: { id: data.activityId }, select: { priority: true } });
      if (activity?.priority === 'critica') {
        const daysLate = Math.floor((Date.now() - new Date(data.dueAt).getTime()) / 86400000);
        await sendWhatsApp(user.phone!, `⚠️ Atividade CRÍTICA vencida há ${daysLate} dia(s):\n"${data.activityTitle}"`);
      }
    }
  }
}

async function enqueueDueReminders(): Promise<void> {
  const q = getNotificationQueue();
  if (!q) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const CLOSED: string[] = ['concluido', 'cancelado'];

  const activities = await db.activity.findMany({
    where: { dueAt: { gte: tomorrow, lt: dayAfter }, status: { notIn: CLOSED as never[] }, deletedAt: null },
    include: { assignees: true },
  });

  for (const activity of activities) {
    for (const assignee of activity.assignees) {
      await q.add('due_reminder', {
        type: 'due_reminder',
        activityId: activity.id,
        userId: assignee.userId,
        activityTitle: activity.title,
        dueAt: activity.dueAt!.toISOString(),
      } satisfies NotificationJob, { removeOnComplete: 50, removeOnFail: 100 });
    }
  }
}

async function enqueueOverdueAlerts(): Promise<void> {
  const q = getNotificationQueue();
  if (!q) return;

  const now = new Date();
  const CLOSED: string[] = ['concluido', 'cancelado'];

  const activities = await db.activity.findMany({
    where: { dueAt: { lt: now }, status: { notIn: CLOSED as never[] }, deletedAt: null },
    include: { assignees: true },
    take: 500,
  });

  for (const activity of activities) {
    for (const assignee of activity.assignees) {
      await q.add('overdue', {
        type: 'overdue',
        activityId: activity.id,
        userId: assignee.userId,
        activityTitle: activity.title,
        dueAt: activity.dueAt!.toISOString(),
      } satisfies NotificationJob, { removeOnComplete: 50, removeOnFail: 100 });
    }
  }
}

export function startNotificationWorker(): void {
  const worker = createWorker('notifications', processNotification);
  if (!worker) {
    console.info('[notifications] Redis not configured — notifications disabled');
    return;
  }

  worker.on('failed', (job, err) => {
    console.error(`[notifications] Job ${job?.id} failed:`, err.message);
  });

  console.info('[notifications] Worker started');

  // Daily cron: due reminders at 08:00, overdue alerts at 09:00
  scheduleDailyCron(8, 0, enqueueDueReminders);
  scheduleDailyCron(9, 0, enqueueOverdueAlerts);
}

function scheduleDailyCron(hour: number, minute: number, fn: () => Promise<void>): void {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      try { await fn(); } catch (e) { console.error('[notifications] Cron error:', e); }
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}
