// ai/memory.js — MEMORIA DURAVEL do chat de autoria (Postgres + pgvector), padrao SICAT/GymOps.
//   thread store (conversa sobrevive a reload/restart) + rolling summary + memoria longa do
//   operador (pgvector). FAIL-SOFT: sem DATABASE_URL ou erro de DB -> undefined (o grafo usa
//   turn.history; o chat NUNCA cai por causa do banco). Roda migrations idempotentes no 1o uso.
import { createThreadStore, createRollingSummarizer, createUserMemory, createEmbedder } from '@flavioneto11/ai-core';
import { getLlm } from '../llm.js';
import { runMigrations } from './migrate.js';

let _memory; // undefined = nao construido; null nunca (usamos undefined p/ "sem memoria")
let _pool = null;

export function memoryEnabled() { return Boolean((process.env.DATABASE_URL || '').trim()); }

// Constroi (uma vez) a memoria duravel. Retorna { threadStore, summarizer, userMemory } ou
// undefined (fail-soft). Idempotente.
export async function buildDurableMemory() {
  if (_memory !== undefined) return _memory || undefined;
  if (!memoryEnabled()) { _memory = false; return undefined; }
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    _pool = pool;
    const query = async (sql, params = []) => { const r = await pool.query(sql, params); return { rows: r.rows, rowCount: r.rowCount }; };
    await runMigrations(query);
    const llm = await getLlm();
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embedder = createEmbedder({
      embedFn: async (texts) => {
        const res = await client.embeddings.create({ model: process.env.REQHUB_EMBED_MODEL || 'text-embedding-3-small', input: texts });
        return res.data.map((d) => d.embedding);
      },
      dimensions: 1536,
    });
    _memory = {
      threadStore: createThreadStore({ query }),
      summarizer: createRollingSummarizer({ llm, keepRecent: 8, triggerAt: 16 }),
      userMemory: createUserMemory({ query, embedder, ttlDays: 180 }),
    };
    console.log('[reqhub-api] memoria duravel ATIVA (Postgres+pgvector)');
    return _memory;
  } catch (err) {
    console.error('[reqhub-api] memoria duravel indisponivel (chat segue SEM memoria):', err && err.message);
    _memory = false;
    return undefined;
  }
}

// para testes/encerramento
export async function closeMemoryPool() { if (_pool) { try { await _pool.end(); } catch { /* ignore */ } _pool = null; } _memory = undefined; }
