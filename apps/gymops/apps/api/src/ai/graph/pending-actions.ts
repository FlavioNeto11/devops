// Ações pendentes da IA (F5) — token HMAC autocontido para o fluxo
// dry-run → confirmação explícita do usuário.
//
// A tool mutante roda em dry-run (preview) durante o turno do chat; a execução
// real só acontece quando o usuário clica "Confirmar" no widget — o clique É o
// salvar ("IA nunca salva direto" preservado). O token assina tool + argumentos
// + dono (user/org) com validade curta; o /ai/confirm verifica tudo antes de
// despachar com confirmedToolCallId.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 10 * 60 * 1000; // 10 minutos

export interface PendingActionPayload {
  toolName: string;
  arguments: Record<string, unknown>;
  userId: string;
  organizationId: string;
  /** epoch ms de expiração */
  exp: number;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', process.env.JWT_SECRET || '').update(payloadB64).digest('base64url');
}

/** Assina uma ação pendente (tool + argumentos + dono) com exp = now + 10min. */
export function signPendingAction(input: {
  toolName: string;
  arguments: Record<string, unknown>;
  userId: string;
  organizationId: string;
}): string {
  const payload: PendingActionPayload = { ...input, exp: Date.now() + TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verifica assinatura, expiração e dono (usuário + organização).
 * Retorna o payload válido ou null — nunca lança.
 */
export function verifyPendingAction(
  token: string,
  expected: { userId: string; organizationId: string },
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
  if (payload.userId !== expected.userId || payload.organizationId !== expected.organizationId) return null;
  if (!payload.arguments || typeof payload.arguments !== 'object') return null;
  return payload;
}
