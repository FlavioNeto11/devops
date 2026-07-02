// Escritor da linha do tempo ("documentar cada etapa"). Polimorfico: anexa a qualquer
// entidade e registra qual ator (IA/humano) produziu o passo. Fail-soft (nunca lanca).
import { prisma } from './prisma';
import type { AiActor, TimelineKind } from '@prisma/client';

export async function appendTimeline(entry: {
  organizationId: string;
  entityType: string;
  entityId: string;
  kind: TimelineKind;
  actorType?: AiActor;
  actorUserId?: string | null;
  title: string;
  summary?: string;
  payload?: unknown;
  correlationId?: string | null;
}): Promise<void> {
  try {
    await prisma.timelineEntry.create({
      data: {
        organizationId: entry.organizationId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        kind: entry.kind,
        actorType: entry.actorType ?? 'system',
        actorUserId: entry.actorUserId ?? null,
        title: entry.title,
        summary: entry.summary,
        payload: (entry.payload ?? {}) as any,
        correlationId: entry.correlationId ?? null,
      },
    });
  } catch (err) {
    console.error('[imobia] appendTimeline falhou (fail-soft):', (err as Error).message);
  }
}
