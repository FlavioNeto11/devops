'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, User, LogOut, ChevronLeft, ChevronRight, Settings, ListTodo, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
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

  const isManagerLevel = userRole === 'owner' || userRole === 'org_manager' || userRole === 'unit_manager' || userRole === 'area_leader';

  const navItems = [
    ...(isManagerLevel ? [{
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
        data-tutorial="app-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r bg-card transition-transform duration-200',
          'md:relative md:inset-y-auto md:left-auto md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-60 md:w-14' : 'w-60',
        )}
      >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b p-4', collapsed && 'justify-center p-3')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
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
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === item.href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}

        {/* Units */}
        {!collapsed && (
          <div className="mt-4">
            <p className="mb-1 px-3 text-xs font-medium uppercase text-muted-foreground tracking-wider">
              Unidades
            </p>
          </div>
        )}
        {collapsed && <div className="my-2 border-t" />}

        {units.map((unit) => (
          <Link
            key={unit.id}
            href={`/units/${unit.id}`}
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === `/units/${unit.id}`
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? unit.name : undefined}
          >
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold bg-muted"
            >
              {(unit.code ?? unit.name)[0]}
            </div>
            {!collapsed && <span className="truncate">{unit.name}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t p-2', collapsed && 'flex flex-col items-center gap-1')}>
        {!collapsed && user && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}

        <Link href="/profile" onClick={onMobileClose} title={collapsed ? 'Perfil' : undefined}>
          <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} className={cn('w-full', !collapsed && 'justify-start gap-2 text-muted-foreground')}>
            <User className="h-4 w-4" />
            {!collapsed && 'Meu Perfil'}
          </Button>
        </Link>
        <Link href="/help" onClick={onMobileClose} title={collapsed ? 'Ajuda' : undefined}>
          <Button
            data-tutorial="app-help-button"
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn('w-full', !collapsed && 'justify-start gap-2 text-muted-foreground')}
          >
            <HelpCircle className="h-4 w-4" />
            {!collapsed && 'Ajuda'}
          </Button>
        </Link>
        <Link href="/settings" onClick={onMobileClose} title={collapsed ? 'Configurações' : undefined}>
          <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} className={cn('w-full', !collapsed && 'justify-start gap-2 text-muted-foreground')}>
            <Settings className="h-4 w-4" />
            {!collapsed && 'Configurações'}
          </Button>
        </Link>

        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          className={cn('w-full text-muted-foreground', !collapsed && 'justify-start gap-2')}
          onClick={logout}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sair'}
        </Button>
      </div>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 hidden md:flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
    </>
  );
}
