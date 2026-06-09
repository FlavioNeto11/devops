import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { asyncH } from './_util.js';
import { requireAdmin } from '../auth.js';

/**
 * Inventário de recursos compartilhados (libs @flavioneto11/* + infra) e quem consome qual versão.
 * Gerado no repo por scripts/scan-shared-resources.mjs e baked na imagem (src/data/shared-resources.json).
 * Visão de toda a plataforma → restrita a platform-admins.
 */
const dataPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'shared-resources.json');

let cached;
function loadInventory() {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(readFileSync(dataPath, 'utf8'));
  } catch {
    cached = { generatedAt: null, resources: [] };
  }
  return cached;
}

const r = Router();
r.get('/shared-resources', requireAdmin, asyncH(async (_req, res) => {
  res.json({ data: loadInventory() });
}));

export default r;
