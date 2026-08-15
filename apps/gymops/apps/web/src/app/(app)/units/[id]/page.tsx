'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Filter, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { activitiesApi, type ActivityListItem } from '@/lib/activities-api';
import { Button } from '@/components/ui/button';
import { ActivityCard } from '@/components/activities/ActivityCard';
import { ActivityDrawer } from '@/components/activities/ActivityDrawer';
import { NewActivityDialog } from '@/components/activities/NewActivityDialog';
import { AiDraftDialog } from '@/components/ai/AiDraftDialog';
import { DailySummaryBadge } from '@/components/ai/DailySummaryBadge';
import { TutorialTrigger } from '@/features/tutorial';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { useAuthStore } from '@/store/auth';
import type { ApiResponse } from '@gymops/shared';

interface UnitDashboard {
  unit: { id: string; name: string };
  summary: { total: number; overdue: number; critical: number; dueToday: number };
  byArea: Array<{
    area: { id: string; name: string; color: string | null };
    activities: unknown[];
  }>;
}

interface AreaData {
  id: string;
  name: string;
  color: string | null;
}

interface AreaWithActivities {
  area: AreaData;
  activities: ActivityListItem[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_terceiro', label: 'Aguardando terceiro' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];

function SummaryCard({ label, value, icon: Icon, variant = 'default' }: {
  label: string; value: number; icon: React.ElementType; variant?: 'default' | 'danger' | 'warning'
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${variant === 'danger' ? 'border-red-200 bg-red-50' : variant === 'warning' ? 'border-amber-200 bg-amber-50' : 'bg-card'}`}>
      <Icon className={`h-5 w-5 ${variant === 'danger' ? 'text-red-500' : variant === 'warning' ? 'text-amber-500' : 'text-muted-foreground'}`} />
      <div>
        <p className="text-xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function AreaSection({ area, activities, onCardClick }: {
  area: AreaData;
  activities: ActivityListItem[];
  onCardClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const panelId = `area-panel-${area.id}`;
  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: area.color ?? '#6b7280' }} />
          <span className="font-medium">{area.name}</span>
          <span className="text-xs text-muted-foreground">({activities.length})</span>
        </div>
      </button>
      {open && (
        <div id={panelId} className="border-t p-3 space-y-2">
          {activities.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma atividade nesta área</p>
          ) : (
            activities.map((a) => <ActivityCard key={a.id} activity={a} onClick={() => onCardClick(a.id)} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function UnitPage({ params }: { params: { id: string } }) {
  const organizationId = useAuthStore((s) => s.organizationId);
  const canCreate = useAuthStore((s) => s.canCreate);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);

  // Dashboard summary
  const { data: dashRes, isError: isDashError, refetch: refetchDash } = useQuery({
    queryKey: ['unit-dashboard', params.id],
    queryFn: () => api.get<ApiResponse<UnitDashboard>>(`/units/${params.id}/dashboard`),
    refetchInterval: 60_000,
    enabled: !!organizationId,
  });

  // Activities list (separate query for filters)
  const { data: activitiesRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['activities', params.id, filterStatus, filterPriority, filterOverdue],
    queryFn: () =>
      activitiesApi.list({
        organizationId: organizationId!,
        unitId: params.id,
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        overdue: filterOverdue ? 'true' : undefined,
      }),
    enabled: !!organizationId,
    refetchInterval: 60_000,
  });

  const dashboard = dashRes?.data;
  const activities = activitiesRes?.data ?? [];

  // Group by area (using the unit dashboard areas as structure)
  const areaMap = new Map<string, AreaData>();
  dashboard?.byArea.forEach(({ area }) => areaMap.set(area.id, area));

  const grouped: AreaWithActivities[] = [];
  const groupedIds = new Set<string>();
  for (const { area } of dashboard?.byArea ?? []) {
    const areaActivities = activities.filter((a) => a.area?.id === area.id);
    if (areaActivities.length > 0 || !filterStatus) {
      grouped.push({ area, activities: areaActivities });
      areaActivities.forEach((a) => groupedIds.add(a.id));
    }
  }
  // Ungrouped activities (areas not in dashboard)
  const ungrouped = activities.filter((a) => !groupedIds.has(a.id));

  // Areas for new activity form and AI draft
  const areas = (dashboard?.byArea ?? []).map(({ area }) => area);

  // Areas with key for AI draft
  const { data: areasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => api.get<ApiResponse<Array<{ id: string; key: string; name: string; color: string | null }>>>(`/areas?organizationId=${organizationId}`),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
  const areasWithKey = areasData?.data ?? [];

  return (
    <div className="p-3 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{dashboard?.unit.name ?? '...'}</h1>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </p>
          <div className="mt-2">
            <DailySummaryBadge unitId={params.id} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2 items-center">
          <TutorialTrigger tutorialId="unit-operation" />
          {canCreate() && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAiDraft(true)}>
                <Sparkles className="h-4 w-4 text-violet-500" />
                Criar com IA
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowNewActivity(true)}>
                <Plus className="h-4 w-4" />
                Nova atividade
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Falha ao carregar o painel da unidade (KPIs + título): banner com retry
          em vez de título "..." e KPIs sumidos parecendo carregamento eterno
          (UX-GYMOPS-017). A lista de atividades tem seu próprio estado de erro. */}
      {isDashError && !dashboard && (
        <QueryErrorState
          className="py-4"
          title="Não foi possível carregar o painel da unidade"
          onRetry={() => refetchDash()}
        />
      )}

      {/* Summary KPIs */}
      {dashboard && (
        <div data-tutorial="unit-summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Abertas" value={dashboard.summary.total} icon={Clock} />
          <SummaryCard label="Atrasadas" value={dashboard.summary.overdue} icon={AlertTriangle} variant="warning" />
          <SummaryCard label="Críticas" value={dashboard.summary.critical} icon={AlertTriangle} variant="danger" />
          <SummaryCard label="Vencem hoje" value={dashboard.summary.dueToday} icon={Clock} />
        </div>
      )}

      {/* Filters */}
      <div data-tutorial="unit-filters" className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          aria-label="Filtrar por status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded border border-input bg-background px-2 text-xs"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          aria-label="Filtrar por prioridade"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="h-8 rounded border border-input bg-background px-2 text-xs"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
          Apenas atrasadas
        </label>
        {(filterStatus || filterPriority || filterOverdue) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterOverdue(false); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Areas accordion — erro só substitui o conteúdo quando não há dados; com dados stale, banner acima */}
      {isError && activitiesRes && (
        <QueryErrorState
          className="mb-4 py-4"
          title="Não foi possível atualizar"
          description="Exibindo os últimos dados carregados."
          onRetry={() => refetch()}
        />
      )}
      {isError && !activitiesRes ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : (
        <div className="space-y-3" data-tutorial="unit-area-board">
          {grouped.map(({ area, activities: acts }) => (
            <AreaSection key={area.id} area={area} activities={acts} onCardClick={setSelectedActivityId} />
          ))}
          {ungrouped.length > 0 && (
            <AreaSection
              area={{ id: 'other', name: 'Outras áreas', color: '#9ca3af' }}
              activities={ungrouped}
              onCardClick={setSelectedActivityId}
            />
          )}
          {activities.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma atividade encontrada</p>
              {canCreate() && (
                <Button variant="outline" size="sm" onClick={() => setShowNewActivity(true)}>
                  Criar primeira atividade
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Drawers / dialogs */}
      {selectedActivityId && (
        <ActivityDrawer
          activityId={selectedActivityId}
          onClose={() => setSelectedActivityId(null)}
        />
      )}

      {organizationId && (
        <NewActivityDialog
          open={showNewActivity}
          onClose={() => setShowNewActivity(false)}
          organizationId={organizationId}
          unitId={params.id}
          areas={areas}
          onCreated={(id) => setSelectedActivityId(id)}
        />
      )}

      {showAiDraft && organizationId && (
        <AiDraftDialog
          unitId={params.id}
          areas={areasWithKey}
          onClose={() => setShowAiDraft(false)}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}
