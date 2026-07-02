// =============================================================================
// Tranca de conversas × IA. Por padrão a IA NUNCA acessa conversas trancadas
// (Chat.locked=true): tools filtram, embeddings não indexam, sugestões não rodam.
// O usuário desbloqueia digitando o MESMO código da tranca (AppSetting.lockSecret)
// no assistente — de forma discreta, sem nada que exponha que há conversas trancadas.
// Estado em memória, por usuário, com TTL (re-tranca sozinho).
// =============================================================================
import { prisma } from '../../lib/prisma';

const TTL_MS = 30 * 60 * 1000; // desbloqueio vale 30min
const _unlocked = new Map<string, number>(); // userId -> expiry ms

export async function getLockSecret(userId: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { userId }, select: { lockSecret: true } }).catch(() => null);
  return s?.lockSecret ?? null;
}

export async function hasLock(userId: string): Promise<boolean> {
  return Boolean(await getLockSecret(userId));
}

export function isAiUnlocked(userId: string): boolean {
  const exp = _unlocked.get(userId);
  if (!exp) return false;
  if (exp <= Date.now()) {
    _unlocked.delete(userId);
    return false;
  }
  return true;
}

/** Desbloqueia a IA se `secret` confere com o código de tranca. Retorna true se conferiu. */
export async function tryUnlock(userId: string, secret: string): Promise<boolean> {
  const real = await getLockSecret(userId);
  if (!real || secret.trim() !== real) return false;
  _unlocked.set(userId, Date.now() + TTL_MS);
  return true;
}

export function relockAi(userId: string): void {
  _unlocked.delete(userId);
}
