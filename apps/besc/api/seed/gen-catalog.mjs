// gen-catalog.mjs — GERADOR OFFLINE do catalogo de conteudo do BESC (roda no dev box,
// NUNCA no container). Le a pasta-fonte extraida, deriva facetas deterministicas de
// pasta+nome, extrai texto (pdftotext) p/ excerpts, e escreve api/seed/*.json.
// Ementas/resumos/outcome curados entram por overrides.json (id -> partial), aplicado por ultimo.
//
// Uso:
//   node gen-catalog.mjs --src "C:\\besc-source" --out "." [--excerpts "<dir>"]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]]);
  return a;
}, []));
const SRC = args.src || 'C:\\besc-source';
const OUT = args.out || path.resolve('.');
const EXCERPTS = args.excerpts || null;      // se setado, grava <id>.txt de cada juris
const TEXTDIR = args.textdir || null;        // se setado, le texto de <textdir>/<id>.txt (OCR pronto)
const PDFTOTEXT = process.env.PDFTOTEXT || 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';

const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push({ rel: path.relative(base, full).split(path.sep).join('/'), full, size: st.size });
  }
  return out;
}

// mime/ext: por extensao; sem extensao valida, faz sniff de %PDF.
function detectFile(full) {
  let ext = path.extname(full).toLowerCase();
  const known = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.mp4': 'video/mp4', '.doc': 'application/msword' };
  if (known[ext]) return { ext, mime: known[ext] };
  // extensao ausente/estranha -> sniff
  try {
    const fd = fs.openSync(full, 'r'); const buf = Buffer.alloc(4); fs.readSync(fd, buf, 0, 4, 0); fs.closeSync(fd);
    if (buf.toString('latin1') === '%PDF') return { ext: '.pdf', mime: 'application/pdf' };
  } catch { /* ok */ }
  return { ext: ext || '.pdf', mime: 'application/pdf' };
}

function pdfText(full) {
  try {
    const out = execFileSync(PDFTOTEXT, ['-layout', '-nopgbrk', full, '-'], { maxBuffer: 64 * 1024 * 1024 });
    return out.toString('utf8');
  } catch { return ''; }
}
// texto: prioriza <textdir>/<id>.txt (extracao/OCR ja feita); fallback pdftotext.
function getText(id, full, mime) {
  if (TEXTDIR) {
    try { const t = fs.readFileSync(path.join(TEXTDIR, `${id}.txt`), 'utf8'); if (t && t.trim()) return t; } catch { /* cai no fallback */ }
  }
  return mime === 'application/pdf' ? pdfText(full) : '';
}

// ---------------- parsers de faceta ----------------
const TRIBUNAL_RX = /\b(STJ|STF|TRF3|TRF4|TJSP|TJSC|TJGO|TJMT|TJRS|TJPB|TJBA|TJAM|TJDF|TJRJ|TJPR|TJMG)\b/i;
const CNJ_RX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const YEAR_RX = /\b(19|20)\d{2}\b/;
const CREDITOR_BY_TOP = {
  'Banco do Brasil': 'banco_do_brasil',
  'Bancos privados': 'bancos_privados',
  'Empresas privadas': 'empresas_privadas',
  'Caixa Economica Federal': 'caixa_economica',
  'Tributos Federais - União': 'tributos_federais',
  'Tributos Estaduais': 'tributos_estaduais',
  'Tributos Municipais': 'tributos_municipais',
};
const TRIB_UF = { TJSP: 'SP', TJSC: 'SC', TJGO: 'GO', TJMT: 'MT', TJRS: 'RS', TJPB: 'PB', TJBA: 'BA', TJAM: 'AM', TJDF: 'DF', TJRJ: 'RJ', TJPR: 'PR', TJMG: 'MG', TRF3: 'SP', TRF4: 'RS' };
const MECH = [
  ['substituicao_penhora', /substitu\w*\s*(de\s*)?penhor/i],
  ['compensacao', /compensa/i],
  ['quitacao', /quita/i],
  ['conversao', /convers/i],
  ['dacao_pagamento', /da[çc][ãa]o|dacao/i],
  ['caucao', /cau[çc][ãa]o|caucao|caucão/i],
  ['penhora', /penhor/i],
];

function parseJuris(f, text) {
  const parts = f.rel.split('/');
  const top = parts.length > 1 ? parts[0] : null;
  const sub = parts.length > 2 ? parts[1] : null;
  const fname = parts[parts.length - 1];
  const hay = `${f.rel}`;
  const tribM = TRIBUNAL_RX.exec(fname) || TRIBUNAL_RX.exec(hay) || (text ? TRIBUNAL_RX.exec(text.slice(0, 4000)) : null);
  let tribunal = tribM ? tribM[1].toUpperCase() : 'outro';
  // TF-XX (Tributos Federais) sem TRF -> mapeia por regiao
  if (tribunal === 'outro' && /\bTF-SP\b/i.test(fname)) tribunal = 'TRF3';
  else if (tribunal === 'outro' && /\bTF-PR\b/i.test(fname)) tribunal = 'TRF4';
  const creditorCategory = (top && CREDITOR_BY_TOP[top]) || 'outros';
  const clientCase = sub && !/Decis[õo]es\s*STJ/i.test(sub) ? sub.replace(/\s+$/, '') : null;
  const mechanism = MECH.filter(([, rx]) => rx.test(fname)).map(([k]) => k);
  // dedupe: se tem substituicao_penhora, remove penhora generico
  const mech = mechanism.includes('substituicao_penhora') ? mechanism.filter((m) => m !== 'penhora') : mechanism;
  const yM = YEAR_RX.exec(fname) || (text ? YEAR_RX.exec(text.slice(0, 3000)) : null);
  const year = yM ? parseInt(yM[0], 10) : null;
  // uf: prefixo do clientCase ("SP Renata...") ou do tribunal
  let uf = null;
  const ufM = /^([A-Z]{2})\s/.exec(sub || '') || (top && /Federais/.test(top) && /\bTF-([A-Z]{2})\b/i.exec(fname));
  if (ufM) uf = (ufM[1] || ufM[0]).toUpperCase().slice(0, 2);
  if (!uf) uf = TRIB_UF[tribunal] || null;
  // instancia
  let instancia = 'segunda';
  if (/Decis[õo]es\s*STJ/i.test(sub || '') || tribunal === 'STJ') instancia = 'superior_STJ';
  else if (tribunal === 'STF') instancia = 'STF';
  else if (/senten[çc]a/i.test(fname) || /1000/.test(fname)) instancia = 'primeira';
  else if (/mono?crat/i.test(fname)) instancia = 'segunda';
  else if (/3[°ºª]\s*inst|terceira\s*inst/i.test(fname)) instancia = 'superior_STJ';
  const cnj = CNJ_RX.exec(fname) || (text ? CNJ_RX.exec(text) : null);
  const processNumber = cnj ? cnj[0] : null;
  return { tribunal, creditorCategory, clientCase, mechanism: mech, year, uf, instancia, processNumber };
}

const MECH_LABEL = { compensacao: 'Compensação', quitacao: 'Quitação', conversao: 'Conversão', dacao_pagamento: 'Dação em pagamento', substituicao_penhora: 'Substituição de penhora', caucao: 'Caução', penhora: 'Penhora' };
const CRED_LABEL = { banco_do_brasil: 'Banco do Brasil', bancos_privados: 'Banco privado', empresas_privadas: 'Empresa privada', caixa_economica: 'Caixa Econômica', tributos_federais: 'Tributo federal', tributos_estaduais: 'Tributo estadual', tributos_municipais: 'Tributo municipal', outros: 'Geral' };

function jurisTitle(facets) {
  const mech = facets.mechanism.map((m) => MECH_LABEL[m]).filter(Boolean)[0];
  const who = facets.clientCase || CRED_LABEL[facets.creditorCategory];
  const t = facets.tribunal !== 'outro' ? facets.tribunal : '';
  return [t, mech, who].filter(Boolean).join(' — ') || 'Decisão sobre ações BESC';
}

// ---------------- library kind ----------------
function libKind(fname) {
  if (/\.mp4$/i.test(fname)) return 'video';
  if (/comunicado|bacen|homologa|fra[çc][õo]es|transfer/i.test(fname)) return 'comunicado_bacen';
  if (/aquisi|incorpora/i.test(fname)) return 'historia';
  if (/cart[óo]rio|honor|tabela_cartorio|custo/i.test(fname)) return 'custos';
  if (/laudo/i.test(fname)) return 'laudo';
  if (/inicial|peti[çc]|a[çc][ãa]o\s*besc|modelo|airton|1984|acordo/i.test(fname)) return 'modelo';
  if (/porqu|utilizar/i.test(fname)) return 'fundamento';
  if (/considera|parecer|jurisprud|consolidad|benef/i.test(fname)) return 'base_legal';
  return 'outro';
}

// ---------------- geracao ----------------
function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function excerpt(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 6500) return clean;
  return clean.slice(0, 5000) + '\n[...]\n' + clean.slice(-1500);
}

const jurisFiles = walk(path.join(SRC, 'jurisprudencia'));
const infoFiles = walk(path.join(SRC, 'informacoes'));

const jurisprudence = [];
const excerptsOut = [];
let needsOcrJuris = [];
for (const f of jurisFiles) {
  const id = `jur_${sha1('jurisprudencia/' + f.rel)}`;
  const { ext, mime } = detectFile(f.full);
  const text = getText(id, f.full, mime);
  const charCount = (text || '').replace(/\s/g, '').length;
  const needsOcr = mime === 'application/pdf' && charCount < 200;
  if (needsOcr) needsOcrJuris.push(f.rel);
  const facets = parseJuris(f, text);
  jurisprudence.push({
    id, slug: slugify(`${facets.tribunal}-${facets.mechanism[0] || ''}-${facets.clientCase || facets.creditorCategory}-${id.slice(-4)}`),
    title: jurisTitle(facets),
    ...facets,
    outcome: 'indefinido',
    parties: null,
    summary: '', ementa: '',
    tags: [...facets.mechanism, facets.creditorCategory].filter(Boolean),
    sourcePath: `jurisprudencia/${f.rel}`,
    fileRef: { stored: true, ext, mime, sizeBytes: f.size },
    needsOcr,
    createdAt: new Date().toISOString().slice(0, 10),
  });
  excerptsOut.push({ id, rel: f.rel, tribunal: facets.tribunal, creditorCategory: facets.creditorCategory, mechanism: facets.mechanism, needsOcr, excerpt: excerpt(text) });
  if (EXCERPTS) fs.writeFileSync(path.join(EXCERPTS, `${id}.txt`), text || '', 'utf8');
}

const library = [];
let needsOcrLib = [];
for (const f of infoFiles) {
  const id = `lib_${sha1('informacoes/' + f.rel)}`;
  const { ext, mime } = detectFile(f.full);
  const text = getText(id, f.full, mime);
  const charCount = (text || '').replace(/\s/g, '').length;
  const needsOcr = mime === 'application/pdf' && charCount < 200;
  if (needsOcr) needsOcrLib.push(f.rel);
  const kind = libKind(f.rel);
  library.push({
    id, slug: slugify(f.rel.replace(/\.[^.]+$/, '')),
    title: f.rel.replace(/\.[^.]+$/, ''),
    kind, summary: '', body: '',
    tags: [kind],
    sourceFilename: path.basename(f.rel),
    fileRef: { stored: true, ext, mime, sizeBytes: f.size },
    hasText: charCount >= 200, needsOcr,
    externalLinks: [],
    createdAt: new Date().toISOString().slice(0, 10),
  });
  if (EXCERPTS) fs.writeFileSync(path.join(EXCERPTS, `${id}.txt`), text || '', 'utf8');
}

// ---------------- overrides (ementas curadas) ----------------
const overridesPath = path.join(OUT, 'overrides.json');
let overrides = {};
if (fs.existsSync(overridesPath)) { try { overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')); } catch {} }
function applyOverrides(arr) {
  for (const it of arr) {
    const ov = overrides[it.id];
    if (ov) Object.assign(it, ov);
    // recomputa tags de jurisprudencia (mecanismo pode ter sido corrigido no override)
    if (it.mechanism && it.creditorCategory) it.tags = [...new Set([...(it.mechanism || []), it.creditorCategory])];
    delete it.needsOcr; // flag interna, nao vai pro catalogo final
  }
}
applyOverrides(jurisprudence);
applyOverrides(library);

// ---------------- curadoria (denylist + patches) ----------------
// Itens removidos/reclassificados por decisao do operador NUNCA voltam numa regeneracao,
// mesmo que os arquivos-fonte ainda existam na pasta. Ver docs/evolution/11-curadoria-conteudo.md.
const curationPath = path.join(OUT, 'curation-denylist.json');
let curation = { remove: [], patch: {} };
if (fs.existsSync(curationPath)) { try { curation = JSON.parse(fs.readFileSync(curationPath, 'utf8')); } catch {} }
const removeSet = new Set(curation.remove || []);
function applyCuration(arr) {
  const kept = arr.filter((it) => !removeSet.has(it.id));
  for (const it of kept) if (curation.patch && curation.patch[it.id]) Object.assign(it, curation.patch[it.id]);
  return kept;
}
const jurisprudenceFinal = applyCuration(jurisprudence);
const libraryFinal = applyCuration(library);

// ordena por id p/ diffs estaveis
jurisprudenceFinal.sort((a, b) => a.id.localeCompare(b.id));
libraryFinal.sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(path.join(OUT, 'jurisprudence.json'), JSON.stringify(jurisprudenceFinal, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify(libraryFinal, null, 2), 'utf8');

// version bump automatico
const verPath = path.join(OUT, 'catalog-version.json');
let ver = { version: 0 };
if (fs.existsSync(verPath)) { try { ver = JSON.parse(fs.readFileSync(verPath, 'utf8')); } catch {} }
ver.version = (ver.version || 0) + 1;
ver.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(verPath, JSON.stringify(ver, null, 2), 'utf8');

// excerpts p/ o passo de ementas (grava no dir de excerpts, fora do repo)
if (args.dumpExcerpts && EXCERPTS) fs.writeFileSync(path.join(EXCERPTS, 'juris-excerpts.json'), JSON.stringify(excerptsOut, null, 2), 'utf8');

console.log(`jurisprudence: ${jurisprudence.length} | library: ${library.length} | catalog v${ver.version}`);
console.log(`needsOcr juris (${needsOcrJuris.length}): ${needsOcrJuris.join(' | ') || '—'}`);
console.log(`needsOcr library (${needsOcrLib.length}): ${needsOcrLib.join(' | ') || '—'}`);
