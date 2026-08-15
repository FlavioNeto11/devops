'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { aiApi, type AiPendingAction } from '@/lib/ai-api';
import { useTutorialStore } from '@/features/tutorial/tutorial-store';

type PendingState = 'idle' | 'confirming' | 'done' | 'error';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'up' | 'down' | null;
  pendingAction?: AiPendingAction | null;
  pendingState?: PendingState;
  pendingError?: string | null;
};

const SUGGESTIONS = ['Resumo de hoje', 'O que está atrasado?', 'Como crio uma atividade?'];

const TOOL_LABELS: Record<string, string> = {
  create_activity: 'Criar atividade',
};

const PREVIEW_LABELS: Record<string, string> = {
  title: 'Título',
  unit: 'Unidade',
  area: 'Área',
  priority: 'Prioridade',
  dueAt: 'Prazo',
  description: 'Descrição',
  willNotify: 'Notificações',
};

function humanizeToolName(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, ' ');
}

/** Linhas legíveis da prévia (ignora a flag preview e valores vazios/objetos). */
function previewEntries(preview: Record<string, unknown> | null): Array<[string, string]> {
  if (!preview) return [];
  return Object.entries(preview)
    .filter(([k, v]) => k !== 'preview' && v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => {
      const label = PREVIEW_LABELS[k] ?? k;
      const value = k === 'dueAt' && typeof v === 'string' ? new Date(v).toLocaleString('pt-BR') : String(v);
      return [label, value] as [string, string];
    });
}

/**
 * Assistente IA conversacional (flutuante). Disponível em todas as telas autenticadas.
 * Conversa em linguagem natural sobre o estado real da organização (via POST /ai/chat),
 * coleta feedback 👍/👎 por resposta e renderiza o card de confirmação quando a IA
 * propõe uma ação mutante (dry-run) — o clique do usuário é o que salva.
 */
export function AiChatWidget() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  // Quando o convite de tour (OnboardingPrompt, canto inferior direito) está visível,
  // ele ficaria por cima do botão da IA. Subimos o botão para não ser encoberto;
  // sem nada atrapalhando, ele volta à posição padrão.
  const onboardingVisible = useTutorialStore((s) => s.onboardingPromptVisible);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Ao abrir, foca o campo de pergunta (UX-GYMOPS-020).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fecha o painel e devolve o foco ao botão flutuante (Esc / retorno de foco).
  function closePanel() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  if (!organizationId) return null;

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    try {
      const res = await aiApi.chat(msg, organizationId as string, history);
      const pendingAction = res.data?.meta?.pendingAction ?? null;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: res.data?.reply ?? '…',
          feedback: null,
          pendingAction,
          pendingState: pendingAction ? 'idle' : undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Não consegui responder agora. Tente novamente em instantes.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(msg: Msg, kind: 'up' | 'down') {
    if (!organizationId || msg.feedback === kind) return;
    const previous = msg.feedback ?? null;
    // otimista: marca já; erro → desfaz
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, feedback: kind } : m)));
    try {
      await aiApi.feedback({
        messageId: msg.id,
        kind: kind === 'up' ? 'thumbs_up' : 'thumbs_down',
        organizationId: organizationId as string,
      });
    } catch (err) {
      console.error('[ai] feedback falhou', err);
      toast.error('Não foi possível registrar o feedback');
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, feedback: previous } : m)));
    }
  }

  function cancelPending(msg: Msg) {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pendingAction: null, pendingState: undefined, pendingError: null } : m)));
  }

  async function confirmPending(msg: Msg) {
    if (!organizationId || !msg.pendingAction || msg.pendingState === 'confirming') return;
    const token = msg.pendingAction.token;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pendingState: 'confirming', pendingError: null } : m)));
    try {
      const res = await aiApi.confirm({ token, organizationId: organizationId as string });
      setMessages((prev) => [
        ...prev.map((m) => (m.id === msg.id ? { ...m, pendingState: 'done' as const } : m)),
        { id: crypto.randomUUID(), role: 'assistant' as const, content: res.data?.message ?? 'Ação executada.', feedback: null },
      ]);
      toast.success('Ação executada com sucesso!');
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao executar a ação.';
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pendingState: 'error' as const, pendingError: message } : m)));
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Assistente IA"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tutorial="ai-assistant-button"
        className={`fixed right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 hover:scale-105 ${
          onboardingVisible && !open ? 'bottom-48' : 'bottom-5'
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Assistente IA"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } }}
          className="fixed bottom-24 right-5 z-[60] flex h-[min(72vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold leading-tight">Assistente IA</p>
              <p className="text-xs text-muted-foreground">O que está acontecendo no GymOps</p>
            </div>
          </div>

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-label="Conversa com o assistente"
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Olá! Sou o assistente do GymOps. Posso explicar o que está acontecendo, apontar atrasos e
                  prioridades, e te guiar a operar o sistema. Como posso ajudar?
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-full border px-3 py-1 text-xs text-foreground transition hover:bg-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[88%]">
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.content}
                  </div>

                  {m.role === 'assistant' && m.pendingAction && m.pendingState !== 'done' && (
                    <div className="mt-2 rounded-xl border border-amber-400/70 bg-amber-50 p-3 text-xs dark:border-amber-500/50 dark:bg-amber-950/30">
                      <p className="font-semibold text-amber-700 dark:text-amber-400">
                        A IA quer executar: {humanizeToolName(m.pendingAction.toolName)}
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-foreground">
                        {previewEntries(m.pendingAction.preview).map(([label, value]) => (
                          <li key={label}>
                            <span className="text-muted-foreground">{label}:</span> {value}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-muted-foreground">Nada foi salvo ainda — confirme para executar.</p>
                      {m.pendingState === 'error' && (
                        <p className="mt-1.5 text-red-600">{m.pendingError ?? 'Falha ao executar a ação.'}</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => cancelPending(m)}
                          disabled={m.pendingState === 'confirming'}
                          className="rounded-lg border px-3 py-1 text-xs transition hover:bg-muted disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => confirmPending(m)}
                          disabled={m.pendingState === 'confirming'}
                          className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                        >
                          {m.pendingState === 'confirming' && <Loader2 className="h-3 w-3 animate-spin" />}
                          Confirmar
                        </button>
                      </div>
                    </div>
                  )}

                  {m.role === 'assistant' && (
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        onClick={() => sendFeedback(m, 'up')}
                        aria-label="Resposta útil"
                        className={`rounded p-1 text-xs transition hover:text-foreground ${
                          m.feedback === 'up' ? 'text-emerald-600' : 'text-muted-foreground'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => sendFeedback(m, 'down')}
                        aria-label="Resposta ruim"
                        className={`rounded p-1 text-xs transition hover:text-foreground ${
                          m.feedback === 'down' ? 'text-red-600' : 'text-muted-foreground'
                        }`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo…"
              aria-label="Pergunte ao assistente"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition disabled:opacity-50"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
