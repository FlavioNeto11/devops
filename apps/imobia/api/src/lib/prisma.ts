// PrismaClient singleton. Em F2+ ganha um adaptador rawQuery para pgvector (busca semantica
// e memoria da IA usam vector(1536) via SQL cru, pois o Prisma Client nao seleciona vector).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
});

/** Ping de conectividade para o /health (nao lanca — retorna boolean). */
export async function dbHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
