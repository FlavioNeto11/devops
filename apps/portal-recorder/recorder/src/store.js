// store.js — gravação da captura no Postgres (reusa o schema da api).
// O recorder grava DIRETO no banco (evita uma rota de ingest intermediária).
// Tudo que chega aqui JÁ foi redigido na origem (capture.js usa redaction.js).
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
    pool.on('error', (e) => console.error(`[db] idle error: ${e.message}`));
  }
  return pool;
}

const genId = (p) => `${p}_${crypto.randomBytes(9).toString('hex')}`;

export async function setSessionStatus(sessionId, status, { started, ended } = {}) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  if (started) sets.push('started_at = NOW()');
  if (ended) sets.push('ended_at = NOW()');
  await getPool().query(`UPDATE capture_sessions SET ${sets.join(', ')} WHERE id = $1`, [sessionId, status]);
}

export async function getSessionPortal(sessionId) {
  const { rows } = await getPool().query(
    `SELECT s.id, s.status, s.started_at, p.entry_url, p.base_origin, p.api_origins, p.slug AS portal_slug
       FROM capture_sessions s JOIN portals p ON p.id = s.portal_id WHERE s.id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

// Insere um evento de captura (request ou response) já redigido.
export async function insertEvent(sessionId, ev) {
  const id = genId('evt');
  await getPool().query(
    `INSERT INTO capture_events
       (id, session_id, seq, t_offset_ms, phase, method, url, host, path, query, status_code,
        resource_type, req_headers, resp_headers, req_body, resp_body, body_blob_ref, body_truncated,
        redacted_keys, secret_hashes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19::jsonb,$20::jsonb)`,
    [
      id, sessionId, ev.seq, ev.tOffsetMs, ev.phase, ev.method || null, ev.url, ev.host, ev.path,
      JSON.stringify(ev.query || {}), ev.statusCode ?? null, ev.resourceType || null,
      JSON.stringify(ev.reqHeaders || {}), JSON.stringify(ev.respHeaders || {}),
      ev.reqBody != null ? JSON.stringify(ev.reqBody) : null,
      ev.respBody != null ? JSON.stringify(ev.respBody) : null,
      ev.bodyBlobRef || null, Boolean(ev.bodyTruncated),
      JSON.stringify(ev.redactedKeys || []), JSON.stringify(ev.secretHashes || {}),
    ]
  );
  await getPool().query('UPDATE capture_sessions SET event_count = event_count + 1 WHERE id = $1', [sessionId]);
  return id;
}

export async function insertSessionState(sessionId, tOffsetMs, cookies) {
  const id = genId('st');
  await getPool().query(
    `INSERT INTO capture_session_state (id, session_id, t_offset_ms, cookies) VALUES ($1,$2,$3,$4::jsonb)`,
    [id, sessionId, tOffsetMs, JSON.stringify(cookies || [])]
  );
}

export async function insertScreenshot(sessionId, tOffsetMs, blobRef, { width, height, caption, annotationId } = {}) {
  const id = genId('shot');
  await getPool().query(
    `INSERT INTO capture_screenshots (id, session_id, t_offset_ms, blob_ref, width, height, caption, annotation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, sessionId, tOffsetMs, blobRef, width || null, height || null, caption || null, annotationId || null]
  );
  return id;
}
