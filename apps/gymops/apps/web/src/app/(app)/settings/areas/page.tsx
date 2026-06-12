'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { areasApi, type AreaSummary } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus, Pencil, Archive, LayoutGrid, Loader2 } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

const COLOR_PRESETS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

export default function AreasPage() {
  const { organizationId } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editArea, setEditArea] = useState<AreaSummary | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId!),
    enabled: !!organizationId,
  });

  const archiveMutation = useMutation({
    mutationFn: areasApi.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas', organizationId] });
      showToast('success', 'Área arquivada.');
    },
    onError: () => showToast('error', 'Erro ao arquivar área.'),
  });

  const areas = data?.data ?? [];

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Áreas</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as áreas funcionais da organização.</p>
        </div>
        <div className="flex gap-2 items-center">
          <TutorialTrigger tutorialId="units-areas-admin" />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Área
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
      ) : areas.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium mb-1">Nenhuma área cadastrada</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2 mt-4">
            <Plus className="h-4 w-4" />
            Criar primeira área
          </Button>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="areas-admin-list">
          {areas.map((area) => (
            <div key={area.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: area.color ?? '#94a3b8' }} />
                <div className="min-w-0">
                  <span className="font-medium truncate block">{area.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{area.key}</span>
                    {area.visibilityDefault && area.visibilityDefault !== 'inherited' && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        {area.visibilityDefault === 'restricted' ? 'Restrita' : 'Compartilhada'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0 ml-4">
                <Button variant="ghost" size="icon" onClick={() => setEditArea(area)} aria-label="Editar área">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Arquivar a área "${area.name}"?`)) archiveMutation.mutate(area.id);
                  }}
                  disabled={archiveMutation.isPending}
                  aria-label="Arquivar área"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AreaDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId!}
        onSuccess={() => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ['areas', organizationId] });
          showToast('success', 'Área criada!');
        }}
      />

      {editArea && (
        <AreaDialog
          open={!!editArea}
          onClose={() => setEditArea(null)}
          organizationId={organizationId!}
          area={editArea}
          onSuccess={() => {
            setEditArea(null);
            queryClient.invalidateQueries({ queryKey: ['areas', organizationId] });
            showToast('success', 'Área atualizada!');
          }}
        />
      )}
    </div>
  );
}

const VISIBILITY_OPTIONS = [
  { value: 'inherited', label: 'Herdada (padrão)' },
  { value: 'shared', label: 'Compartilhada' },
  { value: 'restricted', label: 'Restrita' },
];

function AreaDialog({ open, onClose, organizationId, area, onSuccess }: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  area?: AreaSummary;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(area?.name ?? '');
  const [key, setKey] = useState(area?.key ?? '');
  const [color, setColor] = useState(area?.color ?? COLOR_PRESETS[0]);
  const [visibilityDefault, setVisibilityDefault] = useState(area?.visibilityDefault ?? 'inherited');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof areasApi.create>[0]) => areasApi.create(data),
    onSuccess,
    onError: (err: unknown) => setError((err as { message?: string })?.message ?? 'Erro ao criar área.'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof areasApi.update>[1]) => areasApi.update(area!.id, data),
    onSuccess,
    onError: () => setError('Erro ao atualizar área.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    if (area) {
      updateMutation.mutate({ name: name.trim(), color, visibilityDefault });
    } else {
      if (!key.trim()) { setError('Chave é obrigatória.'); return; }
      createMutation.mutate({ organizationId, name: name.trim(), key: key.trim(), color, visibilityDefault });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <h2 className="text-lg font-semibold mb-4">{area ? 'Editar área' : 'Nova área'}</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="area-name" className="block text-sm font-medium mb-1">Nome *</label>
            <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Administrativo" required />
          </div>
          {!area && (
            <div>
              <label htmlFor="area-key" className="block text-sm font-medium mb-1">Chave (slug) *</label>
              <Input
                id="area-key"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="administrativo"
              />
              <p className="text-xs text-muted-foreground mt-1">Apenas letras minúsculas, números e _. Não pode ser alterado depois.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="area-visibility" className="block text-sm font-medium mb-1">Visibilidade padrão das atividades</label>
            <select
              id="area-visibility"
              value={visibilityDefault}
              onChange={(e) => setVisibilityDefault(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Controla como as atividades desta área aparecem para membros sem permissão explícita.
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {area ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
