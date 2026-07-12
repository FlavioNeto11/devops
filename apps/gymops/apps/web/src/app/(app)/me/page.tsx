'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { ActivityCard } from '@/components/activities/ActivityCard';
import { ActivityDrawer } from '@/components/activities/ActivityDrawer';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { TutorialTrigger } from '@/features/tutorial';
import { useTutorialStore } from '@/features/tutorial';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@gymops/shared';
import type { ActivityListItem } from '@/lib/activities-api';

type ViewTab = 'today' | 'overdue' | 'this_week' | 'awaiting_my_return';

interface TabCounts { today: number; overdue: number; thisWeek: number; awaitingMyReturn: number }

const TABS: Array<{ id: ViewTab; label: string; countKey: keyof TabCounts }> = [
  { id: 'today', label: 'Hoje', countKey: 'today' },
  { id: 'overdue', label: 'Atrasadas', countKey: 'overdue' },
  { id: 'this_week', label: 'Esta semana', countKey: 'thisWeek' },
  { id: 'awaiting_my_return', label: 'Aguardando meu retorno', countKey: 'awaitingMyReturn' },
];

const EMPTY_MESSAGES: Record<ViewTab, string> = {
  today: 'Nenhuma atividade para hoje — bom trabalho! Confira "Esta semana" para se antecipar.',
  overdue: 'Tudo em dia: nenhuma atividade atrasada.',
  this_week: 'Nenhuma atividade agendada para esta semana.',
  awaiting_my_return: 'Nenhuma atividade aguardando o seu retorno no momento.',
};

/** Atividades demonstrativas exibidas durante o tutorial quando a lista real está vazia. */
const DEMO_ACTIVITIES: ActivityListItem[] = [
  {
    id: '_demo_1',
    title: 'Verificar limpeza da área de musculação',
    status: 'in_progress',
    priority: 'alta',
    dueAt: new Date().toISOString(),
    isOverdue: false,
    unit: { id: '_demo', name: 'Unidade Centro' },
    area: { id: '_demo', name: 'Estrutura/Manutenção', color: '#f97316' },
    assignees: [{ userId: '_demo', name: 'Ana Lima', avatarUrl: null, kind: 'responsible' }],
    checklistProgress: { done: 2, total: 5 },
  },
  {
    id: '_demo_2',
    title: 'Atualizar planilha de agendamentos',
    status: 'pending',
    priority: 'normal',
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    isOverdue: false,
    unit: { id: '_demo', name: 'Unidade Centro' },
    area: { id: '_demo', name: 'Administrativo', color: '#3b82f6' },
    assignees: [{ userId: '_demo', name: 'Carlos Souza', avatarUrl: null, kind: 'responsible' }],
    checklistProgress: { done: 0, total: 3 },
  },
  {
    id: '_demo_3',
    title: 'Revisar relatório mensal de frequência',
    status: 'pending',
    priority: 'normal',
    dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    isOverdue: false,
    unit: { id: '_demo', name: 'Unidade Norte' },
    area: { id: '_demo2', name: 'Administrativo', color: '#3b82f6' },
    assignees: [{ userId: '_demo', name: 'Ana Lima', avatarUrl: null, kind: 'responsible' }],
    checklistProgress: { done: 1, total: 4 },
  },
];

export default function MyActivitiesPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('today');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const organizationId = useAuthStore((s) => s.organizationId);
  const run = useTutorialStore((s) => s.run);
  const isTutorialMyActivities = run?.tutorialId === 'my-activities';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-activities', activeTab, organizationId],
    queryFn: () =>
      api.get<ApiResponse<ActivityListItem[]>>(
        `/me/activities?view=${activeTab}&organizationId=${organizationId}`,
      ),
    enabled: !!organizationId,
    refetchInterval: 60 * 1000,
  });

  const { data: countsData } = useQuery({
    queryKey: ['my-activity-counts', organizationId],
    queryFn: () => api.get<ApiResponse<TabCounts>>(`/me/counts?organizationId=${organizationId}`),
    enabled: !!organizationId,
    refetchInterval: 60 * 1000,
  });

  const activities = data?.data ?? [];
  const counts = countsData?.data;

  // Exibe atividades demo quando o tutorial está ativo e a lista real está vazia.
  // Garante que o passo "me-activity-list" encontre o elemento no DOM.
  const showDemoData = isTutorialMyActivities && !isLoading && activities.length === 0;
  const displayActivities = showDemoData ? DEMO_ACTIVITIES : activities;

  return (
    <div className="p-3 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Minhas atividades</h1>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </p>
        </div>
        <TutorialTrigger tutorialId="my-activities" />
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto" data-tutorial="me-tabs">
      <div className="flex min-w-max gap-1 rounded-lg border bg-muted/50 p-1 md:min-w-0">
        {TABS.map((tab) => {
          const count = counts?.[tab.countKey] ?? 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap md:flex-1',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                    tab.id === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      {/* Activities — erro só substitui o conteúdo quando não há dados; com dados stale, banner acima */}
      {isError && data && (
        <QueryErrorState
          className="mb-4 py-4"
          title="Não foi possível atualizar"
          description="Exibindo os últimos dados carregados."
          onRetry={() => refetch()}
        />
      )}
      {isError && !data ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : displayActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES[activeTab]}</p>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="me-activity-list">
          {showDemoData && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Exemplo de tutorial — suas atividades aparecerão aqui quando forem atribuídas a você
              </span>
            </div>
          )}
          {displayActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onClick={showDemoData ? undefined : () => setSelectedActivityId(activity.id)}
            />
          ))}
        </div>
      )}

      {selectedActivityId && (
        <ActivityDrawer
          activityId={selectedActivityId}
          onClose={() => setSelectedActivityId(null)}
        />
      )}
    </div>
  );
}
