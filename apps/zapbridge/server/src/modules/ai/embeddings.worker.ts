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
import { prisma } from '../../lib/prisma';

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

/** Remove os embeddings de UMA conversa (ao trancá-la, some da busca semântica). */
export async function purgeChatEmbeddings(userId: string, chatJid: string): Promise<void> {
  if (!aiDbEnabled()) return;
  await query(`delete from message_embeddings where user_id = $1 and chat_jid = $2`, [userId, chatJid]).catch(() => undefined);
}

const _backfilling = new Set<string>();

export interface BackfillProgress {
  running: boolean;
  done: number;
  indexed: number;
}
const _progress = new Map<string, BackfillProgress>();
export function backfillStatus(userId: string): BackfillProgress {
  return _progress.get(userId) ?? { running: false, done: 0, indexed: 0 };
}

/**
 * Backfill: indexa o histórico EXISTENTE (que nunca passou pelos hooks). Lê do SQLite em
 * páginas, embeda em LOTE (1 chamada OpenAI por lote) e insere ON CONFLICT DO NOTHING.
 * Throttle entre lotes. Em background, fail-soft, idempotente. Cap p/ limitar custo/tempo.
 */
export async function backfillUserEmbeddings(
  userId: string,
  sessionId: string,
  opts: { batch?: number; max?: number } = {},
): Promise<void> {
  if (!aiDbEnabled() || _backfilling.has(userId)) return;
  _backfilling.add(userId);
  // Lote pequeno + throttle generoso: com WAL o SQLite suporta leitura concorrente, mas
  // o backfill deve ceder espaço às leituras do assistente (não monopolizar o I/O).
  const batch = Math.min(opts.batch ?? 80, 256);
  const max = opts.max ?? 50_000;
  _progress.set(userId, { running: true, done: 0, indexed: 0 });
  let indexed = 0;
  let done = 0;

  const readPage = async (cursor?: string) => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        return await prisma.message.findMany({
          where: { text: { not: null }, chat: { sessionId, locked: false } }, // nunca indexa trancadas
          orderBy: { timestamp: 'desc' },
          take: batch,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, text: true, fromMe: true, timestamp: true, chat: { select: { jid: true } } },
        });
      } catch {
        if (attempt === 4) return null; // desiste desta sessão; reindex retoma do zero (idempotente)
        await new Promise((r) => setTimeout(r, 1500 * attempt)); // SQLite ocupado → recua e tenta de novo
      }
    }
    return null;
  };

  try {
    let cursor: string | undefined;
    while (done < max) {
      const rows = await readPage(cursor);
      if (rows === null) break; // timeout persistente → para (retomável)
      if (!rows.length) break;
      cursor = rows[rows.length - 1]!.id;
      done += rows.length;

      // Pula os já indexados neste lote.
      const ids = rows.map((r) => r.id);
      const existing = await query<{ message_id: string }>(
        `select message_id from message_embeddings where message_id = any($1::text[])`,
        [ids],
      ).catch(() => ({ rows: [] as { message_id: string }[] }));
      const have = new Set(existing.rows.map((r) => r.message_id));
      const todo = rows.filter((r) => !have.has(r.id) && (r.text ?? '').trim());

      if (todo.length) {
        const vecs = await embedTexts(todo.map((r) => (r.text ?? '').slice(0, 4000))).catch(() => [] as number[][]);
        for (let i = 0; i < todo.length; i++) {
          const v = vecs[i];
          if (!v?.length) continue;
          const r = todo[i]!;
          await query(
            `insert into message_embeddings (message_id, user_id, chat_jid, from_me, text, ts, embedding)
               values ($1,$2,$3,$4,$5,$6,$7::vector) on conflict (message_id) do nothing`,
            [r.id, userId, r.chat.jid, r.fromMe, (r.text ?? '').slice(0, 4000), r.timestamp.toISOString(), vectorLiteral(v)],
          ).catch(() => undefined);
          indexed++;
        }
      }
      _progress.set(userId, { running: true, done, indexed });
      await new Promise((res) => setTimeout(res, 700)); // throttle: cede I/O do SQLite ao assistente
    }
  } finally {
    _backfilling.delete(userId);
    _progress.set(userId, { running: false, done, indexed });
    console.log(`[ai/embed] backfill concluído: ${indexed} indexados (${done} varridos) p/ ${userId}`);
  }
}
