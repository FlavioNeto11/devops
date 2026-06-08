'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importsApi } from '@/lib/imports-api';
import { integrationsExtApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import type { ImportJob } from '@/lib/imports-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw, X, ChevronRight } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pending: { label: 'Aguardando', variant: 'secondary', icon: Clock },
  processing: { label: 'Processando', variant: 'default', icon: Loader2 },
  awaiting_review: { label: 'Revisão pendente', variant: 'outline', icon: AlertCircle },
  committed: { label: 'Concluído', variant: 'default', icon: CheckCircle2 },
  failed: { label: 'Falha', variant: 'destructive', icon: AlertCircle },
};

export default function ImportsPage() {
  const { organizationId } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['imports', organizationId],
    queryFn: () => importsApi.list(organizationId!),
    enabled: !!organizationId,
    refetchInterval: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: integrationsExtApi.retryImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports', organizationId] });
      showToast('success', 'Importação reativada para revisão.');
    },
    onError: () => showToast('error', 'Erro ao reativar importação.'),
  });

  const cancelMutation = useMutation({
    mutationFn: integrationsExtApi.cancelImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports', organizationId] });
      showToast('success', 'Importação cancelada.');
    },
    onError: () => showToast('error', 'Erro ao cancelar importação.'),
  });

  const jobs = data?.data ?? [];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Importações</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico e status das importações Trello.</p>
        </div>
        <div className="flex gap-2 items-center">
          <TutorialTrigger tutorialId="trello-import" />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <RefreshCw className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium mb-1">Nenhuma importação encontrada</p>
          <p className="text-sm text-muted-foreground">Para iniciar uma importação do Trello, acesse Configurações → Integrações.</p>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="imports-history">
          {jobs.map((job) => (
            <ImportJobRow
              key={job.id}
              job={job}
              onViewDetails={() => setSelectedJob(job)}
              onRetry={() => {
                if (confirm('Reativar esta importação para revisão?')) retryMutation.mutate(job.id);
              }}
              onCancel={() => {
                if (confirm('Cancelar esta importação?')) cancelMutation.mutate(job.id);
              }}
              retrying={retryMutation.isPending && retryMutation.variables === job.id}
              cancelling={cancelMutation.isPending && cancelMutation.variables === job.id}
            />
          ))}
        </div>
      )}

      {selectedJob && (
        <ImportDetailsDialog
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}

function ImportJobRow({ job, onViewDetails, onRetry, onCancel, retrying, cancelling }: {
  job: ImportJob;
  onViewDetails: () => void;
  onRetry: () => void;
  onCancel: () => void;
  retrying: boolean;
  cancelling: boolean;
}) {
  const cfg = (STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending)!;
  const Icon = cfg.icon;
  const summary = job.summary;
  const isProcessing = job.status === 'processing';
  const canRetry = job.status === 'failed';
  const canCancel = ['pending', 'processing', 'awaiting_review'].includes(job.status);

  return (
    <div className="rounded-lg border p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant={cfg.variant} className="gap-1 text-xs">
              <Icon className={`h-3 w-3 ${isProcessing ? 'animate-spin' : ''}`} />
              {cfg.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(job.createdAt))}
            </span>
          </div>
          {summary && (
            <div className="text-sm text-muted-foreground mt-1">
              {summary.phase === 'result' && summary.created !== undefined && (
                <span>{summary.created} criadas · {summary.skipped ?? 0} ignoradas · {summary.failed ?? 0} falhas</span>
              )}
              {summary.phase === 'processing' && summary.progress && (
                <span>Processando: {summary.progress.done}/{summary.progress.total}</span>
              )}
              {summary.message && <span>{summary.message}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onViewDetails} className="gap-1 text-xs">
            Detalhes
            <ChevronRight className="h-3 w-3" />
          </Button>
          {canRetry && (
            <Button variant="ghost" size="icon" onClick={onRetry} disabled={retrying} aria-label="Reativar importação">
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel} disabled={cancelling} aria-label="Cancelar importação">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 text-destructive" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportDetailsDialog({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const summary = job.summary;
  const errors = summary?.errors ?? [];
  const mapping = job.mapping;
  const boards = mapping?.boards ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Detalhes da importação</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Criado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(job.createdAt))}
        </p>

        {summary?.phase === 'result' && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.created ?? 0}</p>
              <p className="text-xs text-muted-foreground">Criadas</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{summary.skipped ?? 0}</p>
              <p className="text-xs text-muted-foreground">Ignoradas</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{summary.failed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-2 text-red-600">Erros</p>
            <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">{e}</p>
              ))}
            </div>
          </div>
        )}

        {boards.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Boards mapeados</p>
            <div className="space-y-2">
              {boards.map((b) => (
                <div key={b.trelloBoardId} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{b.targetUnitName}</p>
                  <p className="text-xs text-muted-foreground">{b.lists.filter((l) => l.type !== 'ignore').length} listas importadas · {b.lists.filter((l) => l.type === 'ignore').length} ignoradas</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
