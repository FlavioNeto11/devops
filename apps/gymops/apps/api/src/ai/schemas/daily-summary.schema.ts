import { z } from 'zod';

export const DailySummarySchema = z.object({
  summary: z.string().max(600),
  highlights: z.array(z.string()).max(5),
  alertCount: z.number().int().min(0),
});

export type DailySummary = z.infer<typeof DailySummarySchema>;

export interface StoredDailySummary {
  summary: string;
  highlights: string[];
  alertCount: number;
  unitName: string;
  date: string;
  generatedAt: string;
}
