import { z } from 'zod';

/**
 * Working Memory (memória de trabalho) de uma conversa operacional SICAT/CETESB.
 * É mantida pela própria IA (um LLM atualiza o estado a cada turno) e recuperada em
 * todo turno para dar CONTINUIDADE real entre chamadas — substituindo a extração
 * heurística + injeção solta de data no prompt. Persiste em conversation_memory
 * (summary_kind = 'working_memory'), uma linha por conversa (upsert).
 */

export const WORKING_MEMORY_VERSION = 'working-memory.v1' as const;
export const WORKING_MEMORY_KIND = 'working_memory' as const;

export type WorkingMemoryDateWindow = {
  dateFrom: string | null;
  dateTo: string | null;
  label: string | null;
  // Filtro/agrupamento ativos junto da janela (ex.: status "cancelado", groupBy "status").
  // Persistidos para follow-ups REUSAREM o recorte confirmado, não só o período.
  status: string | null;
  groupBy: string | null;
};

export type WorkingMemoryFocus = {
  partnerRole: string | null;
  activeDateWindow: WorkingMemoryDateWindow | null;
  activeManifestIds: string[];
  activeJobIds: string[];
  activeCdfIds: string[];
};

export type WorkingMemory = {
  version: typeof WORKING_MEMORY_VERSION;
  goal: string | null;
  operationalFocus: WorkingMemoryFocus;
  establishedFacts: string[];
  openThreads: string[];
  narrative: string | null;
  updatedAt: string;
};

const trimmedDate = z.string().trim().max(32);

const dateWindowSchema = z
  .object({
    dateFrom: trimmedDate.nullable().optional(),
    dateTo: trimmedDate.nullable().optional(),
    label: z.string().trim().max(120).nullable().optional(),
    status: z.string().trim().max(80).nullable().optional(),
    groupBy: z.string().trim().max(40).nullable().optional()
  })
  .nullable();

/**
 * Schema da SAÍDA do LLM updater. version/updatedAt são carimbados pelo código,
 * não pelo modelo. passthrough tolera campos extras sem quebrar.
 */
export const workingMemoryDraftSchema = z
  .object({
    goal: z.string().trim().max(600).nullable().optional(),
    operationalFocus: z
      .object({
        partnerRole: z.string().trim().max(60).nullable().optional(),
        activeDateWindow: dateWindowSchema.optional(),
        activeManifestIds: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
        activeJobIds: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
        activeCdfIds: z.array(z.string().trim().min(1).max(80)).max(40).optional()
      })
      .optional(),
    establishedFacts: z.array(z.string().trim().min(1).max(400)).max(20).optional(),
    openThreads: z.array(z.string().trim().min(1).max(400)).max(15).optional(),
    narrative: z.string().trim().max(1200).nullable().optional()
  })
  .passthrough();

export type WorkingMemoryDraft = z.infer<typeof workingMemoryDraftSchema>;

export function emptyWorkingMemory(updatedAt: string): WorkingMemory {
  return {
    version: WORKING_MEMORY_VERSION,
    goal: null,
    operationalFocus: {
      partnerRole: null,
      activeDateWindow: null,
      activeManifestIds: [],
      activeJobIds: [],
      activeCdfIds: []
    },
    establishedFacts: [],
    openThreads: [],
    narrative: null,
    updatedAt
  };
}
