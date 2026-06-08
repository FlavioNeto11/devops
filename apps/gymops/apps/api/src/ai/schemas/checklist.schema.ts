import { z } from 'zod';

export const ChecklistSuggestionSchema = z.object({
  items: z.array(z.object({
    text: z.string().max(500),
    rationale: z.string().optional(),
    optional: z.boolean().default(false),
  })).max(12),
});

export type ChecklistSuggestion = z.infer<typeof ChecklistSuggestionSchema>;
