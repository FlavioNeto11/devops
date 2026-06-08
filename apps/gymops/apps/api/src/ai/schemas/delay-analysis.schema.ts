import { z } from 'zod';

export const DelayAnalysisSchema = z.object({
  summary: z.string().max(300),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  possibleReasons: z.array(z.string()).max(4),
  suggestedActions: z.array(z.string()).max(4),
});

export type DelayAnalysis = z.infer<typeof DelayAnalysisSchema>;
