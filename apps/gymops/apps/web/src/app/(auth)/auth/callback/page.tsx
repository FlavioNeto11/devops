'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { ApiResponse } from '@gymops/shared';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      toast.error('Erro no login com Google. Tente novamente.');
      router.push('/login');
      return;
    }

    // Consume the short-lived auth_token cookie set by the backend OAuth callback
    api
      .get<ApiResponse<{ accessToken: string }>>('/auth/consume')
      .then(async (res) => {
        const token = res.data.accessToken;
        api.setToken(token);
        const me = await api.get<ApiResponse<{ id: string; name: string; email: string; avatarUrl: string | null }>>('/auth/me');
        setAuth(me.data, token);
        toast.success(`Bem-vindo, ${me.data.name}!`);
        router.push('/dashboard');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          toast.error('Erro ao autenticar. Tente novamente.');
        }
        router.push('/login');
      });
  }, [searchParams, router, setAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2 text-muted-foreground">Autenticando...</span>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Autenticando...</span>
        </div>
      )}
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
