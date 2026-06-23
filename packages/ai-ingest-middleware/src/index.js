// @flavioneto11/ai-ingest-middleware — cola HTTP: upload multipart -> ingest -> req.ingested.
// No-op em application/json (rotas JSON existentes seguem intactas). Fail-soft: erro de ingest NÃO
// vira 500 — req.ingested degrada p/ texto-vazio + nota, e o handler segue. O gate de 503 (sem chave
// de IA) continua onde está, no handler. feedBlocks() monta o content multimodal por provedor/modelo.

import multer from 'multer';
import { ingest, toMessageContent, supportsVision, supportsPdf } from '@flavioneto11/file-ingest-kit';

const empty = (note) => ({ textParts: [], blocks: [], manifest: [], notes: note ? [String(note)] : [], totalChars: 0, truncated: false, warnings: [], text: '', error: note || null });

/**
 * attachIngest({ field, maxFiles, maxBytes, ingest }) -> middleware Express.
 * Anexa req.ingested = IngestResult + .text (bundle string p/ prepender no prompt).
 */
export function attachIngest(opts = {}) {
  const field = opts.field || 'files';
  const maxFiles = opts.maxFiles || 20;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: opts.maxBytes || 10 * 1024 * 1024, files: maxFiles } }).array(field, maxFiles);
  return function attachIngestMw(req, res, next) {
    // só processa multipart — JSON segue p/ o express.json() global, sem tocar no contrato existente.
    if (!req.is || !req.is('multipart/form-data')) { req.ingested = null; return next(); }
    upload(req, res, async (err) => {
      if (err) { req.ingested = empty(err.message); return next(); }
      try {
        const files = (req.files || []).map((f) => ({ filename: f.originalname, mime: f.mimetype, bytes: f.buffer }));
        const result = await ingest(files, opts.ingest || {});
        req.ingested = { ...result, text: toMessageContent(result, { supportsVision: false }) }; // bundle string
      } catch (e) {
        req.ingested = empty(e.message);
      }
      next();
    });
  };
}

/**
 * feedBlocks(messages, ingested, { provider, model }) — funde os arquivos na ÚLTIMA mensagem user:
 * texto extraído sempre; blocos nativos (imagem/PDF) conforme o modelo. Muta+retorna messages.
 */
export function feedBlocks(messages, ingested, { provider = 'openai', model = '' } = {}) {
  if (!ingested || (!ingested.textParts?.length && !ingested.blocks?.length && !ingested.manifest?.length)) return messages;
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) { if (messages[i] && messages[i].role === 'user') { idx = i; break; } }
  const userText = idx >= 0 && typeof messages[idx].content === 'string' ? messages[idx].content : '';
  const content = toMessageContent(ingested, { provider, supportsVision: supportsVision(model), supportsPdf: supportsPdf(model), userText });
  if (idx >= 0) messages[idx] = { ...messages[idx], content };
  else messages.push({ role: 'user', content });
  return messages;
}
