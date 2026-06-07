import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureStorageDirs(): Promise<void> {
  await ensureDir(path.resolve(process.cwd(), config.storageDir));
  await ensureDir(path.resolve(process.cwd(), config.storageDir, 'documents'));
}

export function resolveStoragePath(...parts: string[]): string {
  return path.resolve(process.cwd(), config.storageDir, ...parts);
}
