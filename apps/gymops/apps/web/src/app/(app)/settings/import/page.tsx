'use client';

import Link from 'next/link';
import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, FileJson, Wifi, ChevronRight, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { TutorialTrigger } from '@/features/tutorial';
import { importsApi, integrationsApi } from '@/lib/imports-api';
import type { BoardPreview, BoardMapping, ListMapping, ImportMapping } from '@/lib/imports-api';
import { areasApi, unitsApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type Step = 'source' | 'boards' | 'analyzing' | 'mapping' | 'committing' | 'done';

export default function ImportPage() {
  const qc = useQueryClient();
  const organizationId = useAuthStore((s) => s.organizationId);

  const [step, setStep] = useState<Step>('source');
  const [mode, setMode] = useState<'json' | 'api'>('json');
  const [jobId, setJobId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Poll job status while analyzing or committing
  const { data: jobData } = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => importsApi.get(jobId!),
    enabled: !!jobId && (step === 'analyzing' || step === 'committing'),
    refetchInterval: 2000,
  });

  const job = jobData?.data;

  // Advance step when job status changes
  if (step === 'analyzing' && job) {
    if (job.status === 'awaiting_review') {
      // Build default mapping from suggestions
      const preview = job.summary;
      if (preview?.boards) {
        const defaultMapping: ImportMapping = {
          boards: preview.boards.map((b: BoardPreview) => ({
            trelloBoardId: b.trelloBoardId,
            targetUnitId: null,
            targetUnitName: b.suggestedUnitName,
            lists: b.lists.map((l) => ({
              trelloListId: l.trelloListId,
              type: l.suggestedType,
              value: l.suggestedValue,
            })),
          })),
        };
        if (!mapping) setMapping(defaultMapping);
        setStep('mapping');
      }
    } else if (job.status === 'failed') {
      toast.error('Falha na análise do board');
      setStep('source');
    }
  }

  if (step === 'committing' && job) {
    if (job.status === 'committed') setStep('done');
    else if (job.status === 'failed') {
      toast.error('Falha na importação');
      setStep('mapping');
    }
  }

  // Trello boards for API mode
  const {
    data: trelloBoardsData,
    isError: boardsError,
    refetch: refetchBoards,
  } = useQuery({
    queryKey: ['trello-boards', organizationId],
    queryFn: () => integrationsApi.getTrelloBoards(organizationId!),
    enabled: mode === 'api' && step === 'boards',
  });
  const trelloBoards = trelloBoardsData?.data ?? [];

  // Integrations to check if Trello is connected
  const { data: integrationsData } = useQuery({
    queryKey: ['integrations', organizationId],
    queryFn: () => integrationsApi.getAll(organizationId!),
    enabled: !!organizationId,
  });
  const trelloAccount = integrationsData?.data?.find((i) => i.provider === 'trello');

  // Load real org areas and units for mapping step
  const { data: areasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId!),
    enabled: !!organizationId,
  });
  const { data: unitsData } = useQuery({
    queryKey: ['units', organizationId],
    queryFn: () => unitsApi.list(organizationId!),
    enabled: !!organizationId,
  });
  const orgAreas = (areasData?.data ?? []).filter((a) => !a.deletedAt);
  const orgUnits = unitsData?.data ?? [];

  // JSON upload → create job → analyze
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const boardData = JSON.parse(text) as unknown;
      return importsApi.createFromJson(organizationId!, boardData);
    },
    onSuccess: (res) => {
      setJobId(res.data.id);
      setStep('analyzing');
    },
    onError: () => toast.error('Arquivo inválido ou muito grande'),
  });

  // API mode → select boards → create job → analyze
  const apiImportMutation = useMutation({
    mutationFn: () => importsApi.createFromApi({
      organizationId: organizationId!,
      integrationAccountId: trelloAccount!.id,
      boardIds: selectedBoardIds,
    }),
    onSuccess: (res) => {
      setJobId(res.data.id);
      setStep('analyzing');
    },
    onError: () => toast.error('Erro ao iniciar importação'),
  });

  // Save mapping + commit
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!jobId || !mapping) throw new Error('No job or mapping');
      await importsApi.patchMapping(jobId, mapping);
      return importsApi.commit(jobId);
    },
    onSuccess: () => {
      setStep('committing');
      void qc.invalidateQueries({ queryKey: ['import-job', jobId] });
    },
    onError: () => toast.error('Erro ao iniciar commit'),
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }, [uploadMutation]);

  const updateListMapping = (boardId: string, listId: string, update: Partial<ListMapping>) => {
    setMapping((prev) => {
      if (!prev) return prev;
      return {
        boards: prev.boards.map((b) => b.trelloBoardId === boardId
          ? { ...b, lists: b.lists.map((l) => l.trelloListId === listId ? { ...l, ...update } : l) }
          : b,
        ),
      };
    });
  };

  const updateBoardMapping = (boardId: string, update: Partial<BoardMapping>) => {
    setMapping((prev) => {
      if (!prev) return prev;
      return { boards: prev.boards.map((b) => b.trelloBoardId === boardId ? { ...b, ...update } : b) };
    });
  };

  // ── Render steps ─────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-6 max-w-3xl space-y-6" data-tutorial="trello-import-wizard">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Importar do Trello</h1>
          <p className="text-sm text-muted-foreground">Migre seus boards Trello para o GymOps</p>
        </div>
        <TutorialTrigger tutorialId="trello-import" />
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {(['source', 'boards', 'analyzing', 'mapping', 'committing', 'done'] as Step[]).map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <span className={cn(step === s && 'text-foreground font-medium')}>
              {s === 'source' ? '1. Fonte' : s === 'boards' ? '2. Boards' : s === 'analyzing' ? '3. Análise' : s === 'mapping' ? '4. Mapeamento' : s === 'committing' ? '5. Importando' : '6. Concluído'}
            </span>
          </span>
        ))}
      </div>

      {/* ── Step: source ──────────────────────────────────────────────────────── */}
      {step === 'source' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Escolha como importar:</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('json')}
              className={cn(
                'rounded-lg border-2 p-4 text-left transition-colors',
                mode === 'json' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <FileJson className="mb-2 h-6 w-6 text-primary" />
              <p className="text-sm font-medium">Arquivo JSON</p>
              <p className="text-xs text-muted-foreground">Exporte o board do Trello e faça upload aqui</p>
            </button>

            <button
              onClick={() => setMode('api')}
              className={cn(
                'rounded-lg border-2 p-4 text-left transition-colors',
                mode === 'api' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <Wifi className="mb-2 h-6 w-6 text-primary" />
              <p className="text-sm font-medium">API do Trello</p>
              <p className="text-xs text-muted-foreground">Conecte sua conta e selecione boards diretamente</p>
            </button>
          </div>

          {mode === 'json' && (
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Clique para selecionar o arquivo JSON do Trello</p>
              <p className="text-xs text-muted-foreground">Exporte via Menu do Board → Imprimir e Exportar → Exportar como JSON</p>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
              {uploadMutation.isPending && (
                <p className="text-xs text-primary">Processando arquivo...</p>
              )}
            </div>
          )}

          {mode === 'api' && (
            <div className="rounded-lg border p-4 space-y-3">
              {trelloAccount ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Trello conectado. Clique em "Próximo" para selecionar boards.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Trello não conectado. Vá em{' '}
                  <Link href="/settings/integrations" className="underline">Integrações</Link>{' '}
                  para conectar primeiro.
                </div>
              )}
              {trelloAccount && (
                <Button size="sm" onClick={() => setStep('boards')}>
                  Próximo: Selecionar boards
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step: boards (API mode only) ─────────────────────────────────────── */}
      {step === 'boards' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Selecione os boards a importar:</p>
          {boardsError && trelloBoardsData && (
            <QueryErrorState
              className="py-4"
              title="Não foi possível atualizar"
              description="Exibindo os últimos boards carregados."
              onRetry={() => refetchBoards()}
            />
          )}
          {boardsError && !trelloBoardsData ? (
            <QueryErrorState
              description="Não foi possível listar os boards do Trello."
              onRetry={() => refetchBoards()}
            />
          ) : trelloBoards.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando boards do Trello...
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {trelloBoards.map((board) => (
                <label key={board.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selectedBoardIds.includes(board.id)}
                    onChange={(e) => setSelectedBoardIds((prev) =>
                      e.target.checked ? [...prev, board.id] : prev.filter((id) => id !== board.id),
                    )}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm">{board.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep('source')}>Voltar</Button>
            <Button
              size="sm"
              disabled={selectedBoardIds.length === 0 || apiImportMutation.isPending}
              onClick={() => apiImportMutation.mutate()}
            >
              {apiImportMutation.isPending ? 'Iniciando análise...' : `Analisar ${selectedBoardIds.length} board(s)`}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: analyzing ──────────────────────────────────────────────────── */}
      {step === 'analyzing' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Analisando boards...</p>
          <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
        </div>
      )}

      {/* ── Step: mapping ─────────────────────────────────────────────────────── */}
      {step === 'mapping' && mapping && job?.summary?.boards && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Revise o mapeamento das listas do Trello para as áreas do GymOps. Listas marcadas como "Ignorar" não serão importadas.
          </p>

          {mapping.boards.map((boardMap) => {
            const preview = job.summary!.boards!.find((b) => b.trelloBoardId === boardMap.trelloBoardId);
            const totalCards = preview?.stats.cards ?? 0;
            const ignoredCards = boardMap.lists.filter((l) => l.type === 'ignore').reduce((acc, l) => {
              const lp = preview?.lists.find((lv) => lv.trelloListId === l.trelloListId);
              return acc + (lp?.cardCount ?? 0);
            }, 0);

            return (
              <div key={boardMap.trelloBoardId} className="rounded-lg border">
                {/* Board header */}
                <div className="flex items-start justify-between gap-4 border-b bg-muted/30 px-4 py-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{preview?.trelloBoardName}</p>
                    <p className="text-xs text-muted-foreground">{totalCards} cards · {ignoredCards} serão ignorados</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Unidade de destino</p>
                    {orgUnits.length > 0 ? (
                      <select
                        value={boardMap.targetUnitId ?? ''}
                        onChange={(e) => {
                          const unitId = e.target.value;
                          const unit = orgUnits.find((u) => u.id === unitId);
                          updateBoardMapping(boardMap.trelloBoardId, { targetUnitId: unitId || null, targetUnitName: unit?.name ?? boardMap.targetUnitName });
                        }}
                        className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— Criar nova unidade —</option>
                        {orgUnits.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ''}</option>
                        ))}
                      </select>
                    ) : null}
                    {(!boardMap.targetUnitId) && (
                      <input
                        value={boardMap.targetUnitName}
                        onChange={(e) => updateBoardMapping(boardMap.trelloBoardId, { targetUnitName: e.target.value })}
                        placeholder="Nome da nova unidade"
                        className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </div>
                </div>

                {/* List mappings */}
                <div className="divide-y">
                  {boardMap.lists.map((listMap) => {
                    const lp = preview?.lists.find((l) => l.trelloListId === listMap.trelloListId);
                    return (
                      <div key={listMap.trelloListId} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{lp?.trelloListName ?? listMap.trelloListId}</p>
                          <p className="text-xs text-muted-foreground">{lp?.cardCount ?? 0} cards</p>
                        </div>
                        <select
                          value={listMap.type === 'ignore' ? 'ignore' : (listMap.value ?? '')}
                          onChange={(e) => {
                            if (e.target.value === 'ignore') {
                              updateListMapping(boardMap.trelloBoardId, listMap.trelloListId, { type: 'ignore', value: null });
                            } else {
                              updateListMapping(boardMap.trelloBoardId, listMap.trelloListId, { type: 'area', value: e.target.value });
                            }
                          }}
                          className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="ignore">— Ignorar —</option>
                          {orgAreas.map((a) => (
                            <option key={a.key} value={a.key}>{a.name}</option>
                          ))}
                        </select>
                        {lp?.confidence === 'low' && listMap.type !== 'ignore' && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Match de baixa confiança — revise" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep('source')}>Cancelar</Button>
            <Button size="sm" onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
              {commitMutation.isPending ? 'Salvando...' : 'Confirmar e importar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: committing ─────────────────────────────────────────────────── */}
      {step === 'committing' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Importando atividades...</p>
          <p className="text-xs text-muted-foreground">Aguarde — a importação é atômica e pode levar até 2 minutos</p>
        </div>
      )}

      {/* ── Step: done ───────────────────────────────────────────────────────── */}
      {step === 'done' && job?.summary && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/50 p-4">
            <CheckCircle className="h-6 w-6 shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">Importação concluída!</p>
              <p className="text-xs text-green-700">
                {job.summary.created ?? 0} atividades criadas ·{' '}
                {job.summary.skipped ?? 0} ignoradas ·{' '}
                {job.summary.failed ?? 0} falhas
              </p>
            </div>
          </div>

          {(job.summary.errors?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <XCircle className="h-4 w-4" />
                Erros encontrados ({job.summary.errors!.length})
              </div>
              <ul className="space-y-0.5 text-xs text-amber-700 max-h-40 overflow-y-auto">
                {job.summary.errors!.slice(0, 20).map((err, i) => (
                  <li key={i} className="list-disc ml-4">{err}</li>
                ))}
              </ul>
            </div>
          )}

          <Button size="sm" onClick={() => { setStep('source'); setJobId(null); setMapping(null); }}>
            Importar outro board
          </Button>
        </div>
      )}
    </div>
  );
}
