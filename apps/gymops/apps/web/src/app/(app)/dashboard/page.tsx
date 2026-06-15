'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Wrench, TrendingDown, ChevronUp, ChevronDown, Brain, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { activitiesApi, type ActivityListItem } from '@/lib/activities-api';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DelayAnalysisModal } from '@/components/ai/DelayAnalysisModal';
import { TutorialTrigger } from '@/features/tutorial';
import Link from 'next/link';
import type { ApiResponse } from '@gymops/shared';

interface DashboardOverview {
  kpis: {
    unitsWithCriticalOverdue: number;
    totalOverdue: number;
    financialDueToday: number;
    maintenanceOpen: number;
  };
  byUnit: Array<{
    unit: { id: string; name: string };
    open: number;
    overdue: number;
    critical: number;
    unassigned: number;
  }>;
}

type SortCol = 'name' | 'open' | 'overdue' | 'critical' | 'unassigned';

function KpiCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant?: 'default' | 'danger' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {/* Mono: ícone em chip neutro; a criticidade aparece no NÚMERO, não no chip. */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p
            className={`text-2xl font-semibold tracking-tight ${
              variant === 'danger' && value > 0
                ? 'text-red-600 dark:text-red-400'
                : variant === 'warning' && value > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : ''
            }`}
          >
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ChevronUp className="inline h-3.5 w-3.5 ml-0.5" />
    : <ChevronDown className="inline h-3.5 w-3.5 ml-0.5" />;
}

export default function DashboardPage() {
  const router = useRouter();
  const organizationId = useAuthStore((s) => s.organizationId);
  const userRole = useAuthStore((s) => s.userRole);
  const [sortCol, setSortCol] = useState<SortCol>('overdue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [analyzeActivity, setAnalyzeActivity] = useState<{ id: string; title: string } | null>(null);

  // Role gate — only org_manager/owner may access this page
  useEffect(() => {
    if (userRole && userRole !== 'owner' && userRole !== 'org_manager') {
      router.replace('/me');
    }
  }, [userRole, router]);

  const { data: overdueData } = useQuery({
    queryKey: ['activities-overdue', organizationId],
    queryFn: () => activitiesApi.list({ organizationId: organizationId!, overdue: 'true', limit: '10' }),
    enabled: !!organizationId && (userRole === 'owner' || userRole === 'org_manager'),
    refetchInterval: 5 * 60 * 1000,
  });
  const overdueActivities: ActivityListItem[] = overdueData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overview', organizationId],
    queryFn: () =>
      api.get<ApiResponse<DashboardOverview>>(
        `/dashboards/overview?organizationId=${organizationId}`,
      ),
    enabled: !!organizationId && (userRole === 'owner' || userRole === 'org_manager'),
    refetchInterval: 5 * 60 * 1000,
  });

  const overview = data?.data;

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sortedUnits = [...(overview?.byUnit ?? [])].sort((a, b) => {
    const aVal = sortCol === 'name' ? a.unit.name : (a as Record<string, unknown>)[sortCol] as number;
    const bVal = sortCol === 'name' ? b.unit.name : (b as Record<string, unknown>)[sortCol] as number;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const thCls = (col: SortCol) =>
    `cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground transition-colors ${sortCol === col ? 'text-foreground' : ''}`;

  return (
    <div className="p-3 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Painel Geral</h1>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </p>
        </div>
        <TutorialTrigger tutorialId="dashboard-overview" />
      </div>

      {/* KPIs */}
      <div data-tutorial="dashboard-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={AlertTriangle}
              label="Unidades com atraso crítico"
              value={overview?.kpis.unitsWithCriticalOverdue ?? 0}
              variant="danger"
            />
            <KpiCard
              icon={TrendingDown}
              label="Atividades atrasadas"
              value={overview?.kpis.totalOverdue ?? 0}
              variant="warning"
            />
            <KpiCard
              icon={Clock}
              label="Financeiro vencendo hoje"
              value={overview?.kpis.financialDueToday ?? 0}
            />
            <KpiCard
              icon={Wrench}
              label="Manutenções abertas"
              value={overview?.kpis.maintenanceOpen ?? 0}
            />
          </>
        )}
      </div>

      {/* Units table */}
      <Card data-tutorial="dashboard-unit-table">
        <CardHeader>
          <CardTitle className="text-base">Visão por Unidade</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Unidade</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Abertas</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Atrasadas</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Críticas</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Sem resp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-6" /></td>
                      <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-6" /></td>
                      <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-6" /></td>
                      <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-6" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted">
                  <th scope="col" aria-sort={sortCol === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className={thCls('name')} onClick={() => handleSort('name')}>
                    Unidade <SortIcon active={sortCol === 'name'} dir={sortDir} />
                  </th>
                  <th scope="col" aria-sort={sortCol === 'open' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${thCls('open')} text-center`} onClick={() => handleSort('open')}>
                    Abertas <SortIcon active={sortCol === 'open'} dir={sortDir} />
                  </th>
                  <th scope="col" aria-sort={sortCol === 'overdue' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${thCls('overdue')} text-center`} onClick={() => handleSort('overdue')}>
                    Atrasadas <SortIcon active={sortCol === 'overdue'} dir={sortDir} />
                  </th>
                  <th scope="col" aria-sort={sortCol === 'critical' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${thCls('critical')} text-center`} onClick={() => handleSort('critical')}>
                    Críticas <SortIcon active={sortCol === 'critical'} dir={sortDir} />
                  </th>
                  <th scope="col" aria-sort={sortCol === 'unassigned' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${thCls('unassigned')} text-center`} onClick={() => handleSort('unassigned')}>
                    Sem resp. <SortIcon active={sortCol === 'unassigned'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedUnits.map((row) => (
                  <tr
                    key={row.unit.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      row.critical > 0 ? 'bg-red-50/50' : row.overdue > 0 ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/units/${row.unit.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.unit.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">{row.open}</td>
                    <td className="px-4 py-3 text-center">
                      {row.overdue > 0 ? (
                        <span className="font-medium text-amber-600">{row.overdue}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.critical > 0 ? (
                        <span className="font-bold text-red-600">{row.critical}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.unassigned > 0 ? (
                        <span className="text-amber-600">{row.unassigned}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedUnits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <EmptyState
                        icon={Building2}
                        title="Nenhuma unidade encontrada"
                        description="Cadastre uma unidade para acompanhar a operação por aqui."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overdue activities with AI analysis */}
      {overdueActivities.length > 0 && (
        <Card data-tutorial="dashboard-overdue-activities">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Atividades Atrasadas
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {overdueActivities.length} encontrada{overdueActivities.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Atividade</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Unidade</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Área</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Prioridade</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {overdueActivities.map((act) => (
                  <tr key={act.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium max-w-xs truncate">{act.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{act.unit?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{act.area?.name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${
                        act.priority === 'critica' ? 'text-red-600'
                        : act.priority === 'alta' ? 'text-amber-600'
                        : 'text-muted-foreground'
                      }`}>
                        {act.priority === 'critica' ? 'Crítica' : act.priority === 'alta' ? 'Alta' : act.priority === 'media' ? 'Média' : 'Baixa'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-violet-600 hover:text-violet-700"
                        onClick={() => setAnalyzeActivity({ id: act.id, title: act.title })}
                      >
                        <Brain className="h-3.5 w-3.5" />
                        Analisar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {analyzeActivity && (
        <DelayAnalysisModal
          activityId={analyzeActivity.id}
          activityTitle={analyzeActivity.title}
          onClose={() => setAnalyzeActivity(null)}
        />
      )}
    </div>
  );
}
