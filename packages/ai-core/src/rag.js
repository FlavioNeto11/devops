// rag.js — base de conhecimento da plataforma de IA (F2): chunking, embeddings,
// store pgvector (HNSW) com ingestão INCREMENTAL por hash e re-rank por LLM.
//
// Tudo estrutural (padrão ai-core): o app injeta `query(sql, params)` (pg),
// `embedFn(texts) → vetores` (OpenAI nativo OU LangChain) e o `llm` do re-rank.
// Falha de RAG nunca derruba o turno — quem chama decide o fallback ([]).

import { createHash } from 'node:crypto';

/** Hash estável do conteúdo de uma fonte (ingestão incremental). */
export function hashContent(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/**
 * Divide texto longo COM SOBREPOSIÇÃO, preferindo quebras naturais
 * (parágrafo > sentença > espaço). Evita truncar seções longas (recall).
 */
export function splitWithOverlap(text, { maxChars = 1100, overlap = 140, minChars = 40 } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return clean.length >= minChars ? [clean] : [];
  const pieces = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const para = window.lastIndexOf('\n\n');
      const sent = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf('? '), window.lastIndexOf('! '));
      const sp = window.lastIndexOf(' ');
      const half = maxChars * 0.5;
      const cut = para > half ? para + 2 : sent > half ? sent + 1 : sp > half ? sp + 1 : window.length;
      end = start + cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece.length >= minChars) pieces.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return pieces;
}

/**
 * Chunking de markdown por seções de nível 2 (## ...); seções longas são
 * subdivididas com overlap. Retorna [{ index, title, content }].
 */
export function chunkMarkdownSections(markdown, { maxChars = 1100, overlap = 140, minChars = 40, fallbackTitle = 'doc' } = {}) {
  const sections = String(markdown || '').split(/\n(?=##\s)/);
  const chunks = [];
  sections.forEach((section) => {
    const text = section.replace(/\s+\n/g, '\n').trim();
    if (text.length < minChars) return;
    const titleMatch = /^#{1,3}\s+(.+)$/m.exec(text);
    const title = (titleMatch ? titleMatch[1] : fallbackTitle).trim().slice(0, 120);
    for (const part of splitWithOverlap(text, { maxChars, overlap, minChars })) {
      chunks.push({ index: chunks.length, title, content: part });
    }
  });
  return chunks;
}

/**
 * Embedder estrutural: `embedFn(texts: string[]) → Promise<number[][]>` vem do
 * app (OpenAI nativo: client.embeddings.create; LangChain: embedDocuments).
 * Faz batching e valida dimensões.
 */
export function createEmbedder({ embedFn, batchSize = 128, dimensions } = {}) {
  if (typeof embedFn !== 'function') throw new Error('createEmbedder: embedFn obrigatorio');
  async function embedBatch(texts) {
    const out = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const vectors = await embedFn(texts.slice(i, i + batchSize));
      for (const v of vectors) {
        if (dimensions && v.length !== dimensions) {
          throw new Error(`embedding com ${v.length} dims (esperado ${dimensions})`);
        }
        out.push(v);
      }
    }
    return out;
  }
  return {
    embedBatch,
    embedQuery: async (text) => (await embedBatch([text]))[0],
  };
}

function toVectorLiteral(embedding) {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

/**
 * Store pgvector estrutural sobre `query(sql, params)` (pg). Tabelas criadas
 * pela migration do app (knowledge_sources + knowledge_chunks com vector + HNSW).
 */
export function createPgVectorStore({ query, chunksTable = 'knowledge_chunks', sourcesTable = 'knowledge_sources' } = {}) {
  if (typeof query !== 'function') throw new Error('createPgVectorStore: query obrigatorio');

  return {
    /** Hash registrado da fonte (null se nunca ingerida). */
    async getSourceHash(sourceId) {
      const r = await query(`select content_hash from ${sourcesTable} where source_id = $1`, [sourceId]);
      return r.rows?.[0]?.content_hash ?? null;
    },

    /** Substitui os chunks de uma fonte (delete + insert) e registra o hash. */
    async upsertSource({ sourceId, contentHash, embeddingModel, chunks }) {
      await query(`delete from ${chunksTable} where source_id = $1`, [sourceId]);
      await query(
        `insert into ${sourcesTable} (source_id, content_hash, chunk_count, embedding_model, ingested_at)
         values ($1, $2, $3, $4, now())
         on conflict (source_id) do update
           set content_hash = excluded.content_hash,
               chunk_count = excluded.chunk_count,
               embedding_model = excluded.embedding_model,
               ingested_at = now()`,
        [sourceId, contentHash, chunks.length, embeddingModel || null],
      );
      for (const c of chunks) {
        await query(
          `insert into ${chunksTable} (id, source_id, chunk_index, title, content, embedding)
           values ($1, $2, $3, $4, $5, $6::vector)`,
          [c.id, sourceId, c.index, c.title ?? null, c.content, toVectorLiteral(c.embedding)],
        );
      }
      return { sourceId, chunkCount: chunks.length };
    },

    /** Remove fontes que não estão mais na lista ativa (prune da base). */
    async pruneSources(activeSourceIds) {
      if (!activeSourceIds?.length) return 0;
      const r = await query(
        `delete from ${sourcesTable} where source_id <> all($1::text[])`,
        [activeSourceIds],
      );
      return r.rowCount ?? 0;
    },

    /** Busca por similaridade (cosine) no HNSW. Retorna score = 1 - distância. */
    async search(embedding, { k = 6 } = {}) {
      const r = await query(
        `select id, source_id, title, content, 1 - (embedding <=> $1::vector) as score
           from ${chunksTable}
          order by embedding <=> $1::vector
          limit $2`,
        [toVectorLiteral(embedding), k],
      );
      return (r.rows || []).map((row) => ({
        id: row.id,
        source: row.source_id,
        title: row.title ?? undefined,
        text: row.content,
        score: Number(row.score) || 0,
      }));
    },

    async stats() {
      const [c, s] = await Promise.all([
        query(`select count(*)::int as n from ${chunksTable}`),
        query(`select count(*)::int as n from ${sourcesTable}`),
      ]);
      return { chunks: c.rows?.[0]?.n ?? 0, sources: s.rows?.[0]?.n ?? 0 };
    },
  };
}

const RERANK_PROMPT = (queryText, hits) => `Voce e um RE-RANKER de trechos de conhecimento para uma consulta.
Pontue a RELEVANCIA de cada trecho para responder a consulta (0 = irrelevante, 1 = responde diretamente).

CONSULTA: ${queryText}

TRECHOS:
${hits.map((h, i) => `[${i}] (${h.source}${h.title ? ` › ${h.title}` : ''}) ${String(h.text).slice(0, 500)}`).join('\n')}

Responda APENAS JSON: {"scores":[{"i":<indice>,"s":<0..1>}, ...]} cobrindo TODOS os indices.`;

/**
 * Re-ranker por LLM (gpt-5-nano): re-pontua os top-K do HNSW antes de cortar
 * para top-N. Defensivo: em erro/saída inválida, devolve a ordem original.
 */
export function createReranker({ llm, model = 'gpt-5-nano' } = {}) {
  if (!llm || typeof llm.complete !== 'function') throw new Error('createReranker: llm.complete obrigatorio');
  return {
    async rerank(queryText, hits, { topN = 6 } = {}) {
      if (!hits?.length || hits.length <= 1) return hits ?? [];
      try {
        const r = await llm.complete({
          model,
          jsonMode: true,
          reasoningEffort: 'minimal',
          messages: [{ role: 'user', content: RERANK_PROMPT(queryText, hits) }],
        });
        const parsed = JSON.parse(r.text || '{}');
        const byIndex = new Map((parsed.scores || []).map((s) => [Number(s.i), Number(s.s)]));
        if (!byIndex.size) return hits.slice(0, topN);
        return hits
          .map((h, i) => ({ ...h, rerankScore: Number.isFinite(byIndex.get(i)) ? byIndex.get(i) : 0 }))
          .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0) || b.score - a.score)
          .slice(0, topN);
      } catch {
        return hits.slice(0, topN);
      }
    },
  };
}
