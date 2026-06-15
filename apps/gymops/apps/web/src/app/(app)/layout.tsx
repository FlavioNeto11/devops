'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Menu, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TutorialProvider } from '@/features/tutorial';
import type { ApiResponse, UnitDTO } from '@gymops/shared';

// Título da aba do navegador por rota — várias abas do GymOps ficam distinguíveis.
const PAGE_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/dashboard/, 'Painel Geral'],
  [/^\/me/, 'Minhas Atividades'],
  [/^\/activities/, 'Central de Atividades'],
  [/^\/profile/, 'Meu Perfil'],
  [/^\/settings\/team/, 'Equipe'],
  [/^\/settings\/templates/, 'Templates'],
  [/^\/settings\/imports/, 'Importações'],
  [/^\/settings\/audit/, 'Auditoria'],
  [/^\/settings\/areas/, 'Áreas'],
  [/^\/settings\/organization/, 'Organização'],
  [/^\/settings/, 'Configurações'],
  [/^\/units\//, 'Unidade'],
  [/^\/help/, 'Central de Ajuda'],
];

export default function AppLayout({ children }: { readonly children: React.ReactNode }) {
  const { isAuthenticated, organizationId, hasHydrated, sessionReady } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const match = PAGE_TITLES.find(([re]) => re.test(pathname ?? ''));
    document.title = match ? `${match[1]} · GymOps` : 'GymOps';
  }, [pathname]);

  useEffect(() => {
    if (!hasHydrated || !sessionReady) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, router, sessionReady]);

  const { data: unitsData } = useQuery({
    queryKey: ['units', organizationId],
    queryFn: () =>
      api.get<ApiResponse<UnitDTO[]>>(`/units?organizationId=${organizationId}&status=active`),
    enabled: hasHydrated && sessionReady && !!organizationId && isAuthenticated,
  });

  const { data: orgData } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () =>
      api.get<ApiResponse<{ id: string; name: string; slug: string }>>(`/organizations/${organizationId}`),
    enabled: hasHydrated && sessionReady && !!organizationId && isAuthenticated,
  });

  if (!hasHydrated || !sessionReady) return null;
  if (!isAuthenticated) return null;

  return (
    <TutorialProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex h-14 shrink-0 items-center border-b bg-background px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu de navegação" title="Menu de navegação" aria-expanded={mobileNavOpen} aria-controls="app-sidebar">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <span className="ml-2 truncate text-sm font-semibold flex-1">
            {orgData?.data?.name ?? 'GymOps'}
          </span>
          <Link href="/help" aria-label="Central de ajuda">
            <Button data-tutorial="app-help-button" variant="ghost" size="icon">
              <HelpCircle className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        {/* Sidebar + content */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            units={unitsData?.data ?? []}
            organizationName={orgData?.data?.name ?? 'GymOps'}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
          <main className="flex-1 overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </TutorialProvider>
  );
}
