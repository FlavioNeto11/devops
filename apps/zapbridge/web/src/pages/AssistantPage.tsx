import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../api/ai';
import { connectSocket } from '../realtime/socket';
import { isDevPreview } from '../dev/devPreview';
import { useAiConsent } from '../hooks/useAiConsent';
import { IconBack } from '../components/icons';
import { Markdown } from '../components/Markdown';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  progress?: string;
  streaming?: boolean;
}

const STARTERS = [
  'Com quem falei hoje?',
  'Quem está esperando resposta?',
  'Resuma minhas conversas não lidas',
  'Do que o grupo falou hoje?',
];

export function AssistantPage() {
  const nav = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const { aiOn, loading: consentLoading, accept } = useAiConsent();
  const scrollRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef<string>('');
  const idxRef = useRef<number>(-1);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (isDevPreview()) return;
    const socket = connectSocket();
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => prev.map((m, i) => (i === idxRef.current ? fn(m) : m)));
    const onProgress = ({ requestId, label }: { requestId: string; label: string }) => {
      if (requestId === reqIdRef.current) patch((m) => ({ ...m, progress: label }));
    };
    const onDelta = ({ requestId, text }: { requestId: string; text: string }) => {
      if (requestId === reqIdRef.current) patch((m) => ({ ...m, text: m.text + text, progress: undefined }));
    };
    const onDone = ({ requestId }: { requestId: string }) => {
      if (requestId === reqIdRef.current) patch((m) => ({ ...m, streaming: false, progress: undefined }));
    };
    socket.on('ai.assistant.progress', onProgress);
    socket.on('ai.assistant.delta', onDelta);
    socket.on('ai.assistant.done', onDone);
    return () => {
      socket.off('ai.assistant.progress', onProgress);
      socket.off('ai.assistant.delta', onDelta);
      socket.off('ai.assistant.done', onDone);
    };
  }, []);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setBusy(true);
    const requestId = (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now());
    reqIdRef.current = requestId;
    setMessages((prev) => {
      const next = [...prev, { role: 'user' as const, text: t }, { role: 'assistant' as const, text: '', streaming: true }];
      idxRef.current = next.length - 1;
      return next;
    });
    try {
      const res = await aiApi.assistant(t, requestId);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === idxRef.current ? { ...m, text: m.text || res.text, streaming: false, progress: undefined } : m,
        ),
      );
      if (res.unlocked) setUnlocked(true);
    } catch {
      setMessages((prev) =>
        prev.map((m, i) => (i === idxRef.current ? { ...m, text: m.text || 'Não consegui responder agora.', streaming: false } : m)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 px-3 h-14 bg-header border-b border-line shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => nav('/')} className="text-white" title="Voltar">
          <IconBack />
        </button>
        <div className="font-semibold text-white flex items-center gap-2">
          ✨ Assistente {unlocked && <span title="Conversas trancadas acessíveis">🔓</span>}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {!consentLoading && !aiOn ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
            <div className="text-3xl">✨</div>
            <div className="text-white font-semibold">Ativar o assistente de IA</div>
            <div className="text-muted max-w-sm text-sm">
              A IA lê suas conversas para responder (enviado à Anthropic/OpenAI). Você pode desativar quando quiser.
            </div>
            <button onClick={accept} className="bg-primary text-bg font-bold rounded-xl px-5 py-2.5">
              Ativar assistente
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-3xl">✨</div>
            <div className="text-muted max-w-sm">Pergunte sobre suas conversas — quem esperou resposta, resumos, o que rolou hoje.</div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="bg-surface rounded-2xl px-3 py-2 text-sm text-white hover:bg-surfaceAlt">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`my-2 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${m.role === 'user' ? 'bg-primary text-bg' : 'bg-surface text-white'}`}>
                {m.role === 'assistant' ? (
                  m.text ? (
                    <Markdown text={m.text} />
                  ) : (
                    <span className="text-muted text-sm">{m.progress ?? 'Pensando…'}</span>
                  )
                ) : (
                  <span className="whitespace-pre-wrap">{m.text}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2 p-2 bg-header border-t border-line shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
        <textarea
          className="flex-1 resize-none bg-surface rounded-2xl px-4 py-2.5 min-h-[42px] max-h-[120px] text-[15px] outline-none"
          placeholder="Pergunte ao seu WhatsApp…"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="w-11 h-11 rounded-full bg-primary text-bg grid place-items-center shrink-0 text-lg disabled:opacity-50">
          ➤
        </button>
      </div>
    </div>
  );
}
