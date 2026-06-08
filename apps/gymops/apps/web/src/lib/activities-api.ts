import { api } from './api';
import type { ApiResponse } from '@gymops/shared';

export interface RecurrenceRule {
  id: string;
  activityId: string;
  frequency: 'diaria' | 'semanal' | 'mensal' | 'intervalo_customizado';
  interval: number;
  weekdays: number[] | null;
  generationMode: 'on_complete' | 'pre_generate';
  preGenerateN: number | null;
  nextRunAt: string | null;
}

export interface ActivityTemplate {
  id: string;
  organizationId: string;
  areaId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  config: {
    defaultChecklist: string[];
    defaultPriority: string;
    defaultVisibility: string;
    suggestedSlaDays?: number;
    specificFields?: string[];
  };
  area: { id: string; name: string; color: string | null; key: string } | null;
}

export interface ActivityDetail {
  id: string;
  organizationId: string;
  unitId: string;
  areaId: string;
  templateId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  visibilityMode: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  unit: { id: string; name: string };
  area: { id: string; name: string; color: string | null };
  template: { id: string; name: string } | null;
  recurrenceRule: RecurrenceRule | null;
  assignees: Array<{ userId: string; name: string; avatarUrl: string | null; kind: string; user?: { id: string; name: string; avatarUrl: string | null } }>;
  checklists: Array<{
    id: string;
    title: string;
    order: number;
    items: Array<{ id: string; text: string; done: boolean; doneBy: string | null; doneAt: string | null; order: number }>;
  }>;
  attachments: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number | null; createdAt: string; downloadUrl?: string | null }>;
  commentCount: number;
  checklistProgress: { done: number; total: number };
}

export interface ActivityListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  isOverdue: boolean;
  unit: { id: string; name: string };
  area: { id: string; name: string; color: string | null };
  assignees: Array<{ userId: string; name: string; avatarUrl: string | null; kind: string }>;
  checklistProgress: { done: number; total: number };
  recurrenceRule?: RecurrenceRule | null;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface Comment {
  id: string;
  userId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

export const activitiesApi = {
  list: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>,
    ).toString();
    return api.get<ApiResponse<ActivityListItem[]>>(`/activities?${qs}`);
  },

  get: (id: string) => api.get<ApiResponse<ActivityDetail>>(`/activities/${id}`),

  create: (data: Record<string, unknown>) => api.post<ApiResponse<ActivityDetail>>('/activities', data),

  patch: (id: string, data: Record<string, unknown>) =>
    api.patch<ApiResponse<ActivityDetail>>(`/activities/${id}`, data),

  delete: (id: string) => api.delete<void>(`/activities/${id}`),

  assign: (id: string, data: { add?: Array<{ userId: string; kind: string }>; remove?: string[] }) =>
    api.post(`/activities/${id}/assign`, data),

  getEvents: (id: string) => api.get<ApiResponse<ActivityEvent[]>>(`/activities/${id}/events`),

  getComments: (id: string) => api.get<ApiResponse<Comment[]>>(`/activities/${id}/comments`),

  addComment: (id: string, body: string) => api.post<ApiResponse<Comment>>(`/activities/${id}/comments`, { body }),

  editComment: (commentId: string, body: string) => api.patch<ApiResponse<Comment>>(`/comments/${commentId}`, { body }),

  deleteComment: (commentId: string) => api.delete<void>(`/comments/${commentId}`),

  toggleChecklistItem: (itemId: string, done: boolean) =>
    api.patch(`/checklist-items/${itemId}`, { done }),

  addChecklistItem: (checklistId: string, text: string) =>
    api.post(`/checklists/${checklistId}/items`, { text }),

  createChecklist: (activityId: string, title: string) =>
    api.post<ApiResponse<{ id: string; title: string; order: number }>>(`/activities/${activityId}/checklists`, { title, items: [] }),

  getAttachments: (id: string) => api.get<ApiResponse<ActivityDetail['attachments']>>(`/activities/${id}/attachments`),

  presignAttachment: (id: string, data: { filename: string; mimeType: string; sizeBytes: number }) =>
    api.post<ApiResponse<{ uploadUrl: string | null; objectKey: string; expiresIn: number }>>(`/activities/${id}/attachments/presign`, data),

  registerAttachment: (id: string, data: { objectKey: string; filename: string; mimeType: string; sizeBytes?: number }) =>
    api.post(`/activities/${id}/attachments`, data),

  deleteAttachment: (attachmentId: string) => api.delete<void>(`/attachments/${attachmentId}`),

  setRecurrence: (id: string, data: Partial<RecurrenceRule>) =>
    api.post<ApiResponse<RecurrenceRule>>(`/activities/${id}/recurrence`, data),

  deleteRecurrence: (id: string) => api.delete<void>(`/activities/${id}/recurrence`),
};

export const templatesApi = {
  list: (params: { organizationId: string; areaId?: string }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>,
    ).toString();
    return api.get<ApiResponse<ActivityTemplate[]>>(`/activity-templates?${qs}`);
  },
};

export const notificationsApi = {
  getPreferences: () => api.get<ApiResponse<Array<{ userId: string; channel: string; enabled: boolean }>>>('/notifications/preferences'),

  updatePreferences: (
    userId: string,
    prefs: { email?: { enabled: boolean }; push?: { enabled: boolean }; whatsapp?: { enabled: boolean } },
  ) => api.patch(`/notifications/preferences/${userId}`, prefs),

  subscribe: (subscription: PushSubscriptionJSON) =>
    api.post('/notifications/subscribe', { subscription }),

  getVapidKey: () => api.get<ApiResponse<{ publicKey: string | null }>>('/notifications/vapid-key'),
};
