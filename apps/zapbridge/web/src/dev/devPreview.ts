// DEV/verificação de layout — gated por ?devpreview na URL. Semeia usuário + conversas fake
// (sem auth/backend) para renderizar as telas logadas no navegador. Remover antes do go-live (Fase 8).
import { useAuthStore } from '../store/auth.store';
import { useChatsStore } from '../store/chats.store';
import { useSessionStore } from '../store/session.store';
import { ChatListItem } from '../types';

const NAMES = [
  'Kauane', 'Caio Russo', 'Ana Paula amor', 'Chris', 'Ericles', 'Moh',
  'Piter Punk', 'Hora Extra - Vagas', 'Denis Gariglio', 'Albert',
  'Vanessa Rufino', 'Thiago Menezes', 'Cognição', 'Palmaldade',
];

export function isDevPreview(): boolean {
  // NUNCA ativa em build de produção — só no dev server (vite dev).
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).has('devpreview');
  } catch {
    return false;
  }
}

export function maybeSeedDevPreview(): boolean {
  if (!isDevPreview()) return false;
  const now = Date.now();
  const chats: ChatListItem[] = Array.from({ length: 14 }, (_, i) => ({
    id: 'dev' + i,
    jid: i + '@s.whatsapp.net',
    name: NAMES[i] ?? 'Contato ' + i,
    avatarUrl: null,
    kind: i % 4 === 0 ? 'group' : 'chat',
    isGroup: i % 4 === 0,
    unreadCount: i % 3 === 0 ? i + 1 : 0,
    lastMessageAt: new Date(now - i * 1800000).toISOString(),
    lastMessage: { text: 'Mensagem de exemplo número ' + (i + 1), type: 'text', fromMe: i % 2 === 0, status: 'read' },
  }));
  useChatsStore.setState({ chats, loading: false });
  useSessionStore.setState({ status: 'connected' });
  useAuthStore.setState({ user: { id: 'dev', email: 'dev@dev', displayName: 'Dev' }, bootstrapping: false });
  return true;
}
