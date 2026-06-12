'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurrencesApi, type RecurrenceSummary } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pause, Play, Trash2, Loader2, RepeatIcon, Pencil } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  custom: 'Personalizada',
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function RecurrencesPage() {
  const { organizationId } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceSummary | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['recurrences', organizationId, filterStatus],
    queryFn: () => recurrencesApi.list({ organizationId: organizationId!, ...(filterStatus ? { status: filterStatus } : {}) }),
    enabled: !!organizationId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof recurrencesApi.update>[1] }) =>
      recurrencesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences', organizationId] });
      showToast('success', 'Recorrência atualizada.');
    },
    onError: () => showToast('error', 'Erro ao atualizar recorrência.'),
  });

  const deleteMutation = useMutation({
    mutationFn: recurrencesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences', organizationId] });
      showToast('success', 'Recorrência removida.');
    },
    onError: () => showToast('error', 'Erro ao remover recorrência.'),
  });

  const recurrences = data?.data ?? [];

  const toggleStatus = (r: RecurrenceSummary) => {
    const newStatus = r.status === 'active' ? 'paused' : 'active';
    updateMutation.mutate({ id: r.id, data: { status: newStatus } });
  };

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Recorrências</h1>
          <p className="text-sm text-muted-foreground mt-1">Regras de geração automática de atividades periódicas.</p>
        </div>
        <TutorialTrigger tutorialId="recurrences" />
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'active', 'paused'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            {s === '' ? 'Todas' : s === 'active' ? 'Ativas' : 'Pausadas'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : recurrences.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <RepeatIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium mb-1">Nenhuma recorrência {filterStatus ? `"${filterStatus === 'active' ? 'ativa' : 'pausada'}"` : ''} encontrada</p>
          <p className="text-sm text-muted-foreground">Recorrências são criadas ao configurar uma atividade com frequência periódica.</p>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="recurrence-list">
          {recurrences.map((r) => (
            <RecurrenceRow
              key={r.id}
              recurrence={r}
              onToggle={() => toggleStatus(r)}
              onEdit={() => setEditRecurrence(r)}
              onDelete={() => {
                if (confirm(`Remover esta recorrência? A atividade não será mais gerada automaticamente.`))
                  deleteMutation.mutate(r.id);
              }}
              toggling={updateMutation.isPending && updateMutation.variables?.id === r.id}
              deleting={deleteMutation.isPending && deleteMutation.variables === r.id}
            />
          ))}
        </div>
      )}

      {editRecurrence && (
        <EditRecurrenceDialog
          recurrence={editRecurrence}
          onClose={() => setEditRecurrence(null)}
          onSuccess={(data) => {
            updateMutation.mutate({ id: editRecurrence.id, data });
            setEditRecurrence(null);
          }}
        />
      )}
    </div>
  );
}

function RecurrenceRow({ recurrence: r, onToggle, onEdit, onDelete, toggling, deleting }: {
  recurrence: RecurrenceSummary;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const isPaused = r.status === 'paused';

  return (
    <div className={`rounded-lg border p-4 hover:bg-muted/30 transition-colors ${isPaused ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm truncate">{r.activity.title}</span>
            <Badge variant={isPaused ? 'secondary' : 'default'} className="text-xs">
              {isPaused ? 'Pausada' : 'Ativa'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: r.activity.area.color ? `${r.activity.area.color}20` : undefined }}
            >
              {r.activity.area.name}
            </span>
            <span>{r.activity.unit.name}</span>
            <span>·</span>
            <span>
              {FREQUENCY_LABELS[r.frequency] ?? r.frequency}
              {r.interval > 1 ? ` a cada ${r.interval}` : ''}
            </span>
            {r.weekdays && r.weekdays.length > 0 && (
              <span>— {r.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}</span>
            )}
          </div>
          {r.nextRunAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Próxima: {new Intl.DateTimeFormat('pt-BR').format(new Date(r.nextRunAt))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={onToggle} disabled={toggling} aria-label={isPaused ? 'Reativar' : 'Pausar'}>
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar frequência">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} aria-label="Remover recorrência">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditRecurrenceDialog({ recurrence, onClose, onSuccess }: {
  recurrence: RecurrenceSummary;
  onClose: () => void;
  onSuccess: (data: { frequency?: string; interval?: number; weekdays?: number[] | null }) => void;
}) {
  const [frequency, setFrequency] = useState(recurrence.frequency);
  const [interval, setInterval] = useState(String(recurrence.interval));
  const [weekdays, setWeekdays] = useState<number[]>(recurrence.weekdays ?? []);

  const toggleDay = (d: number) => setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSuccess({
      frequency,
      interval: Math.max(1, parseInt(interval) || 1),
      weekdays: frequency === 'weekly' ? weekdays : null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <h2 className="text-lg font-semibold mb-4">Editar frequência</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="rec-freq" className="block text-sm font-medium mb-1">Frequência</label>
            <select
              id="rec-freq"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
          <div>
            <label htmlFor="rec-interval" className="block text-sm font-medium mb-1">Intervalo</label>
            <Input
              id="rec-interval"
              type="number"
              min={1}
              max={365}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Ex: 2 = a cada 2 dias/semanas/meses</p>
          </div>
          {frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">Dias da semana</label>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${weekdays.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
