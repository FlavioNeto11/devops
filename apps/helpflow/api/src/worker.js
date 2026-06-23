// worker.js — consumidor da fila transacional. Gerado pela Forge.
import { migrate, pool } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import { dispatch } from './gateways/gateway.js';
const WORKER_ID = 'w-' + process.pid; let running = true;

// ---- RAG/pgvector: utilitários de chunking e embedding ----
function chunkText(text, maxChars, overlap) {
  maxChars = maxChars || 1800; overlap = overlap || 200;
  if (!text || text.length <= maxChars) return text ? [text.trim()] : [];
  const out = []; let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const c = text.slice(start, end).trim(); if (c) out.push(c);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return out;
}
async function generateEmbeddings(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !texts || !texts.length) return null;
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const res = await client.embeddings.create({ model: 'text-embedding-3-small', input: texts });
    return res.data.map((d) => d.embedding);
  } catch { return null; }
}
let _hasPgVec = null;
async function hasPgVector() {
  if (_hasPgVec !== null) return _hasPgVec;
  try {
    const { rows } = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='kb_chunks' AND column_name='embedding'");
    _hasPgVec = rows.length > 0;
  } catch { _hasPgVec = false; }
  return _hasPgVec;
}
// Refatia o artigo em chunks, gera embeddings (se pgvector + key disponíveis) e
// persiste em kb_chunks. Degrada graciosamente: sem embedding, armazena só texto.
// Idempotente: apaga os chunks anteriores antes de inserir os novos.
async function handleReindex(job) {
  const articleId = (job.payload || {}).articleId;
  if (!articleId) throw new Error('payload.articleId ausente');
  const row = (await pool.query('SELECT id,title,body,tenant_id FROM kb_articles WHERE id=$1', [articleId])).rows[0];
  if (!row) throw new Error('artigo não encontrado: ' + articleId);
  const text = ((row.title || '') + '\n\n' + (row.body || '')).trim();
  const chunks = chunkText(text);
  const pgVec = await hasPgVector();
  let embeddings = null;
  if (pgVec) embeddings = await generateEmbeddings(chunks);
  try { await pool.query('DELETE FROM kb_chunks WHERE tenant_id=$1 AND article_id=$2', [row.tenant_id, articleId]); } catch {}
  for (let i = 0; i < chunks.length; i++) {
    const emb = embeddings && embeddings[i];
    if (emb && pgVec) {
      try { await pool.query('INSERT INTO kb_chunks(tenant_id,article_id,chunk_index,content,embedding) VALUES($1,$2,$3,$4,$5::vector)', [row.tenant_id, articleId, i, chunks[i], JSON.stringify(emb)]); continue; } catch {}
    }
    try { await pool.query('INSERT INTO kb_chunks(tenant_id,article_id,chunk_index,content) VALUES($1,$2,$3,$4)', [row.tenant_id, articleId, i, chunks[i]]); } catch {}
  }
  await pool.query("UPDATE kb_articles SET embedding_status='indexed',updated_at=now() WHERE id=$1", [articleId]);
  console.log('[worker] reindex ok article ' + articleId + ': ' + chunks.length + ' chunks' + (embeddings ? ' + embeddings' : ' (sem embedding — sem pgvector ou sem key)'));
}

async function handle(job) {
  if (job.type === 'kb-article.reindex') return handleReindex(job);
  const id = (job.payload || {}).recordId;
  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };
  let res; try { res = await dispatch(rec); M.gatewayCalls.inc({ outcome: 'ok' }); } catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }
  await pool.query(`UPDATE records SET status='submitted', external_ref=$2, updated_at=now() WHERE id=$1`, [id, res.externalRef]);
}
async function tick() {
  const job = await jobsRepo.claim(WORKER_ID); if (!job) return false;
  const end = M.jobDuration.startTimer();
  try { await handle(job); await jobsRepo.ack(job.id); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] job ' + job.id + ' OK'); }
  catch (e) { const o = await jobsRepo.fail(job, String(e.message || e)); M.jobsTotal.inc({ status: o });
    if (o === 'dlq') { try { await pool.query(`UPDATE records SET status='failed', updated_at=now() WHERE id=$1`, [(job.payload||{}).recordId]); } catch {} }
    console.warn('[worker] job ' + job.id + ' falhou (' + job.attempts + '/' + job.max_attempts + ') -> ' + o); }
  finally { end(); } return true;
}
async function loop() { let idle = 0; while (running) { let did = false; try { did = await tick(); } catch (e) { console.error(e.message); } if (!did) { idle++; if (idle % 12 === 0) await jobsRepo.requeueStale().catch(() => {}); await new Promise((r) => setTimeout(r, 1000)); } else idle = 0; } }
process.on('SIGTERM', () => { running = false; });
(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer(); console.log('[helpflow-worker] iniciado'); await loop(); process.exit(0); })();