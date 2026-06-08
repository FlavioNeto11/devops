'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Plug, Upload, Building2, MapPin, Users, LayoutGrid, RefreshCw, Shield, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

function SettingsNav() {
  const pathname = usePathname();
  const { userRole } = useAuthStore();

  const isAdmin = userRole === 'owner' || userRole === 'org_manager';
  const isOwner = userRole === 'owner';

  type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };
  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Pessoal',
      items: [
        { href: '/settings', label: 'Notificações', icon: Bell, exact: true },
      ],
    },
    ...(isAdmin ? [{
      label: 'Organização',
      items: [
        ...(isOwner ? [{ href: '/settings/organization', label: 'Organização', icon: Building2 }] : []),
        { href: '/settings/units', label: 'Unidades', icon: MapPin },
        { href: '/settings/areas', label: 'Áreas', icon: LayoutGrid },
        { href: '/settings/team', label: 'Equipe', icon: Users },
        { href: '/settings/templates', label: 'Templates', icon: LayoutGrid },
      ],
    }] : []),
    {
      label: 'Integrações',
      items: [
        { href: '/settings/integrations', label: 'Integrações', icon: Plug },
        { href: '/settings/import', label: 'Importações', icon: Upload },
      ],
    },
    ...(isAdmin ? [{
      label: 'Operação',
      items: [
        { href: '/settings/recurrences', label: 'Recorrências', icon: RefreshCw },
        { href: '/settings/imports', label: 'Histórico de imports', icon: ListTodo },
        ...(isOwner ? [{ href: '/settings/audit', label: 'Auditoria', icon: Shield }] : []),
      ],
    }] : []),
  ];

  return (
    <>
      {/* Mobile: horizontal scrollable */}
      <nav className="flex overflow-x-auto border-b bg-card px-2 py-2 gap-1 md:hidden shrink-0">
        {groups.flatMap((g) => g.items).map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap',
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-label={label} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:flex md:flex-col w-52 shrink-0 border-r bg-card p-4 gap-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-label={label} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row gap-0">
      <SettingsNav />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
