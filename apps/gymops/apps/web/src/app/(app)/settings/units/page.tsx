'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unitsApi, areasApi, type UnitSummary, type UnitAreaRecord } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus, Pencil, Archive, MapPin, Loader2, Layers, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

export default function UnitsPage() {
  const { organizationId } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitSummary | null>(null);
  const [areasUnit, setAreasUnit] = useState<UnitSummary | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['units', organizationId],
    queryFn: () => unitsApi.list(organizationId!),
    enabled: !!organizationId,
  });

  const archiveMutation = useMutation({
    mutationFn: unitsApi.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', organizationId] });
      showToast('success', 'Unidade arquivada.');
    },
    onError: () => showToast('error', 'Erro ao arquivar unidade.'),
  });

  const units = data?.data ?? [];

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as unidades físicas da organização.</p>
        </div>
        <div className="flex gap-2 items-center">
          <TutorialTrigger tutorialId="units-areas-admin" />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Unidade
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
      ) : units.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium mb-1">Nenhuma unidade cadastrada</p>
          <p className="text-sm text-muted-foreground mb-4">Crie a primeira unidade para começar.</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar primeira unidade
          </Button>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="units-admin-list">
          {units.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{unit.name}</span>
                  {unit.code && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{unit.code}</span>}
                  <Badge variant={unit.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {unit.status === 'active' ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
                {unit.address && <p className="text-sm text-muted-foreground mt-0.5 truncate">{unit.address}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => setAreasUnit(unit)} aria-label="Gerenciar áreas">
                  <Layers className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEditUnit(unit)} aria-label="Editar unidade">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Arquivar a unidade "${unit.name}"? Esta ação não pode ser desfeita facilmente.`))
                      archiveMutation.mutate(unit.id);
                  }}
                  disabled={archiveMutation.isPending}
                  aria-label="Arquivar unidade"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UnitDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId!}
        onSuccess={() => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ['units', organizationId] });
          showToast('success', 'Unidade criada com sucesso!');
        }}
      />

      {editUnit && (
        <UnitDialog
          open={!!editUnit}
          onClose={() => setEditUnit(null)}
          organizationId={organizationId!}
          unit={editUnit}
          onSuccess={() => {
            setEditUnit(null);
            queryClient.invalidateQueries({ queryKey: ['units', organizationId] });
            showToast('success', 'Unidade atualizada!');
          }}
        />
      )}

      {areasUnit && (
        <UnitAreasDialog
          open={!!areasUnit}
          onClose={() => setAreasUnit(null)}
          unit={areasUnit}
          organizationId={organizationId!}
          onSuccess={() => showToast('success', 'Áreas atualizadas.')}
        />
      )}
    </div>
  );
}

function UnitDialog({ open, onClose, organizationId, unit, onSuccess }: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  unit?: UnitSummary;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(unit?.name ?? '');
  const [code, setCode] = useState(unit?.code ?? '');
  const [address, setAddress] = useState(unit?.address ?? '');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof unitsApi.create>[0]) => unitsApi.create(data),
    onSuccess,
    onError: () => setError('Erro ao criar unidade.'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof unitsApi.update>[1]) => unitsApi.update(unit!.id, data),
    onSuccess,
    onError: () => setError('Erro ao atualizar unidade.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    if (unit) {
      updateMutation.mutate({ name: name.trim(), code: code.trim() || undefined, address: address.trim() || undefined });
    } else {
      createMutation.mutate({ organizationId, name: name.trim(), code: code.trim() || undefined, address: address.trim() || undefined });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <h2 className="text-lg font-semibold mb-4">{unit ? 'Editar unidade' : 'Nova unidade'}</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="unit-name" className="block text-sm font-medium mb-1">Nome *</label>
            <Input id="unit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vila Xavier" required />
          </div>
          <div>
            <label htmlFor="unit-code" className="block text-sm font-medium mb-1">Código</label>
            <Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex: VX" />
          </div>
          <div>
            <label htmlFor="unit-address" className="block text-sm font-medium mb-1">Endereço</label>
            <Input id="unit-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {unit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitAreasDialog({ open, onClose, unit, organizationId, onSuccess }: {
  open: boolean;
  onClose: () => void;
  unit: UnitSummary;
  organizationId: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: unitDetailData, isLoading: unitLoading } = useQuery({
    queryKey: ['unit-detail', unit.id],
    queryFn: () => unitsApi.get(unit.id),
    enabled: open,
  });

  const { data: allAreasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId),
    enabled: open,
  });

  const linkedAreas: UnitAreaRecord[] = unitDetailData?.data?.unitAreas ?? [];
  const allAreas = allAreasData?.data ?? [];
  const linkedAreaIds = new Set(linkedAreas.map((ua) => ua.areaId));
  const availableAreas = allAreas.filter((a) => !linkedAreaIds.has(a.id) && !a.deletedAt);

  const addMutation = useMutation({
    mutationFn: (areaId: string) => unitsApi.addArea(unit.id, areaId, linkedAreas.length),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-detail', unit.id] });
      onSuccess();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (areaId: string) => unitsApi.removeArea(unit.id, areaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-detail', unit.id] });
      onSuccess();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (order: Array<{ areaId: string; order: number }>) => unitsApi.reorderAreas(unit.id, order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-detail', unit.id] });
    },
  });

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...linkedAreas];
    const temp = newOrder[index - 1];
    if (!temp) return;
    newOrder[index - 1] = newOrder[index]!;
    newOrder[index] = temp;
    reorderMutation.mutate(newOrder.map((ua, i) => ({ areaId: ua.areaId, order: i })));
  };

  const handleMoveDown = (index: number) => {
    if (index === linkedAreas.length - 1) return;
    const newOrder = [...linkedAreas];
    const temp = newOrder[index + 1];
    if (!temp) return;
    newOrder[index + 1] = newOrder[index]!;
    newOrder[index] = temp;
    reorderMutation.mutate(newOrder.map((ua, i) => ({ areaId: ua.areaId, order: i })));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Áreas da unidade</h2>
        <p className="text-sm text-muted-foreground mb-4">{unit.name}</p>

        {unitLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Linked areas */}
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Áreas vinculadas ({linkedAreas.length})</p>
              {linkedAreas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">Nenhuma área vinculada.</p>
              ) : (
                <div className="space-y-1">
                  {linkedAreas.map((ua, idx) => (
                    <div key={ua.areaId} className="flex items-center justify-between rounded-md border p-2 bg-background">
                      <div className="flex items-center gap-2 min-w-0">
                        {ua.area.color && (
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: ua.area.color }} />
                        )}
                        <span className="text-sm truncate">{ua.area.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveUp(idx)} disabled={idx === 0} aria-label="Mover para cima">
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveDown(idx)} disabled={idx === linkedAreas.length - 1} aria-label="Mover para baixo">
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm(`Desvincular "${ua.area.name}" desta unidade? Atividades existentes não serão afetadas.`))
                              removeMutation.mutate(ua.areaId);
                          }}
                          disabled={removeMutation.isPending}
                          aria-label="Desvincular área"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available areas to add */}
            {availableAreas.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Áreas disponíveis para vincular</p>
                <div className="space-y-1">
                  {availableAreas.map((area) => (
                    <div key={area.id} className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        {area.color && (
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: area.color }} />
                        )}
                        <span className="text-sm truncate">{area.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addMutation.mutate(area.id)}
                        disabled={addMutation.isPending}
                        className="gap-1 h-7 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Vincular
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
