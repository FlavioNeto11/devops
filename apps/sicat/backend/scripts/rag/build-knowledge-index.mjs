#!/usr/bin/env node
/**
 * Constrói o índice de conhecimento (RAG) da IA conversacional.
 * Fontes: catálogo de intents (prompt + expected_response) + docs de domínio do repo.
 * Embeddings: text-embedding-3-small (autorizado). Saída: artifacts/conversation-knowledge-index.json
 * (gitignored, regenerável). Lê OPENAI_API_KEY do ambiente/.env; NUNCA imprime a chave.
 *
 * Uso: npm run build:rag
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { OpenAIEmbeddings } from '@langchain/openai';

const ROOT = process.cwd();
const MODEL = 'text-embedding-3-small';
const OUT_PATH = resolve(ROOT, 'artifacts', 'conversation-knowledge-index.json');

// Docs de domínio do repo a indexar (conceito + fluxo + dados + CETESB + riscos), não dev-pesados.
const DOMAIN_DOCS = [
  'docs/copilot/01-visao-geral.md',
  'docs/copilot/02-arquitetura.md',
  'docs/copilot/04-fluxos-operacionais.md',
  'docs/copilot/05-modelo-de-dados.md',
  'docs/copilot/07-integracao-cetesb.md',
  'docs/copilot/08-riscos-e-lacunas.md',
  'docs/copilot/16-camada-conversacional.md'
];
const INTENT_CATALOG = 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function maskKey(key) {
  const k = String(key || '');
  return k ? `${k.slice(0, 10)}…${k.slice(-4)} (len=${k.length})` : '(ausente)';
}

function chunkIntentCatalog() {
  const path = resolve(ROOT, INTENT_CATALOG);
  if (!existsSync(path)) return [];
  const seenPrompts = new Set();
  const chunks = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let row;
    try { row = JSON.parse(t); } catch { continue; }
    const prompt = String(row.prompt || '').trim();
    const expected = String(row.expected_response || '').trim();
    if (!prompt || !expected) continue;
    const key = prompt.toLowerCase();
    if (seenPrompts.has(key)) continue; // deduplica variações idênticas
    seenPrompts.add(key);
    const category = String(row.category || '').trim();
    chunks.push({
      id: String(row.id || `intent-${chunks.length}`),
      source: 'intent-catalog',
      title: category || 'intent',
      text: `Categoria: ${category}. Pergunta do usuario: ${prompt} Como responder bem: ${expected}`
    });
  }
  return chunks;
}

function chunkDomainDoc(relPath) {
  const path = resolve(ROOT, relPath);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const name = basename(relPath);
  // Quebra por secoes de nivel 2 (## ...); cada secao vira um chunk.
  const sections = raw.split(/\n(?=##\s)/);
  const chunks = [];
  sections.forEach((section, index) => {
    const text = section.replace(/\s+\n/g, '\n').trim();
    if (text.length < 40) return; // ignora fragmentos triviais
    const titleMatch = /^#{1,3}\s+(.+)$/m.exec(text);
    const title = (titleMatch ? titleMatch[1] : name).trim().slice(0, 120);
    chunks.push({
      id: `${name}#${index}`,
      source: relPath,
      title,
      text: text.slice(0, 1800) // limita o tamanho do chunk
    });
  });
  return chunks;
}

async function main() {
  loadDotenv(resolve(ROOT, '.env'));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[build:rag] OPENAI_API_KEY ausente. Abortando.');
    process.exit(2);
  }
  console.log(`[build:rag] modelo=${MODEL} | chave=${maskKey(apiKey)}`);

  const chunks = [
    ...chunkIntentCatalog(),
    ...DOMAIN_DOCS.flatMap(chunkDomainDoc)
  ];
  if (!chunks.length) {
    console.error('[build:rag] nenhum chunk gerado (fontes ausentes?). Abortando.');
    process.exit(1);
  }
  console.log(`[build:rag] chunks: ${chunks.length} (intents + docs). Gerando embeddings...`);

  const embedder = new OpenAIEmbeddings({ apiKey, model: MODEL });
  const vectors = await embedder.embedDocuments(chunks.map((c) => c.text));
  const indexed = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));

  mkdirSync(resolve(ROOT, 'artifacts'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({
    version: 2,
    model: MODEL,
    builtAt: new Date().toISOString(),
    chunks: indexed
  }));
  const dims = vectors[0]?.length || 0;
  console.log(`[build:rag] OK — ${indexed.length} chunks (dim=${dims}) salvos em artifacts/conversation-knowledge-index.json`);
}

main().catch((err) => {
  console.error('[build:rag] erro inesperado:', err?.message || err);
  process.exit(1);
});
