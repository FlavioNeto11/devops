import { useState } from 'react';
import { ChatListItem as ChatItem, MessageStatus } from '../types';
import { IconCheck } from './icons';

const MEDIA_LABELS: Record<string, string> = {
  image: '📷 Foto',
  video: '🎬 Vídeo',
  audio: '🎤 Mensagem de voz',
  document: '📄 Documento',
};

function previewText(chat: ChatItem): string {
  if (!chat.lastMessage) return 'Sem mensagens';
  const { text, type, fromMe, senderName } = chat.lastMessage;
  let prefix = '';
  if (!fromMe && chat.isGroup && senderName) prefix = `${senderName}: `;
  if (type === 'text') return prefix + (text ?? '');
  return prefix + (MEDIA_LABELS[type] ?? 'Mídia');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string | null): string {
  if (!name) return '#';
  return name.trim().slice(0, 2).toUpperCase();
}

function Avatar({ chat }: { chat: ChatItem }) {
  const [err, setErr] = useState(false);
  const showImg = chat.avatarUrl && !err;
  return (
    <div className="w-[52px] h-[52px] rounded-full bg-surfaceAlt shrink-0 grid place-items-center overflow-hidden">
      {showImg ? (
        <img src={chat.avatarUrl!} alt="" className="w-full h-full object-cover" onError={() => setErr(true)} />
      ) : (
        <span className="font-bold text-white/90">{initials(chat.name)}</span>
      )}
    </div>
  );
}

export function ChatListItemRow({
  chat,
  active,
  onClick,
}: {
  chat: ChatItem;
  active?: boolean;
  onClick: () => void;
}) {
  const lm = chat.lastMessage;
  const showCheck = !!lm && lm.fromMe;
  const status: MessageStatus = lm?.status ?? 'sent';
  const checkClass = status === 'read' ? 'text-link' : status === 'error' ? 'text-danger' : 'text-muted';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-surfaceAlt' : 'hover:bg-surface'
      }`}
    >
      <Avatar chat={chat} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <div className="truncate font-semibold text-[16px] text-white">
            {chat.kind === 'group' ? '👥 ' : chat.kind === 'channel' ? '📢 ' : ''}
            {chat.name ?? chat.jid}
          </div>
          <div className={`text-xs shrink-0 ${chat.unreadCount > 0 ? 'text-primary' : 'text-muted'}`}>
            {formatTime(chat.lastMessageAt)}
          </div>
        </div>
        <div className="flex justify-between items-center gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0 text-sm text-muted">
            {showCheck && (
              <span className={`${checkClass} shrink-0`}>
                <IconCheck size={16} double={status === 'delivered' || status === 'read'} />
              </span>
            )}
            <span className="truncate">{previewText(chat)}</span>
          </div>
          {chat.unreadCount > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-bg text-xs font-bold grid place-items-center">
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
