import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../env.js';

const connection = env.REDIS_URL
  ? { url: env.REDIS_URL }
  : null;

export type NotificationJob =
  | { type: 'activity_assigned'; activityId: string; userId: string; activityTitle: string; assignerName: string }
  | { type: 'due_reminder'; activityId: string; userId: string; activityTitle: string; dueAt: string }
  | { type: 'overdue'; activityId: string; userId: string; activityTitle: string; dueAt: string };

export type ImportJob =
  | { type: 'dry_run'; importJobId: string }
  | { type: 'commit'; importJobId: string };

let _notificationQueue: Queue | null = null;
let _importQueue: Queue | null = null;

export function getNotificationQueue(): Queue | null {
  if (!connection) return null;
  if (_notificationQueue) return _notificationQueue;
  _notificationQueue = new Queue('notifications', { connection });
  return _notificationQueue;
}

export function getImportQueue(): Queue | null {
  if (!connection) return null;
  if (_importQueue) return _importQueue;
  _importQueue = new Queue('imports', { connection });
  return _importQueue;
}

export function createWorker(
  name: string,
  processor: (job: Job) => Promise<void>,
): Worker | null {
  if (!connection) return null;
  return new Worker(name, processor, { connection, concurrency: 2 });
}

export async function enqueueNotification(data: NotificationJob): Promise<void> {
  const q = getNotificationQueue();
  if (!q) return;
  await q.add(data.type, data, { removeOnComplete: 100, removeOnFail: 200 });
}

export async function enqueueImport(data: ImportJob): Promise<void> {
  const q = getImportQueue();
  if (!q) return;
  await q.add(data.type, data, { removeOnComplete: 50, removeOnFail: 100 });
}
