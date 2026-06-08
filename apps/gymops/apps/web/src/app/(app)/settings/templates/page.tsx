'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesAdminApi } from '@/lib/admin-api';
import { areasApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import type { ActivityTemplate } from '@/lib/activities-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus, Pencil, Archive, Copy, ListTodo, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

export default function TemplatesPage() {
  const { organizationId } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ActivityTemplate | null>(null);
  const [filterArea, setFilterArea] = useState('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['templates-admin', organizationId, filterArea],
    queryFn: () => templatesAdminApi.list(organizationId!, filterArea || undefined),
    enabled: !!organizationId,
  });

  const { data: areasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId!),
    enabled: !!organizationId,
  });

  const archiveMutation = useMutation({
    mutationFn: templatesAdminApi.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates-admin', organizationId] });
      showToast('success', 'Template arquivado.');
    },
    onError: () => showToast('error', 'Erro ao arquivar template.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: templatesAdminApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates-admin', organizationId] });
      showToast('success', 'Template duplicado.');
    },
    onError: () => showToast('error', 'Erro ao duplicar template.'),
  });

  const templates = data?.data ?? [];
  const areas = areasData?.data ?? [];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Modelos de atividade reutilizáveis por área.</p>
        </div>
        <div className="flex gap-2 items-center">
          <TutorialTrigger tutorialId="templates" />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {areas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilterArea('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!filterArea ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            Todas
          </button>
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setFilterArea(filterArea === a.id ? '' : a.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterArea === a.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <ListTodo className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium mb-1">Nenhum template encontrado</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2 mt-4">
            <Plus className="h-4 w-4" />
            Criar primeiro template
          </Button>
        </div>
      ) : (
        <div className="space-y-2" data-tutorial="templates-list">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={() => setEditTemplate(t)}
              onArchive={() => {
                if (confirm(`Arquivar o template "${t.name}"?`)) archiveMutation.mutate(t.id);
              }}
              onDuplicate={() => duplicateMutation.mutate(t.id)}
              archiving={archiveMutation.isPending && archiveMutation.variables === t.id}
              duplicating={duplicateMutation.isPending && duplicateMutation.variables === t.id}
            />
          ))}
        </div>
      )}

      <TemplateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId!}
        areas={areas}
        onSuccess={() => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ['templates-admin', organizationId] });
          showToast('success', 'Template criado!');
        }}
      />

      {editTemplate && (
        <TemplateDialog
          open={!!editTemplate}
          onClose={() => setEditTemplate(null)}
          organizationId={organizationId!}
          areas={areas}
          template={editTemplate}
          onSuccess={() => {
            setEditTemplate(null);
            queryClient.invalidateQueries({ queryKey: ['templates-admin', organizationId] });
            showToast('success', 'Template atualizado!');
          }}
        />
      )}
    </div>
  );
}

function TemplateRow({ template, onEdit, onArchive, onDuplicate, archiving, duplicating }: {
  template: ActivityTemplate;
  onEdit: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  archiving: boolean;
  duplicating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const checklist = template.config?.defaultChecklist ?? [];

  return (
    <div className="rounded-lg border hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0">
          {template.area && (
            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: template.area.color ?? '#94a3b8' }} />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{template.name}</span>
              {template.isSystem && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">sistema</span>
              )}
            </div>
            {template.area && <p className="text-xs text-muted-foreground">{template.area.name}</p>}
            {template.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4 shrink-0">
          {checklist.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              {checklist.length} itens
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          <Button variant="ghost" size="icon" onClick={onDuplicate} disabled={duplicating} aria-label="Duplicar template">
            {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar template">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onArchive} disabled={archiving} aria-label="Arquivar template">
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {expanded && checklist.length > 0 && (
        <div className="border-t px-4 pb-3 pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Checklist padrão</p>
          <ul className="space-y-1">
            {checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TemplateDialog({ open, onClose, organizationId, areas, template, onSuccess }: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  areas: Array<{ id: string; name: string; color: string | null }>;
  template?: ActivityTemplate;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [areaId, setAreaId] = useState(template?.areaId ?? '');
  const [checklistRaw, setChecklistRaw] = useState((template?.config?.defaultChecklist ?? []).join('\n'));
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof templatesAdminApi.create>[0]) => templatesAdminApi.create(data),
    onSuccess,
    onError: (err: unknown) => setError((err as { message?: string })?.message ?? 'Erro ao criar template.'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof templatesAdminApi.update>[1]) => templatesAdminApi.update(template!.id, data),
    onSuccess,
    onError: () => setError('Erro ao atualizar template.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    const defaultChecklist = checklistRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    const config = {
      defaultChecklist,
      defaultPriority: template?.config?.defaultPriority ?? 'medium',
      defaultVisibility: template?.config?.defaultVisibility ?? 'team',
    };
    if (template) {
      updateMutation.mutate({ name: name.trim(), description: description.trim() || null, config });
    } else {
      createMutation.mutate({ organizationId, areaId: areaId || undefined, name: name.trim(), description: description.trim() || undefined, config });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{template ? 'Editar template' : 'Novo template'}</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tpl-name" className="block text-sm font-medium mb-1">Nome *</label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Limpeza diária" required />
          </div>
          <div>
            <label htmlFor="tpl-desc" className="block text-sm font-medium mb-1">Descrição</label>
            <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição opcional do template" />
          </div>
          {!template && areas.length > 0 && (
            <div>
              <label htmlFor="tpl-area" className="block text-sm font-medium mb-1">Área</label>
              <select
                id="tpl-area"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Sem área específica —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="tpl-checklist" className="block text-sm font-medium mb-1">Checklist padrão</label>
            <textarea
              id="tpl-checklist"
              value={checklistRaw}
              onChange={(e) => setChecklistRaw(e.target.value)}
              placeholder="Um item por linha&#10;Ex: Verificar equipamentos&#10;Ex: Assinar relatório"
              rows={5}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Um item por linha.</p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {template ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
