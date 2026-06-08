// Cripto de sessao da plataforma — PORT BYTE-A-BYTE de apps/sicat/.../lib/sicat-security.ts.
// Os algoritmos sao IDENTICOS (HMAC-SHA256, scrypt, AES-256-GCM); a UNICA diferenca e que o
// prefixo do token virou parametro (default generico). Assim, passando prefix 'sicat_access'/
// 'sicat_refresh', os tokens sao byte-identicos aos do SICAT e as sessoes vivas continuam validas.
import {
  createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual, createHash,
} from 'node:crypto';

const PASSWORD_HASH_PREFIX = 'scrypt_v1';
const DEFAULT_ACCESS_PREFIX = 'oidc_access';
const DEFAULT_REFRESH_PREFIX = 'oidc_refresh';

function toBase64Url(value) { return Buffer.from(value).toString('base64url'); }
function fromBase64Url(value) { return Buffer.from(value, 'base64url'); }
function timingSafeStringEquals(left, right) {
  const l = Buffer.from(String(left || ''));
  const r = Buffer.from(String(right || ''));
  if (l.length !== r.length) return false;
  return timingSafeEqual(l, r);
}
function deriveKeyFromSecret(secret) { return createHash('sha256').update(String(secret || '')).digest(); }

export function hashTokenSha256(token) { return createHash('sha256').update(String(token || '')).digest('hex'); }

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password || ''), salt, 64);
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash || '').split('$');
  const [scheme, saltPart, hashPart] = parts;
  if (parts.length !== 3 || scheme !== PASSWORD_HASH_PREFIX || !saltPart || !hashPart) return false;
  const salt = fromBase64Url(saltPart);
  const expectedHash = fromBase64Url(hashPart);
  const calculatedHash = scryptSync(String(password || ''), salt, expectedHash.length);
  return timingSafeEqual(expectedHash, calculatedHash);
}

export function createAccessToken(payload, { secret, ttlSeconds = 3600, prefix = DEFAULT_ACCESS_PREFIX }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + Number(ttlSeconds || 3600),
    jti: randomBytes(16).toString('hex'),
  };
  const encodedPayload = toBase64Url(JSON.stringify(tokenPayload));
  const signature = createHmac('sha256', String(secret || '')).update(encodedPayload).digest('base64url');
  return `${prefix}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token, { secret, prefix = DEFAULT_ACCESS_PREFIX }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return { valid: false, reason: 'INVALID_FORMAT' };
  const encodedPayload = parts[1];
  const signature = parts[2];
  if (!encodedPayload || !signature) return { valid: false, reason: 'INVALID_FORMAT' };
  const expectedSignature = createHmac('sha256', String(secret || '')).update(encodedPayload).digest('base64url');
  if (!timingSafeStringEquals(signature, expectedSignature)) return { valid: false, reason: 'INVALID_SIGNATURE' };
  let payload;
  try { payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')); }
  catch { return { valid: false, reason: 'INVALID_PAYLOAD' }; }
  const exp = Number((payload && payload.exp) || 0);
  if (!exp || exp <= Math.floor(Date.now() / 1000)) return { valid: false, reason: 'TOKEN_EXPIRED' };
  return { valid: true, payload };
}

export function createRefreshToken({ prefix = DEFAULT_REFRESH_PREFIX } = {}) {
  return `${prefix}.${randomBytes(40).toString('base64url')}`;
}

export function encryptSecret(plainText, { secret }) {
  const iv = randomBytes(12);
  const key = deriveKeyFromSecret(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), tag: tag.toString('base64url') };
}

export function decryptSecret(cipherPayload, { secret }) {
  const key = deriveKeyFromSecret(secret);
  const iv = fromBase64Url((cipherPayload && cipherPayload.iv) || '');
  const encrypted = fromBase64Url((cipherPayload && cipherPayload.ciphertext) || '');
  const tag = fromBase64Url((cipherPayload && cipherPayload.tag) || '');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}
