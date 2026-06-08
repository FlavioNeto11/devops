import { api } from './api';
import type { ApiResponse } from '@gymops/shared';

export interface ActivityDraft {
  title: string;
  description?: string;
  areaKey: string;
  templateName?: string;
  priority: 'baixa' | 'media' | 'alta' | 'critica';
  suggestedDueDays: number;
  checklist: string[];
  confidence: number;
  reasoning?: string;
}

export interface ChecklistItem {
  text: string;
  rationale?: string;
  optional: boolean;
}

export interface ChecklistSuggestion {
  items: ChecklistItem[];
}

export interface DelayAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  possibleReasons: string[];
  suggestedActions: string[];
}

export interface DailySummary {
  summary: string;
  highlights: string[];
  alertCount: number;
  unitName: string;
  date: string;
  generatedAt: string;
}

export const aiApi = {
  draft: (text: string, organizationId: string) =>
    api.post<ApiResponse<ActivityDraft>>('/ai/activities/draft', { text, organizationId }),

  suggestChecklist: (activityId: string) =>
    api.post<ApiResponse<ChecklistSuggestion>>('/ai/activities/checklist', { activityId }),

  analyzeDelay: (activityId: string) =>
    api.post<ApiResponse<DelayAnalysis>>('/ai/activities/delay-analysis', { activityId }),

  getDailySummary: (unitId: string) =>
    api.get<ApiResponse<DailySummary | null>>(`/ai/summaries/daily?unitId=${unitId}`),

  generateDailySummary: (unitId: string, organizationId: string) =>
    api.post<ApiResponse<DailySummary>>('/ai/summaries/daily', { unitId, organizationId }),
};
