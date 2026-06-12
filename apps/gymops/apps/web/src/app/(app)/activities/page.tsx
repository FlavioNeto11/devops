'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { activitiesApi, type ActivityListItem } from '@/lib/activities-api';
import { unitsApi, areasApi, savedViewsApi, type SavedViewRecord } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search, Download, RefreshCw, CheckSquare, Square, AlertCircle,
  CheckCircle2, Loader2, Filter, X, Bookmark, Plus, Trash2,
} from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';
import { ActivityDrawer } from '@/components/activities/ActivityDrawer';
import type { ApiResponse } from '@gymops/shared';

type ActivityStatusValue = 'novo' | 'em_andamento' | 'aguardando_terceiro' | 'aguardando_aprovacao' | 'concluido' | 'cancelado';
type ActivityFilterStatus = ActivityStatusValue | 'overdue' | '';

const STATUS_OPTIONS: Array<{ value: ActivityFilterStatus; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_terceiro', label: 'Aguardando terceiro' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'concluido', label: 'Concluída' },
  { value: 'cancelado', label: 'Cancelada' },
  { value: 'overdue', label: 'Atrasadas' },
];

const BULK_STATUS_OPTIONS: Array<{ value: ActivityStatusValue; label: string }> = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_terceiro', label: 'Aguardando terceiro' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'concluido', label: 'Concluída' },
  { value: 'cancelado', label: 'Cancelada' },
];

const BULK_PRIORITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Qualquer prioridade' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];

const STATUS_LABELS: Record<ActivityStatusValue, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando terceiro',
  aguardando_aprovacao: 'Aguardando aprovação',
  concluido: 'Concluída',
  cancelado: 'Cancelada',
};

const PRIORITY_COLORS: Record<string, string> = {
  baixa: 'text-blue-600',
  media: 'text-amber-600',
  alta: 'text-orange-600',
  critica: 'text-red-600',
};

const PRIORITY_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

interface ActiveFilters {
  status: ActivityFilterStatus;
  priority: string;
  unitId: string;
  areaId: string;
  search: string;
}

const EMPTY_FILTERS: ActiveFilters = { status: '', priority: '', unitId: '', areaId: '', search: '' };

function buildListParams(f: ActiveFilters, orgId: string): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = { organizationId: orgId, limit: '50' };
  if (f.status === 'overdue') { params.overdue = 'true'; }
  else if (f.status) { params.status = f.status; }
  if (f.priority) params.priority = f.priority;
  if (f.unitId) params.unitId = f.unitId;
  if (f.areaId) params.areaId = f.areaId;
  if (f.search.trim()) params.search = f.search.trim();
  return params;
}

export default function ActivitiesPage() {
  const { organizationId, userRole } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = userRole === 'owner' || userRole === 'org_manager';

  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ActivityStatusValue | ''>('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkAction, setBulkAction] = useState<'status' | 'priority'>('status');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [drawerActivityId, setDrawerActivityId] = useState<string | null>(null);
  const [showSaveView, setShowSaveView] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const patchFilters = (patch: Partial<ActiveFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Object.values(filters).some(Boolean);

  // Infinite query for cursor pagination
  const {
    data: pagesData,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['activities-central', organizationId, filters],
    queryFn: ({ pageParam }) => {
      if (!organizationId) throw new Error('Missing organizationId');
      const params = buildListParams(filters, organizationId);
      if (pageParam) params.after = pageParam as string;
      return activitiesApi.list(params) as Promise<ApiResponse<ActivityListItem[]> & { meta: { total: number; nextCursor?: string } }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last as unknown as { meta?: { nextCursor?: string } }).meta?.nextCursor,
    enabled: !!organizationId,
  });

  const activities = pagesData?.pages.flatMap((p) => p.data) ?? [];
  const total = (pagesData?.pages[0] as unknown as { meta?: { total: number } } | undefined)?.meta?.total ?? activities.length;

  const { data: unitsData } = useQuery({
    queryKey: ['units', organizationId],
    queryFn: () => unitsApi.list(organizationId!),
    enabled: !!organizationId && showFilters,
  });

  const { data: areasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId!),
    enabled: !!organizationId && showFilters,
  });

  const { data: savedViewsData } = useQuery({
    queryKey: ['saved-views', organizationId],
    queryFn: () => savedViewsApi.list(organizationId!),
    enabled: !!organizationId,
  });

  const deleteSavedViewMutation = useMutation({
    mutationFn: savedViewsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-views', organizationId] }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: { ids: string[]; status?: string; priority?: string; organizationId: string }) =>
      api.post('/activities/bulk-update', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities-central'] });
      setSelected(new Set());
      setBulkStatus('');
      setBulkPriority('');
      showToast('success', `${selected.size} atividades atualizadas.`);
    },
    onError: () => showToast('error', 'Erro ao atualizar atividades.'),
  });

  const units = unitsData?.data ?? [];
  const areas = areasData?.data ?? [];
  const savedViews = savedViewsData?.data ?? [];

  const overdueCount = activities.filter((a) => a.isOverdue).length;
  const doneCount = activities.filter((a) => a.status === 'concluido').length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === activities.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activities.map((a) => a.id)));
    }
  };

  const applySavedView = (view: SavedViewRecord) => {
    const f = view.filtersJson as Partial<ActiveFilters>;
    setFilters({ ...EMPTY_FILTERS, ...f });
  };

  const handleBulkApply = useCallback(() => {
    if (!organizationId) return;
    const ids = Array.from(selected);
    // ação em massa é difícil de desfazer — acima de 5 itens, confirma antes
    if (ids.length > 5 && !window.confirm(`Aplicar a alteração em ${ids.length} atividades de uma vez?`)) {
      return;
    }
    if (bulkAction === 'status' && bulkStatus) {
      bulkUpdateMutation.mutate({ ids, status: bulkStatus, organizationId });
    } else if (bulkAction === 'priority' && bulkPriority) {
      bulkUpdateMutation.mutate({ ids, priority: bulkPriority, organizationId });
    }
  }, [organizationId, selected, bulkAction, bulkStatus, bulkPriority, bulkUpdateMutation]);

  const handleExport = async () => {
    if (!organizationId) {
      showToast('error', 'Organização não identificada para exportação.');
      return;
    }
    setExporting(true);
    try {
      const params = buildListParams(filters, organizationId);
      // Export doesn't need limit/cursor
      delete params.limit;
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      const blob = await api.getBlob(`/activities/export?${qs}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atividades-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Exportação concluída.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showToast('error', 'Sua sessão expirou. Faça login novamente.');
      } else {
        showToast('error', 'Erro ao exportar CSV.');
      }
    } finally {
      setExporting(false);
    }
  };

  const renderContent = (): ReactNode => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      );
    }

    if (activities.length === 0) {
      return (
        <div className="text-center py-16 border rounded-lg">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" aria-hidden="true" />
          <p className="font-medium">Nenhuma atividade encontrada</p>
          {hasFilters ? (
            <>
              <p className="text-sm text-muted-foreground mt-1">Os filtros ativos podem estar escondendo resultados.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilters(EMPTY_FILTERS)}>
                Limpar filtros
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Crie uma atividade numa unidade ou importe um board do Trello em Configurações → Importações.</p>
          )}
        </div>
      );
    }

    return (
      <div data-tutorial="global-activities-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                {isAdmin && (
                  <th className="py-2 pr-3 w-8">
                    <button onClick={toggleAll} aria-label="Selecionar todos">
                      {selected.size === activities.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                )}
                <th className="text-left py-2 pr-4 font-medium min-w-[200px]">Título</th>
                <th className="text-left py-2 pr-4 font-medium whitespace-nowrap">Unidade · Área</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-left py-2 pr-4 font-medium">Prioridade</th>
                <th className="text-left py-2 font-medium whitespace-nowrap">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  selected={selected.has(a.id)}
                  showSelect={isAdmin}
                  onToggleSelect={() => toggleSelect(a.id)}
                  onOpenDrawer={() => setDrawerActivityId(a.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        {hasNextPage && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetching} className="gap-2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Central de Atividades</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão global de todas as atividades da organização.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <TutorialTrigger tutorialId="activities-center" />
          {/* Saved views dropdown */}
          {savedViews.length > 0 && (
            <div className="relative group">
              <Button variant="outline" size="sm" className="gap-2">
                <Bookmark className="h-4 w-4" />
                <span className="hidden md:inline">Views salvas</span>
              </Button>
              <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block bg-background border rounded-md shadow-md min-w-[180px]">
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 gap-2">
                    <button className="text-sm truncate flex-1 text-left" onClick={() => applySavedView(v)}>{v.name}</button>
                    <button onClick={() => deleteSavedViewMutation.mutate(v.id)} aria-label="Excluir view" className="shrink-0">
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={() => setShowSaveView(true)} className="gap-2">
              <Bookmark className="h-4 w-4" />
              Salvar view
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-2" aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
          <p className="text-xs text-muted-foreground">Atrasadas</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{doneCount}</p>
          <p className="text-xs text-muted-foreground">Concluídas</p>
        </div>
      </div>

      {/* Search & filters */}
      <div className="mb-4 space-y-3" data-tutorial="global-activities-filters">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => patchFilters({ search: e.target.value })}
              placeholder="Buscar por título..."
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={hasFilters ? 'border-primary text-primary' : ''}
            aria-label="Filtros"
          >
            <Filter className="h-4 w-4" />
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={() => setFilters(EMPTY_FILTERS)} aria-label="Limpar filtros">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={filters.status} onChange={(e) => patchFilters({ status: e.target.value as ActivityFilterStatus })} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filters.priority} onChange={(e) => patchFilters({ priority: e.target.value })} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filters.unitId} onChange={(e) => patchFilters({ unitId: e.target.value })} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={filters.areaId} onChange={(e) => patchFilters({ areaId: e.target.value })} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Todas as áreas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {isAdmin && selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium">{selected.size} selecionadas</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as 'status' | 'priority')}
              className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="status">Alterar status</option>
              <option value="priority">Alterar prioridade</option>
            </select>
            {bulkAction === 'status' && (
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as ActivityStatusValue | '')}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {BULK_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {bulkAction === 'priority' && (
              <select
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {BULK_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleBulkApply}
            disabled={(!bulkStatus && !bulkPriority) || bulkUpdateMutation.isPending}
            className="gap-2"
          >
            {bulkUpdateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
        </div>
      )}

      {renderContent()}

      {/* Save view dialog */}
      {showSaveView && (
        <SaveViewDialog
          open={showSaveView}
          onClose={() => setShowSaveView(false)}
          organizationId={organizationId!}
          filtersJson={filters as unknown as Record<string, unknown>}
          onSuccess={() => {
            setShowSaveView(false);
            queryClient.invalidateQueries({ queryKey: ['saved-views', organizationId] });
            showToast('success', 'View salva!');
          }}
        />
      )}

      {/* Activity Drawer */}
      {drawerActivityId && (
        <ActivityDrawer
          activityId={drawerActivityId}
          onClose={() => {
            setDrawerActivityId(null);
            queryClient.invalidateQueries({ queryKey: ['activities-central'] });
          }}
        />
      )}
    </div>
  );
}

function ActivityRow({ activity: a, selected, showSelect, onToggleSelect, onOpenDrawer }: Readonly<{
  activity: ActivityListItem;
  selected: boolean;
  showSelect: boolean;
  onToggleSelect: () => void;
  onOpenDrawer: () => void;
}>) {
  return (
    <tr
      className={`border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${selected ? 'bg-primary/5' : ''}`}
      onClick={onOpenDrawer}
    >
      {showSelect && (
        <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={onToggleSelect} aria-label="Selecionar">
            {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
          </button>
        </td>
      )}
      <td className="py-2 pr-4 max-w-[240px]">
        <div className="flex items-center gap-2">
          {a.isOverdue && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
          <span className="truncate font-medium">{a.title}</span>
        </div>
        {a.checklistProgress.total > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {a.checklistProgress.done}/{a.checklistProgress.total} checklist
          </div>
        )}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">
        <div className="text-xs text-muted-foreground">{a.unit.name}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: a.area.color ?? '#94a3b8' }}
          />
          <span className="text-xs">{a.area.name}</span>
        </div>
      </td>
      <td className="py-2 pr-4">
        <Badge variant="outline" className="text-xs">
          {STATUS_LABELS[a.status as ActivityStatusValue] ?? a.status}
        </Badge>
      </td>
      <td className="py-2 pr-4">
        <span className={`text-xs font-medium ${PRIORITY_COLORS[a.priority] ?? ''}`}>
          {PRIORITY_LABELS[a.priority] ?? a.priority}
        </span>
      </td>
      <td className="py-2 whitespace-nowrap">
        {a.dueAt ? (
          <span className={`text-xs ${a.isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            {new Intl.DateTimeFormat('pt-BR').format(new Date(a.dueAt))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function SaveViewDialog({ open, onClose, organizationId, filtersJson, onSuccess }: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  filtersJson: Record<string, unknown>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => savedViewsApi.create({ organizationId, name: name.trim(), filtersJson }),
    onSuccess,
    onError: () => setError('Erro ao salvar view.'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <h2 className="text-base font-semibold mb-3">Salvar view de filtros</h2>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label htmlFor="view-name" className="block text-sm font-medium mb-1">Nome da view *</label>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Atrasadas — Vila Xavier" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => { if (!name.trim()) { setError('Nome obrigatório.'); return; } saveMutation.mutate(); }} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
