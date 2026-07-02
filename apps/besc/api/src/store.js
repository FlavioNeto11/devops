// Store em arquivo JSON (sem banco externo). Baixo volume, operador unico.
// Escrita atomica (tmp + rename). Persistido no PVC montado em DATA_DIR.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'besc.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let state = { cases: {} };
let writeChain = Promise.resolve();

export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.cases) state = parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[store] leitura falhou, iniciando vazio:', err.message);
    await persist();
  }
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

// --- anexos (arquivos no PVC) ---
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
  try { await fs.unlink(attachmentPath(caseId, attId, ext)); } catch { /* já removido */ }
}

export async function removeCaseUploads(caseId) {
  try { await fs.rm(caseUploadDir(caseId), { recursive: true, force: true }); } catch { /* nada a remover */ }
}
