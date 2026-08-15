'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, setSessionExpiredHandler } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function AuthBootstrap() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const setSessionReady = useAuthStore((s) => s.setSessionReady);
  const logout = useAuthStore((s) => s.logout);

  // Sessão expirada (refresh inválido) em qualquer tela → volta ao login com
  // aviso, em vez de prender o usuário num erro genérico de conexão (UX-GYMOPS-007).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      logout();
      toast.error('Sua sessão expirou. Faça login novamente.');
      router.replace('/login');
    });
    return () => setSessionExpiredHandler(null);
  }, [logout, router]);

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
