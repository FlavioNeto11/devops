'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  useEffect(() => {
    if (!hasHydrated || !sessionReady) return;
    router.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [hasHydrated, isAuthenticated, router, sessionReady]);

  return hasHydrated && sessionReady ? <span className="sr-only">Redirecionando...</span> : null;
}
