// lib/redact.js — REQ-STOCKPILOT-0004: redação de segredos em logs e na trilha de auditoria.
//
// Substitui valores sensíveis por '****' por duas vias complementares:
//  (a) NOME de chave sensível (authorization, api key, token, secret, senha, cookie...) em objetos;
//  (b) VALOR que casa com um segredo conhecido (API key/token configurados no ambiente) em strings,
//      e padrões inline tipo "Bearer <token>" / "apiKey <valor>".
// Stacks de erro NUNCA passam por aqui — só mensagens já redigidas (ver lib/app-error.js).
const MASK = '****';
const SECRET_KEY_RE = /(authorization|api[-_]?key|token|secret|senha|password|cookie|x-access-token)/i;
const INLINE_SECRET_RE = /\b(bearer|token|api[-_]?key)\b([=:\s]+)\S+/gi;

// Segredos conhecidos do ambiente (≥4 chars p/ não mascarar valores triviais por engano).
export function knownSecrets() {
  return [process.env.EXTERNAL_API_KEY, process.env.EXTERNAL_TOKEN, process.env.SUPPLIER_API_KEY, process.env.SUPPLIER_TOKEN]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 4);
}

// Redige uma string: troca segredos conhecidos e padrões inline (Bearer/token/apiKey ...) por '****'.
export function redactString(value, secrets = knownSecrets()) {
  let out = String(value);
  for (const s of secrets) out = out.split(s).join(MASK);
  out = out.replace(INLINE_SECRET_RE, (_m, label, sep) => `${label}${sep}${MASK}`);
  return out;
}

// Redige recursivamente um objeto/array/string. Chaves sensíveis viram '****'; strings são redigidas.
export function redactSecrets(value, secrets = knownSecrets()) {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, secrets));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? MASK : redactSecrets(v, secrets);
    }
    return out;
  }
  return value;
}

// LOG do gateway — toda mensagem/meta é redigida ANTES de ir ao console (LOG.info troca token por ****).
export const LOG = {
  info: (msg, meta) => emit('log', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

function emit(method, msg, meta) {
  const line = '[gateway] ' + redactString(String(msg));
  if (meta === undefined) console[method](line);
  else console[method](line, JSON.stringify(redactSecrets(meta)));
}
