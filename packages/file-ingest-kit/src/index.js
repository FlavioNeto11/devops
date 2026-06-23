// @flavioneto11/file-ingest-kit — converte ARQUIVOS enviados em conteúdo para a IA.
// ingest(files) -> IngestResult { textParts, blocks, manifest, notes, totalChars, truncated }.
// Provider-agnóstico: produz TEXTO (todos os provedores) + BLOCOS nativos (imagem/PDF) p/ modelos
// com visão. toMessageContent() monta o `content` da mensagem por provedor. Deps de extração são
// OPCIONAIS e carregadas sob demanda (lazy) — sem a lib, o formato vira "name-only" (não quebra).
// Determinístico, fail-soft por arquivo (um arquivo ruim = nota; os outros seguem).

// ---- limites padrão ----------------------------------------------------------
export const DEFAULTS = {
  maxFileBytes: 10 * 1024 * 1024,   // por arquivo
  maxFiles: 20,
  maxTotalChars: 120_000,           // orçamento global (~30k tokens)
  perFileChars: 30_000,
  csvMaxRows: 200,
  xlsxMaxRowsPerSheet: 500,
  xlsxMaxSheets: 20,
  zipMaxDepth: 3,
  zipMaxEntries: 200,
  zipMaxTotalUncompressedBytes: 50 * 1024 * 1024,
  dropImagesIfNoVision: true,
};

const IMG_MEDIA = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'text', 'log', 'json', 'yaml', 'yml']);

function toBuf(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'base64'); // base64 por convenção
  return Buffer.alloc(0);
}
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function detectType(name, mime) {
  const e = extOf(name);
  if (TEXT_EXT.has(e)) return 'text';
  if (e === 'csv') return 'csv';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (e === 'doc') return 'doc-legacy';
  if (e === 'xlsx' || e === 'xlsm' || e === 'xls') return 'xls';
  if (e === 'pptx') return 'pptx';
  if (e === 'ppt') return 'ppt-legacy';
  if (e === 'zip') return 'zip';
  if (IMG_MEDIA[e]) return 'image';
  // fallback por mime
  const mt = String(mime || '');
  if (mt.startsWith('text/')) return 'text';
  if (mt === 'application/pdf') return 'pdf';
  if (mt.startsWith('image/')) return 'image';
  if (mt === 'application/zip') return 'zip';
  if (mt.includes('wordprocessingml')) return 'docx';
  if (mt.includes('spreadsheetml') || mt === 'application/vnd.ms-excel') return 'xls';
  if (mt.includes('presentationml')) return 'pptx';
  return 'unknown';
}
async function lazy(mod) { try { const m = await import(mod); return m.default || m; } catch { return null; } }
function clamp(text, max) { if (text == null) return { text: '', cut: false }; const s = String(text); return s.length > max ? { text: s.slice(0, max), cut: true } : { text: s, cut: false }; }

// csv -> tabela markdown (cap de linhas)
function csvToMarkdown(text, maxRows) {
  const rows = String(text).split(/\r?\n/).filter((r) => r.length).slice(0, maxRows + 1);
  if (!rows.length) return '';
  const cells = rows.map((r) => r.split(','));
  const head = cells[0];
  const sep = head.map(() => '---');
  const body = cells.slice(1);
  const fmt = (a) => '| ' + a.join(' | ') + ' |';
  const lines = [fmt(head), fmt(sep), ...body.map(fmt)];
  const more = String(text).split(/\r?\n/).filter((r) => r.length).length - rows.length;
  if (more > 0) lines.push(`_… +${more} linhas omitidas_`);
  return lines.join('\n');
}

// pdf -> texto, robusto a pdf-parse v1 (default callable) E v2 (classe PDFParse({data}).getText()).
// Retorna null = lib ausente; '' = lib presente mas sem texto (PDF escaneado); string = texto extraído.
async function extractPdfText(buf) {
  let mod;
  try { mod = await import('pdf-parse'); } catch { return null; }
  const m = mod && mod.default ? mod.default : mod;
  // v1: módulo é a própria função
  if (typeof m === 'function') { const r = await m(buf); return String((r && r.text) || ''); }
  // v2: classe PDFParse({ data }).getText() -> { text }; sempre destroy()
  const PDFParse = (m && m.PDFParse) || (mod && mod.PDFParse);
  if (typeof PDFParse === 'function') {
    const parser = new PDFParse({ data: buf });
    try { const r = await parser.getText(); return String((r && r.text) || ''); }
    finally { if (parser && typeof parser.destroy === 'function') { try { await parser.destroy(); } catch { /* noop */ } } }
  }
  return '';
}

// pptx -> texto dos slides (sem lib extra além do jszip)
async function pptxText(buf) {
  const JSZip = await lazy('jszip');
  if (!JSZip) return null;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  const parts = [];
  for (const n of names) {
    const xml = await zip.files[n].async('string');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    if (runs.length) parts.push('### ' + n.replace(/^ppt\/slides\//, '') + '\n' + runs.join(' '));
  }
  return parts.join('\n\n');
}

// extrai UM arquivo -> { textParts[], blocks[], manifestRow, notes[] }
async function extractOne(name, buf, type, opts, depthInfo) {
  const out = { textParts: [], blocks: [], notes: [] };
  const row = { path: depthInfo?.path || name, type, bytes: buf.length, chars: 0, status: 'ok' };
  const pushText = (text, source) => { const c = clamp(text, opts.perFileChars); row.chars = c.text.length; if (c.cut) row.status = 'truncated'; out.textParts.push({ name, text: c.text, source: source || type, truncated: c.cut }); };

  try {
    if (buf.length > opts.maxFileBytes) { row.status = 'skipped'; out.notes.push(`${name}: arquivo > ${opts.maxFileBytes} bytes — pulado.`); return { ...out, row }; }
    switch (type) {
      case 'text': pushText(buf.toString('utf8')); break;
      case 'csv': pushText(csvToMarkdown(buf.toString('utf8'), opts.csvMaxRows), 'csv'); break;
      case 'image': {
        row.status = 'image';
        out.blocks.push({ type: 'image', name, mediaType: IMG_MEDIA[extOf(name)] || 'image/png', dataBase64: buf.toString('base64') });
        break;
      }
      case 'pdf': {
        out.blocks.push({ type: 'document', name, mediaType: 'application/pdf', dataBase64: buf.toString('base64') });
        let pdfText = null; // null = lib ausente; '' = sem texto (escaneado); string = texto
        try { pdfText = await extractPdfText(buf); } catch (e) { out.notes.push(`${name}: PDF texto não extraído (${e.message}); bloco nativo disponível p/ Claude.`); pdfText = ''; }
        if (pdfText == null) out.notes.push(`${name}: pdf-parse ausente — sem texto (bloco nativo só p/ Claude).`);
        else if (pdfText === '') out.notes.push(`${name}: PDF sem texto extraível (escaneado?); bloco nativo p/ Claude.`);
        else pushText(pdfText, 'pdf');
        break;
      }
      case 'docx': {
        const mammoth = await lazy('mammoth');
        if (mammoth) { const r = await mammoth.extractRawText({ buffer: buf }); pushText(r.value || '', 'docx'); }
        else { row.status = 'name-only'; out.notes.push(`${name}: mammoth ausente — docx não extraído (name-only).`); }
        break;
      }
      case 'xls': {
        const XLSX = await lazy('xlsx');
        if (XLSX) {
          const wb = XLSX.read(buf, { type: 'buffer' });
          const sheets = wb.SheetNames.slice(0, opts.xlsxMaxSheets);
          const parts = [];
          for (const sn of sheets) {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
            parts.push('## ' + sn + '\n' + csvToMarkdown(csv, opts.xlsxMaxRowsPerSheet));
          }
          pushText(parts.join('\n\n'), 'xlsx');
        } else { row.status = 'name-only'; out.notes.push(`${name}: xlsx (sheetjs) ausente — planilha não extraída (name-only).`); }
        break;
      }
      case 'pptx': {
        const t = await pptxText(buf);
        if (t != null) pushText(t, 'pptx'); else { row.status = 'name-only'; out.notes.push(`${name}: jszip ausente — pptx não extraído (name-only).`); }
        break;
      }
      case 'zip': return await extractZip(name, buf, opts, depthInfo);
      case 'doc-legacy': case 'ppt-legacy': row.status = 'unsupported'; out.notes.push(`${name}: formato legado binário (${type}) não extraído — registrado por nome. Salve como .docx/.pptx para extrair o conteúdo.`); break;
      default: row.status = 'unsupported'; out.notes.push(`${name}: tipo não suportado — registrado por nome.`);
    }
  } catch (e) { row.status = 'error'; out.notes.push(`${name}: falha na extração (${e.message}).`); }
  return { ...out, row };
}

async function extractZip(name, buf, opts, depthInfo) {
  const out = { textParts: [], blocks: [], notes: [], rows: [] };
  const depth = (depthInfo?.depth || 0) + 1;
  const baseRow = { path: depthInfo?.path || name, type: 'zip', bytes: buf.length, chars: 0, status: 'ok' };
  if (depth > opts.zipMaxDepth) { baseRow.status = 'skipped'; out.notes.push(`${name}: zip aninhado além de ${opts.zipMaxDepth} níveis — pulado.`); return { ...out, row: baseRow }; }
  const JSZip = await lazy('jszip');
  if (!JSZip) { baseRow.status = 'name-only'; out.notes.push(`${name}: jszip ausente — zip não extraído (name-only).`); return { ...out, row: baseRow }; }
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files).filter((f) => !f.dir).slice(0, opts.zipMaxEntries);
  let uncompressed = 0; let count = 0;
  for (const f of entries) {
    if (count >= opts.zipMaxEntries) { out.notes.push(`${name}: > ${opts.zipMaxEntries} entradas — restante omitido.`); break; }
    const inner = await f.async('nodebuffer');
    uncompressed += inner.length;
    if (uncompressed > opts.zipMaxTotalUncompressedBytes) { out.notes.push(`${name}: descompactado > limite (guarda zip-bomb) — restante omitido.`); break; }
    const path = (depthInfo?.path || name) + '/' + f.name;
    const t = detectType(f.name, '');
    const r = await extractOne(f.name, inner, t, opts, { path, depth });
    out.textParts.push(...(r.textParts || []));
    out.blocks.push(...(r.blocks || []));
    out.notes.push(...(r.notes || []));
    if (r.rows) out.rows.push(...r.rows); else if (r.row) out.rows.push(r.row);
    count++;
  }
  baseRow.chars = out.textParts.reduce((a, p) => a + p.text.length, 0);
  out.rows.unshift(baseRow);
  return out;
}

/** ingest(files, opts) -> IngestResult */
export async function ingest(files, opts = {}) {
  if (!Array.isArray(files)) throw new Error('ingest: files deve ser um array');
  const o = { ...DEFAULTS, ...opts };
  const res = { textParts: [], blocks: [], manifest: [], notes: [], totalChars: 0, truncated: false, warnings: [] };
  const list = files.slice(0, o.maxFiles);
  if (files.length > o.maxFiles) { res.truncated = true; res.warnings.push(`> ${o.maxFiles} arquivos — só os primeiros ${o.maxFiles} processados.`); }
  for (const f of list) {
    if (!f || !f.filename) continue;
    const buf = toBuf(f.bytes);
    const type = detectType(f.filename, f.mime);
    const r = await extractOne(f.filename, buf, type, o, null);
    // respeita o orçamento global de chars (corta textParts excedentes)
    for (const tp of (r.textParts || [])) {
      if (res.totalChars >= o.maxTotalChars) { res.truncated = true; res.notes.push(`Orçamento de ${o.maxTotalChars} chars atingido — texto restante omitido.`); break; }
      const room = o.maxTotalChars - res.totalChars;
      const text = tp.text.length > room ? tp.text.slice(0, room) : tp.text;
      const truncated = tp.truncated || text.length < tp.text.length;
      if (text.length < tp.text.length) res.truncated = true;
      res.textParts.push({ ...tp, text, truncated });
      res.totalChars += text.length;
    }
    res.blocks.push(...(r.blocks || []));
    res.notes.push(...(r.notes || []));
    if (r.rows) res.manifest.push(...r.rows); else if (r.row) res.manifest.push(r.row);
    if (r.row && r.row.status === 'truncated') res.truncated = true;
  }
  return res;
}

// ---- montagem da mensagem por provedor --------------------------------------
function renderTextBundle(result, userText) {
  const parts = [];
  if (userText) parts.push(String(userText));
  if (result.manifest && result.manifest.length) {
    parts.push('# Arquivos enviados\n' + result.manifest.map((m) => `- ${m.path} (${m.type}, ${m.status})`).join('\n'));
  }
  for (const tp of (result.textParts || [])) {
    parts.push('## ' + tp.name + (tp.truncated ? ' (truncado)' : '') + '\n' + tp.text);
  }
  if (result.notes && result.notes.length) parts.push('> Notas de ingestão: ' + result.notes.join(' '));
  return parts.join('\n\n');
}

/** Monta o `content` de uma mensagem de usuário p/ o provedor. string OU array de blocos.
 * supportsVision controla blocos de IMAGEM; supportsPdf (default = supportsVision) controla blocos
 * de PDF nativos (só Anthropic). Quando um bloco não é suportado, o TEXTO extraído (no bundle) cobre. */
export function toMessageContent(result, { provider = 'anthropic', supportsVision = false, supportsPdf, userText = '' } = {}) {
  const allowPdf = supportsPdf === undefined ? supportsVision : supportsPdf;
  const textBundle = renderTextBundle(result, userText);
  const blocks = (result && result.blocks) || [];
  const usable = blocks.filter((b) => (b.type === 'image' && supportsVision) || (b.type === 'document' && allowPdf && provider === 'anthropic'));
  if (!usable.length) return textBundle;
  const content = [{ type: 'text', text: textBundle }];
  for (const b of usable) {
    if (b.type === 'image') {
      if (provider === 'anthropic') content.push({ type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.dataBase64 } });
      else content.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.dataBase64}` } });
    } else if (b.type === 'document') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.dataBase64 } });
    }
  }
  return content;
}

export function estimateTokens(result) {
  const chars = (result.textParts || []).reduce((a, p) => a + (p.text ? p.text.length : 0), 0);
  const imgs = (result.blocks || []).filter((b) => b.type === 'image').length;
  return Math.ceil(chars / 4) + imgs * 800; // heurística
}

// visão (imagens): família Claude 4.x/3.5 (opus/sonnet/haiku-4) + GPT-4o/4.1/GPT-5 (exceto nano).
const VISION_MODELS = [/claude-(opus|sonnet)/i, /claude-haiku-4/i, /gpt-4o/i, /gpt-4\.1/i, /gpt-5(?!-nano)/i];
export function supportsVision(model) { const m = String(model || ''); return VISION_MODELS.some((re) => re.test(m)); }
// PDF nativo (bloco document): só Claude (opus/sonnet/haiku-4). Demais usam o texto extraído.
const PDF_MODELS = [/claude-(opus|sonnet)/i, /claude-haiku-4/i];
export function supportsPdf(model) { const m = String(model || ''); return PDF_MODELS.some((re) => re.test(m)); }
