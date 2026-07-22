'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, User, LogOut, ChevronLeft, ChevronRight, Settings, ListTodo, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import type { UnitDTO } from '@gymops/shared';

interface SidebarProps {
  units: UnitDTO[];
  organizationName: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ units, organizationName, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, userRole } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  // Fechar o drawer mobile por teclado (Esc) — o backdrop é apenas apresentacional
  // (fecha-ao-clicar com o mouse); o Esc dá o equivalente por teclado (WCAG 2.1.1).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  const isManagerLevel = userRole === 'owner' || userRole === 'org_manager' || userRole === 'unit_manager' || userRole === 'area_leader';
  // "Painel Geral" (/dashboard) só existe para owner/org_manager — o próprio
  // dashboard expulsa os demais papéis (UX-GYMOPS-003). O item de menu segue
  // exatamente o mesmo gate da página, para nunca levar a um redirect silencioso.
  const canSeeDashboard = userRole === 'owner' || userRole === 'org_manager';

  const navItems = [
    ...(canSeeDashboard ? [{
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Painel Geral',
    }] : []),
    {
      href: '/me',
      icon: User,
      label: 'Minhas atividades',
    },
    ...(isManagerLevel ? [{
      href: '/activities',
      icon: ListTodo,
      label: 'Central de Atividades',
    }] : []),
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        id="app-sidebar"
        data-tutorial="app-sidebar"
        className={cn(
          // Grafite nos dois modos (tokens sidebar-*): identidade visual do produto.
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200',
          'md:relative md:inset-y-auto md:left-auto md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-60 md:w-14' : 'w-60',
        )}
      >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b border-sidebar-border p-4', collapsed && 'justify-center p-3')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-sidebar-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        {!collapsed && (
          <span className="truncate font-semibold text-sm">{organizationName}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onMobileClose}
            className={cn(
              'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground/40',
              pathname === item.href
                ? 'bg-white/[0.14] font-medium text-sidebar-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-sidebar-foreground'
                : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}

        {/* Units */}
        {!collapsed && (
          <div className="mt-4">
            <p className="mb-1 px-3 text-xs font-medium uppercase text-sidebar-muted tracking-wider">
              Unidades
            </p>
          </div>
        )}
        {collapsed && <div className="my-2 border-t border-sidebar-border" />}

        {units.map((unit) => (
          <Link
            key={unit.id}
            href={`/units/${unit.id}`}
            onClick={onMobileClose}
            className={cn(
              'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground/40',
              pathname === `/units/${unit.id}`
                ? 'bg-white/[0.14] font-medium text-sidebar-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-sidebar-foreground'
                : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? unit.name : undefined}
            aria-label={`Unidade ${unit.name}`}
            aria-current={pathname === `/units/${unit.id}` ? 'page' : undefined}
          >
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold bg-white/10"
            >
              {(unit.code ?? unit.name)[0]}
            </div>
            {!collapsed && <span className="truncate">{unit.name}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-sidebar-border p-2', collapsed && 'flex flex-col items-center gap-1')}>
        {!collapsed && user && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
            </div>
          </div>
        )}

        <Link href="/profile" onClick={onMobileClose} title={collapsed ? 'Perfil' : undefined}>
          <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} aria-label="Meu perfil" className={cn('w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground', !collapsed && 'justify-start gap-2')}>
            <User className="h-4 w-4" aria-hidden="true" />
            {!collapsed && 'Meu Perfil'}
          </Button>
        </Link>
        <Link href="/help" onClick={onMobileClose} title={collapsed ? 'Ajuda' : undefined}>
          <Button
            data-tutorial="app-help-button"
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            aria-label="Central de ajuda"
            className={cn('w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground', !collapsed && 'justify-start gap-2')}
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            {!collapsed && 'Ajuda'}
          </Button>
        </Link>
        <Link href="/settings" onClick={onMobileClose} title={collapsed ? 'Configurações' : undefined}>
          <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} aria-label="Configurações" className={cn('w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground', !collapsed && 'justify-start gap-2')}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            {!collapsed && 'Configurações'}
          </Button>
        </Link>

        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          className={cn('w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground', !collapsed && 'justify-start gap-2')}
          onClick={logout}
          title={collapsed ? 'Sair' : undefined}
          aria-label="Sair da conta"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {!collapsed && 'Sair'}
        </Button>
      </div>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 hidden md:flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : <ChevronLeft className="h-3 w-3" aria-hidden="true" />}
      </button>
    </aside>
    </>
  );
}
