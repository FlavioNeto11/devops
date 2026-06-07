/**
 * Sanitização de payloads antes de persistir/streamar/enviar a Langfuse.
 * Remove segredos (Authorization, cookies, tokens, senhas, recaptcha, JWT, apiKey…)
 * recursivamente. Usado por observabilidade local, SSE e adapter Langfuse.
 */

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|password|senha|secret|api[-_]?key|apikey|token|bearer|jwt|recaptcha|x-amz|client[-_]?secret|refresh[-_]?token|access[-_]?token|private[-_]?key)/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 4000;

function clampString(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return clampString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = sanitizeValue(entry, depth + 1);
    }
    return out;
  }

  return null;
}

export function sanitizeForObservability(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0);
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return { value: sanitized };
}

/** Mascara um segredo para status/diagnóstico (nunca o valor completo). */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 6) return `***(len=${trimmed.length})`;
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-2)} (len=${trimmed.length})`;
}
