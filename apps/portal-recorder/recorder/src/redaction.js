// redaction.js — redação na ORIGEM (antes de qualquer escrita no banco).
// Porta a política do cetesb-gateway.js (BUSINESS_SENSITIVE_KEY_TOKENS + sanitizeHeaders),
// e adiciona secret_hashes: ao mascarar um segredo, guarda sha256(valor) para correlacionar
// "é o mesmo token de antes?" SEM nunca expor o valor.
import crypto from 'node:crypto';

const SENSITIVE_KEY_TOKENS = [
  'authorization', 'token', 'cookie', 'senha', 'password', 'recaptcha', 'assinatura',
  'email', 'cpf', 'cnpj', 'hash', 'jwt', 'secret', 'bearer', 'x-access-token',
];
const SENSITIVE_HEADERS = new Set(['authorization', 'x-access-token', 'cookie', 'set-cookie']);
const MASK = '***';

function sha(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16);
}

function keyIsSensitive(key) {
  const k = String(key).toLowerCase();
  return SENSITIVE_KEY_TOKENS.some((t) => k.includes(t));
}

// Redige um objeto recursivamente; acumula chaves mascaradas e hashes em `acc`.
export function redactObject(value, acc = { keys: [], hashes: {} }, keyPath = '') {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v, i) => redactObject(v, acc, `${keyPath}[${i}]`));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (keyIsSensitive(key) && entry != null && typeof entry !== 'object') {
      out[key] = MASK;
      acc.keys.push(key);
      acc.hashes[key] = sha(entry);
    } else {
      out[key] = redactObject(entry, acc, key);
    }
  }
  return out;
}

// Redige headers (map nome→valor); mascara os sensíveis e hasheia.
export function sanitizeHeaders(headers, acc = { keys: [], hashes: {} }) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const k = String(key).toLowerCase();
    if (SENSITIVE_HEADERS.has(k) || keyIsSensitive(k)) {
      out[k] = MASK;
      acc.keys.push(k);
      acc.hashes[k] = sha(value);
    } else {
      out[k] = value;
    }
  }
  return out;
}

// Redige cookies (lista de {name, value, domain, ...}); preserva metadados, mascara valor.
export function sanitizeCookies(cookies, acc = { keys: [], hashes: {} }) {
  return (cookies || []).map((c) => {
    acc.keys.push(`cookie:${c.name}`);
    acc.hashes[`cookie:${c.name}`] = sha(c.value);
    return { name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, value: MASK };
  });
}

// Tenta parsear um corpo (string) como JSON e redigir; senão devolve um resumo.
export function redactBody(rawBody, acc) {
  if (rawBody == null) return { body: null, truncated: false };
  if (typeof rawBody === 'object') return { body: redactObject(rawBody, acc), truncated: false };
  const str = String(rawBody);
  try {
    return { body: redactObject(JSON.parse(str), acc), truncated: false };
  } catch {
    // não-JSON (form, texto): redige por heurística de chave=valor sensível
    return { body: { _raw: str.length > 2000 ? `${str.slice(0, 2000)}…` : str, _nonJson: true }, truncated: str.length > 2000 };
  }
}
