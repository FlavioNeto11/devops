'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { aiApi, type ActivityDraft } from '@/lib/ai-api';
import { activitiesApi } from '@/lib/activities-api';
import { useAuthStore } from '@/store/auth';

interface Props {
  unitId: string;
  areas: Array<{ id: string; key: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
};

const PRIORITY_COLORS: Record<string, string> = {
  baixa: 'text-green-600', media: 'text-blue-600', alta: 'text-amber-600', critica: 'text-red-600',
};

export function AiDraftDialog({ unitId, areas, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const organizationId = useAuthStore((s) => s.organizationId);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedDueDays, setEditedDueDays] = useState(7);

  const draftMutation = useMutation({
    mutationFn: () => aiApi.draft(text, organizationId!),
    onSuccess: (res) => {
      const d = res.data;
      setDraft(d);
      setEditedTitle(d.title);
      setEditedDescription(d.description ?? '');
      setEditedDueDays(d.suggestedDueDays);
      setStep('review');
    },
    onError: () => toast.error('Falha ao gerar rascunho'),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('No draft');
      const area = areas.find((a) => a.key === draft.areaKey) ?? areas[0];
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + editedDueDays);
      const res = await activitiesApi.create({
        organizationId: organizationId!,
        unitId,
        areaId: area?.id,
        title: editedTitle,
        description: editedDescription || undefined,
        priority: draft.priority,
        dueAt: dueAt.toISOString(),
      });
      // Vincula o checklist sugerido pela IA à atividade recém-criada.
      if (draft.checklist.length > 0 && res.data?.id) {
        try {
          await activitiesApi.createChecklist(res.data.id, 'Checklist sugerido pela IA', draft.checklist);
        } catch {
          /* não bloqueia a criação da atividade se o checklist falhar */
        }
      }
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activities'] });
      void qc.invalidateQueries({ queryKey: ['unit-dashboard'] });
      toast.success('Atividade criada com sucesso!');
      onCreated();
      onClose();
    },
    onError: () => toast.error('Erro ao criar atividade'),
  });

  const areaForDraft = draft ? (areas.find((a) => a.key === draft.areaKey)?.name ?? draft.areaKey) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            <h2 className="font-semibold">Criar com IA</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'input' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium">Descreva a atividade em texto livre</label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ex: &quot;esteira 4 parada na Vila Xavier&quot; ou &quot;campanha de junho no marketing&quot;
              </p>
            </div>
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Descreva o que precisa ser feito..."
              className="min-h-[100px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.length >= 3) {
                  draftMutation.mutate();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={() => draftMutation.mutate()}
                disabled={text.length < 3 || draftMutation.isPending}
                className="gap-1.5"
              >
                {draftMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analisando...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Gerar rascunho</>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && draft && (
          <div className="p-5 space-y-4">
            {/* Confidence indicator */}
            <div className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${
              draft.confidence >= 0.7 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {draft.confidence >= 0.7
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {draft.reasoning ?? (draft.confidence >= 0.7
                ? 'Alta confiança na classificação'
                : 'Revise os campos sugeridos abaixo')}
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Título</label>
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="mt-1 min-h-[60px] resize-none text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Área sugerida</label>
                  <p className="mt-1 text-sm font-medium">{areaForDraft}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
                  <p className={`mt-1 text-sm font-medium ${PRIORITY_COLORS[draft.priority] ?? ''}`}>
                    {PRIORITY_LABELS[draft.priority] ?? draft.priority}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Prazo (dias)</label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={editedDueDays}
                    onChange={(e) => setEditedDueDays(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              {draft.checklist.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Checklist sugerido</label>
                  <ul className="mt-1 space-y-1">
                    {draft.checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {draft.clarifyingQuestions && draft.clarifyingQuestions.length > 0 && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                    <Sparkles className="h-3.5 w-3.5" /> A IA sugere confirmar antes de criar
                  </label>
                  <ul className="mt-1.5 space-y-1">
                    {draft.clarifyingQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-violet-900">• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
                ← Reescrever
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!editedTitle.trim() || createMutation.isPending}
                  className="gap-1.5"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Criando...</>
                  ) : (
                    'Confirmar e criar'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
