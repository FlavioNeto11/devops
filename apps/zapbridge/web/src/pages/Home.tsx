import { useParams } from 'react-router-dom';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useChatsStore } from '../store/chats.store';
import { ChatListPanel } from '../components/ChatListPanel';
import { ChatPanel } from '../components/ChatPanel';
import { WhatsAppTabBar } from '../components/WhatsAppTabBar';

export function Home() {
  const { chatId } = useParams();
  const isDesktop = useIsDesktop();
  const unread = useChatsStore((s) => s.chats.filter((c) => c.unreadCount > 0).length);

  // Desktop: 2 colunas (sidebar de conversas + painel de chat), estilo WhatsApp Web.
  if (isDesktop) {
    return (
      <div className="flex-1 flex min-h-0">
        <aside className="w-[30%] min-w-[300px] max-w-[420px] border-r border-line min-h-0 flex flex-col">
          <ChatListPanel selectedChatId={chatId} />
        </aside>
        <main className="flex-1 min-h-0 flex flex-col">
          <ChatPanel chatId={chatId} />
        </main>
      </div>
    );
  }

  // Mobile: 1 coluna. Chat aberto ocupa a tela toda; senão, lista + barra de abas.
  if (chatId) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <ChatPanel chatId={chatId} />
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <ChatListPanel />
      </div>
      <WhatsAppTabBar active="chats" unread={unread} />
    </div>
  );
}
