'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Building2, Users, LogOut, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin/organizations', label: 'Academias', icon: Building2 },
  { href: '/admin/masters', label: 'Masters', icon: Users },
];

export default function AdminLayout({ children }: { readonly children: React.ReactNode }) {
  const { isAuthenticated, isPlatformAdmin, hasHydrated, sessionReady, user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!hasHydrated || !sessionReady) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (!isPlatformAdmin) { router.replace('/me'); }
  }, [hasHydrated, sessionReady, isAuthenticated, isPlatformAdmin, router]);

  if (!hasHydrated || !sessionReady) return null;
  if (!isAuthenticated || !isPlatformAdmin) return null;

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    logout();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">GymOps · Plataforma</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground md:inline">{user?.email}</span>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b bg-background px-2 md:px-4">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}
