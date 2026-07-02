// =============================================================================
// Base de conhecimento do usuário (PME): ingere catálogo/FAQ/preços (texto/PDF/docx/
// imagem via file-ingest-kit), faz chunk + embeddings e grava em knowledge_chunks
// (createPgVectorStore do ai-core), escopado por user no source_id `kb:<userId>:<nome>`.
// =============================================================================
import { aiDbEnabled, query } from './pg';
import { getEmbedder } from './ai.service';
import { loadAiCore, loadFileIngest } from './ai-core-loader';

function sourceId(userId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fonte';
  return `kb:${userId}:${slug}`;
}

/** Ingere um texto markdown/plain como fonte de conhecimento. */
export async function ingestText(userId: string, name: string, text: string): Promise<{ sourceId: string; chunks: number }> {
  if (!aiDbEnabled()) throw Object.assign(new Error('IA indisponível'), { status: 503 });
  const embedderObj = getEmbedder();
  if (!embedderObj) throw Object.assign(new Error('Embeddings indisponíveis (sem OPENAI_API_KEY)'), { status: 503 });
  const core = await loadAiCore();
  const sid = sourceId(userId, name);
  const chunks = core.chunkMarkdownSections(text, { maxChars: 1100, overlap: 140, fallbackTitle: name });
  if (!chunks.length) return { sourceId: sid, chunks: 0 };
  const embedder = core.createEmbedder({ embedFn: (t: string[]) => embedderObj.embedFn(t), dimensions: 1536 });
  const vectors = await embedder.embedBatch(chunks.map((c) => c.content));
  const store = core.createPgVectorStore({ query });
  const contentHash = core.hashContent(text);
  await store.upsertSource({
    sourceId: sid,
    contentHash,
    embeddingModel: 'text-embedding-3-small',
    chunks: chunks.map((c, i) => ({ id: `${sid}#${c.index}`, index: c.index, title: c.title, content: c.content, embedding: vectors[i]! })),
  });
  return { sourceId: sid, chunks: chunks.length };
}

/** Ingere arquivos (PDF/docx/imagem/csv/txt) via file-ingest-kit. */
export async function ingestFiles(
  userId: string,
  files: Array<{ filename: string; mime: string; bytes: Buffer }>,
): Promise<Array<{ name: string; sourceId: string; chunks: number }>> {
  const ingest = await loadFileIngest();
  const result = await ingest.ingest(files.map((f) => ({ filename: f.filename, mime: f.mime, bytes: f.bytes })));
  const out: Array<{ name: string; sourceId: string; chunks: number }> = [];
  for (const part of result.textParts ?? []) {
    if (!part.text?.trim()) continue;
    const r = await ingestText(userId, part.name, part.text);
    out.push({ name: part.name, ...r });
  }
  return out;
}

export interface KbSource {
  sourceId: string;
  name: string;
  chunks: number;
  ingestedAt: string;
}

export async function listSources(userId: string): Promise<KbSource[]> {
  if (!aiDbEnabled()) return [];
  const r = await query<{ source_id: string; chunk_count: number; ingested_at: string }>(
    `select source_id, chunk_count, ingested_at from knowledge_sources where source_id like $1 order by ingested_at desc`,
    [`kb:${userId}:%`],
  ).catch(() => ({ rows: [] as never[] }));
  return r.rows.map((row) => ({
    sourceId: row.source_id,
    name: row.source_id.split(':').slice(2).join(':'),
    chunks: row.chunk_count,
    ingestedAt: row.ingested_at,
  }));
}

export async function removeSource(userId: string, sid: string): Promise<void> {
  if (!aiDbEnabled() || !sid.startsWith(`kb:${userId}:`)) return;
  // FK on delete cascade remove os chunks.
  await query(`delete from knowledge_sources where source_id = $1`, [sid]).catch(() => undefined);
}

/** Expurgo da KB do usuário (disconnect / apagar dados de IA). */
export async function purgeUserKnowledge(userId: string): Promise<void> {
  if (!aiDbEnabled()) return;
  await query(`delete from knowledge_sources where source_id like $1`, [`kb:${userId}:%`]).catch(() => undefined);
}
