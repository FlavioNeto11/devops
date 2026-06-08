'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { activitiesApi, templatesApi, type ActivityTemplate } from '@/lib/activities-api';
import type { ApiResponse } from '@gymops/shared';

interface Area { id: string; name: string; color: string | null }
interface Unit { id: string; name: string }

interface NewActivityDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  unitId: string;
  areas: Area[];
  units?: Unit[];
  onCreated?: (activityId: string) => void;
}

const schema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(300),
  description: z.string().max(5000).optional(),
  areaId: z.string().uuid('Área obrigatória'),
  templateId: z.string().uuid().optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  dueAt: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const PRIORITY_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };

export function NewActivityDialog({ open, onClose, organizationId, unitId, areas, onCreated }: NewActivityDialogProps) {
  const qc = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<ActivityTemplate | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'media' },
  });

  const watchedAreaId = watch('areaId');

  const { data: templatesData } = useQuery({
    queryKey: ['templates', organizationId, watchedAreaId],
    queryFn: () => templatesApi.list({ organizationId, areaId: watchedAreaId || undefined }),
    enabled: !!organizationId,
  });

  const templates = (templatesData as ApiResponse<ActivityTemplate[]> | undefined)?.data ?? [];

  // When template changes, fill in defaults
  function applyTemplate(tmpl: ActivityTemplate | null) {
    setSelectedTemplate(tmpl);
    if (!tmpl) return;
    const config = tmpl.config;
    if (config.defaultPriority) setValue('priority', config.defaultPriority as 'baixa' | 'media' | 'alta' | 'critica');
    if (config.suggestedSlaDays) {
      const d = new Date();
      d.setDate(d.getDate() + config.suggestedSlaDays);
      setValue('dueAt', d.toISOString().split('T')[0]);
    }
    setValue('templateId', tmpl.id);
  }

  // Reset when dialog closes
  useEffect(() => {
    if (!open) { reset(); setSelectedTemplate(null); }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      activitiesApi.create({
        organizationId,
        unitId,
        areaId: data.areaId,
        templateId: data.templateId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : undefined,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['activities'] });
      void qc.invalidateQueries({ queryKey: ['unit-dashboard'] });
      toast.success('Atividade criada');
      reset();
      setSelectedTemplate(null);
      onCreated?.(res.data.id);
      onClose();
    },
    onError: () => toast.error('Erro ao criar atividade'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
          <DialogDescription>
            Crie uma atividade para a unidade selecionando area, titulo e os detalhes opcionais que fizerem sentido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pt-2">
          {/* Area (first — filters templates) */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Área *</label>
            <select
              {...register('areaId')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onChange={(e) => { register('areaId').onChange(e); setSelectedTemplate(null); setValue('templateId', undefined); }}
            >
              <option value="">Selecionar...</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.areaId && <p className="text-xs text-red-500">{errors.areaId.message}</p>}
          </div>

          {/* Template selector */}
          {watchedAreaId && templates.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Usar template</label>
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(e) => {
                  const tmpl = templates.find((t) => t.id === e.target.value) ?? null;
                  applyTemplate(tmpl);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sem template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selectedTemplate?.description && (
                <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
              )}
              {selectedTemplate && selectedTemplate.config.defaultChecklist.length > 0 && (
                <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                  <p className="mb-1 font-medium">Checklist que será criado:</p>
                  <ul className="space-y-0.5 pl-3">
                    {selectedTemplate.config.defaultChecklist.map((item, i) => (
                      <li key={i} className="list-disc">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Título *</label>
            <Input {...register('title')} placeholder="Ex: Verificar ar-condicionado sala 2" autoFocus />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição</label>
            <Textarea {...register('description')} placeholder="Detalhes opcionais..." rows={2} />
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Prioridade</label>
              <select
                {...register('priority')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Prazo</label>
              <Input {...register('dueAt')} type="date" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Criando...' : 'Criar atividade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
