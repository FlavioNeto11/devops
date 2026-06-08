import { api } from './api';
import type { ApiResponse } from '@gymops/shared';
import type { ActivityTemplate } from './activities-api';

// ── Units ────────────────────────────────────────────────────────────────────

export interface UnitSummary {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  status: string;
  organizationId: string;
}

export interface UnitAreaRecord {
  unitId: string;
  areaId: string;
  order: number;
  enabled: boolean;
  area: AreaSummary;
}

export interface UnitDetail extends UnitSummary {
  unitAreas: UnitAreaRecord[];
}

export const unitsApi = {
  list: (organizationId: string, status?: string) => {
    const qs = new URLSearchParams({ organizationId, ...(status ? { status } : {}) }).toString();
    return api.get<ApiResponse<UnitSummary[]>>(`/units?${qs}`);
  },

  get: (id: string) =>
    api.get<ApiResponse<UnitDetail>>(`/units/${id}`),

  create: (data: { organizationId: string; name: string; code?: string; address?: string }) =>
    api.post<ApiResponse<UnitSummary>>('/units', data),

  update: (id: string, data: { name?: string; code?: string; address?: string; status?: string }) =>
    api.patch<ApiResponse<UnitSummary>>(`/units/${id}`, data),

  archive: (id: string) => api.delete<void>(`/units/${id}`),

  reorderAreas: (id: string, order: Array<{ areaId: string; order: number }>) =>
    api.patch<void>(`/units/${id}/areas/reorder`, { order }),

  addArea: (id: string, areaId: string, order?: number) =>
    api.post(`/units/${id}/areas`, { areaId, order: order ?? 0 }),

  removeArea: (id: string, areaId: string) =>
    api.delete<void>(`/units/${id}/areas/${areaId}`),
};

// ── Areas ────────────────────────────────────────────────────────────────────

export interface AreaSummary {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  color: string | null;
  visibilityDefault: string;
  deletedAt: string | null;
}

export const areasApi = {
  list: (organizationId: string) =>
    api.get<ApiResponse<AreaSummary[]>>(`/areas?organizationId=${organizationId}`),

  create: (data: { organizationId: string; name: string; key: string; color?: string; visibilityDefault?: string }) =>
    api.post<ApiResponse<AreaSummary>>('/areas', data),

  update: (id: string, data: { name?: string; color?: string; visibilityDefault?: string }) =>
    api.patch<ApiResponse<AreaSummary>>(`/areas/${id}`, data),

  archive: (id: string) => api.delete<void>(`/areas/${id}`),
};

// ── Templates ─────────────────────────────────────────────────────────────────

export const templatesAdminApi = {
  list: (organizationId: string, areaId?: string) => {
    const qs = new URLSearchParams({ organizationId, ...(areaId ? { areaId } : {}) }).toString();
    return api.get<ApiResponse<ActivityTemplate[]>>(`/activity-templates?${qs}`);
  },

  create: (data: { organizationId: string; areaId?: string; name: string; description?: string; config?: Record<string, unknown> }) =>
    api.post('/activity-templates', data),

  update: (id: string, data: { name?: string; description?: string | null; config?: Record<string, unknown> }) =>
    api.patch(`/activity-templates/${id}`, data),

  archive: (id: string) => api.delete<void>(`/activity-templates/${id}`),

  duplicate: (id: string) => api.post(`/activity-templates/${id}/duplicate`, {}),
};

// ── Memberships ───────────────────────────────────────────────────────────────

export interface MembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  scopeType: string;
  scopeId: string;
  role: string;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export const membershipsApi = {
  list: (params: { organizationId: string; userId?: string; scopeType?: string; scopeId?: string }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>).toString();
    return api.get<ApiResponse<MembershipRecord[]>>(`/memberships?${qs}`);
  },

  create: (data: { organizationId: string; userId: string; role: string; scopeType: string; scopeId: string }) =>
    api.post<ApiResponse<MembershipRecord>>('/memberships', data),

  /** Update the role of an existing membership at the same scope (backend upserts). */
  updateRole: (m: MembershipRecord, newRole: string) =>
    api.post<ApiResponse<MembershipRecord>>('/memberships', {
      organizationId: m.organizationId,
      userId: m.userId,
      role: newRole,
      scopeType: m.scopeType,
      scopeId: m.scopeId,
    }),

  addByEmail: (data: { email: string; organizationId: string; role: string; scopeType: string; scopeId: string }) =>
    api.post<ApiResponse<MembershipRecord>>('/memberships/invite-by-email', data),

  revoke: (id: string) => api.delete<void>(`/memberships/${id}`),
};

// ── Invitations ───────────────────────────────────────────────────────────────

export interface InvitationRecord {
  id: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export const invitationsApi = {
  list: (organizationId: string, status?: string) => {
    const qs = new URLSearchParams({ organizationId, ...(status ? { status } : {}) }).toString();
    return api.get<ApiResponse<InvitationRecord[]>>(`/invitations?${qs}`);
  },

  create: (data: { organizationId: string; email: string; role: string; scopeType: string; scopeId: string }) =>
    api.post<ApiResponse<{ id: string; email: string; status: string }>>('/invitations', data),

  cancel: (id: string) => api.delete<void>(`/invitations/${id}`),

  getByToken: (token: string) =>
    api.get<ApiResponse<{ email: string; role: string; organization: { name: string; slug: string } | null; expiresAt: string }>>(`/invitations/${token}`),

  accept: (token: string, data: { name: string; password: string }) =>
    api.post<ApiResponse<{ userId: string }>>(`/invitations/${token}/accept`, data),
};

// ── Recurrences ───────────────────────────────────────────────────────────────

export interface RecurrenceSummary {
  id: string;
  frequency: string;
  interval: number;
  weekdays: number[] | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  status: string;
  activity: {
    id: string;
    title: string;
    unitId: string;
    areaId: string;
    unit: { id: string; name: string };
    area: { id: string; name: string; color: string | null };
  };
}

export const recurrencesApi = {
  list: (params: { organizationId: string; unitId?: string; areaId?: string; status?: string }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>).toString();
    return api.get<ApiResponse<RecurrenceSummary[]>>(`/recurrences?${qs}`);
  },

  update: (id: string, data: { status?: string; frequency?: string; interval?: number; weekdays?: number[] | null }) =>
    api.patch(`/recurrences/${id}`, data),

  delete: (id: string) => api.delete<void>(`/recurrences/${id}`),
};

// ── Audit Logs ─────────────────────────────────────────────────────────────────

export interface AuditLogRecord {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export const auditLogsApi = {
  list: (params: { organizationId: string; action?: string; dateFrom?: string; dateTo?: string; page?: number }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) as Record<string, string>).toString();
    return api.get<ApiResponse<AuditLogRecord[]> & { meta: { total: number; page: number; limit: number; pages: number } }>(`/audit-logs?${qs}`);
  },
};

// ── Saved Views ────────────────────────────────────────────────────────────────

export interface SavedViewRecord {
  id: string;
  name: string;
  filtersJson: Record<string, unknown>;
  createdAt: string;
}

export const savedViewsApi = {
  list: (organizationId: string) =>
    api.get<ApiResponse<SavedViewRecord[]>>(`/saved-views?organizationId=${organizationId}`),

  create: (data: { organizationId: string; name: string; filtersJson: Record<string, unknown> }) =>
    api.post<ApiResponse<SavedViewRecord>>('/saved-views', data),

  delete: (id: string) => api.delete<void>(`/saved-views/${id}`),
};

// ── Notification Deliveries ────────────────────────────────────────────────────

export interface DeliveryRecord {
  id: string;
  channel: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  userId: string;
}

export const deliveriesApi = {
  list: (params: { organizationId?: string; channel?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) as Record<string, string>).toString();
    return api.get<ApiResponse<DeliveryRecord[]>>(`/notifications/deliveries?${qs}`);
  },
};

// ── Integrations extended ─────────────────────────────────────────────────────

export const integrationsExtApi = {
  getTrelloHealth: (organizationId: string) =>
    api.get<ApiResponse<{ connected: boolean; healthy: boolean; connectedAt?: string }>>(`/integrations/trello/health?organizationId=${organizationId}`),

  reconnectTrello: (organizationId: string) =>
    api.post<ApiResponse<{ url: string }>>('/integrations/trello/reconnect', { organizationId }),

  getWhatsAppStatus: (organizationId: string) =>
    api.get<ApiResponse<{ configured: boolean; sandbox: boolean; from: string | null; lastErrors: string[] }>>(`/integrations/whatsapp/status?organizationId=${organizationId}`),

  testNotification: (channel: 'email' | 'push' | 'whatsapp', organizationId?: string) =>
    api.post<ApiResponse<{ sent: boolean }>>('/notifications/test', { channel, organizationId }),

  getImportItems: (jobId: string, params?: { status?: string; page?: number }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) as Record<string, string>).toString();
    return api.get(`/imports/${jobId}/items?${qs}`);
  },

  retryImport: (jobId: string) => api.post(`/imports/${jobId}/retry`, {}),
  cancelImport: (jobId: string) => api.post(`/imports/${jobId}/cancel`, {}),
};
