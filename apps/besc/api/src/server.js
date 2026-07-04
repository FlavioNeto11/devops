// API da Plataforma de Levantamento BESC Tokenizacao.
// Rotas na RAIZ (o Traefik faz strip de /besc/api). Sem login.
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as store from './store.js';
import {
  ENUMS,
  DOC_CATEGORY_LABELS,
  LEGAL_CATEGORY_LABELS,
  TOKENIZATION_CATEGORY_LABELS,
  DOCUMENT_TEMPLATE,
  LEGAL_TEMPLATE,
  TOKENIZATION_TEMPLATE,
  instantiateDocuments,
  instantiateLegal,
  instantiateTokenization,
  emptyCollateral,
  emptyPericia,
  enrichCase,
} from './domain.js';
import { CONTENT_ENUMS, CONTENT_CATEGORY_LABELS } from './domain-content.js';
import { REFERENCE, GLOSSARY } from './reference/index.js';
import { buildReport, renderReportHtml, REPORT_TYPES } from './reports.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
// CORS permissivo (mesmo origin em producao; util para debug via port-forward).
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const now = () => new Date().toISOString();

// Upload de anexos: grava no PVC (/data/uploads/<caseId>/<attId><ext>), 15 MB/arquivo.
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = store.caseUploadDir(req.params.id);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const id = randomUUID();
    const ext = (path.extname(file.originalname || '') || '').slice(0, 12);
    req._attId = id;
    req._attExt = ext;
    cb(null, `${id}${ext}`);
  },
});
const uploadAttachment = multer({ storage: uploadStorage, limits: { fileSize: 15 * 1024 * 1024, files: 1 } }).single('file');

// Upload de CONTEUDO do portal (biblioteca/jurisprudencia): limite maior (80 MB) para
// acomodar videos; nome do arquivo = id do item. Grava em LIBRARY_DIR/JURIS_DIR.
function contentUpload(destDir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => { try { mkdirSync(destDir, { recursive: true }); cb(null, destDir); } catch (e) { cb(e); } },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').slice(0, 12);
      req._ext = ext;
      cb(null, `${req.params.id}${ext}`);
    },
  });
  return multer({ storage, limits: { fileSize: 80 * 1024 * 1024, files: 1 } }).single('file');
}
const uploadLibraryFile = contentUpload(store.LIBRARY_DIR);
const uploadJurisFile = contentUpload(store.JURIS_DIR);

const CASE_FIELDS = [
  'holder_name', 'holder_tax_id', 'contact', 'holder_type', 'summary', 'origin',
  'acquisition_date', 'share_quantity', 'share_class', 'certificate_count', 'registrar',
  'notes', 'right_type', 'liquidity_status', 'estimated_value',
  // extensao do processo real (aditivo, opcional)
  'mechanism', 'target_creditor_type', 'target_creditor_name', 'legal_basis_notes', 'precedents',
];
const LAWSUIT_FIELDS = [
  'number', 'court', 'chamber', 'comarca', 'type', 'parties', 'lawyer', 'phase',
  'has_sentence', 'has_appeal', 'transited', 'claimed_value', 'updated_value', 'risk', 'next_steps',
];

function pick(src, fields) {
  const out = {};
  for (const f of fields) if (src[f] !== undefined) out[f] = src[f];
  return out;
}

// Persiste o caso, aplica auto-status e devolve a versao enriquecida (com .derived).
async function saveAndEnrich(c) {
  c.updatedAt = now();
  const before = c.status || 'new';
  const { case: enriched, changed, nextStatus } = enrichCase(c);
  if (changed) {
    c.status = nextStatus;
    c.statusHistory = c.statusHistory || [];
    c.statusHistory.push({ at: c.updatedAt, from: before, status: nextStatus, mode: 'auto' });
  }
  await store.putCase(c);
  return enriched;
}

function summarize(enriched) {
  const c = enriched;
  return {
    id: c.id,
    holder_name: c.holder_name,
    holder_tax_id: c.holder_tax_id,
    holder_type: c.holder_type,
    status: c.status,
    right_type: c.right_type,
    mechanism: c.mechanism,
    target_creditor_type: c.target_creditor_type,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    docPct: c.derived.docPct,
    pendencyCount: c.derived.pendencyCount,
    blockerCount: c.derived.blockerCount,
    risk: c.derived.risk.level,
    estimatedValue: c.derived.estimatedValue,
    suggestedStatus: c.derived.suggestedStatus,
  };
}

// --- health & meta ---
app.get('/health', (req, res) => res.json({ ok: true, service: 'besc-api', ...store.counts() }));

app.get('/meta', (req, res) => {
  res.json({
    enums: ENUMS,
    contentEnums: CONTENT_ENUMS,
    reportTypes: REPORT_TYPES,
    reference: REFERENCE,
    catalogs: {
      documents: DOCUMENT_TEMPLATE.map(({ key, label, requirement, category }) => ({ key, label, requirement, category })),
      legal: LEGAL_TEMPLATE.map(({ key, label, category }) => ({ key, label, category })),
      tokenization: TOKENIZATION_TEMPLATE.map(({ key, label, category, requiresLegal }) => ({ key, label, category, requiresLegal: !!requiresLegal })),
      docCategories: DOC_CATEGORY_LABELS,
      legalCategories: LEGAL_CATEGORY_LABELS,
      tokenizationCategories: TOKENIZATION_CATEGORY_LABELS,
      contentCategories: CONTENT_CATEGORY_LABELS,
    },
  });
});

// --- cases ---
app.get('/cases', (req, res) => {
  const list = store.listCases().map((c) => summarize(enrichCase(c).case));
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(list);
});

app.post('/cases', async (req, res) => {
  const body = req.body || {};
  const c = {
    id: randomUUID(),
    ...pick(body, CASE_FIELDS),
    holder_type: body.holder_type || 'pessoa_fisica',
    share_class: body.share_class || 'unknown',
    right_type: body.right_type || 'indeterminado',
    liquidity_status: body.liquidity_status || 'indeterminado',
    mechanism: body.mechanism || 'indefinido',
    target_creditor_type: body.target_creditor_type || 'outro',
    precedents: Array.isArray(body.precedents) ? body.precedents : [],
    status: 'new',
    lawsuits: [],
    documents: instantiateDocuments(),
    legal: instantiateLegal(),
    tokenization: instantiateTokenization(),
    collateral: emptyCollateral(),
    pericia: emptyPericia(),
    statusHistory: [{ at: now(), status: 'new', mode: 'init' }],
    createdAt: now(),
  };
  const enriched = await saveAndEnrich(c);
  res.status(201).json(enriched);
});

function loadCase(req, res) {
  const c = store.getCase(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'caso não encontrado' });
    return null;
  }
  return c;
}

app.get('/cases/:id', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  res.json(await saveAndEnrich(c));
});

app.put('/cases/:id', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  Object.assign(c, pick(req.body || {}, CASE_FIELDS));
  res.json(await saveAndEnrich(c));
});

app.delete('/cases/:id', async (req, res) => {
  const ok = await store.deleteCase(req.params.id);
  if (!ok) return res.status(404).json({ error: 'caso não encontrado' });
  res.json({ ok: true });
});

// --- lawsuits ---
app.post('/cases/:id/lawsuits', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const l = { id: randomUUID(), ...pick(req.body || {}, LAWSUIT_FIELDS), createdAt: now() };
  c.lawsuits = c.lawsuits || [];
  c.lawsuits.push(l);
  res.status(201).json(await saveAndEnrich(c));
});

app.put('/cases/:id/lawsuits/:lid', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const l = (c.lawsuits || []).find((x) => x.id === req.params.lid);
  if (!l) return res.status(404).json({ error: 'processo não encontrado' });
  Object.assign(l, pick(req.body || {}, LAWSUIT_FIELDS));
  res.json(await saveAndEnrich(c));
});

app.delete('/cases/:id/lawsuits/:lid', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  c.lawsuits = (c.lawsuits || []).filter((x) => x.id !== req.params.lid);
  res.json(await saveAndEnrich(c));
});

// --- documents ---
app.put('/cases/:id/documents/:key', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const d = (c.documents || []).find((x) => x.key === req.params.key);
  if (!d) return res.status(404).json({ error: 'documento não encontrado' });
  const body = req.body || {};
  if (body.status !== undefined && ENUMS.document_status[body.status]) d.status = body.status;
  if (body.notes !== undefined) d.notes = String(body.notes);
  if (body.source !== undefined) d.source = String(body.source);
  // refs: referências a PDFs já no acervo (jurisprudência) — sem duplicar arquivo
  if (Array.isArray(body.refs)) {
    d.refs = body.refs
      .filter((r) => r && r.jurisprudenceId)
      .map((r) => ({ jurisprudenceId: String(r.jurisprudenceId), title: r.title ? String(r.title) : '' }));
  }
  d.updatedAt = now();
  res.json(await saveAndEnrich(c));
});

// --- anexos de documentos ---
app.post('/cases/:id/documents/:key/attachments', (req, res) => {
  const c = store.getCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'caso não encontrado' });
  const doc = (c.documents || []).find((x) => x.key === req.params.key);
  if (!doc) return res.status(404).json({ error: 'documento não encontrado' });
  uploadAttachment(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'arquivo excede o limite de 15 MB' : 'falha no upload do arquivo';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
    const att = {
      id: req._attId,
      filename: req.file.originalname || 'arquivo',
      size: req.file.size,
      mime: req.file.mimetype || 'application/octet-stream',
      ext: req._attExt || '',
      uploadedAt: now(),
    };
    doc.attachments = doc.attachments || [];
    doc.attachments.push(att);
    if (doc.status === 'pending') doc.status = 'received';
    doc.updatedAt = now();
    res.status(201).json(await saveAndEnrich(c));
  });
});

app.get('/cases/:id/documents/:key/attachments/:attId/download', (req, res) => {
  const c = store.getCase(req.params.id);
  const doc = c && (c.documents || []).find((x) => x.key === req.params.key);
  const att = doc && (doc.attachments || []).find((a) => a.id === req.params.attId);
  if (!att) return res.status(404).json({ error: 'anexo não encontrado' });
  res.setHeader('Content-Type', att.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.filename || 'arquivo')}`);
  createReadStream(store.attachmentPath(req.params.id, att.id, att.ext))
    .on('error', () => { if (!res.headersSent) res.status(404).end(); })
    .pipe(res);
});

app.delete('/cases/:id/documents/:key/attachments/:attId', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const doc = (c.documents || []).find((x) => x.key === req.params.key);
  if (!doc) return res.status(404).json({ error: 'documento não encontrado' });
  const idx = (doc.attachments || []).findIndex((a) => a.id === req.params.attId);
  if (idx < 0) return res.status(404).json({ error: 'anexo não encontrado' });
  const att = doc.attachments[idx];
  await store.removeAttachmentFile(req.params.id, att.id, att.ext);
  doc.attachments.splice(idx, 1);
  doc.updatedAt = now();
  res.json(await saveAndEnrich(c));
});

// --- legal checklist ---
app.put('/cases/:id/legal/:key', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const it = (c.legal || []).find((x) => x.key === req.params.key);
  if (!it) return res.status(404).json({ error: 'item não encontrado' });
  const body = req.body || {};
  if (body.answer !== undefined && ENUMS.checklist_answer[body.answer]) it.answer = body.answer;
  if (body.notes !== undefined) it.notes = String(body.notes);
  it.updatedAt = now();
  res.json(await saveAndEnrich(c));
});

// --- tokenization checklist ---
app.put('/cases/:id/tokenization/:key', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const it = (c.tokenization || []).find((x) => x.key === req.params.key);
  if (!it) return res.status(404).json({ error: 'item não encontrado' });
  const body = req.body || {};
  if (body.answer !== undefined && ENUMS.checklist_answer[body.answer]) it.answer = body.answer;
  if (body.value !== undefined) it.value = String(body.value);
  if (body.notes !== undefined) it.notes = String(body.notes);
  it.updatedAt = now();
  res.json(await saveAndEnrich(c));
});

// --- collateral ---
app.put('/cases/:id/collateral', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const body = req.body || {};
  const col = c.collateral || emptyCollateral();
  const FIELDS = ['active', 'process_type', 'debt_value', 'required_guarantee_value', 'usage_term', 'remuneration', 'refusal_risk', 'risk_bearer', 'contract_needed', 'docs_for_judge', 'notes'];
  for (const f of FIELDS) if (body[f] !== undefined) col[f] = body[f];
  col.updatedAt = now();
  c.collateral = col;
  res.json(await saveAndEnrich(c));
});

// --- pericia / atualizacao monetaria ---
app.put('/cases/:id/pericia', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const body = req.body || {};
  const per = c.pericia || emptyPericia();
  const FIELDS = ['active', 'acquisition_price', 'acquisition_date', 'monetary_index', 'updated_value_pericial', 'agio', 'perito', 'laudo_status', 'authenticity_status', 'notes'];
  for (const f of FIELDS) if (body[f] !== undefined) per[f] = body[f];
  per.updatedAt = now();
  c.pericia = per;
  res.json(await saveAndEnrich(c));
});

// --- status (manual) ---
app.post('/cases/:id/status', async (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const status = (req.body || {}).status;
  if (!ENUMS.case_status[status]) return res.status(400).json({ error: 'status inválido' });
  // guarda de decisao: so declara "apto" se nao houver bloqueante/alta aberta
  const enriched = enrichCase(c).case;
  if (status === 'ready_for_structuring' && !enriched.derived.canConfirmReady) {
    return res.status(409).json({ error: 'ainda há pendências bloqueantes/altas; use "Apto com ressalvas" ou resolva as pendências.' });
  }
  const before = c.status;
  c.status = status;
  c.statusHistory = c.statusHistory || [];
  c.statusHistory.push({ at: now(), from: before, status, mode: 'manual' });
  res.json(await saveAndEnrich(c));
});

// --- reports ---
// resolver de precedentes: id de jurisprudencia -> item (link soft; o dominio nao acopla)
const precedentResolver = (id) => {
  const j = store.getJurisprudence(id);
  return j ? { id: j.id, title: j.title, tribunal: j.tribunal, year: j.year } : null;
};

app.get('/cases/:id/report', (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const enriched = enrichCase(c).case;
  res.json(buildReport(enriched, req.query.type, precedentResolver));
});

app.get('/cases/:id/report.html', (req, res) => {
  const c = loadCase(req, res);
  if (!c) return;
  const enriched = enrichCase(c).case;
  const report = buildReport(enriched, req.query.type, precedentResolver);
  res.set('Content-Type', 'text/html; charset=utf-8').send(renderReportHtml(report));
});

// ===========================================================================
// CONTEUDO DO PORTAL — biblioteca institucional + jurisprudencia + glossario
// (coleccoes novas; rotas na raiz; nao colidem com /cases*). Sem login (lab).
// ===========================================================================
function matchesText(obj, q) {
  const needle = String(q).toLowerCase();
  const hay = [obj.title, obj.summary, obj.ementa, obj.clientCase, obj.comarca, obj.processNumber, obj.sourceFilename, ...(obj.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle);
}
function firstOf(v) { return Array.isArray(v) ? v[0] : v; }

// --- LIBRARY ---
const LIBRARY_FIELDS = ['title', 'slug', 'kind', 'summary', 'body', 'tags', 'sourceFilename', 'externalLinks', 'hasText', 'needsOcr', 'fileRef'];
function summaryLibrary(it) {
  return {
    id: it.id, slug: it.slug, title: it.title, kind: it.kind, summary: it.summary,
    tags: it.tags || [], hasText: !!it.hasText, needsOcr: !!it.needsOcr,
    fileRef: it.fileRef ? { stored: !!it.fileRef.stored, mime: it.fileRef.mime, sizeBytes: it.fileRef.sizeBytes, ext: it.fileRef.ext } : null,
    updatedAt: it.updatedAt,
  };
}

app.get('/library', (req, res) => {
  const q = req.query || {};
  let list = store.listLibrary();
  if (q.kind) list = list.filter((it) => it.kind === q.kind);
  if (q.tag) list = list.filter((it) => (it.tags || []).includes(q.tag));
  if (q.q) list = list.filter((it) => matchesText(it, q.q));
  list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
  res.json(list.map(summaryLibrary));
});

app.get('/library/:id', (req, res) => {
  const it = store.getLibrary(req.params.id);
  if (!it) return res.status(404).json({ error: 'item não encontrado' });
  res.json(it);
});

app.get('/library/:id/file', (req, res) => {
  const it = store.getLibrary(req.params.id);
  if (!it || !it.fileRef) return res.status(404).json({ error: 'arquivo não encontrado' });
  const fp = store.libraryFilePath(it.id, it.fileRef.ext);
  res.setHeader('Content-Type', it.fileRef.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(it.sourceFilename || it.slug || it.id)}`);
  // sendFile honra HTTP Range (necessario p/ seek de video); binario ausente -> 404 gracioso
  res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'arquivo não encontrado' }); });
});

app.post('/library', async (req, res) => {
  const b = req.body || {};
  const it = { id: b.id || `lib_${randomUUID().slice(0, 12)}`, ...pick(b, LIBRARY_FIELDS), source: 'operator', createdAt: now(), updatedAt: now() };
  if (!it.slug) it.slug = it.id;
  res.status(201).json(await store.putLibrary(it));
});

app.put('/library/:id', async (req, res) => {
  const it = store.getLibrary(req.params.id);
  if (!it) return res.status(404).json({ error: 'item não encontrado' });
  Object.assign(it, pick(req.body || {}, LIBRARY_FIELDS));
  it.editedAt = now(); it.updatedAt = now();
  res.json(await store.putLibrary(it));
});

app.delete('/library/:id', async (req, res) => {
  const ok = await store.deleteLibrary(req.params.id);
  if (!ok) return res.status(404).json({ error: 'item não encontrado' });
  res.json({ ok: true });
});

app.post('/library/:id/file', (req, res) => {
  const it = store.getLibrary(req.params.id);
  if (!it) return res.status(404).json({ error: 'item não encontrado' });
  uploadLibraryFile(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'arquivo excede 80 MB' : 'falha no upload' });
    if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
    it.fileRef = { stored: true, ext: req._ext || '', mime: req.file.mimetype || 'application/octet-stream', sizeBytes: req.file.size };
    if (!it.sourceFilename) it.sourceFilename = req.file.originalname;
    it.editedAt = now(); it.updatedAt = now();
    res.status(201).json(await store.putLibrary(it));
  });
});

// --- JURISPRUDENCE ---
const JURIS_FIELDS = ['title', 'slug', 'tribunal', 'instancia', 'creditorCategory', 'mechanism', 'outcome', 'year', 'uf', 'comarca', 'clientCase', 'processNumber', 'parties', 'summary', 'ementa', 'tags', 'sourcePath', 'fileRef'];
function summaryJuris(it) {
  return {
    id: it.id, slug: it.slug, title: it.title, tribunal: it.tribunal, instancia: it.instancia,
    creditorCategory: it.creditorCategory, mechanism: it.mechanism || [], outcome: it.outcome,
    year: it.year, uf: it.uf, comarca: it.comarca, clientCase: it.clientCase, processNumber: it.processNumber,
    summary: it.summary, tags: it.tags || [],
    fileRef: it.fileRef ? { stored: !!it.fileRef.stored, mime: it.fileRef.mime, sizeBytes: it.fileRef.sizeBytes, ext: it.fileRef.ext } : null,
    updatedAt: it.updatedAt,
  };
}

app.get('/jurisprudence', (req, res) => {
  const q = req.query || {};
  let list = store.listJurisprudence();
  if (q.tribunal) list = list.filter((it) => it.tribunal === firstOf(q.tribunal));
  if (q.creditorCategory) list = list.filter((it) => it.creditorCategory === firstOf(q.creditorCategory));
  if (q.mechanism) list = list.filter((it) => (it.mechanism || []).includes(firstOf(q.mechanism)));
  if (q.outcome) list = list.filter((it) => it.outcome === firstOf(q.outcome));
  if (q.instancia) list = list.filter((it) => it.instancia === firstOf(q.instancia));
  if (q.uf) list = list.filter((it) => it.uf === firstOf(q.uf));
  if (q.year) list = list.filter((it) => String(it.year) === String(firstOf(q.year)));
  if (q.q) list = list.filter((it) => matchesText(it, q.q));
  list.sort((a, b) => (b.year || 0) - (a.year || 0) || (a.title || '').localeCompare(b.title || '', 'pt-BR'));
  res.json(list.map(summaryJuris));
});

app.get('/jurisprudence/:id', (req, res) => {
  const it = store.getJurisprudence(req.params.id);
  if (!it) return res.status(404).json({ error: 'decisão não encontrada' });
  res.json(it);
});

app.get('/jurisprudence/:id/file', (req, res) => {
  const it = store.getJurisprudence(req.params.id);
  if (!it || !it.fileRef) return res.status(404).json({ error: 'arquivo não encontrado' });
  const fp = store.jurisFilePath(it.id, it.fileRef.ext);
  res.setHeader('Content-Type', it.fileRef.mime || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(it.title || it.slug || it.id)}.pdf`);
  res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'arquivo não encontrado' }); });
});

app.post('/jurisprudence', async (req, res) => {
  const b = req.body || {};
  const it = { id: b.id || `jur_${randomUUID().slice(0, 12)}`, ...pick(b, JURIS_FIELDS), source: 'operator', createdAt: now(), updatedAt: now() };
  if (!it.slug) it.slug = it.id;
  if (!Array.isArray(it.mechanism)) it.mechanism = it.mechanism ? [it.mechanism] : [];
  res.status(201).json(await store.putJurisprudence(it));
});

app.put('/jurisprudence/:id', async (req, res) => {
  const it = store.getJurisprudence(req.params.id);
  if (!it) return res.status(404).json({ error: 'decisão não encontrada' });
  Object.assign(it, pick(req.body || {}, JURIS_FIELDS));
  it.editedAt = now(); it.updatedAt = now();
  res.json(await store.putJurisprudence(it));
});

app.delete('/jurisprudence/:id', async (req, res) => {
  const ok = await store.deleteJurisprudence(req.params.id);
  if (!ok) return res.status(404).json({ error: 'decisão não encontrada' });
  res.json({ ok: true });
});

app.post('/jurisprudence/:id/file', (req, res) => {
  const it = store.getJurisprudence(req.params.id);
  if (!it) return res.status(404).json({ error: 'decisão não encontrada' });
  uploadJurisFile(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'arquivo excede 80 MB' : 'falha no upload' });
    if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
    it.fileRef = { stored: true, ext: req._ext || '', mime: req.file.mimetype || 'application/pdf', sizeBytes: req.file.size };
    it.editedAt = now(); it.updatedAt = now();
    res.status(201).json(await store.putJurisprudence(it));
  });
});

// --- GLOSSARY (referencia canonica + termos do operador) ---
app.get('/glossary', (req, res) => {
  const opById = new Map(store.listGlossary().map((t) => [t.id, t]));
  const merged = [...GLOSSARY.map((t) => opById.get(t.id) || t)];
  for (const t of store.listGlossary()) if (!GLOSSARY.some((g) => g.id === t.id)) merged.push(t);
  merged.sort((a, b) => (a.term || '').localeCompare(b.term || '', 'pt-BR'));
  res.json(merged);
});

// --- STATS (agregados para a home do portal) ---
function tally(list, keyFn) {
  const out = {};
  for (const it of list) {
    const ks = keyFn(it);
    for (const k of (Array.isArray(ks) ? ks : [ks])) { if (k == null || k === '') continue; out[k] = (out[k] || 0) + 1; }
  }
  return out;
}
app.get('/stats', (req, res) => {
  const lib = store.listLibrary();
  const jur = store.listJurisprudence();
  res.json({
    cases: { total: store.listCases().length },
    library: { total: lib.length, byKind: tally(lib, (it) => it.kind), withFile: lib.filter((it) => it.fileRef && it.fileRef.stored).length },
    jurisprudence: {
      total: jur.length,
      byTribunal: tally(jur, (it) => it.tribunal),
      byCreditorCategory: tally(jur, (it) => it.creditorCategory),
      byMechanism: tally(jur, (it) => it.mechanism || []),
      byOutcome: tally(jur, (it) => it.outcome),
      byInstancia: tally(jur, (it) => it.instancia),
      byYear: tally(jur, (it) => (it.year ? String(it.year) : null)),
      withFile: jur.filter((it) => it.fileRef && it.fileRef.stored).length,
    },
    glossary: { total: GLOSSARY.length },
  });
});

app.use((req, res) => res.status(404).json({ error: 'rota não encontrada' }));

const PORT = process.env.PORT || 8080;
store.init().then(() => {
  app.listen(PORT, () => console.log(`[besc-api] ouvindo em :${PORT} (data em ${process.env.DATA_DIR || 'cwd/data'})`));
});
