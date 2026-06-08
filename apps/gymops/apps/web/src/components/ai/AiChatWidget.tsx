'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { aiApi } from '@/lib/ai-api';
import { useTutorialStore } from '@/features/tutorial/tutorial-store';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = ['Resumo de hoje', 'O que está atrasado?', 'Como crio uma atividade?'];

/**
 * Assistente IA conversacional (flutuante). Disponível em todas as telas autenticadas.
 * Conversa em linguagem natural sobre o estado real da organização (via POST /ai/chat).
 */
export function AiChatWidget() {
  const organizationId = useAuthStore((s) => s.organizationId);
  // Quando o convite de tour (OnboardingPrompt, canto inferior direito) está visível,
  // ele ficaria por cima do botão da IA. Subimos o botão para não ser encoberto;
  // sem nada atrapalhando, ele volta à posição padrão.
  const onboardingVisible = useTutorialStore((s) => s.onboardingPromptVisible);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  if (!organizationId) return null;

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    try {
      const res = await aiApi.chat(msg, organizationId as string, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data?.reply ?? '…' }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Não consegui responder agora. Tente novamente em instantes.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Assistente IA"
        data-tutorial="ai-assistant-button"
        className={`fixed right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 hover:scale-105 ${
          onboardingVisible && !open ? 'bottom-48' : 'bottom-5'
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[60] flex h-[min(72vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold leading-tight">Assistente IA</p>
              <p className="text-xs text-muted-foreground">O que está acontecendo no GymOps</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
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
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  {m.content}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo…"
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
