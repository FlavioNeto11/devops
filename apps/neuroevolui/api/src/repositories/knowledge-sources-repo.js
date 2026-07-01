// repositories/knowledge-sources-repo.js — SQL das fontes da base de conhecimento (RAG).
// A tabela knowledge_sources é keyed por source_id (PK textual), sem tenant_id (RAG é global ao app).
import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { embedTexts } from '../ai/embedder.js';

const KS_SORTABLE = new Set(['source_id', 'title', 'chunk_count', 'ingested_at']);

// Tamanho de chunk do pipeline de ingestão (caracteres). Espelhado na estimativa do frontend.
const CHUNK_SIZE = 1000;

// Chunking simples e determinístico: janelas de ~CHUNK_SIZE caracteres, quebrando em
// fronteira de parágrafo/espaço quando possível para não cortar palavras no meio.
export function chunkText(text, size = CHUNK_SIZE) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      // tenta quebrar numa fronteira natural dentro da última fração da janela
      const window = clean.slice(i, end);
      const brk = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '));
      if (brk > size * 0.5) end = i + brk + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    i = end;
  }
  return chunks;
}

// Hash de conteúdo REAL (sha256 do texto normalizado) — substitui o pseudo-hash de filename
// que o frontend computava. Determinístico e estável entre re-ingestões do mesmo conteúdo.
export function hashContent(text) {
  return 'sha256-' + createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

export async function listKnowledgeSources({ page = 1, pageSize = 50, sort = 'ingested_at', dir = 'desc', q = '' } = {}) {
  const col = KS_SORTABLE.has(sort) ? sort : 'ingested_at';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  // Busca textual server-side por título OU source_id (ILIKE). Termo vazio => sem filtro.
  const term = String(q || '').trim();
  const where = term ? 'WHERE title ILIKE $1 OR source_id ILIKE $1' : '';
  const likeParam = term ? ['%' + term + '%'] : [];
  const totalRes = await pool.query(`SELECT count(*)::int n FROM knowledge_sources ${where}`, likeParam);
  const r = await pool.query(
    `SELECT source_id, title, description, source_type, url, active, content_hash, chunk_count, embedding_model, ingested_at
     FROM knowledge_sources ${where} ORDER BY ${col} ${order} LIMIT $${likeParam.length + 1} OFFSET $${likeParam.length + 2}`,
    [...likeParam, limit, offset]
  );
  return { data: r.rows, total: totalRes.rows[0].n };
}

// Agregados REAIS sobre toda a coleção (não só a página). Alimenta as métricas
// de cabeçalho da tela para que não fiquem inconsistentes com a paginação.
export async function knowledgeSourceStats() {
  const totalsRes = await pool.query(
    `SELECT count(*)::int AS total_sources,
            COALESCE(sum(chunk_count), 0)::int AS total_chunks,
            count(*) FILTER (WHERE COALESCE(chunk_count, 0) <= 0)::int AS empty_sources
       FROM knowledge_sources`
  );
  const modelsRes = await pool.query(
    `SELECT DISTINCT embedding_model FROM knowledge_sources
      WHERE embedding_model IS NOT NULL AND embedding_model <> '' ORDER BY embedding_model`
  );
  const t = totalsRes.rows[0];
  const models = modelsRes.rows.map((row) => row.embedding_model);
  return {
    total_sources: t.total_sources,
    total_chunks: t.total_chunks,
    empty_sources: t.empty_sources,
    distinct_models: models.length,
    models,
  };
}

export async function findKnowledgeSource(sourceId) {
  const r = await pool.query(
    'SELECT source_id, title, description, source_type, url, active, content_hash, chunk_count, embedding_model, ingested_at FROM knowledge_sources WHERE source_id=$1',
    [String(sourceId)]
  );
  return r.rows[0] ?? null;
}

// Cria/atualiza a fonte. Se `content` (texto real) vier no body, faz a INGESTÃO de verdade:
// chunking → INSERT em knowledge_chunks → embedding (fail-soft) → content_hash e chunk_count
// derivados do CONTEÚDO real (não de metadados do arquivo). Tudo numa transação para que a
// fonte e seus chunks fiquem consistentes. Sem `content`, mantém o caminho metadata-only
// (retrocompat para chamadas que só registram a referência).
export async function createKnowledgeSource(body) {
  const sourceId = body.source_id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const content = typeof body.content === 'string' ? body.content : '';
  const embeddingModel = body.embedding_model || null;

  if (content.trim()) {
    const chunks = chunkText(content);
    const contentHash = hashContent(content);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Upsert da fonte com hash/chunk_count REAIS do conteúdo.
      const srcRes = await client.query(
        `INSERT INTO knowledge_sources(source_id, title, content_hash, chunk_count, embedding_model)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(source_id) DO UPDATE SET title=EXCLUDED.title, content_hash=EXCLUDED.content_hash,
           chunk_count=EXCLUDED.chunk_count, embedding_model=EXCLUDED.embedding_model, ingested_at=now()
         RETURNING source_id, title, content_hash, chunk_count, embedding_model, ingested_at`,
        [sourceId, body.title || null, contentHash, chunks.length, embeddingModel]
      );
      // Re-ingestão: descarta chunks antigos desta fonte antes de inserir os novos.
      await client.query('DELETE FROM knowledge_chunks WHERE source_id=$1', [sourceId]);
      // Embedding fail-soft: se indisponível (sem chave / sem pgvector) grava os chunks SEM vetor
      // — a fonte fica "na fila" e vira pesquisável quando o índice voltar. Decidimos UMA vez se a
      // coluna `embedding` existe (pgvector) para não disparar erro por linha (que abortaria a
      // transação inteira no Postgres).
      const vectors = await embedTexts(chunks);
      const colRes = await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name='knowledge_chunks' AND column_name='embedding' LIMIT 1`
      );
      const vectorColumnExists = colRes.rowCount > 0;
      const writeVectors = vectorColumnExists && Array.isArray(vectors) && vectors.length === chunks.length;
      for (let idx = 0; idx < chunks.length; idx++) {
        const chunkId = `${sourceId}#${idx}`;
        if (writeVectors && vectors[idx]) {
          await client.query(
            `INSERT INTO knowledge_chunks(id, source_id, chunk_index, title, content, embedding)
             VALUES($1,$2,$3,$4,$5,$6::vector)
             ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, embedding=EXCLUDED.embedding`,
            [chunkId, sourceId, idx, body.title || null, chunks[idx], `[${vectors[idx].join(',')}]`]
          );
        } else {
          await client.query(
            `INSERT INTO knowledge_chunks(id, source_id, chunk_index, title, content)
             VALUES($1,$2,$3,$4,$5)
             ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content`,
            [chunkId, sourceId, idx, body.title || null, chunks[idx]]
          );
        }
      }
      await client.query('COMMIT');
      return srcRes.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // Caminho metadata-only (retrocompat): registra a referência sem ingerir conteúdo.
  const r = await pool.query(
    `INSERT INTO knowledge_sources(source_id, title, content_hash, chunk_count, embedding_model)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(source_id) DO UPDATE SET title=EXCLUDED.title, content_hash=EXCLUDED.content_hash,
       chunk_count=EXCLUDED.chunk_count, embedding_model=EXCLUDED.embedding_model
     RETURNING source_id, title, content_hash, chunk_count, embedding_model, ingested_at`,
    [sourceId, body.title || null, body.content_hash || '', Number(body.chunk_count) || 0, embeddingModel]
  );
  return r.rows[0];
}

export async function updateKnowledgeSource(sourceId, body) {
  const sets = [];
  const params = [String(sourceId)];
  let i = 2;

  // Text / nullable columns
  const textCols = { title: 'title', description: 'description', source_type: 'source_type', url: 'url', content_hash: 'content_hash', embedding_model: 'embedding_model' };
  for (const [key, col] of Object.entries(textCols)) {
    if (body[key] !== undefined) { sets.push(`${col}=$${i++}`); params.push(body[key] === '' ? null : body[key]); }
  }
  // Integer column
  if (body.chunk_count !== undefined) { sets.push(`chunk_count=$${i++}`); params.push(Number(body.chunk_count) || 0); }
  // Boolean column
  if (body.active !== undefined) { sets.push(`active=$${i++}`); params.push(body.active === true || body.active === 'true'); }

  if (sets.length === 0) return findKnowledgeSource(sourceId);
  const r = await pool.query(
    `UPDATE knowledge_sources SET ${sets.join(', ')} WHERE source_id=$1
     RETURNING source_id, title, description, source_type, url, active, content_hash, chunk_count, embedding_model, ingested_at`,
    params
  );
  return r.rows[0] ?? null;
}

export async function deleteKnowledgeSource(sourceId) {
  // ON DELETE CASCADE remove os chunks associados (FK em knowledge_chunks).
  const r = await pool.query('DELETE FROM knowledge_sources WHERE source_id=$1 RETURNING source_id', [String(sourceId)]);
  return r.rowCount > 0;
}

// Reindexação: marca a fonte como reprocessada agora (ingested_at=now()).
// Efeito honesto e observável — o timestamp "Indexado em" avança. NÃO há
// pipeline de re-embedding/re-chunk neste app: chunk_count/content_hash só mudam
// na (re)ingestão real da fonte. Retorna a linha atualizada ou null se inexistente.
export async function reindexKnowledgeSource(sourceId) {
  const r = await pool.query(
    `UPDATE knowledge_sources SET ingested_at=now() WHERE source_id=$1
     RETURNING source_id, title, description, source_type, url, active, content_hash, chunk_count, embedding_model, ingested_at`,
    [String(sourceId)]
  );
  return r.rows[0] ?? null;
}
