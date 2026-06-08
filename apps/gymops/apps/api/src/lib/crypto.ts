import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../env.js';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer | null {
  if (!env.ENCRYPTION_KEY) return null;
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

export function encrypt(data: string): string {
  const key = getKey();
  if (!key) return data;
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    encrypted: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  });
}

export function decrypt(payload: string): string {
  const key = getKey();
  if (!key) return payload;
  try {
    const { iv, encrypted, tag } = JSON.parse(payload) as { iv: string; encrypted: string; tag: string };
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(Buffer.from(encrypted, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return payload;
  }
}
