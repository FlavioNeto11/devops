'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function AuthBootstrap() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const setSessionReady = useAuthStore((s) => s.setSessionReady);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!hasHydrated || sessionReady) return;

    let cancelled = false;

    const run = async () => {
      if (!isAuthenticated) {
        if (!cancelled) setSessionReady(true);
        return;
      }

      const token = await api.refreshSession();
      if (cancelled) return;

      if (!token) {
        logout();
        return;
      }

      setSessionReady(true);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isAuthenticated, sessionReady, logout, setSessionReady]);

  return null;
}
