'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Shield, Loader2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

const ACTION_LABELS: Record<string, string> = {
  'org.updated': 'Organização atualizada',
  'unit.archived': 'Unidade arquivada',
  'unit.created': 'Unidade criada',
  'unit.updated': 'Unidade atualizada',
  'area.archived': 'Área arquivada',
  'area.created': 'Área criada',
  'area.updated': 'Área atualizada',
  'membership.created': 'Membro adicionado',
  'membership.deleted': 'Membro removido',
  'invitation.sent': 'Convite enviado',
  'invitation.accepted': 'Convite aceito',
  'invitation.cancelled': 'Convite cancelado',
  'template.archived': 'Template arquivado',
  'template.created': 'Template criado',
  'template.updated': 'Template atualizado',
  'activity.created': 'Atividade criada',
  'activity.deleted': 'Atividade excluída',
};

// Tempo relativo pt-BR ("há 2 h") — o instante exato vai no title da célula.
function relativeTime(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(secs) || secs < 0) return '—';
  if (secs < 60) return 'agora há pouco';
  const m = Math.floor(secs / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso));
}

export default function AuditPage() {
  const { organizationId, userRole } = useAuthStore();
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  if (userRole !== 'owner') {
    return <div className="p-8 text-muted-foreground">Apenas owners podem acessar esta página.</div>;
  }

  return <AuditContent organizationId={organizationId!} page={page} setPage={setPage} filterAction={filterAction} setFilterAction={setFilterAction} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} showFilters={showFilters} setShowFilters={setShowFilters} />;
}

function AuditContent({ organizationId, page, setPage, filterAction, setFilterAction, dateFrom, setDateFrom, dateTo, setDateTo, showFilters, setShowFilters }: {
  organizationId: string;
  page: number;
  setPage: (p: number) => void;
  filterAction: string;
  setFilterAction: (a: string) => void;
  dateFrom: string;
  setDateFrom: (d: string) => void;
  dateTo: string;
  setDateTo: (d: string) => void;
  showFilters: boolean;
  setShowFilters: (b: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', organizationId, page, filterAction, dateFrom, dateTo],
    queryFn: () => auditLogsApi.list({
      organizationId,
      page,
      action: filterAction || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    enabled: !!organizationId,
  });

  const logs = data?.data ?? [];
  const meta = (data as { meta?: { total: number; pages: number } })?.meta;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Auditoria</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Registro de ações administrativas da organização.</p>
          </div>
        </div>
        <TutorialTrigger tutorialId="audit" />
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
          {(filterAction || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterAction(''); setDateFrom(''); setDateTo(''); setPage(1); }}>
              Limpar
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas as ações</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="Data início" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="Data fim" />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border" data-tutorial="audit-list">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">Data/Hora</th>
                <th className="text-left py-2 px-4 font-medium">Usuário</th>
                <th className="text-left py-2 px-4 font-medium">Ação</th>
                <th className="text-left py-2 px-4 font-medium">Recurso</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td
                    className="py-2 px-4 whitespace-nowrap text-muted-foreground text-xs"
                    title={new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt))}
                  >
                    {relativeTime(log.createdAt)}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={log.user.name} avatarUrl={log.user.avatarUrl} className="h-5 w-5 text-[9px] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate max-w-[120px]">{log.user.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[120px]">{log.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 text-xs text-muted-foreground">
                    <span className="font-mono">{log.resourceType}</span>
                    {log.resourceId && <span className="ml-1 opacity-50">#{log.resourceId.slice(0, 8)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">{meta.total} registros</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">{page} / {meta.pages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= meta.pages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
