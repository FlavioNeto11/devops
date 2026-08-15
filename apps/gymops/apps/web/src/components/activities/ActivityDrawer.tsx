'use client';

import { useState, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Clock, AlertTriangle, CheckSquare, MessageSquare, Paperclip,
  History, Plus, Trash2, Upload, Download, Lock, Share2, Users, RefreshCw,
  Sparkles, Eye, EyeOff, ChevronUp, ChevronDown, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { activitiesApi, type ActivityDetail, type Comment, type RecurrenceRule } from '@/lib/activities-api';
import { ChecklistSuggestPanel } from '@/components/ai/ChecklistSuggestPanel';
import { aiApi, type ChecklistRevisionResult } from '@/lib/ai-api';
import { TutorialTrigger } from '@/features/tutorial';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { UserAvatar } from '@/components/ui/avatar';
import type { ApiResponse } from '@gymops/shared';

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_terceiro', label: 'Aguardando terceiro' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

const PRIORITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];

const EVENT_LABELS: Record<string, string> = {
  created: 'criou a atividade',
  status_changed: 'alterou o status',
  priority_changed: 'alterou a prioridade',
  due_date_changed: 'alterou o prazo',
  title_changed: 'alterou o título',
  commented: 'comentou',
  checklist_checked: 'marcou item do checklist',
  checklist_item_commented: 'comentou em item do checklist',
  checklist_disabled: 'desativou um checklist',
  checklist_enabled: 'reativou um checklist',
  checklist_removed: 'removeu um checklist',
  checklist_revised: 'revisou o checklist com IA',
  assignees_changed: 'alterou responsáveis',
  attached: 'adicionou anexo',
  deleted: 'excluiu a atividade',
  visibility_changed: 'alterou visibilidade',
};

const VISIBILITY_LABELS: Record<string, string> = {
  inherited: 'Herdada',
  restricted: 'Restrita',
  shared: 'Compartilhada',
};

interface ActivityDrawerProps {
  activityId: string | null;
  onClose: () => void;
}

export function ActivityDrawer({ activityId, onClose }: ActivityDrawerProps) {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const userRole = useAuthStore((s) => s.userRole);
  const organizationId = useAuthStore((s) => s.organizationId);
  const canManageVisibility =
    userRole === 'owner' || userRole === 'org_manager' || userRole === 'unit_manager' || userRole === 'area_leader';

  const [commentText, setCommentText] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: actRes, isLoading } = useQuery({
    queryKey: ['activity', activityId],
    queryFn: () => activitiesApi.get(activityId!),
    enabled: !!activityId,
    staleTime: 10_000,
  });

  const { data: commentsRes } = useQuery({
    queryKey: ['activity-comments', activityId],
    queryFn: () => activitiesApi.getComments(activityId!),
    enabled: !!activityId,
  });

  const { data: eventsRes } = useQuery({
    queryKey: ['activity-events', activityId],
    queryFn: () => activitiesApi.getEvents(activityId!),
    enabled: !!activityId,
  });

  const { data: attachmentsRes } = useQuery({
    queryKey: ['activity-attachments', activityId],
    queryFn: () => activitiesApi.getAttachments(activityId!),
    enabled: !!activityId,
  });

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => activitiesApi.patch(activityId!, data),
    onSuccess: (_result, variables) => {
      void qc.invalidateQueries({ queryKey: ['activity', activityId] });
      void qc.invalidateQueries({ queryKey: ['activities'] });
      void qc.invalidateQueries({ queryKey: ['unit-dashboard'] });
      void qc.invalidateQueries({ queryKey: ['activity-events', activityId] });
      void qc.invalidateQueries({ queryKey: ['my-activities'] });
      // Toast when completing a recurring activity
      if (variables.status === 'concluido' && actRes?.data?.recurrenceRule) {
        const nextRunAt = actRes.data.recurrenceRule.nextRunAt;
        const nextLabel = nextRunAt
          ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date(nextRunAt))
          : 'em breve';
        toast.success(`Próxima ocorrência gerada para ${nextLabel}`);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar';
      toast.error(msg);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => activitiesApi.addComment(activityId!, body),
    onSuccess: () => {
      setCommentText('');
      void qc.invalidateQueries({ queryKey: ['activity-comments', activityId] });
      toast.success('Comentário adicionado');
    },
    onError: () => toast.error('Erro ao comentar'),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      activitiesApi.toggleChecklistItem(itemId, done),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity', activityId] });
      void qc.invalidateQueries({ queryKey: ['activity-events', activityId] });
    },
    // Sem onError, a falha desmarcava o item "sozinho" no refetch sem aviso
    // (UX-GYMOPS-013). O checklist é o registro operacional central.
    onError: () => toast.error('Não foi possível atualizar o item. Tente novamente.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const presign = await activitiesApi.presignAttachment(activityId!, {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (presign.data.uploadUrl) {
        await fetch(presign.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      }
      await activitiesApi.registerAttachment(activityId!, {
        objectKey: presign.data.objectKey,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity-attachments', activityId] });
      void qc.invalidateQueries({ queryKey: ['activity-events', activityId] });
      toast.success('Anexo adicionado');
    },
    onError: () => toast.error('Erro ao enviar anexo'),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (id: string) => activitiesApi.deleteAttachment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity-attachments', activityId] });
      toast.success('Anexo removido');
    },
    // Sem onError, o anexo "voltava" no refetch sem explicação (UX-GYMOPS-013).
    onError: () => toast.error('Erro ao remover anexo'),
  });

  const activity = actRes?.data;
  const comments = commentsRes?.data ?? [];
  const events = eventsRes?.data ?? [];
  const attachments = attachmentsRes?.data ?? [];

  if (!activityId) return null;

  return (
    <>
      {/* Drawer acessível sobre Radix Dialog: role=dialog + aria-modal, focus
          trap, Esc para fechar e retorno de foco à origem vêm do primitivo
          (UX-GYMOPS-004), preservando o visual do painel lateral. */}
      <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogPrimitive.Portal>
          {/* Overlay — hidden on mobile (full screen drawer) */}
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 hidden bg-black/40 md:block" />

          {/* Drawer panel */}
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col overflow-hidden border-l bg-background shadow-2xl outline-none md:max-w-2xl"
          >
            <DialogPrimitive.Title className="sr-only">
              {activity?.title ? `Atividade: ${activity.title}` : 'Detalhes da atividade'}
            </DialogPrimitive.Title>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              ) : editingTitle ? (
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    if (titleDraft.trim() && titleDraft !== activity?.title) {
                      patchMutation.mutate({ title: titleDraft.trim() });
                    }
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  className="text-lg font-semibold"
                />
              ) : (
                <h2
                  className="cursor-text text-lg font-semibold leading-snug hover:underline"
                  onClick={() => { setTitleDraft(activity?.title ?? ''); setEditingTitle(true); }}
                >
                  {activity?.title}
                </h2>
              )}

              {activity && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {activity.isOverdue && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                      <AlertTriangle className="h-3 w-3" />
                      Atrasada
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {activity.unit?.name} · {activity.area?.name}
                  </span>
                  {activity.visibilityMode !== 'inherited' && (
                    <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      <Lock className="h-2.5 w-2.5" />
                      {VISIBILITY_LABELS[activity.visibilityMode]}
                    </span>
                  )}
                  {activity.recurrenceRule && (
                    <span className="flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                      <RefreshCw className="h-2.5 w-2.5" />
                      Recorrente
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canManageVisibility && activity && (
                <>
                  {activity.visibilityMode !== 'restricted' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        // Toast de sucesso só após o servidor confirmar — antes ele
                        // aparecia mesmo quando o PATCH falhava (UX-GYMOPS-012).
                        patchMutation.mutate(
                          { visibilityMode: 'restricted' },
                          { onSuccess: () => toast.success('Atividade restrita a membros explícitos') },
                        );
                      }}
                    >
                      <Lock className="h-3 w-3" />
                      Restringir
                    </Button>
                  )}
                  {activity.visibilityMode === 'restricted' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setShowShareModal(true)}
                    >
                      <Share2 className="h-3 w-3" />
                      Compartilhar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setShowRecurrenceModal(true)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Recorrência
                  </Button>
                </>
              )}
              <TutorialTrigger tutorialId="activity-detail" size="icon" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Status + Priority + Due date bar */}
          {activity && (
            <div data-tutorial="activity-drawer-status" className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Status</span>
                <select
                  value={activity.status}
                  onChange={(e) => patchMutation.mutate({ status: e.target.value })}
                  className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Prioridade</span>
                <select
                  value={activity.priority}
                  onChange={(e) => patchMutation.mutate({ priority: e.target.value })}
                  className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <input
                  type="date"
                  defaultValue={activity.dueAt ? activity.dueAt.slice(0, 10) : ''}
                  onChange={(e) =>
                    patchMutation.mutate({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                  className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Content tabs */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}
              </div>
            ) : activity ? (
              <Tabs defaultValue="checklist" className="flex h-full flex-col">
                <TabsList className="mx-6 mt-4 w-fit shrink-0">
                  <TabsTrigger value="checklist">
                    <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                    Checklist
                    {activity.checklistProgress.total > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {activity.checklistProgress.done}/{activity.checklistProgress.total}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="comments">
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Comentários
                    {comments.length > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{comments.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="attachments">
                    <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                    Anexos
                    {attachments.length > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{attachments.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Histórico
                  </TabsTrigger>
                </TabsList>

                {/* ── Checklist ── */}
                <TabsContent value="checklist" className="flex-1 overflow-y-auto px-6 pb-6" data-tutorial="activity-drawer-checklist">
                  <ChecklistSection
                    activity={activity}
                    onToggle={(itemId, done) => checklistMutation.mutate({ itemId, done })}
                    activityId={activityId!}
                    attachments={attachments}
                  />
                </TabsContent>

                {/* ── Comments ── */}
                <TabsContent value="comments" className="flex-1 overflow-y-auto px-6 pb-6" data-tutorial="activity-drawer-comments">
                  <div className="space-y-4 pt-4">
                    <div className="flex gap-2">
                      {currentUser && (
                        <UserAvatar
                          name={currentUser.name}
                          avatarUrl={currentUser.avatarUrl}
                          className="mt-0.5 h-7 w-7 shrink-0 text-xs"
                        />
                      )}
                      <div className="flex-1 space-y-2">
                        <Textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Escreva um comentário..."
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && commentText.trim()) {
                              commentMutation.mutate(commentText.trim());
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={!commentText.trim() || commentMutation.isPending}
                          onClick={() => commentMutation.mutate(commentText.trim())}
                        >
                          {commentMutation.isPending ? 'Enviando...' : 'Comentar'}
                        </Button>
                      </div>
                    </div>

                    {comments.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum comentário ainda.
                      </p>
                    ) : (
                      comments.map((c) => (
                        <CommentItem key={c.id} comment={c} currentUserId={currentUser?.id} />
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* ── Attachments ── */}
                <TabsContent value="attachments" className="flex-1 overflow-y-auto px-6 pb-6" data-tutorial="activity-drawer-attachments">
                  <div className="space-y-3 pt-4">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Enviar anexo: clique, use Enter/Espaço ou arraste o arquivo"
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) uploadMutation.mutate(file);
                      }}
                    >
                      <Upload className="h-6 w-6" />
                      <span>{uploadMutation.isPending ? 'Enviando...' : 'Clique ou arraste para enviar'}</span>
                      <span className="text-xs">Máx. 10MB — PDF, imagens, xlsx, docx, csv, zip</span>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.csv,.zip"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadMutation.mutate(f);
                        e.target.value = '';
                      }}
                    />

                    {attachments.length === 0 ? (
                      <p className="py-2 text-center text-sm text-muted-foreground">Nenhum anexo.</p>
                    ) : (
                      attachments.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.filename}</p>
                            {a.sizeBytes && (
                              <p className="text-xs text-muted-foreground">
                                {(a.sizeBytes / 1024).toFixed(0)} KB
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {a.downloadUrl && (
                              <a href={a.downloadUrl} target="_blank" rel="noreferrer">
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500"
                              aria-label={`Remover anexo ${a.filename}`}
                              onClick={() => {
                                // Exclusão destrutiva sem undo — confirma citando o
                                // arquivo, como já faz a remoção de checklist (UX-GYMOPS-014).
                                if (window.confirm(`Remover o anexo "${a.filename}"? Esta ação não pode ser desfeita.`)) {
                                  deleteAttachmentMutation.mutate(a.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* ── History ── */}
                <TabsContent value="history" className="flex-1 overflow-y-auto px-6 pb-6" data-tutorial="activity-drawer-history">
                  <div className="space-y-0 pt-4">
                    {events.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum evento registrado.
                      </p>
                    ) : (
                      events.map((event, idx) => (
                        <div key={event.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              {event.actor ? (
                                <UserAvatar
                                  name={event.actor.name}
                                  avatarUrl={event.actor.avatarUrl}
                                  className="h-7 w-7 text-[10px]"
                                />
                              ) : (
                                <History className="h-3 w-3" />
                              )}
                            </div>
                            {idx < events.length - 1 && <div className="w-px flex-1 bg-border" />}
                          </div>
                          <div className="pb-4">
                            <p className="text-sm">
                              <span className="font-medium">{event.actor?.name ?? 'Sistema'}</span>
                              {' '}{EVENT_LABELS[event.eventType] ?? event.eventType}
                              {event.eventType === 'status_changed' && (
                                <span className="ml-1 text-muted-foreground">
                                  ({String(event.payload['from'])} → {String(event.payload['to'])})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatRelative(event.createdAt)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Atividade não encontrada.</p>
              </div>
            )}
          </div>

          {/* Description footer */}
          {activity?.description && (
            <div className="border-t px-6 py-3">
              <p className="text-xs font-medium text-muted-foreground">Descrição</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{activity.description}</p>
            </div>
          )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Share modal */}
      {showShareModal && activityId && organizationId && (
        <ShareModal
          activityId={activityId}
          organizationId={organizationId}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Recurrence modal */}
      {showRecurrenceModal && activityId && (
        <RecurrenceModal
          activityId={activityId}
          existing={activity?.recurrenceRule ?? null}
          onClose={() => setShowRecurrenceModal(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['activity', activityId] });
            setShowRecurrenceModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Recurrence Modal ──────────────────────────────────────────────────────────

const FREQ_LABELS = {
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
  intervalo_customizado: 'Intervalo personalizado',
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function RecurrenceModal({
  activityId,
  existing,
  onClose,
  onSaved,
}: {
  activityId: string;
  existing: RecurrenceRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [frequency, setFrequency] = useState<RecurrenceRule['frequency']>(existing?.frequency ?? 'semanal');
  const [interval, setInterval] = useState(existing?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [1, 2, 3, 4, 5]);
  const [generationMode, setGenerationMode] = useState<RecurrenceRule['generationMode']>(existing?.generationMode ?? 'on_complete');

  const saveMutation = useMutation({
    mutationFn: () =>
      activitiesApi.setRecurrence(activityId, {
        frequency,
        interval,
        weekdays: frequency === 'semanal' ? weekdays : undefined,
        generationMode,
      }),
    onSuccess: () => {
      toast.success('Recorrência configurada');
      onSaved();
    },
    onError: () => toast.error('Erro ao configurar recorrência'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => activitiesApi.deleteRecurrence(activityId),
    onSuccess: () => {
      toast.success('Recorrência removida');
      onSaved();
    },
    onError: () => toast.error('Erro ao remover recorrência'),
  });

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto outline-none"
        >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <DialogPrimitive.Title className="font-semibold">Configurar recorrência</DialogPrimitive.Title>
            <p className="text-xs text-muted-foreground">Gerar atividades automaticamente</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Frequency */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Frequência</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceRule['frequency'])}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {Object.entries(FREQ_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Interval */}
          {(frequency === 'intervalo_customizado' || frequency === 'mensal') && (
            <div className="space-y-1">
              <label className="text-sm font-medium">
                A cada {frequency === 'mensal' ? 'meses' : 'dias'}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
          )}

          {/* Weekdays (for weekly) */}
          {frequency === 'semanal' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Dias da semana</label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                      weekdays.includes(day)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generation mode */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Modo de geração</label>
            <div className="space-y-1.5">
              {([
                ['on_complete', 'Ao concluir a atividade atual'],
                ['pre_generate', 'Pré-gerar automaticamente (cron horário)'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value={value}
                    checked={generationMode === value}
                    onChange={() => setGenerationMode(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar recorrência'}
            </Button>
            {existing && (
              <Button
                variant="outline"
                className="text-red-500 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Remover
              </Button>
            )}
          </div>
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

interface SearchUser { id: string; name: string; email: string; avatarUrl: string | null }

function ShareModal({
  activityId,
  organizationId,
  onClose,
}: { activityId: string; organizationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [searchQ, setSearchQ] = useState('');
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [accessLevel, setAccessLevel] = useState<'view' | 'edit'>('view');

  const { data: searchRes } = useQuery({
    queryKey: ['users-search', searchQ, organizationId],
    queryFn: () =>
      api.get<ApiResponse<SearchUser[]>>(`/users/search?q=${encodeURIComponent(searchQ)}&organizationId=${organizationId}`),
    enabled: searchQ.length >= 2,
    staleTime: 10_000,
  });

  const shareMutation = useMutation({
    mutationFn: ({ userId, level }: { userId: string; level: 'view' | 'edit' }) =>
      activitiesApi.assign(activityId, {
        add: [{ userId, kind: 'participant' }],
      }).then(() =>
        api.post(`/activities/${activityId}/share`, { userId, accessLevel: level }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity', activityId] });
      toast.success('Acesso concedido');
      setSelectedUser(null);
      setSearchQ('');
    },
    onError: () => toast.error('Erro ao compartilhar'),
  });

  const users = searchRes?.data ?? [];

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto outline-none"
        >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <DialogPrimitive.Title className="font-semibold">Compartilhar atividade</DialogPrimitive.Title>
            <p className="text-xs text-muted-foreground">Dê acesso a um usuário desta organização</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          {/* Search */}
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setSelectedUser(null); }}
            autoFocus
          />

          {/* Results */}
          {searchQ.length >= 2 && users.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-2">Nenhum usuário encontrado</p>
          )}
          {users.length > 0 && !selectedUser && (
            <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedUser(u)}
                >
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="h-7 w-7 text-[10px] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected user + access level */}
          {selectedUser && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={selectedUser.name} avatarUrl={selectedUser.avatarUrl} className="h-8 w-8 text-xs shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedUser.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Nível de acesso:</span>
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as 'view' | 'edit')}
                  className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs"
                >
                  <option value="view">Visualizar</option>
                  <option value="edit">Editar</option>
                </select>
              </div>

              <Button
                className="w-full gap-2"
                size="sm"
                disabled={shareMutation.isPending}
                onClick={() => shareMutation.mutate({ userId: selectedUser.id, level: accessLevel })}
              >
                <Users className="h-3.5 w-3.5" />
                {shareMutation.isPending ? 'Compartilhando...' : 'Conceder acesso'}
              </Button>
            </div>
          )}
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Checklist section ─────────────────────────────────────────────────────────

function ChecklistSection({
  activity,
  onToggle,
  activityId,
  attachments,
}: {
  activity: ActivityDetail;
  onToggle: (itemId: string, done: boolean) => void;
  activityId: string;
  attachments: ActivityDetail['attachments'];
}) {
  const qc = useQueryClient();
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  // Item com o painel inline (comentário + anexos) aberto.
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  // Checklist com o painel de revisão por IA aberto.
  const [aiChecklistId, setAiChecklistId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['activity', activityId] });
    void qc.invalidateQueries({ queryKey: ['activity-events', activityId] });
  };

  // Progresso considera apenas checklists ATIVOS (desativado sai da conta).
  const activeChecklists = activity.checklists.filter((c) => !c.disabledAt);
  const allActiveItems = activeChecklists.flatMap((c) => c.items);
  const total = allActiveItems.length;
  const done = allActiveItems.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const attachmentsByItem = new Map<string, ActivityDetail['attachments']>();
  for (const att of attachments) {
    if (!att.checklistItemId) continue;
    const list = attachmentsByItem.get(att.checklistItemId) ?? [];
    list.push(att);
    attachmentsByItem.set(att.checklistItemId, list);
  }

  const addItemMutation = useMutation({
    mutationFn: ({ checklistId, text }: { checklistId: string; text: string }) =>
      activitiesApi.addChecklistItem(checklistId, text),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['activity', activityId] });
      setNewItemText((prev) => ({ ...prev, [vars.checklistId]: '' }));
    },
    onError: () => toast.error('Erro ao adicionar item'),
  });

  const patchChecklistMutation = useMutation({
    mutationFn: ({ checklistId, disabled }: { checklistId: string; disabled: boolean }) =>
      activitiesApi.patchChecklist(checklistId, { disabled }),
    onSuccess: (_, vars) => {
      invalidate();
      toast.success(vars.disabled ? 'Checklist desativado' : 'Checklist reativado');
    },
    onError: () => toast.error('Erro ao atualizar checklist'),
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (checklistId: string) => activitiesApi.deleteChecklist(checklistId),
    onSuccess: () => {
      invalidate();
      toast.success('Checklist removido');
    },
    onError: () => toast.error('Erro ao remover checklist'),
  });

  const handleAiItems = async (items: string[]) => {
    const checklist = await activitiesApi.createChecklist(activityId, 'Sugestões da IA');
    const checklistId = checklist.data.id;
    for (const text of items) {
      await activitiesApi.addChecklistItem(checklistId, text);
    }
    void qc.invalidateQueries({ queryKey: ['activity', activityId] });
  };

  const createChecklistMutation = useMutation({
    mutationFn: (title: string) => activitiesApi.createChecklist(activityId, title),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity', activityId] });
      setNewChecklistTitle('');
      setAddingChecklist(false);
    },
    onError: () => toast.error('Erro ao criar checklist'),
  });

  return (
    <div className="space-y-4 pt-4">
      {total > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={pct} className="flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground">{pct}%</span>
        </div>
      )}

      {activity.checklists.map((checklist) => {
        const isDisabled = Boolean(checklist.disabledAt);
        return (
        <div key={checklist.id} className={`space-y-2 ${isDisabled ? 'opacity-60' : ''}`}>
          <div className="group flex items-center gap-2">
            <h4 className="min-w-0 flex-1 truncate font-medium text-sm">{checklist.title}</h4>
            {isDisabled && (
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Desativado
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
              {!isDisabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-violet-600 hover:text-violet-700"
                  aria-label="Revisar checklist com IA"
                  onClick={() => setAiChecklistId(aiChecklistId === checklist.id ? null : checklist.id)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label={isDisabled ? 'Reativar checklist' : 'Desativar checklist'}
                onClick={() => patchChecklistMutation.mutate({ checklistId: checklist.id, disabled: !isDisabled })}
              >
                {isDisabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-600"
                aria-label="Remover checklist"
                onClick={() => {
                  if (window.confirm(`Remover o checklist "${checklist.title}" e todos os seus itens?`)) {
                    deleteChecklistMutation.mutate(checklist.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {aiChecklistId === checklist.id && !isDisabled && (
            <ChecklistRevisePanel
              checklist={checklist}
              onApplied={() => {
                setAiChecklistId(null);
                invalidate();
              }}
              onClose={() => setAiChecklistId(null)}
            />
          )}

          {checklist.items.map((item) => {
            const itemAttachments = attachmentsByItem.get(item.id) ?? [];
            const isExpanded = expandedItemId === item.id;
            return (
            <div key={item.id}>
              <div className="group/item flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/30">
                <Checkbox
                  checked={item.done}
                  disabled={isDisabled}
                  onCheckedChange={(checked) => {
                    onToggle(item.id, Boolean(checked));
                    // Ao CONCLUIR, abre o painel para comentar/anexar na hora.
                    if (checked) setExpandedItemId(item.id);
                  }}
                />
                <span className={`flex-1 text-sm ${item.done ? 'line-through text-muted-foreground' : ''}`}>
                  {item.text}
                </span>
                {(item.comment || itemAttachments.length > 0) && (
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    {item.comment && <MessageSquare className="h-3 w-3" aria-label="Item com comentário" />}
                    {itemAttachments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px]">
                        <Paperclip className="h-3 w-3" aria-label="Item com anexos" />
                        {itemAttachments.length}
                      </span>
                    )}
                  </span>
                )}
                {item.done && item.doneAt && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(item.doneAt)}</span>
                )}
                {!isDisabled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:transition-opacity md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
                    aria-label={isExpanded ? 'Fechar detalhes do item' : 'Comentar ou anexar arquivo'}
                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              {isExpanded && !isDisabled && (
                <ChecklistItemPanel
                  activityId={activityId}
                  item={item}
                  itemAttachments={itemAttachments}
                  onSaved={invalidate}
                />
              )}
            </div>
            );
          })}
          {!isDisabled && (
          <div className="flex gap-2 pl-6">
            <Input
              value={newItemText[checklist.id] ?? ''}
              onChange={(e) => setNewItemText((p) => ({ ...p, [checklist.id]: e.target.value }))}
              placeholder="Novo item..."
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const text = (newItemText[checklist.id] ?? '').trim();
                  if (text) addItemMutation.mutate({ checklistId: checklist.id, text });
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                const text = (newItemText[checklist.id] ?? '').trim();
                if (text) addItemMutation.mutate({ checklistId: checklist.id, text });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          )}
        </div>
        );
      })}

      {total === 0 && activity.checklists.length === 0 && (
        <ChecklistSuggestPanel activityId={activityId} onAddItems={(items) => { void handleAiItems(items); }} />
      )}

      {addingChecklist ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            placeholder="Título do bloco..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newChecklistTitle.trim()) {
                createChecklistMutation.mutate(newChecklistTitle.trim());
              }
              if (e.key === 'Escape') setAddingChecklist(false);
            }}
          />
          <Button
            size="sm"
            onClick={() => newChecklistTitle.trim() && createChecklistMutation.mutate(newChecklistTitle.trim())}
          >
            Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingChecklist(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddingChecklist(true)}>
          <Plus className="h-3.5 w-3.5" />
          Novo bloco
        </Button>
      )}
    </div>
  );
}

// ── Checklist item panel (comentário + anexos do item, minimal) ───────────────

function ChecklistItemPanel({
  activityId,
  item,
  itemAttachments,
  onSaved,
}: {
  activityId: string;
  item: ActivityDetail['checklists'][number]['items'][number];
  itemAttachments: ActivityDetail['attachments'];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [commentDraft, setCommentDraft] = useState(item.comment ?? '');
  const itemFileRef = useRef<HTMLInputElement>(null);

  const commentMutation = useMutation({
    mutationFn: (comment: string | null) => activitiesApi.updateChecklistItem(item.id, { comment }),
    onSuccess: () => {
      onSaved();
      toast.success('Comentário salvo');
    },
    onError: () => toast.error('Erro ao salvar comentário'),
  });

  const itemUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const presign = await activitiesApi.presignAttachment(activityId, {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (presign.data.uploadUrl) {
        await fetch(presign.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      }
      await activitiesApi.registerAttachment(activityId, {
        objectKey: presign.data.objectKey,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        checklistItemId: item.id,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity-attachments', activityId] });
      void qc.invalidateQueries({ queryKey: ['activity-events', activityId] });
      toast.success('Anexo adicionado ao item');
    },
    onError: () => toast.error('Erro ao enviar anexo'),
  });

  const canSave = commentDraft.trim() !== (item.comment ?? '');

  return (
    <div className="ml-6 mt-1 space-y-2 rounded-md border bg-muted/20 p-2">
      <div className="flex items-start gap-2">
        <Textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          placeholder="Comentário do item (opcional)..."
          className="min-h-[40px] flex-1 resize-none text-xs"
          rows={2}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          disabled={!canSave || commentMutation.isPending}
          onClick={() => commentMutation.mutate(commentDraft.trim() || null)}
        >
          {commentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
        </Button>
      </div>

      <div className="space-y-1">
        {itemAttachments.map((att) => (
          <div key={att.id} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3 shrink-0" />
            {att.downloadUrl ? (
              <a href={att.downloadUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                {att.filename}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate">{att.filename}</span>
            )}
          </div>
        ))}
        <input
          ref={itemFileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) itemUploadMutation.mutate(file);
            e.target.value = '';
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-1.5 text-xs text-muted-foreground"
          disabled={itemUploadMutation.isPending}
          onClick={() => itemFileRef.current?.click()}
        >
          {itemUploadMutation.isPending
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Paperclip className="h-3 w-3" />}
          Anexar arquivo
        </Button>
      </div>
    </div>
  );
}

// ── Checklist AI revise panel (rascunho da IA → diff → usuário confirma) ──────

function ChecklistRevisePanel({
  checklist,
  onApplied,
  onClose,
}: {
  checklist: ActivityDetail['checklists'][number];
  onApplied: () => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<ChecklistRevisionResult | null>(null);

  const reviseMutation = useMutation({
    mutationFn: () => aiApi.reviseChecklist(checklist.id, instruction.trim()),
    onSuccess: (res) => {
      if (res.data.aiUnavailable || !res.data.revision) {
        toast.error('IA indisponível agora — tente novamente em instantes');
        return;
      }
      setResult(res.data);
    },
    onError: () => toast.error('Erro ao consultar a IA'),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const revision = result!.revision!;
      const removeIds = (result!.diff?.removedItems ?? []).map((r) => r.id);
      return activitiesApi.applyChecklistRevision(checklist.id, { items: revision.items, removeIds });
    },
    onSuccess: () => {
      toast.success('Revisão aplicada');
      onApplied();
    },
    onError: () => toast.error('Erro ao aplicar revisão'),
  });

  const currentTextById = new Map(checklist.items.map((i) => [i.id, i.text]));
  const diff = result?.diff;

  return (
    <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50 p-2 dark:border-violet-900 dark:bg-violet-950/30">
      {!result ? (
        <>
          <Textarea
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Ex.: "adicione um passo de teste elétrico", "remova o item de orçamento", "detalhe a verificação final"...'
            className="min-h-[48px] resize-none bg-background text-xs"
            rows={2}
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={instruction.trim().length < 3 || reviseMutation.isPending}
              onClick={() => reviseMutation.mutate()}
            >
              {reviseMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              {reviseMutation.isPending ? 'Analisando...' : 'Sugerir revisão'}
            </Button>
          </div>
        </>
      ) : (
        <>
          {result.revision?.summary && (
            <p className="text-xs text-violet-700 dark:text-violet-300">{result.revision.summary}</p>
          )}
          <ul className="space-y-1">
            {result.revision?.items.map((proposed, idx) => {
              const isNew = !proposed.id;
              const before = proposed.id ? currentTextById.get(proposed.id) : undefined;
              const isChanged = Boolean(before && before !== proposed.text);
              return (
                <li key={proposed.id ?? `new-${idx}`} className="flex items-start gap-1.5 text-xs">
                  <span className={`mt-0.5 shrink-0 font-mono ${isNew ? 'text-emerald-600' : isChanged ? 'text-amber-600' : 'text-muted-foreground/50'}`}>
                    {isNew ? '+' : isChanged ? '~' : '·'}
                  </span>
                  <span className="min-w-0 flex-1">
                    {isChanged && <span className="mr-1 text-muted-foreground line-through">{before}</span>}
                    <span className={isNew ? 'text-emerald-700 dark:text-emerald-400' : ''}>{proposed.text}</span>
                  </span>
                </li>
              );
            })}
            {(diff?.removedItems ?? []).map((removedItem) => (
              <li key={removedItem.id} className="flex items-start gap-1.5 text-xs">
                <span className="mt-0.5 shrink-0 font-mono text-red-600">−</span>
                <span className="min-w-0 flex-1 text-muted-foreground line-through">{removedItem.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              +{diff?.added ?? 0} · ~{diff?.updated ?? 0} · −{diff?.removed ?? 0}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResult(null)}>
                Refazer
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aplicar revisão'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Comment item ──────────────────────────────────────────────────────────────

function CommentItem({ comment, currentUserId }: { comment: Comment; currentUserId?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const isOwn = comment.userId === currentUserId;

  const editMutation = useMutation({
    mutationFn: (body: string) => activitiesApi.editComment(comment.id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity-comments'] });
      setEditing(false);
    },
    onError: () => toast.error('Erro ao editar comentário'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => activitiesApi.deleteComment(comment.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activity-comments'] }),
    onError: () => toast.error('Erro ao excluir comentário'),
  });

  return (
    <div className="flex gap-2">
      <UserAvatar
        name={comment.user.name}
        avatarUrl={comment.user.avatarUrl}
        className="mt-0.5 h-7 w-7 shrink-0 text-[10px]"
      />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.user.name}</span>
          <span className="text-xs text-muted-foreground">{formatRelative(comment.createdAt)}</span>
          {comment.editedAt && <span className="text-xs text-muted-foreground">(editado)</span>}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => draft.trim() && editMutation.mutate(draft.trim())}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
        )}
        {isOwn && !editing && (
          <div className="flex gap-1">
            <button
              onClick={() => { setDraft(comment.body); setEditing(true); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Editar
            </button>
            <span className="text-xs text-muted-foreground">·</span>
            <button
              onClick={() => deleteMutation.mutate()}
              className="text-xs text-muted-foreground hover:text-red-500"
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
