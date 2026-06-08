'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type UserRole =
  | 'owner'
  | 'org_manager'
  | 'unit_manager'
  | 'area_leader'
  | 'executor'
  | 'viewer'
  | null;

interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  organizationId: string | null;
  userRole: UserRole;
  primaryUnitId: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  sessionReady: boolean;
  setHasHydrated: (value: boolean) => void;
  setSessionReady: (value: boolean) => void;
  setAuth: (user: AuthUser, token: string) => void;
  setOrganizationId: (id: string) => void;
  setUserContext: (role: UserRole, primaryUnitId: string | null) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
  canCreate: () => boolean;
  canEdit: () => boolean;
  isManager: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      organizationId: null,
      userRole: null,
      primaryUnitId: null,
      isAuthenticated: false,
      hasHydrated: false,
      sessionReady: false,

      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSessionReady: (value) => set({ sessionReady: value }),

      setAuth: (user, token) => {
        api.setToken(token);
        set({ user, token, isAuthenticated: true, sessionReady: true });
      },

      setOrganizationId: (id) => set({ organizationId: id }),

      setUserContext: (role, primaryUnitId) => set({ userRole: role, primaryUnitId }),

      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),

      logout: () => {
        api.setToken(null);
        set({ user: null, token: null, organizationId: null, userRole: null, primaryUnitId: null, isAuthenticated: false, sessionReady: true });
      },

      // Helper: can this user create activities?
      // Backend does the fine-grained scope check; this only hides the CTA from pure viewers.
      canCreate: () => {
        const role = get().userRole;
        return role === 'owner' || role === 'org_manager' || role === 'unit_manager' || role === 'area_leader' || role === 'executor';
      },

      // Helper: can this user edit (in general — per-activity check is still on the API)?
      canEdit: () => {
        const role = get().userRole;
        return role !== 'viewer' && role !== null;
      },

      // Helper: org or unit manager level?
      isManager: () => {
        const role = get().userRole;
        return role === 'owner' || role === 'org_manager' || role === 'unit_manager';
      },
    }),
    {
      name: 'gymops-auth',
      // token is intentionally excluded — kept in memory only to prevent XSS via localStorage
      partialize: (state) => ({
        user: state.user,
        organizationId: state.organizationId,
        userRole: state.userRole,
        primaryUnitId: state.primaryUnitId,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
