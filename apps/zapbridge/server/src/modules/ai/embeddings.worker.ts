// =============================================================================
// Worker de embeddings IN-PROCESS (sem Redis). Indexa o texto das mensagens em
// message_embeddings (pgvector) para a busca semântica/RAG do histórico.
// Fila simples com concorrência limitada + throttle no backfill (1º sync pode ter
// milhares de mensagens). Fire-and-forget, fail-soft: erro só conta métrica.
// Só escreve no Postgres da IA — o SQLite do app nunca ganha um 2º writer.
// =============================================================================
import { aiDbEnabled, query } from './pg';
import { embedTexts } from './ai.service';
import { getAiMetrics } from './ai-metrics';

interface Job {
  messageId: string;
  userId: string;
  chatJid: string;
  fromMe: boolean;
  text: string;
  ts: Date;
}

const queueArr: Job[] = [];
const CONCURRENCY = 2;
const MAX_QUEUE = 5000;
let active = 0;

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

async function persist(job: Job, embedding: number[]): Promise<void> {
  await query(
    `insert into message_embeddings (message_id, user_id, chat_jid, from_me, text, ts, embedding)
       values ($1, $2, $3, $4, $5, $6, $7::vector)
       on conflict (message_id) do nothing`,
    [job.messageId, job.userId, job.chatJid, job.fromMe, job.text.slice(0, 4000), job.ts.toISOString(), vectorLiteral(embedding)],
  );
}

async function drainOne(): Promise<void> {
  const job = queueArr.shift();
  if (!job) return;
  active++;
  try {
    const vecs = await embedTexts([job.text]);
    if (vecs[0]?.length) await persist(job, vecs[0]);
  } catch {
    getAiMetrics().countError('embed', 'message');
  } finally {
    active--;
    if (queueArr.length) void drainOne();
  }
}

function pump(): void {
  while (active < CONCURRENCY && queueArr.length) void drainOne();
}

/** Enfileira a indexação de uma mensagem (best-effort). Sem banco/chave → no-op. */
export function enqueueMessageEmbedding(job: {
  messageId: string;
  userId: string;
  chatJid: string;
  fromMe: boolean;
  text: string | null | undefined;
  ts: Date;
}): void {
  if (!aiDbEnabled()) return;
  const text = (job.text ?? '').trim();
  if (!text) return; // só indexa texto (mídia entra via "entender mídia", não aqui)
  if (queueArr.length >= MAX_QUEUE) return; // cap: descarta excesso no backfill pesado
  queueArr.push({ messageId: job.messageId, userId: job.userId, chatJid: job.chatJid, fromMe: job.fromMe, text, ts: job.ts });
  pump();
}

/** Remove os embeddings de um usuário (expurgo no disconnect / "apagar dados de IA"). */
export async function purgeUserEmbeddings(userId: string): Promise<void> {
  if (!aiDbEnabled()) return;
  await query(`delete from message_embeddings where user_id = $1`, [userId]).catch(() => undefined);
}
