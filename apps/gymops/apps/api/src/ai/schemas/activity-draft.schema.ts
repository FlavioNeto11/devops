import { z } from 'zod';

export const ActivityDraftSchema = z.object({
  title: z.string().max(200),
  description: z.string().optional(),
  areaKey: z.string(),
  templateName: z.string().optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']),
  suggestedDueDays: z.number().int().min(1).max(90),
  checklist: z.array(z.string()).max(12),
  clarifyingQuestions: z.array(z.string()).max(6).optional(),
  metadata: z.record(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type ActivityDraft = z.infer<typeof ActivityDraftSchema>;
