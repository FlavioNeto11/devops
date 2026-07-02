import { PrismaClient } from '@prisma/client';

// Singleton do PrismaClient para evitar múltiplas conexões em hot-reload (tsx watch).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// WAL: leitores (assistente de IA, backfill de embeddings) e o escritor (sessão Baileys)
// coexistem sem bloquear → elimina "Operations timed out" sob contenção. busy_timeout faz
// uma query esperar em vez de falhar. synchronous=NORMAL é seguro com WAL e mais rápido.
let _pragmasDone = false;
export async function initSqlitePragmas(): Promise<void> {
  if (_pragmasDone) return;
  try {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout=8000;');
    await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');
    _pragmasDone = true;
    console.log('[db] SQLite WAL + busy_timeout aplicados');
  } catch (e) {
    console.warn('[db] pragmas falharam:', (e as Error).message);
  }
}
