'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { resolveApiUrl } from '@/lib/api-url';
import { useAuthStore, type UserRole } from '@/store/auth';
import type { ApiResponse, LoginResponse } from '@gymops/shared';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

function resolveRedirect(role: UserRole, primaryUnitId: string | null, isPlatformAdmin: boolean): string {
  if (isPlatformAdmin) return '/admin/organizations';
  if (role === 'owner' || role === 'org_manager') return '/dashboard';
  if (role === 'unit_manager' || role === 'area_leader') {
    return primaryUnitId ? `/units/${primaryUnitId}` : '/dashboard';
  }
  return '/me';
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setOrganizationId = useAuthStore((s) => s.setOrganizationId);
  const setUserContext = useAuthStore((s) => s.setUserContext);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const userRole = useAuthStore((s) => s.userRole);
  const primaryUnitId = useAuthStore((s) => s.primaryUnitId);
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);
  const setPlatformAdmin = useAuthStore((s) => s.setPlatformAdmin);
  const enableGoogleLogin = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN !== 'false';
  const enableSso = process.env.NEXT_PUBLIC_ENABLE_SSO === 'true';

  useEffect(() => {
    if (!hasHydrated || !sessionReady) return;
    if (!isAuthenticated) return;
    router.replace(resolveRedirect(userRole, primaryUnitId, isPlatformAdmin));
  }, [hasHydrated, isAuthenticated, isPlatformAdmin, primaryUnitId, router, sessionReady, userRole]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginForm) {
    try {
      const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', values);
      setAuth(res.data.user, res.data.accessToken);
      if (res.data.organizationId) setOrganizationId(res.data.organizationId);
      const role = (res.data.role as UserRole) ?? null;
      setUserContext(role, res.data.primaryUnitId ?? null);
      const platformAdmin = res.data.isPlatformAdmin ?? false;
      setPlatformAdmin(platformAdmin);
      toast.success(`Bem-vindo, ${res.data.user.name}!`);
      router.push(resolveRedirect(role, res.data.primaryUnitId ?? null, platformAdmin));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('E-mail ou senha inválidos. Confira os dados e tente de novo.');
      } else if (err instanceof ApiError && err.status === 429) {
        toast.error('Muitas tentativas seguidas. Aguarde um minuto e tente novamente.');
      } else if (err instanceof ApiError && err.status >= 500) {
        toast.error('Servidor indisponível no momento. Tente novamente em instantes.');
      } else if (err instanceof TypeError) {
        toast.error('Sem conexão com o servidor. Verifique sua internet.');
      } else {
        toast.error('Erro ao fazer login. Tente novamente.');
      }
    }
  }

  const apiUrl = resolveApiUrl();

  if (!hasHydrated || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          Carregando sessão...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">GymOps</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão operacional multiunidade</p>
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold">Entrar na sua conta</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="password">Senha</label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
            </Button>
          </form>

          {enableGoogleLogin ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 border-t" />
              </div>

              <a href={`${apiUrl}/auth/google/start`}>
                <Button variant="outline" className="mt-4 w-full gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Entrar com Google
                </Button>
              </a>
            </>
          ) : null}

          {enableSso ? (
            <a href={`${apiUrl}/auth/keycloak/start`}>
              <Button variant="outline" className="mt-3 w-full gap-2">
                <Building2 className="h-4 w-4" />
                Entrar com SSO (Keycloak)
              </Button>
            </a>
          ) : null}

          <p className="mt-6 border-t pt-4 text-center text-sm text-muted-foreground">
            Não tem conta?{' '}
            <a href="/setup" className="font-medium text-primary hover:underline">Cadastre sua empresa</a>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Plataforma de gestão operacional &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
