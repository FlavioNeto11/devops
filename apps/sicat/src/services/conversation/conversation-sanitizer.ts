type LooseRecord = Record<string, unknown>;

const REDACTED = '[REDACTED]';
const SECRET_KEY_HINTS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'api-key',
  'apikey',
  'refresh-token',
  'access-token',
  'jwt',
  'recaptcha',
  'credential',
  'senha',
  'sigilo'
];
const SECRET_ASSIGNMENT_HINTS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'cookie',
  'api-key',
  'apikey',
  'refresh-token',
  'access-token',
  'jwt',
  'recaptcha',
  'credential',
  'senha'
];
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSecretKey(key: string | null | undefined) {
  if (!key) return false;
  const normalized = key.trim().toLowerCase().replaceAll('_', '-');
  return SECRET_KEY_HINTS.some((hint) => normalized.includes(hint));
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function sanitizeStringValue(value: string) {
  let sanitized = value
    .replaceAll(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replaceAll(JWT_PATTERN, REDACTED);

  for (const hint of SECRET_ASSIGNMENT_HINTS) {
    const pattern = new RegExp(String.raw`(${escapeRegExp(hint)}\s*[:=]\s*)(["']?)([^\s,;"']+)(\2)`, 'gi');
    sanitized = sanitized.replaceAll(pattern, (_match, prefix, quote) => {
      const safeQuote = typeof quote === 'string' ? quote : '';
      return `${prefix}${safeQuote}${REDACTED}${safeQuote}`;
    });
  }

  return sanitized;
}

export function sanitizeConversationText(value: unknown): string {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return '';
  }

  return sanitizeStringValue(value);
}

export function sanitizeConversationValue(value: unknown, parentKey?: string, depth = 0): unknown {
  if (depth > 8) {
    return '[TRUNCATED]';
  }

  if (isSecretKey(parentKey)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || value == null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeConversationValue(entry, parentKey, depth + 1));
  }

  if (!isRecord(value)) {
    return '[UNSUPPORTED_VALUE]';
  }

  const output: LooseRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = sanitizeConversationValue(entry, key, depth + 1);
  }

  return output;
}

export function sanitizeConversationRecord(value: unknown): LooseRecord {
  const sanitized = sanitizeConversationValue(value);
  return isRecord(sanitized) ? sanitized : {};
}