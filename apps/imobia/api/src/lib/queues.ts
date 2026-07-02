// Fabrica de filas BullMQ (fail-soft): sem REDIS_URL, getQueue()/createWorker() -> null e o
// enqueue vira no-op. As filas de dominio (acm-scrape, ptam-render, vistoria-vision,
// document-validate, whatsapp-inbound, marketing-image, ai-summary) sao registradas em F4+.
import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { getRedis } from './redis';

export type QueueName =
  | 'acm-scrape'
  | 'ptam-render'
  | 'vistoria-vision'
  | 'document-validate'
  | 'whatsapp-inbound'
  | 'marketing-image'
  | 'ai-summary';

export const QUEUE_NAMES: QueueName[] = [
  'acm-scrape',
  'ptam-render',
  'vistoria-vision',
  'document-validate',
  'whatsapp-inbound',
  'marketing-image',
  'ai-summary',
];

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue | null {
  const connection = getRedis();
  if (!connection) return null;
  let q = queues.get(name);
  if (!q) {
    // BullMQ empacota sua propria copia do ioredis -> cast (mesma API em runtime).
    q = new Queue(name, { connection: connection as any });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(name: QueueName, jobName: string, data: unknown): Promise<boolean> {
  const q = getQueue(name);
  if (!q) return false; // fail-soft: sem Redis o job simplesmente nao roda (fluxo manual segue)
  await q.add(jobName, data as object, { removeOnComplete: 200, removeOnFail: 500, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  return true;
}

export function createWorker(name: QueueName, processor: Processor): Worker | null {
  const connection = getRedis();
  if (!connection) return null;
  return new Worker(name, processor, { connection: connection as any, concurrency: 2 });
}

export type { Job };
