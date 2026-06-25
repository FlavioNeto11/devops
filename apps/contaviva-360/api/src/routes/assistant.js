// routes/assistant.js — Assistente de IA contábil (REQ-CONTAVIVA360-0007).
// POST /v1/assistant — JSON ou multipart/form-data (com arquivos).
// GET  /v1/assistant/health — { ai: true|false }.
// POST /v1/assistant/confirm-draft — persiste um rascunho confirmado pelo usuário.
// Fail-closed: sem chave de IA → 503. Fail-soft: arquivo ilegível não derruba a rota.
import { pool } from '../db.js';
import { getLlm, getEmbedder } from '../ai/llm.js';
import { runAssistantTurn } from '../ai/graph.js';
import { searchKnowledge, formatRagContext, ingestDocument } from '../ai/rag.js';

// Parse multipart sem SDK externo (usa busboy via transitive dep de multer/ai-ingest-middleware)
async function parseMultipart(rawReq) {
  let Busboy;
  try { ({ default: Busboy } = await import('busboy')); } catch { return { files: [], fields: {} }; }
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: rawReq.headers, limits: { fileSize: 10 * 1024 * 1024, files: 20 } });
    const files = [];
    const fields = {};
    bb.on('file', (fieldname, stream, info) => {
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('close', () => files.push({ filename: info.filename || 'arquivo', mime: info.mimeType || 'application/octet-stream', bytes: Buffer.concat(chunks) }));
      stream.resume();
    });
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('close', () => resolve({ files, fields }));
    bb.on('error', (e) => resolve({ files: [], fields: {}, error: e.message })); // fail-soft
    rawReq.pipe(bb);
  });
}

// Ingere arquivos via file-ingest-kit (fail-soft: erro em arquivo não derruba)
async function ingestFiles(files, llm) {
  if (!files || !files.length) return { ingested: null, manifest: [] };
  try {
    const fik = await import('@flavioneto11/file-ingest-kit');
    const result = await fik.ingest(files);
    const provider = llm?.provider === 'anthropic' ? 'anthropic' : 'openai';
    const model = llm?.model || '';
    const userContent = fik.toMessageContent(result, {
      provider,
      supportsVision: fik.supportsVision(model),
      supportsPdf: fik.supportsPdf(model),
    });
    const manifest = (result.manifest || []).map((f) => ({ path: f.path || f.filename, type: f.type || f.mime, status: f.status || 'ok' }));
    return { ingested: result, userContent, manifest };
  } catch (e) {
    return { ingested: null, userContent: null, manifest: [], error: e.message };
  }
}

// Registra no log de auditoria (fail-soft: erro de log não derruba a resposta)
async function auditLog({ tenantId, conversationId, question, answer, toolsUsed, filesManifest, confirmations, durationMs }) {
  try {
    await pool.query(
      `INSERT INTO assistant_audit_log(tenant_id, conversation_id, question, answer, tools_used, files_manifest, confirmations, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, conversationId || null, String(question || '').slice(0, 4000), String(answer || '').slice(0, 4000), JSON.stringify(toolsUsed || []), JSON.stringify(filesManifest || []), JSON.stringify(confirmations || []), durationMs || null],
    );
  } catch { /* auditoria fail-soft */ }
}

export function registerAssistantRoutes(app) {

  // GET /v1/assistant/health — status do provedor de IA
  app.get('/v1/assistant/health', async (req, reply) => {
    const llm = await getLlm();
    if (!llm) { reply.code(503); return { ai: false, reason: 'sem chave de IA configurada (fail-closed)' }; }
    return { ai: true, provider: llm.provider, model: llm.model };
  });

  // POST /v1/assistant — chat com o assistente contábil
  // Aceita JSON { message, conversation_id, history? } OU multipart { message, files[], conversation_id }
  app.post('/v1/assistant', async (req, reply) => {
    const t0 = Date.now();
    const llm = await getLlm();
    if (!llm) { reply.code(503); return { error: { code: 'AI_DISABLED', message: 'Assistente de IA desabilitado. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY.' } }; }

    const tenantId = req.tenantId || 1;
    const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
    let message = '';
    let conversationId = null;
    let history = [];
    let files = [];

    if (isMultipart) {
      // Fastify não consome o raw stream para multipart — parseamos via busboy
      const { files: rawFiles, fields, error } = await parseMultipart(req.raw);
      message = fields.message || fields.text || '';
      conversationId = fields.conversation_id || null;
      if (fields.history) { try { history = JSON.parse(fields.history); } catch {} }
      files = rawFiles;
      if (error) { /* fail-soft: log mas segue sem arquivos */ }
    } else {
      const body = req.body || {};
      message = String(body.message || body.text || '').trim();
      conversationId = body.conversation_id || null;
      history = Array.isArray(body.history) ? body.history : [];
    }

    if (!message && !files.length) {
      reply.code(400);
      return { error: { message: 'message ou arquivo obrigatório' } };
    }

    // Ingere arquivos (fail-soft)
    const { userContent, manifest: filesManifest } = await ingestFiles(files, llm);

    // Busca RAG para enriquecer o contexto (fail-soft: erro não derruba)
    let ragContext = '';
    if (message) {
      try {
        const hits = await searchKnowledge(pool, message);
        ragContext = formatRagContext(hits);
      } catch { /* fail-soft */ }
    }

    // Monta a mensagem final com contexto RAG
    const fullMessage = message + ragContext;

    let chatResult;
    try {
      chatResult = await runAssistantTurn({
        pool, tenantId, message: fullMessage, history, conversationId, userContent,
        identity: { sub: String(tenantId) },
      });
    } catch (e) {
      if (e?.code === 'AI_DISABLED' || String(e?.message).includes('sem chave')) {
        reply.code(503);
        return { error: { code: 'AI_DISABLED', message: 'offline, consulte seu contador' } };
      }
      reply.code(500);
      return { error: { message: e?.message || 'Erro interno do assistente' } };
    }

    const durationMs = Date.now() - t0;

    // Auditoria assíncrona (não bloqueia a resposta)
    auditLog({ tenantId, conversationId, question: message, answer: chatResult.answer, toolsUsed: chatResult.tools_used, filesManifest, confirmations: [], durationMs });

    return {
      answer: chatResult.answer,
      text: chatResult.answer,
      citations: chatResult.citations || [],
      draft: chatResult.draft || null,
      tools_used: chatResult.tools_used || [],
      grounded: chatResult.grounded || false,
      files: filesManifest,
      conversation_id: conversationId,
      usage: chatResult.usage || null,
    };
  });

  // POST /v1/assistant/confirm-draft — confirma e persiste um rascunho proposto pela IA
  app.post('/v1/assistant/confirm-draft', async (req, reply) => {
    const body = req.body || {};
    const { draft_id, draft_type, draft_data, conversation_id } = body;
    if (!draft_id || !draft_data) {
      reply.code(400);
      return { error: { message: 'draft_id e draft_data são obrigatórios' } };
    }
    const tenantId = req.tenantId || 1;
    // Persiste o rascunho confirmado como documento
    const { rows } = await pool.query(
      `INSERT INTO assistant_drafts(tenant_id, draft_id, draft_type, draft_data, conversation_id, status)
       VALUES ($1,$2,$3,$4,$5,'confirmado') RETURNING *`,
      [tenantId, String(draft_id), String(draft_type || draft_data.tipo || 'rascunho'), JSON.stringify(draft_data), conversation_id || null],
    );
    // Auditoria
    auditLog({ tenantId, conversationId: conversation_id, question: `confirm-draft:${draft_id}`, answer: 'draft_confirmado', toolsUsed: [], filesManifest: [], confirmations: [{ draft_id, draft_type }], durationMs: 0 });
    reply.code(201);
    return { status: 'confirmado', draft: rows[0] };
  });

  // POST /v1/assistant/ingest — ingere um documento na base de conhecimento RAG
  app.post('/v1/assistant/ingest', async (req, reply) => {
    const llm = await getLlm();
    if (!llm) { reply.code(503); return { error: { message: 'IA desabilitada' } }; }
    const embedder = await getEmbedder();
    if (!embedder) { reply.code(503); return { error: { message: 'Embedder indisponível (requer OPENAI_API_KEY)' } }; }
    const body = req.body || {};
    const { source_id, title, content } = body;
    if (!source_id || !content) {
      reply.code(400);
      return { error: { message: 'source_id e content são obrigatórios' } };
    }
    const tenantId = req.tenantId || 1;
    try {
      const result = await ingestDocument(pool, { sourceId: `${tenantId}:${source_id}`, title, content, tenantId });
      return result;
    } catch (e) {
      reply.code(500);
      return { error: { message: e?.message || 'Erro na ingestão' } };
    }
  });
}
