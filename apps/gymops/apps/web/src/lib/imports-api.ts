import { api } from './api';
import type { ApiResponse } from '@gymops/shared';

export interface TrelloBoard {
  id: string;
  name: string;
  desc?: string;
  lists?: TrelloList[];
  cards?: TrelloCard[];
  members?: TrelloMember[];
  checklists?: TrelloChecklist[];
  actions?: TrelloAction[];
}

export interface TrelloList { id: string; name: string; closed: boolean; pos: number }
export interface TrelloCard { id: string; name: string; idList: string; closed: boolean; idMembers: string[] }
export interface TrelloMember { id: string; fullName: string; email?: string }
export interface TrelloChecklist { id: string; name: string; idCard: string; checkItems: unknown[] }
export interface TrelloAction { id: string; type: string; date: string; data: { text?: string; card?: { id: string } }; memberCreator: { fullName: string } }

export interface ListPreview {
  trelloListId: string;
  trelloListName: string;
  suggestedType: 'area' | 'ignore';
  suggestedValue: string | null;
  confidence: 'high' | 'low';
  cardCount: number;
}

export interface BoardPreview {
  trelloBoardId: string;
  trelloBoardName: string;
  suggestedUnitName: string;
  lists: ListPreview[];
  stats: { cards: number; lists: number; members: number; checklists: number; comments: number };
}

export interface ImportPreview { boards: BoardPreview[] }

export interface ListMapping {
  trelloListId: string;
  type: 'area' | 'ignore';
  value: string | null;
}

export interface BoardMapping {
  trelloBoardId: string;
  targetUnitId: string | null;
  targetUnitName: string;
  lists: ListMapping[];
}

export interface ImportMapping { boards: BoardMapping[] }

export interface ImportJob {
  id: string;
  provider: string;
  status: 'pending' | 'processing' | 'awaiting_review' | 'committed' | 'failed';
  summary: {
    phase: 'preview' | 'processing' | 'result' | 'error';
    boards?: BoardPreview[];
    created?: number;
    skipped?: number;
    failed?: number;
    errors?: string[];
    message?: string;
    progress?: { done: number; total: number };
  } | null;
  mapping: ImportMapping | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationAccount {
  id: string;
  provider: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const integrationsApi = {
  getAll: (organizationId: string) =>
    api.get<ApiResponse<IntegrationAccount[]>>(`/integrations?organizationId=${organizationId}`),

  getTrelloAuthUrl: () =>
    api.get<ApiResponse<{ url: string }>>('/integrations/trello/auth-url'),

  connectTrello: (token: string, organizationId: string) =>
    api.post<ApiResponse<{ id: string }>>('/integrations/trello/connect', { token, organizationId }),

  getTrelloBoards: (organizationId: string) =>
    api.get<ApiResponse<Array<{ id: string; name: string }>>>(`/integrations/trello/boards?organizationId=${organizationId}`),

  disconnect: (id: string) => api.delete<void>(`/integrations/${id}`),
};

export const importsApi = {
  list: (organizationId: string) =>
    api.get<ApiResponse<ImportJob[]>>(`/imports?organizationId=${organizationId}`),

  createFromJson: (organizationId: string, boardData: unknown) =>
    api.post<ApiResponse<ImportJob>>('/imports/json', { organizationId, boardData }),

  createFromApi: (data: { organizationId: string; integrationAccountId: string; boardIds: string[] }) =>
    api.post<ApiResponse<ImportJob>>('/imports/api', data),

  get: (id: string) =>
    api.get<ApiResponse<ImportJob>>(`/imports/${id}`),

  getPreview: (id: string) =>
    api.get<ApiResponse<{ preview: { phase: string; boards?: BoardPreview[] }; mapping: ImportMapping | null }>>(`/imports/${id}/preview`),

  patchMapping: (id: string, mapping: ImportMapping) =>
    api.patch<ApiResponse<{ ok: boolean }>>(`/imports/${id}/mapping`, mapping),

  commit: (id: string) =>
    api.post<ApiResponse<{ status: string }>>(`/imports/${id}/commit`),
};
