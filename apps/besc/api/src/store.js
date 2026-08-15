// Store em arquivo JSON (sem banco externo). Baixo volume, operador unico.
// Escrita atomica (tmp + rename). Persistido no PVC montado em DATA_DIR.
//
// Coleccoes:
//   cases         -> casos de levantamento (modelo original)
//   library       -> biblioteca institucional (metadados; binarios no PVC)
//   jurisprudence -> acervo de decisoes (metadados; binarios no PVC)
//   glossary      -> termos do glossario
//   catalogMeta   -> controle de versao da semente (seedCatalog)
// Binarios de conteudo vivem em /data/library/<id><ext> e /data/jurisprudence/<id><ext>.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'besc.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const LIBRARY_DIR = path.join(DATA_DIR, 'library');
export const JURIS_DIR = path.join(DATA_DIR, 'jurisprudence');

const EMPTY_STATE = { cases: {}, library: {}, jurisprudence: {}, glossary: {}, catalogMeta: {} };
let state = structuredClone(EMPTY_STATE);
let writeChain = Promise.resolve();

const now = () => new Date().toISOString();

export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(LIBRARY_DIR, { recursive: true });
  await fs.mkdir(JURIS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.cases) {
      // migracao aditiva: coleccoes ausentes viram {} sem tocar nas existentes
      state = {
        cases: parsed.cases || {},
        library: parsed.library || {},
        jurisprudence: parsed.jurisprudence || {},
        glossary: parsed.glossary || {},
        catalogMeta: parsed.catalogMeta || {},
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[store] leitura falhou, iniciando vazio:', err.message);
    await persist();
  }
  await seedCatalog();
  return state;
}

async function persist() {
  const tmp = DATA_FILE + '.tmp';
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

// Serializa as escritas para nunca corromper o arquivo sob mutacoes concorrentes.
function save() {
  writeChain = writeChain.then(persist).catch((e) => console.error('[store] persist falhou:', e.message));
  return writeChain;
}

// ---------------------------------------------------------------------------
// cases (modelo original)
// ---------------------------------------------------------------------------
export function listCases() {
  return Object.values(state.cases);
}

export function getCase(id) {
  return state.cases[id] || null;
}

export async function putCase(c) {
  state.cases[c.id] = c;
  await save();
  return c;
}

export async function deleteCase(id) {
  const existed = !!state.cases[id];
  delete state.cases[id];
  await save();
  await removeCaseUploads(id);
  return existed;
}

// --- anexos de casos (arquivos no PVC) ---
export function caseUploadDir(caseId) {
  return path.join(UPLOADS_DIR, caseId);
}

export function attachmentPath(caseId, attId, ext) {
  return path.join(UPLOADS_DIR, caseId, `${attId}${ext || ''}`);
}

export async function ensureCaseUploadDir(caseId) {
  const dir = caseUploadDir(caseId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function removeAttachmentFile(caseId, attId, ext) {
  try { await fs.unlink(attachmentPath(caseId, attId, ext)); } catch { /* ja removido */ }
}

export async function removeCaseUploads(caseId) {
  try { await fs.rm(caseUploadDir(caseId), { recursive: true, force: true }); } catch { /* nada a remover */ }
}

// ---------------------------------------------------------------------------
// library (biblioteca institucional)
// ---------------------------------------------------------------------------
export function listLibrary() { return Object.values(state.library); }
export function getLibrary(id) { return state.library[id] || null; }
export async function putLibrary(item) { state.library[item.id] = item; await save(); return item; }
export async function deleteLibrary(id) {
  const it = state.library[id];
  const existed = !!it;
  delete state.library[id];
  await save();
  if (it) await removeLibraryFile(id, it.fileRef && it.fileRef.ext);
  return existed;
}
export function libraryFilePath(id, ext) { return path.join(LIBRARY_DIR, `${id}${ext || ''}`); }
export async function removeLibraryFile(id, ext) { try { await fs.unlink(libraryFilePath(id, ext)); } catch { /* ok */ } }

// ---------------------------------------------------------------------------
// jurisprudence (acervo de decisoes)
// ---------------------------------------------------------------------------
export function listJurisprudence() { return Object.values(state.jurisprudence); }
export function getJurisprudence(id) { return state.jurisprudence[id] || null; }
export async function putJurisprudence(item) { state.jurisprudence[item.id] = item; await save(); return item; }
export async function deleteJurisprudence(id) {
  const it = state.jurisprudence[id];
  const existed = !!it;
  delete state.jurisprudence[id];
  await save();
  if (it) await removeJurisFile(id, it.fileRef && it.fileRef.ext);
  return existed;
}
export function jurisFilePath(id, ext) { return path.join(JURIS_DIR, `${id}${ext || ''}`); }
export async function removeJurisFile(id, ext) { try { await fs.unlink(jurisFilePath(id, ext)); } catch { /* ok */ } }

// ---------------------------------------------------------------------------
// glossary
// ---------------------------------------------------------------------------
export function listGlossary() { return Object.values(state.glossary); }
export function getGlossary(id) { return state.glossary[id] || null; }
export async function putGlossary(term) { state.glossary[term.id] = term; await save(); return term; }
export async function deleteGlossary(id) {
  const existed = !!state.glossary[id];
  delete state.glossary[id];
  await save();
  return existed;
}

// ---------------------------------------------------------------------------
// seedCatalog: upsert idempotente a partir de api/seed/*.json
// Version-gated: so reprocessa quando a versao da semente sobe OU a coleccao esta
// vazia. NUNCA sobrescreve registros criados/editados pelo operador. Preserva
// fileRef.stored do registro vivo (a ingestao de binarios e dona desse estado).
// ---------------------------------------------------------------------------
async function readJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

function mergeFileRef(seedRef, liveRef) {
  if (!seedRef) return (liveRef || null);
  return { ...seedRef, stored: (liveRef && typeof liveRef.stored === 'boolean') ? liveRef.stored : (seedRef.stored || false) };
}

async function seedCatalog() {
  const seedDir = path.join(process.cwd(), 'seed');
  const ver = await readJson(path.join(seedDir, 'catalog-version.json'));
  if (!ver || typeof ver.version !== 'number') return; // sem semente (ex.: dev sem seed) -> no-op
  const meta = state.catalogMeta || {};
  let touched = false;

  const upsertColl = async (coll, metaKey, file) => {
    const currentVer = meta[metaKey] || 0;
    const hasData = Object.keys(state[coll]).length > 0;
    if (currentVer >= ver.version && hasData) return; // ja aplicado
    const items = await readJson(path.join(seedDir, file));
    if (!Array.isArray(items)) return;
    for (const s of items) {
      if (!s || !s.id) continue;
      const live = state[coll][s.id];
      if (live && (live.source === 'operator' || live.editedAt)) continue; // dono operador -> pula
      state[coll][s.id] = {
        ...s,
        source: 'seed',
        createdAt: (live && live.createdAt) || s.createdAt || now(),
        updatedAt: now(),
        fileRef: mergeFileRef(s.fileRef, live && live.fileRef),
      };
      touched = true;
    }
    meta[metaKey] = ver.version;
  };

  const upsertGlossary = async () => {
    const currentVer = meta.glossaryVersion || 0;
    const hasData = Object.keys(state.glossary).length > 0;
    if (currentVer >= ver.version && hasData) return;
    const items = await readJson(path.join(seedDir, 'glossary.json'));
    if (!Array.isArray(items)) return;
    for (const s of items) {
      if (!s || !s.id) continue;
      const live = state.glossary[s.id];
      if (live && (live.source === 'operator' || live.editedAt)) continue;
      state.glossary[s.id] = { ...s, source: 'seed', updatedAt: now() };
      touched = true;
    }
    meta.glossaryVersion = ver.version;
  };

  await upsertColl('library', 'libraryVersion', 'library.json');
  await upsertColl('jurisprudence', 'jurisprudenceVersion', 'jurisprudence.json');
  await upsertGlossary();
  state.catalogMeta = meta;
  if (touched) await save();
  console.log(`[store] seedCatalog v${ver.version}: library=${Object.keys(state.library).length} jurisprudence=${Object.keys(state.jurisprudence).length} glossary=${Object.keys(state.glossary).length}`);
}

// exposto p/ debug/estatisticas
export function counts() {
  return {
    cases: Object.keys(state.cases).length,
    library: Object.keys(state.library).length,
    jurisprudence: Object.keys(state.jurisprudence).length,
    glossary: Object.keys(state.glossary).length,
  };
}
