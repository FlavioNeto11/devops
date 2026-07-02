// gateways/gateway-audit.js — Auditoria centralizada de trocas HTTP com sistemas externos.
// Toda requisição a SEFAZ/RFB/e-Social/Prefeitura/Governo passa por logExchange antes de retornar.
// Padrão: cetesb-gateway do SICAT — redação de segredos, trilha imutável, falha silenciosa se DB indisponível.
// Pool é importado de forma lazy (dentro de logExchange) para não bloquear testes unitários sem pg.

const REDACT_KEYS = [
  'senha', 'password', 'cert', 'certpass', 'pfx', 'token', 'authorization',
  'secret', 'cnj', 'accesscode', 'accesstoken', 'chave_cert', 'private', 'apikey',
];

export function redactObject(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (Buffer.isBuffer(obj)) return '[Buffer redacted]';
  if (typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const lk = key.toLowerCase().replace(/[_\-]/g, '');
    if (REDACT_KEYS.some(f => lk.includes(f.replace(/[_\-]/g, '')))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactObject(obj[key], depth + 1);
    }
  }
  return out;
}

export function redactXml(xml) {
  if (!xml) return null;
  return String(xml)
    .replace(/<(senha|Senha|cert|Cert|token|Token)[^>]*>[^<]*<\/(senha|Senha|cert|Cert|token|Token)>/g, '<$1>[REDACTED]</$1>')
    .slice(0, 500) + (xml.length > 500 ? '...[truncated]' : '');
}

export async function logExchange({
  gateway, method, endpoint,
  requestPayload = null, responseStatus = null, responseSnippet = null,
  durationMs = null, attempts = 1, userId = null, errorCode = null,
}) {
  let sanitizedReq = null;
  try {
    if (requestPayload != null) {
      const obj = typeof requestPayload === 'string'
        ? { xml_snippet: requestPayload.slice(0, 300) }
        : requestPayload;
      sanitizedReq = JSON.stringify(redactObject(obj)).slice(0, 2000);
    }
  } catch { sanitizedReq = '[unparseable]'; }

  const snippet = responseSnippet
    ? redactXml(String(responseSnippet)).slice(0, 1000)
    : null;

  try {
    const { pool } = await import('../db.js');
    await pool.query(
      `INSERT INTO gateway_audit_log
         (gateway, method, endpoint, request_payload_sanitized, response_status, response_snippet, duration_ms, attempts, user_id, error_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [gateway, method, endpoint, sanitizedReq, responseStatus ?? null,
       snippet, durationMs ?? null, attempts, userId ?? null, errorCode ?? null],
    );
  } catch { /* audit failure NUNCA bloqueia a operação principal */ }

  const parts = [
    `[gateway-audit] ${gateway} ${method} ${endpoint}`,
    `→ ${responseStatus ?? 'ERR'} in ${durationMs ?? '?'}ms (attempts=${attempts})`,
  ];
  if (userId) parts.push(`user=${userId}`);
  if (errorCode) parts.push(`err=${errorCode}`);
  console.log(parts.join(' '));
}
