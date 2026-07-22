import { useState } from 'react';
import { Message } from '../types';
import { mediaUrl } from '../api/client';
import { formatTime, senderColor } from '../lib/messageUtils';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Aparelhos com ponteiro fino (mouse) recebem o botão de ações discreto, revelado
// no hover/foco; em touch (sem hover) o botão fica sempre visível para ser tocável.
const HOVER_CAPABLE =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover)').matches
    : false;

function quotedTypeLabel(type: string): string {
  const l: Record<string, string> = { image: '📷 Imagem', video: '🎬 Vídeo', audio: '🎤 Áudio', document: '📄 Documento' };
  return l[type] ?? 'Mensagem';
}

function StatusTick({ status }: { status: Message['status'] }) {
  if (status === 'pending') return <span className="text-muted text-[11px]"> 🕓</span>;
  if (status === 'error') return <span className="text-danger text-[11px]"> ⚠️</span>;
  const isRead = status === 'read';
  const isDouble = status === 'delivered' || isRead;
  return <span className={`text-[11px] ${isRead ? 'text-link' : 'text-white/50'}`}>{isDouble ? ' ✓✓' : ' ✓'}</span>;
}

function ReactionBadge({ reactions }: { reactions: NonNullable<Message['reactions']> }) {
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  return (
    <div className="-mt-1.5 self-start flex items-center gap-1 bg-surfaceAlt border border-bg rounded-xl px-1.5 py-0.5">
      {[...counts.entries()].map(([emoji, n]) => (
        <span key={emoji} className="text-[13px]">
          {emoji}
          {n > 1 && <span className="text-[11px] text-muted"> {n}</span>}
        </span>
      ))}
    </div>
  );
}

// Ações da mensagem alcançáveis por teclado e touch (não só por hover): um botão
// de ações sempre focável abre a régua de ações; cada ação tem nome acessível.
// O hover continua como atalho no desktop. (WCAG 2.1.1)
function BubbleActions({
  open,
  hovered,
  onToggle,
  onReply,
  onCopy,
  onReactPress,
  onForward,
}: {
  open: boolean;
  hovered: boolean;
  onToggle: () => void;
  onReply: () => void;
  onCopy: () => void;
  onReactPress?: () => void;
  onForward?: () => void;
}) {
  const btn =
    'w-7 h-7 rounded-full bg-surfaceAlt grid place-items-center text-[13px] hover:bg-line outline-none focus-visible:ring-2 focus-visible:ring-primary';
  const showRow = open || hovered;
  // Em touch o gatilho fica visível; no desktop some até hover/foco para não poluir.
  const triggerVisibility = HOVER_CAPABLE
    ? `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${open ? 'opacity-100' : ''}`
    : 'opacity-100';
  return (
    <div className="flex items-center gap-1 self-end pb-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Ações da mensagem"
        aria-expanded={showRow}
        className={`w-7 h-7 rounded-full bg-surfaceAlt grid place-items-center text-muted text-[16px] leading-none hover:bg-line hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary transition-opacity ${triggerVisibility}`}
      >
        ⋯
      </button>
      {showRow && (
        <div role="group" aria-label="Ações da mensagem" className="flex items-center gap-1">
          {onReactPress && (
            <button type="button" onClick={onReactPress} className={btn} aria-label="Reagir" title="Reagir">
              😀
            </button>
          )}
          <button type="button" onClick={onReply} className={btn} aria-label="Responder" title="Responder">
            ↩
          </button>
          {onForward && (
            <button type="button" onClick={onForward} className={btn} aria-label="Encaminhar" title="Encaminhar">
              ↪
            </button>
          )}
          <button type="button" onClick={onCopy} className={btn} aria-label="Copiar" title="Copiar">
            📋
          </button>
        </div>
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  isGroup,
  onOpenMedia,
  onReply,
  onReact,
  onForward,
  onRetry,
}: {
  message: Message;
  isGroup?: boolean;
  onOpenMedia?: (m: Message) => void;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  onForward?: (m: Message) => void;
  onRetry?: (m: Message) => void;
}) {
  const mine = message.fromMe;
  const showSender = isGroup && !mine;
  const mediaId = message.media?.id;
  const uri = mediaId ? mediaUrl(mediaId) : undefined;
  const expired = message.media?.expired;
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const reactions = message.reactions ?? [];

  const pickReaction = (emoji: string) => {
    setShowPicker(false);
    setMenuOpen(false);
    const mineReaction = reactions.find((r) => r.fromMe)?.emoji;
    onReact?.(message, mineReaction === emoji ? '' : emoji);
  };
  const handleCopy = () => {
    if (message.text && navigator?.clipboard) navigator.clipboard.writeText(message.text).catch(() => undefined);
  };
  const closeMenus = () => {
    setMenuOpen(false);
    setShowPicker(false);
  };

  const actions = onReply && (
    <BubbleActions
      open={menuOpen}
      hovered={hovered}
      onToggle={() => setMenuOpen((v) => !v)}
      onReply={() => {
        onReply(message);
        closeMenus();
      }}
      onCopy={() => {
        handleCopy();
        setMenuOpen(false);
      }}
      onReactPress={onReact ? () => setShowPicker((v) => !v) : undefined}
      onForward={onForward ? () => { onForward(message); closeMenus(); } : undefined}
    />
  );

  return (
    <div
      className={`group px-3 my-[3px] flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        closeMenus();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (menuOpen || showPicker)) {
          e.stopPropagation();
          closeMenus();
        }
      }}
    >
      {mine && actions}

      {showSender && (
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-white text-xs font-bold shrink-0 mb-0.5"
          style={{ background: senderColor(message.senderJid) }}
        >
          {(message.senderName ?? message.senderJid.split('@')[0]).charAt(0).toUpperCase()}
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showPicker && (
          <div role="group" aria-label="Escolher reação" className="mb-1 self-end flex items-center gap-1.5 bg-surfaceAlt rounded-2xl px-2 py-1.5 shadow-lg">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => pickReaction(e)} aria-label={`Reagir com ${e}`} className="text-[22px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full">
                {e}
              </button>
            ))}
            <button type="button" onClick={() => setShowPicker(false)} aria-label="Fechar reações" className="text-muted text-lg ml-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full">
              ✕
            </button>
          </div>
        )}

        <div
          className={`rounded-lg px-3 py-1.5 ${mine ? 'bg-bubbleOut rounded-tr-sm' : 'bg-bubbleIn rounded-tl-sm'}`}
        >
          {showSender && (
            <div className="text-[13px] font-bold mb-0.5 truncate" style={{ color: senderColor(message.senderJid) }}>
              {message.senderName ?? message.senderJid.split('@')[0]}
            </div>
          )}

          {message.quoted && (
            <div className="flex bg-black/20 rounded overflow-hidden mb-1 max-w-[280px]">
              <div className="w-[3px] bg-primary" />
              <div className="flex-1 px-2 py-1 min-w-0">
                {message.quoted.senderName && (
                  <div className="text-primary text-xs font-bold truncate">{message.quoted.senderName}</div>
                )}
                <div className="text-muted text-xs truncate">
                  {message.quoted.text ?? quotedTypeLabel(message.quoted.type)}
                </div>
              </div>
            </div>
          )}

          {uri && !expired && message.type === 'image' && (
            <img
              src={uri}
              onClick={() => onOpenMedia?.(message)}
              className="w-60 max-w-full rounded mb-1 cursor-pointer object-cover"
              alt=""
            />
          )}
          {uri && !expired && message.type === 'video' && (
            <video src={uri} controls className="w-full max-w-[320px] rounded mb-1 bg-black block" />
          )}
          {uri && !expired && message.type === 'audio' && (
            <audio src={uri} controls className="w-[260px] h-10 mb-1 block" />
          )}
          {uri && !expired && message.type === 'document' && (
            <a href={uri} target="_blank" rel="noreferrer" className="block py-1.5 text-white underline">
              📄 {message.media?.fileName ?? 'Documento'}
            </a>
          )}
          {message.type !== 'text' && (expired || !mediaId) && (
            <div className="text-white text-[15px] mb-0.5">
              {message.type === 'image' ? '📷 Imagem' : message.type === 'video' ? '🎬 Vídeo' : message.type === 'audio' ? '🎤 Áudio' : '📄 Documento'}
              {expired ? ' (indisponível)' : ''}
            </div>
          )}

          {!!message.text && <div className="text-white text-[15px] whitespace-pre-wrap break-words">{message.text}</div>}

          <div className="flex justify-end items-center mt-0.5">
            <span className="text-white/50 text-[11px]">{formatTime(message.timestamp)}</span>
            {mine && <StatusTick status={message.status} />}
          </div>
        </div>

        {mine && message.status === 'error' && onRetry && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
            <span className="text-danger">Falha ao enviar.</span>
            <button
              onClick={() => onRetry(message)}
              className="text-primary font-semibold underline underline-offset-2"
              aria-label="Tentar enviar novamente"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {reactions.length > 0 && <ReactionBadge reactions={reactions} />}
      </div>

      {!mine && actions}
    </div>
  );
}
