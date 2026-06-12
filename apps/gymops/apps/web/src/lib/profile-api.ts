import { api } from './api';
import type { ApiResponse } from '@gymops/shared';
import type { AuditLogRecord } from './admin-api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export const profileApi = {
  get: () => api.get<ApiResponse<UserProfile>>('/me/profile'),

  update: (data: { name?: string; phone?: string | null; timezone?: string }) =>
    api.patch<ApiResponse<UserProfile>>('/me/profile', data),

  presignAvatar: (mimeType: string) =>
    api.post<ApiResponse<{ uploadUrl: string; objectKey: string; expiresIn: number }>>('/me/avatar/presign', { mimeType }),

  confirmAvatar: (objectKey: string) =>
    api.post<ApiResponse<UserProfile>>('/me/avatar', { objectKey }),
};

// ── Blueprint do onboarding (espelha o zod do backend) ────────────────────────

export interface BlueprintTemplate {
  name: string;
  description?: string;
  defaultChecklist: string[];
  defaultPriority: 'baixa' | 'media' | 'alta' | 'critica';
  defaultVisibility: 'inherited' | 'restricted';
  suggestedSlaDays?: number;
  specificFields?: string[];
}

export interface BlueprintArea {
  key: string;
  name: string;
  color: string;
  visibilityDefault: 'inherited' | 'restricted';
  /** Omitido + key canônica = templates canônicos; [] = nenhum. */
  templates?: BlueprintTemplate[];
}

export interface BlueprintUnit {
  name: string;
  code?: string;
  address?: string;
}

export interface OrgBlueprint {
  areas: BlueprintArea[];
  units: BlueprintUnit[];
}

/** Rascunho da IA (POST /organizations/setup-draft) — proposta editável. */
export interface OrgSetupDraft {
  organizationName?: string;
  suggestedSlug?: string;
  segmentLabel?: string;
  areas: Array<BlueprintArea & { templates: BlueprintTemplate[] }>;
  unitsSuggested?: BlueprintUnit[];
  confidence: number;
  reasoning?: string;
}

export const organizationApi = {
  get: (id: string) =>
    api.get<ApiResponse<{ id: string; name: string; slug: string; logoUrl: string | null; settings: Record<string, unknown> }>>(`/organizations/${id}`),

  update: (id: string, data: { name?: string; logoUrl?: string | null; settings?: Record<string, unknown> }) =>
    api.patch<ApiResponse<{ id: string; name: string; slug: string }>>(`/organizations/${id}`, data),

  checkSlug: (slug: string) =>
    api.get<ApiResponse<{ available: boolean }>>(`/organizations/slug-available?slug=${encodeURIComponent(slug)}`),

  create: (data: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    initialUnit?: { name: string; code?: string; address?: string };
    blueprint?: OrgBlueprint;
    setupMeta?: { mode: 'ai' | 'manual'; segmentLabel?: string };
  }) =>
    api.post<ApiResponse<{ organizationId: string; organizationSlug: string; userId: string }>>('/organizations', data),

  setupDraft: (businessDescription: string, organizationName?: string) =>
    api.post<ApiResponse<OrgSetupDraft>>('/organizations/setup-draft', {
      businessDescription,
      ...(organizationName ? { organizationName } : {}),
    }),
};

export const auditLogsApi = {
  list: (params: { organizationId: string; action?: string; dateFrom?: string; dateTo?: string; page?: number }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) as Record<string, string>).toString();
    return api.get<ApiResponse<AuditLogRecord[]> & { meta?: { total: number; page: number; limit: number; pages: number } }>(`/audit-logs?${qs}`);
  },
};
