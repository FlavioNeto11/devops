import { z } from 'zod';

/**
 * Revisão de um checklist EXISTENTE proposta pela IA (rascunho — quem aplica é
 * o usuário, via POST /checklists/:id/apply-revision). A IA devolve a LISTA
 * COMPLETA revisada: item com `id` = existente (texto possivelmente alterado);
 * sem `id` = novo; item existente ausente da lista = proposto para remoção.
 */
export const ChecklistRevisionSchema = z.object({
  items: z.array(z.object({
    id: z.string().nullable().optional(),
    text: z.string().min(1).max(500),
  })).min(1).max(30),
  summary: z.string().max(300).optional(),
});

export type ChecklistRevision = z.infer<typeof ChecklistRevisionSchema>;
