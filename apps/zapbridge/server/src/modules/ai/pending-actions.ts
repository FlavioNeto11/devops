// Ações pendentes da IA — token HMAC autocontido para o fluxo dry-run → confirmação.
// A tool mutante roda em dry-run (preview) durante o turno; a execução real só ocorre
// quando o usuário clica "Confirmar" (POST /ai/confirm) — o clique É o envio. O token
// assina tool + argumentos + dono (userId+chatJid) com validade curta. Espelha o padrão
// de apps/gymops/.../ai/graph/pending-actions.ts.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

const TTL_MS = 10 * 60 * 1000;

export interface PendingActionPayload {
  toolName: string;
  arguments: Record<string, unknown>;
  userId: string;
  chatJid: string;
  exp: number;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', env.jwtSecret || '').update(payloadB64).digest('base64url');
}

export function signPendingAction(input: {
  toolName: string;
  arguments: Record<string, unknown>;
  userId: string;
  chatJid: string;
}): string {
  const payload: PendingActionPayload = { ...input, exp: Date.now() + TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyPendingAction(
  token: string,
  expected: { userId: string },
): PendingActionPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const givenSig = token.slice(dot + 1);
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(givenSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: PendingActionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as PendingActionPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.toolName !== 'string' || !payload.toolName) return null;
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (payload.userId !== expected.userId) return null;
  if (!payload.arguments || typeof payload.arguments !== 'object') return null;
  return payload;
}
