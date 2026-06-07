type JwtPayload = {
  exp?: number;
  [key: string]: unknown;
};

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

export function decodeJwtPayload(token: unknown): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(payloadPart));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

export function getJwtExpirationIso(token: unknown): string | null {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== 'number') return null;
  return new Date(payload.exp * 1000).toISOString();
}

export function isJwtExpiring(token: unknown, skewSeconds = 120): boolean {
  if (!token || typeof token !== 'string') return true;
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== 'number') return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + skewSeconds;
}
