import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  hashContent, chunkMarkdownSections, createEmbedder, createPgVectorStore,
} from '@flavioneto11/ai-core';
import { query } from '../../../db/pool.js';
import { getAiConfig, hasOpenAiApiKey } from '../ai-config.js';
import { KNOWLEDGE_EMBEDDING_MODEL } from './conversation-knowledge-service.js';

/**
 * Ingestão da base de conhecimento no pgvector (F2). INCREMENTAL: cada fonte tem
 * hash de conteúdo registrado em knowledge_sources — só re-embeda o que mudou.
 * Fontes: docs de domínio (docs/copilot) + catálogo de intents. Roda no boot do
 * worker (best-effort, nunca derruba o processo) e via `npm run rag:ingest`.
 */

const DOMAIN_DOCS = [
  'docs/copilot/01-visao-geral.md',
  'docs/copilot/02-arquitetura.md',
  'docs/copilot/04-fluxos-operacionais.md',
  'docs/copilot/05-modelo-de-dados.md',
  'docs/copilot/07-integracao-cetesb.md',
  'docs/copilot/08-riscos-e-lacunas.md',
  'docs/copilot/16-camada-conversacional.md',
  'docs/copilot/17-ferramentas-e-roteamento.md'
];
const INTENT_CATALOG = 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl';

type SourceChunks = { sourceId: string; raw: string; chunks: { id: string; index: number; title?: string; content: string }[] };

function collectIntentCatalog(): SourceChunks | null {
  const path = resolve(process.cwd(), INTENT_CATALOG);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const seenPrompts = new Set<string>();
  const chunks: SourceChunks['chunks'] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let row: Record<string, unknown>;
    try { row = JSON.parse(t); } catch { continue; }
    const prompt = String(row.prompt || '').trim();
    const expected = String(row.expected_response || '').trim();
    if (!prompt || !expected) continue;
    const key = prompt.toLowerCase();
    if (seenPrompts.has(key)) continue; // deduplica variações idênticas
    seenPrompts.add(key);
    const category = String(row.category || '').trim();
    chunks.push({
      id: `intent-catalog#${chunks.length}`,
      index: chunks.length,
      title: category || 'intent',
      content: `Categoria: ${category}. Pergunta do usuario: ${prompt} Como responder bem: ${expected}`
    });
  }
  return { sourceId: 'intent-catalog', raw, chunks };
}

function collectDomainDoc(relPath: string): SourceChunks | null {
  const path = resolve(process.cwd(), relPath);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const sections = chunkMarkdownSections(raw, { maxChars: 1100, overlap: 140, fallbackTitle: basename(relPath) });
  return {
    sourceId: relPath,
    raw,
    chunks: sections.map((s) => ({ id: `${relPath}#${s.index}`, index: s.index, title: s.title, content: s.content }))
  };
}

export type IngestSummary = {
  status: 'ok' | 'skipped';
  reason?: string;
  ingested: { sourceId: string; chunkCount: number }[];
  unchanged: number;
  pruned: number;
  totalChunks: number;
};

/** Ingere (incremental) todas as fontes; `force` re-embeda tudo. */
export async function ingestKnowledge({ force = false }: { force?: boolean } = {}): Promise<IngestSummary> {
  if (!hasOpenAiApiKey()) {
    return { status: 'skipped', reason: 'OPENAI_API_KEY ausente', ingested: [], unchanged: 0, pruned: 0, totalChunks: 0 };
  }
  const config = getAiConfig();
  const langchainEmbedder = new OpenAIEmbeddings({ apiKey: config.openAiApiKey, model: KNOWLEDGE_EMBEDDING_MODEL });
  const embedder = createEmbedder({
    embedFn: (texts: string[]) => langchainEmbedder.embedDocuments(texts),
    batchSize: 128,
    dimensions: 1536
  });
  const store = createPgVectorStore({ query });

  const sources = [collectIntentCatalog(), ...DOMAIN_DOCS.map(collectDomainDoc)]
    .filter((s): s is SourceChunks => Boolean(s && s.chunks.length));

  const ingested: { sourceId: string; chunkCount: number }[] = [];
  let unchanged = 0;
  for (const source of sources) {
    const contentHash = hashContent(source.raw);
    if (!force) {
      const existing = await store.getSourceHash(source.sourceId);
      if (existing === contentHash) {
        unchanged += 1;
        continue;
      }
    }
    const embeddings = await embedder.embedBatch(source.chunks.map((c) => c.content));
    if (embeddings.length !== source.chunks.length) {
      throw new Error(`embeddings (${embeddings.length}) != chunks (${source.chunks.length}) em ${source.sourceId}`);
    }
    await store.upsertSource({
      sourceId: source.sourceId,
      contentHash,
      embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
      chunks: source.chunks.map((c, i) => ({ ...c, embedding: embeddings[i] as number[] }))
    });
    ingested.push({ sourceId: source.sourceId, chunkCount: source.chunks.length });
    console.log(`[rag:ingest] ${source.sourceId}: ${source.chunks.length} chunks`);
  }

  const pruned = await store.pruneSources(sources.map((s) => s.sourceId));
  const stats = await store.stats();
  return { status: 'ok', ingested, unchanged, pruned, totalChunks: stats.chunks };
}

/** Boot do worker: ingestão best-effort (nunca derruba o processo). */
export async function ingestKnowledgeOnBoot(): Promise<void> {
  if ((process.env.KNOWLEDGE_INGEST_ON_BOOT ?? 'true').toLowerCase() === 'false') return;
  try {
    const summary = await ingestKnowledge();
    if (summary.status === 'ok') {
      console.log(`[rag:ingest] base pronta — ${summary.totalChunks} chunks (${summary.ingested.length} fontes novas/alteradas, ${summary.unchanged} inalteradas, ${summary.pruned} removidas)`);
    } else {
      console.log(`[rag:ingest] pulado: ${summary.reason}`);
    }
  } catch (error) {
    console.warn('[rag:ingest] falhou (segue sem atualizar a base):', (error as Error).message);
  }
}
