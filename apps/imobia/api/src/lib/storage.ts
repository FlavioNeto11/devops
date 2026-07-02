// Armazenamento de arquivos no PVC (STORAGE_DIR, default /data/files). Uploads (documentos,
// fotos de vistoria) e PDFs gerados (PTAM/laudos). storageKey = "<org>/<uuid>-<nome>".
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../env';

const ROOT = env.STORAGE_DIR;

function safeName(name: string): string {
  return (name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export async function saveFile(orgId: string, filename: string, buffer: Buffer): Promise<{ storageKey: string; sizeBytes: number }> {
  const dir = path.join(ROOT, orgId);
  await fs.mkdir(dir, { recursive: true });
  const key = `${orgId}/${crypto.randomUUID()}-${safeName(filename)}`;
  await fs.writeFile(path.join(ROOT, key), buffer);
  return { storageKey: key, sizeBytes: buffer.length };
}

export async function saveText(orgId: string, filename: string, text: string): Promise<{ storageKey: string; sizeBytes: number }> {
  return saveFile(orgId, filename, Buffer.from(text, 'utf8'));
}

export async function readFile(storageKey: string): Promise<Buffer> {
  // impede path traversal
  const resolved = path.resolve(ROOT, storageKey);
  if (!resolved.startsWith(path.resolve(ROOT))) throw new Error('invalid key');
  return fs.readFile(resolved);
}
