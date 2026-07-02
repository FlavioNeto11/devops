// =============================================================================
// RAG do ZapBridge: busca semântica no HISTÓRICO de mensagens (message_embeddings)
// e na BASE DE CONHECIMENTO do usuário (knowledge_chunks, escopada por user via
// source_id `kb:<userId>:<nome>`). Embeddings sempre OpenAI (ai.service.embedTexts).
// Fail-soft: sem chave/banco → [].
// =============================================================================
import { aiDbEnabled, query } from './pg';
import { embedTexts } from './ai.service';

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

export interface HistoryHit {
  messageId: string;
  chatJid: string;
  fromMe: boolean;
  text: string;
  ts: string;
  score: number;
}

/** Busca semântica no histórico do usuário (opcionalmente restrita a um chat). */
export async function searchHistorySemantic(
  userId: string,
  chatJid: string | null,
  q: string,
  k = 8,
): Promise<HistoryHit[]> {
  if (!aiDbEnabled() || !q.trim()) return [];
  const vecs = await embedTexts([q]).catch(() => [] as number[][]);
  const vec = vecs[0];
  if (!vec?.length) return [];
  const params: unknown[] = [vectorLiteral(vec), userId];
  let where = `user_id = $2`;
  if (chatJid) {
    params.push(chatJid);
    where += ` and chat_jid = $${params.length}`;
  }
  params.push(Math.min(Math.max(k, 1), 30));
  const r = await query<{ message_id: string; chat_jid: string; from_me: boolean; text: string; ts: string; score: number }>(
    `select message_id, chat_jid, from_me, text, ts, 1 - (embedding <=> $1::vector) as score
       from message_embeddings
      where ${where}
      order by embedding <=> $1::vector
      limit $${params.length}`,
    params,
  ).catch(() => ({ rows: [] as never[] }));
  return r.rows.map((row) => ({
    messageId: row.message_id,
    chatJid: row.chat_jid,
    fromMe: Boolean(row.from_me),
    text: row.text,
    ts: row.ts,
    score: Number(row.score) || 0,
  }));
}

export interface KnowledgeHit {
  sourceId: string;
  title: string | null;
  text: string;
  score: number;
}

/** Recupera trechos da base de conhecimento do usuário (RAG de domínio). */
export async function retrieveKnowledge(userId: string, q: string, k = 6): Promise<KnowledgeHit[]> {
  if (!aiDbEnabled() || !q.trim()) return [];
  const vecs = await embedTexts([q]).catch(() => [] as number[][]);
  const vec = vecs[0];
  if (!vec?.length) return [];
  const r = await query<{ source_id: string; title: string | null; content: string; score: number }>(
    `select source_id, title, content, 1 - (embedding <=> $1::vector) as score
       from knowledge_chunks
      where source_id like $2
      order by embedding <=> $1::vector
      limit $3`,
    [vectorLiteral(vec), `kb:${userId}:%`, Math.min(Math.max(k, 1), 20)],
  ).catch(() => ({ rows: [] as never[] }));
  return r.rows
    .map((row) => ({ sourceId: row.source_id, title: row.title, text: row.content, score: Number(row.score) || 0 }))
    .filter((h) => h.score >= 0.15);
}

/** Bloco de contexto (KB) para injetar em prompts grounded. */
export function knowledgeBlock(hits: KnowledgeHit[]): string {
  if (!hits.length) return '';
  return (
    'Base de conhecimento (use para responder; cite quando usar):\n' +
    hits.map((h, i) => `[${i + 1}]${h.title ? ` ${h.title}:` : ''} ${h.text.slice(0, 600)}`).join('\n')
  );
}
