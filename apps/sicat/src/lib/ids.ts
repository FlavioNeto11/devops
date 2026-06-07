import { randomBytes } from 'node:crypto';

export function createPrefixedId(prefix: string): string {
  return `${prefix}_${randomBytes(13).toString('hex')}`;
}

export function createCorrelationId(): string {
  return `corr_${randomBytes(16).toString('hex')}`;
}

export function createManifestHash(): string {
  return randomBytes(15).toString('base64url').slice(0, 30);
}

export function createManifestNumber(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const ms = String(Date.now()).slice(-8);
  return `${yyyy}${day}${ms}`.slice(0, 12);
}

export function createManifestCode(): number {
  return Number(String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 90) + 10));
}
