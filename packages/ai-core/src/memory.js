// memory.js — memória em TRÊS horizontes da plataforma de IA (F3).
//
//   CURTO  → createThreadStore: estado da conversa em Postgres (sobrevive a
//            restart e é compartilhado entre processos) — thread por id.
//   MÉDIO  → createRollingSummarizer: quando a thread excede o budget, turnos
//            antigos viram um "rolling summary" e só os recentes ficam íntegros.
//   LONGO  → createUserMemory: fatos/preferências por USUÁRIO em pgvector, com
//            TTL e recall semântico; extração de fatos é assíncrona (worker).
//
// Tudo estrutural (padrão ai-core): `query(sql, params)` e `embedFn` vêm do app.
// Privacidade: TODO acesso à memória longa é escopado por user_id no SQL.

const VECTOR = (embedding) => `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;

/**
 * Estado de thread em Postgres. Tabela (migration do app):
 *   ai_chat_threads(id text pk, messages jsonb, rolling_summary text,
 *                   turn_count int, created_at, updated_at)
 */
export function createThreadStore({ query, table = 'ai_chat_threads' } = {}) {
  if (typeof query !== 'function') throw new Error('createThreadStore: query obrigatorio');
  return {
    async get(threadId) {
      const r = await query(
        `select id, messages, rolling_summary, turn_count from ${table} where id = $1`,
        [threadId],
      );
      const row = r.rows?.[0];
      if (!row) return null;
      const messages = typeof row.messages === 'string' ? JSON.parse(row.messages) : (row.messages || []);
      return {
        id: row.id,
        messages: Array.isArray(messages) ? messages : [],
        rollingSummary: row.rolling_summary || null,
        turnCount: Number(row.turn_count) || 0,
      };
    },

    async put(threadId, { messages = [], rollingSummary = null, turnCount = 0 } = {}) {
      await query(
        `insert into ${table} (id, messages, rolling_summary, turn_count, created_at, updated_at)
         values ($1, $2::jsonb, $3, $4, now(), now())
         on conflict (id) do update
           set messages = excluded.messages,
               rolling_summary = excluded.rolling_summary,
               turn_count = excluded.turn_count,
               updated_at = now()`,
        [threadId, JSON.stringify(messages), rollingSummary, turnCount],
      );
    },

    /** Anexa um turno (user+assistant) com teto de mensagens íntegras. */
    async appendTurn(threadId, userMessage, assistantMessage, { maxMessages = 40 } = {}) {
      const current = (await this.get(threadId)) || { messages: [], rollingSummary: null, turnCount: 0 };
      const messages = [
        ...current.messages,
        { role: 'user', content: String(userMessage ?? '') },
        { role: 'assistant', content: String(assistantMessage ?? '') },
      ].slice(-maxMessages);
      const next = { messages, rollingSummary: current.rollingSummary, turnCount: current.turnCount + 1 };
      await this.put(threadId, next);
      return next;
    },
  };
}

const SUMMARY_PROMPT = (previousSummary, turns) => `Voce mantem o RESUMO CORRENTE de uma conversa entre um operador e um assistente.
Atualize o resumo incorporando os turnos antigos abaixo. Preserve: objetivos do usuario, decisoes,
dados/numeros citados, pendencias. Maximo ~150 palavras, em portugues, terceira pessoa.

RESUMO ANTERIOR (pode ser vazio):
${previousSummary || '(vazio)'}

TURNOS ANTIGOS A INCORPORAR:
${turns.map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`).join('\n')}

Responda APENAS JSON: {"summary":"<resumo atualizado>"}`;

/**
 * Sumarização progressiva: acima de `triggerAt` mensagens, as antigas (além das
 * `keepRecent` últimas) são fundidas no rolling summary via LLM.
 */
export function createRollingSummarizer({ llm, model = 'gpt-5-nano', keepRecent = 8, triggerAt = 16 } = {}) {
  if (!llm || typeof llm.complete !== 'function') throw new Error('createRollingSummarizer: llm.complete obrigatorio');
  return {
    needsCompaction(thread) {
      return (thread?.messages?.length || 0) > triggerAt;
    },
    async compact(thread) {
      const messages = thread?.messages || [];
      if (messages.length <= keepRecent) return thread;
      const old = messages.slice(0, messages.length - keepRecent);
      const recent = messages.slice(-keepRecent);
      try {
        const r = await llm.complete({
          model,
          jsonMode: true,
          reasoningEffort: 'minimal',
          messages: [{ role: 'user', content: SUMMARY_PROMPT(thread.rollingSummary, old) }],
        });
        const parsed = JSON.parse(r.text || '{}');
        const summary = String(parsed.summary || '').trim();
        if (!summary) return thread; // defensivo: sem resumo válido, não perde nada
        return { ...thread, messages: recent, rollingSummary: summary };
      } catch {
        return thread; // falha de LLM nunca derruba/perde a thread
      }
    },
  };
}

/**
 * Memória LONGA por usuário em pgvector. Tabela (migration do app):
 *   ai_user_memory(id, user_id, kind, content, embedding vector(1536),
 *                  expires_at, created_at) + HNSW.
 */
export function createUserMemory({ query, embedder, table = 'ai_user_memory', ttlDays = 180 } = {}) {
  if (typeof query !== 'function') throw new Error('createUserMemory: query obrigatorio');
  if (!embedder || typeof embedder.embedQuery !== 'function') throw new Error('createUserMemory: embedder obrigatorio');
  return {
    /** Recall semântico ESCOPADO pelo usuário (nunca cruza user_id). */
    async recall(userId, queryText, { k = 5, minScore = 0.3 } = {}) {
      if (!userId || !String(queryText || '').trim()) return [];
      const vector = await embedder.embedQuery(String(queryText));
      const r = await query(
        `select kind, content, 1 - (embedding <=> $2::vector) as score
           from ${table}
          where user_id = $1
            and (expires_at is null or expires_at > now())
          order by embedding <=> $2::vector
          limit $3`,
        [String(userId), VECTOR(vector), k],
      );
      return (r.rows || [])
        .map((row) => ({ kind: row.kind, content: row.content, score: Number(row.score) || 0 }))
        .filter((m) => m.score >= minScore);
    },

    /** Grava fatos do usuário (com embedding e TTL). */
    async store(userId, facts) {
      const list = (facts || []).filter((f) => f && String(f.content || '').trim());
      if (!userId || !list.length) return 0;
      for (const fact of list) {
        const vector = await embedder.embedQuery(String(fact.content));
        await query(
          `insert into ${table} (user_id, kind, content, embedding, expires_at)
           values ($1, $2, $3, $4::vector, now() + ($5 || ' days')::interval)`,
          [String(userId), String(fact.kind || 'fact'), String(fact.content), VECTOR(vector), String(ttlDays)],
        );
      }
      return list.length;
    },

    async pruneExpired() {
      const r = await query(`delete from ${table} where expires_at is not null and expires_at <= now()`, []);
      return r.rowCount ?? 0;
    },
  };
}

const EXTRACT_PROMPT = (conversationText, maxFacts) => `Extraia FATOS ESTAVEIS sobre o USUARIO desta conversa
(preferencias, contexto de trabalho, objetivos recorrentes, nome/papel se ele declarar).
REGRAS: maximo ${maxFacts}; so o que for util em conversas FUTURAS; NADA sensivel (senhas, documentos,
saude); NADA efemero (status de hoje); frases curtas em portugues, terceira pessoa.
Se nao houver nada digno de memoria, devolva lista vazia.

CONVERSA:
${String(conversationText).slice(0, 6000)}

Responda APENAS JSON: {"facts":[{"kind":"preference|context|goal|identity","content":"<frase>"}]}`;

/** Extração de fatos para memória longa (uso ASSÍNCRONO no worker — nunca no caminho do turno). */
export async function extractMemoryFacts({ llm, model = 'gpt-5-nano', conversationText, maxFacts = 5 } = {}) {
  if (!llm || typeof llm.complete !== 'function') throw new Error('extractMemoryFacts: llm.complete obrigatorio');
  try {
    const r = await llm.complete({
      model,
      jsonMode: true,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: EXTRACT_PROMPT(conversationText, maxFacts) }],
    });
    const parsed = JSON.parse(r.text || '{}');
    return (parsed.facts || [])
      .filter((f) => f && String(f.content || '').trim())
      .slice(0, maxFacts)
      .map((f) => ({ kind: String(f.kind || 'fact'), content: String(f.content).trim() }));
  } catch {
    return [];
  }
}
