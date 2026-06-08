import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash
} from 'node:crypto';
import * as oidcKit from '@flavioneto11/oidc-kit';

const ACCESS_TOKEN_PREFIX = 'sicat_access';
const REFRESH_TOKEN_PREFIX = 'sicat_refresh';
const PASSWORD_HASH_PREFIX = 'scrypt_v1';

// Cripto centralizada em @flavioneto11/oidc-kit (PORT BYTE-A-BYTE: mesmos algoritmos e, com os
// prefixos sicat_access/sicat_refresh, mesmos tokens -> sessoes vivas seguem validas).
// OIDC_KIT=off volta ao caminho inline legado (rollback de 1 ciclo; ver deprecation-policy).
const OIDC_KIT = (process.env.OIDC_KIT ?? 'on').trim().toLowerCase() !== 'off';

type TokenPayload = {
  iat?: number;
  exp?: number;
  jti?: string;
  sub?: string;
  email?: string;
  name?: string;
  roles?: string[];
  [key: string]: unknown;
};

type TokenOptions = {
  secret: string;
  ttlSeconds?: number;
};

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function deriveKeyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(String(secret || '')).digest();
}

export function hashTokenSha256(token: string): string {
  if (OIDC_KIT) return oidcKit.hashTokenSha256(token);
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function hashPassword(password: string): string {
  if (OIDC_KIT) return oidcKit.hashPassword(password);
  const normalizedPassword = String(password || '');
  const salt = randomBytes(16);
  const hash = scryptSync(normalizedPassword, salt, 64);
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  if (OIDC_KIT) return oidcKit.verifyPassword(password, passwordHash);
  const raw = String(passwordHash || '');
  const parts = raw.split('$');
  const scheme = parts[0];
  const saltPart = parts[1];
  const hashPart = parts[2];
  if (parts.length !== 3 || scheme !== PASSWORD_HASH_PREFIX || !saltPart || !hashPart) return false;

  const salt = fromBase64Url(saltPart);
  const expectedHash = fromBase64Url(hashPart);
  const calculatedHash = scryptSync(String(password || ''), salt, expectedHash.length);
  return timingSafeEqual(expectedHash, calculatedHash);
}

export function createAccessToken(payload: TokenPayload, { secret, ttlSeconds = 3600 }: TokenOptions): string {
  if (OIDC_KIT) return oidcKit.createAccessToken(payload, { secret, ttlSeconds, prefix: ACCESS_TOKEN_PREFIX });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + Number(ttlSeconds || 3600),
    jti: randomBytes(16).toString('hex')
  };

  const encodedPayload = toBase64Url(JSON.stringify(tokenPayload));
  const signature = createHmac('sha256', String(secret || ''))
    .update(encodedPayload)
    .digest('base64url');

  return `${ACCESS_TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string, { secret }: Pick<TokenOptions, 'secret'>):
  | { valid: false; reason: string }
  | { valid: true; payload: TokenPayload } {
  if (OIDC_KIT) return oidcKit.verifyAccessToken(token, { secret, prefix: ACCESS_TOKEN_PREFIX });
  const rawToken = String(token || '');
  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts[0] !== ACCESS_TOKEN_PREFIX) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  const encodedPayload = parts[1];
  const signature = parts[2];
  if (!encodedPayload || !signature) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }
  const expectedSignature = createHmac('sha256', String(secret || ''))
    .update(encodedPayload)
    .digest('base64url');

  if (!timingSafeStringEquals(signature, expectedSignature)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD' };
  }

  const exp = Number(payload?.exp || 0);
  if (!exp || exp <= Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  return { valid: true, payload };
}

export function createRefreshToken() {
  if (OIDC_KIT) return oidcKit.createRefreshToken({ prefix: REFRESH_TOKEN_PREFIX });
  return `${REFRESH_TOKEN_PREFIX}.${randomBytes(40).toString('base64url')}`;
}

export function encryptSecret(plainText: string, { secret }: Pick<TokenOptions, 'secret'>): EncryptedPayload {
  if (OIDC_KIT) return oidcKit.encryptSecret(plainText, { secret });
  const iv = randomBytes(12);
  const key = deriveKeyFromSecret(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url')
  };
}

export function decryptSecret(cipherPayload: Partial<EncryptedPayload>, { secret }: Pick<TokenOptions, 'secret'>): string {
  if (OIDC_KIT) return oidcKit.decryptSecret(cipherPayload, { secret });
  const key = deriveKeyFromSecret(secret);
  const iv = fromBase64Url(cipherPayload?.iv || '');
  const encrypted = fromBase64Url(cipherPayload?.ciphertext || '');
  const tag = fromBase64Url(cipherPayload?.tag || '');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}
