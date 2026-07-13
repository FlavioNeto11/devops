import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatsStore } from '../store/chats.store';
import { useChatMessages } from '../hooks/useChatMessages';
import { useAiConsent } from '../hooks/useAiConsent';
import { aiApi } from '../api/ai';
import { buildList, isSep } from '../lib/messageUtils';
import { Message } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { MediaViewer } from './MediaViewer';
import { Spinner } from './Spinner';
import { IconBack } from './icons';

function presenceLabel(p: { typing?: boolean; recording?: boolean; online?: boolean; lastSeen?: string | null }, isGroup?: boolean): string | null {
  if (p.typing) return 'digitando…';
  if (p.recording) return 'gravando áudio…';
  if (isGroup) return null;
  if (p.online) return 'online';
  if (p.lastSeen) return 'visto ' + new Date(p.lastSeen).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return null;
}

export function ChatPanel({ chatId }: { chatId?: string }) {
  const nav = useNavigate();
  const chat = useChatsStore((s) => s.chats.find((c) => c.id === chatId));
  const isGroup = chat?.isGroup || chat?.jid?.endsWith('@g.us');
  const {
    messages,
    loading,
    loadingMore,
    exhausted,
    presence,
    loadMore,
    sendText,
    sendMedia,
    retrySend,
    canRetry,
    sendFailureAt,
    react,
    notifyTyping,
    suggestions,
    setSuggestions,
  } = useChatMessages(chatId ?? '');
  const { aiOn } = useAiConsent();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Anuncia falha de envio para leitores de tela. sendFailureAt é um contador
  // monotônico; limpa e repõe o texto para forçar mutação real do DOM (senão
  // falhas seguintes com texto idêntico não são re-anunciadas).
  useEffect(() => {
    if (!sendFailureAt) return;
    setLiveAnnouncement('');
    const announce = setTimeout(() => setLiveAnnouncement('Falha ao enviar mensagem'), 0);
    const clear = setTimeout(() => setLiveAnnouncement(''), 4000);
    return () => {
      clearTimeout(announce);
      clearTimeout(clear);
    };
  }, [sendFailureAt]);

  const runSummary = async () => {
    if (!chatId) return;
    setSummaryBusy(true);
    try {
      const r = await aiApi.summary(chatId);
      setSummary(r.bullets);
    } catch {
      setSummary(['Não foi possível resumir agora.']);
    } finally {
      setSummaryBusy(false);
    }
  };

  // Rola pro fim ao montar e quando chega mensagem nova (se já estava no fim).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, chatId]);

  useEffect(() => {
    setReplyTo(null);
    setViewer(null);
    setSummary(null);
  }, [chatId]);

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg text-center px-8">
        <div className="text-2xl font-bold text-white/80">ZapBridge Web</div>
        <div className="text-muted mt-2 max-w-sm">Selecione uma conversa para começar.</div>
      </div>
    );
  }

  const items = buildList(messages);
  const subtitle = presenceLabel(presence, isGroup);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div
      className="flex-1 flex flex-col h-full min-h-0 bg-bg relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
          const t = f.type.startsWith('image/')
            ? 'image'
            : f.type.startsWith('video/')
              ? 'video'
              : f.type.startsWith('audio/')
                ? 'audio'
                : 'document';
          sendMedia(f, t, f.name);
        }
      }}
    >
      {/* Região viva para anúncios acessíveis (ex.: falha de envio) */}
      <div aria-live="polite" role="status" className="sr-only">
        {liveAnnouncement}
      </div>

      {dragging && (
        <div className="absolute inset-0 z-30 bg-black/60 border-2 border-dashed border-primary grid place-items-center pointer-events-none">
          <span className="text-white font-semibold">Solte para enviar</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-3 h-14 bg-header border-b border-line shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => nav('/')} className="text-white md:hidden" title="Voltar" aria-label="Voltar">
          <IconBack />
        </button>
        <div className="w-9 h-9 rounded-full bg-surfaceAlt grid place-items-center overflow-hidden shrink-0">
          {chat?.avatarUrl ? (
            <img src={chat.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white/90 text-sm font-bold">{(chat?.name ?? '#').slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white truncate">
            {isGroup ? '👥 ' : ''}
            {chat?.name ?? 'Conversa'}
          </div>
          {subtitle && <div className="text-xs text-primary truncate">{subtitle}</div>}
        </div>
        {aiOn && (
          <button onClick={runSummary} title="Resumir conversa" aria-label="Resumir conversa" className="text-lg shrink-0">
            ✨
          </button>
        )}
      </div>

      {/* Card de resumo (IA) */}
      {(summary || summaryBusy) && (
        <div className="mx-3 mt-2 rounded-lg bg-surface border border-line p-3 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-primary text-sm font-semibold">✨ Resumo</span>
            <button onClick={() => setSummary(null)} className="text-muted" aria-label="Fechar resumo">×</button>
          </div>
          {summaryBusy ? (
            <div className="text-muted text-sm">Resumindo…</div>
          ) : (
            <ul className="list-disc ml-5 text-sm text-white space-y-0.5">
              {summary!.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Mensagens (ancoradas no rodapé como o WhatsApp) */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col justify-end py-2">
        {!exhausted && messages.length > 0 && (
          <div className="text-center py-2">
            <button onClick={loadMore} disabled={loadingMore} className="text-sm text-muted bg-surface rounded-full px-4 py-1.5">
              {loadingMore ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}
        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted py-16">Nenhuma mensagem ainda</div>
        ) : (
          items.map((it) =>
            isSep(it) ? (
              <div key={it.id} className="flex justify-center my-2">
                <span className="text-xs text-muted bg-surface rounded-full px-3 py-1">{it.label}</span>
              </div>
            ) : (
              <MessageBubble
                key={it.id}
                message={it}
                isGroup={isGroup}
                onReply={setReplyTo}
                onReact={(m, emoji) => react(m.id, emoji)}
                onOpenMedia={setViewer}
                onRetry={canRetry(it) ? retrySend : undefined}
              />
            ),
          )
        )}
        </div>
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-surfaceAlt border-t border-line shrink-0">
          <div className="w-[3px] self-stretch bg-primary rounded" />
          <div className="flex-1 min-w-0">
            <div className="text-primary text-xs font-bold">Respondendo</div>
            <div className="text-muted text-sm truncate">{replyTo.text ?? 'mídia'}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted text-lg px-1" aria-label="Cancelar resposta">×</button>
        </div>
      )}

      <MessageInput
        onSend={(text) => {
          sendText(text, replyTo?.id);
          setReplyTo(null);
        }}
        onAttach={(file, type) => sendMedia(file, type, (file as File).name ?? 'arquivo')}
        onSendAudio={(blob, name) => sendMedia(blob, 'audio', name)}
        onTyping={notifyTyping}
        suggestions={suggestions}
        onClearSuggestions={() => setSuggestions([])}
        aiEnabled={aiOn}
        onRewrite={(text, mode) => aiApi.rewrite(text, mode)}
      />

      {viewer && <MediaViewer message={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
