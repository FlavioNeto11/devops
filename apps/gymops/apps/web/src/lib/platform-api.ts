import { api } from './api';
import type { ApiResponse } from '@gymops/shared';

// ── Tipos da plataforma (super-admin) ──────────────────────────────────────────
export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
  isActive: boolean;
  counts: { units: number; members: number; activities: number };
}

export interface PlatformOrgDetail extends PlatformOrg {
  settings: unknown;
  plan: unknown;
  owners: { id: string; name: string; email: string }[];
}

export interface PlatformMaster {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  initialUnit?: { name: string; code?: string; address?: string };
}

// ── Cliente (todas as rotas exigem master da plataforma no backend) ────────────
export const platformApi = {
  listOrganizations: (params?: { status?: 'active' | 'inactive' | 'all'; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    const s = qs.toString();
    return api.get<ApiResponse<PlatformOrg[]>>(`/admin/organizations${s ? `?${s}` : ''}`);
  },
  getOrganization: (id: string) => api.get<ApiResponse<PlatformOrgDetail>>(`/admin/organizations/${id}`),
  createOrganization: (data: CreateOrgInput) =>
    api.post<ApiResponse<{ organizationId: string; organizationSlug: string; ownerUserId: string }>>('/admin/organizations', data),
  updateOrganization: (id: string, data: { name?: string; logoUrl?: string | null; isActive?: boolean }) =>
    api.patch<ApiResponse<{ id: string; name: string; slug: string; isActive: boolean }>>(`/admin/organizations/${id}`, data),
  listMasters: () => api.get<ApiResponse<PlatformMaster[]>>('/admin/masters'),
  createMaster: (data: { email: string; name?: string; password?: string }) =>
    api.post<ApiResponse<PlatformMaster>>('/admin/masters', data),
  revokeMaster: (id: string) => api.delete<void>(`/admin/masters/${id}`),
};
