// forge-state.js — estado VIVO da Forja para o frontend (tempo real, sem rebuild de imagem).
// Lê products.json + implementation-status.json de um diretório MONTADO (ConfigMap reqhub-forge-state),
// assim o progresso de cada produto reflete a baseline ATUAL sem reassar a imagem do frontend.
// Fail-soft: arquivo ausente -> source:'empty' (o frontend cai no baked). Cache curto (3s) p/ o polling.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.FORGE_DATA_DIR || '/forge-data';
const DONE = ['deployed', 'done', 'merged'];
const STATUS_ORDER = ['not_started', 'in_progress', 'pr_open', 'merged', 'deployed', 'done', 'blocked'];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return null; }
}

function progressOf(reqIds, implStatus) {
  const ids = Array.isArray(reqIds) ? reqIds : [];
  const items = (implStatus && implStatus.items) || {};
  const by = {};
  for (const s of STATUS_ORDER) by[s] = 0;
  let done = 0;
  for (const id of ids) {
    const st = (items[id] && items[id].status) || 'not_started';
    by[st] = (by[st] || 0) + 1;
    if (DONE.includes(st)) done++;
  }
  const total = ids.length;
  return { by, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

let cache = null; // { at, payload }

/** Estado vivo: lista de produtos com progresso recalculado da baseline montada. */
export function forgeState() {
  const now = Date.now();
  if (cache && now - cache.at < 3000) return cache.payload;
  const products = readJson('products.json');
  const implStatus = readJson('implementation-status.json');
  const list = (products && products.products) || [];
  const out = list
    .map((p) => ({
      name: p.name,
      display_name: p.display_name || p.name,
      base_path: p.base_path || '/' + p.name,
      blueprint: p.blueprint || null,
      stack: p.stack || null,
      app_type: p.app_type || 'product_software',
      vision: p.vision || '',
      phases: p.phases || {},
      capability_blocks: p.capability_blocks || [],
      requirement_ids: p.requirement_ids || [],
      reqCount: (p.requirement_ids || []).length,
      progress: progressOf(p.requirement_ids || [], implStatus),
      reqs: (p.requirement_ids || []).map((id) => ({
        id,
        status: ((implStatus && implStatus.items && implStatus.items[id]) || {}).status || 'not_started',
      })),
    }))
    .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'pt-BR'));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: fs.existsSync(path.join(DATA_DIR, 'products.json')) ? 'live' : 'empty',
    count: out.length,
    products: out,
  };
  cache = { at: now, payload };
  return payload;
}
