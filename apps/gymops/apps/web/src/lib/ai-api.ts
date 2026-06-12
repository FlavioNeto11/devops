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
  clarifyingQuestions?: string[];
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

/** Ação mutante proposta pela IA (dry-run) aguardando confirmação do usuário. */
export interface AiPendingAction {
  toolName: string;
  preview: Record<string, unknown> | null;
  token: string;
}

export interface AiChatMeta {
  route?: string;
  specialist?: string | null;
  tools?: string[];
  judge?: number | null;
  memory?: { thread: boolean; recalled: number; turns: number | null } | null;
  pendingAction?: AiPendingAction;
}

/** Rascunho de revisão de checklist existente (IA propõe; usuário confirma). */
export interface ChecklistRevisionResult {
  revision: { items: Array<{ id: string | null; text: string }>; summary: string | null } | null;
  diff?: {
    added: number;
    updated: number;
    removed: number;
    removedItems: Array<{ id: string; text: string; done: boolean }>;
    updatedItems: Array<{ id: string; before: string; after: string }>;
  };
  aiUnavailable: boolean;
}

export const aiApi = {
  draft: (text: string, organizationId: string) =>
    api.post<ApiResponse<ActivityDraft>>('/ai/activities/draft', { text, organizationId }),

  suggestChecklist: (activityId: string) =>
    api.post<ApiResponse<ChecklistSuggestion>>('/ai/activities/checklist', { activityId }),

  reviseChecklist: (checklistId: string, instruction: string) =>
    api.post<ApiResponse<ChecklistRevisionResult>>(`/ai/checklists/${checklistId}/revise`, { instruction }),

  analyzeDelay: (activityId: string) =>
    api.post<ApiResponse<DelayAnalysis>>('/ai/activities/delay-analysis', { activityId }),

  getDailySummary: (unitId: string) =>
    api.get<ApiResponse<DailySummary | null>>(`/ai/summaries/daily?unitId=${unitId}`),

  generateDailySummary: (unitId: string, organizationId: string) =>
    api.post<ApiResponse<DailySummary>>('/ai/summaries/daily', { unitId, organizationId }),

  chat: (
    message: string,
    organizationId: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => api.post<ApiResponse<{ reply: string; meta?: AiChatMeta }>>('/ai/chat', { message, organizationId, history }),

  feedback: (input: {
    messageId: string;
    kind: 'thumbs_up' | 'thumbs_down';
    organizationId: string;
    reason?: string;
  }) => api.post<ApiResponse<{ id: string; kind: string }>>('/ai/feedback', input),

  confirm: (input: { token: string; organizationId: string }) =>
    api.post<ApiResponse<{ result: Record<string, unknown>; message: string }>>('/ai/confirm', input),
};
