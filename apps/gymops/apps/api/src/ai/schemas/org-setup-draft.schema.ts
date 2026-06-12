import { z } from 'zod';
import { BlueprintAreaSchema, BlueprintTemplateSchema, BlueprintUnitSchema } from '../../lib/org-blueprint.schema.js';

/**
 * Rascunho de configuração inicial de organização proposto pela IA a partir da
 * descrição livre do negócio (POST /organizations/setup-draft). É APENAS uma
 * proposta: o usuário revisa/edita no wizard e confirma via POST /organizations
 * com blueprint. Validação de SHAPE — o conteúdo (quais áreas/templates fazem
 * sentido para o segmento) é decisão da IA guiada pelo prompt.
 */
export const OrgSetupDraftSchema = z.object({
  organizationName: z.string().min(2).max(100).optional(),
  suggestedSlug: z.string().regex(/^[a-z0-9-]{3,60}$/).optional(),
  segmentLabel: z.string().max(60).optional(),
  areas: z.array(BlueprintAreaSchema.extend({
    // No rascunho da IA os templates são SEMPRE propostos (1-6 por área).
    templates: z.array(BlueprintTemplateSchema).min(1).max(6),
  })).min(3).max(10),
  unitsSuggested: z.array(BlueprintUnitSchema).max(5).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500).optional(),
});

export type OrgSetupDraft = z.infer<typeof OrgSetupDraftSchema>;
