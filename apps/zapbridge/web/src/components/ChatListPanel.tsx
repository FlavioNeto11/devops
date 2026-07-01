import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useChatsStore } from '../store/chats.store';
import { useSessionStore } from '../store/session.store';
import { ChatListItemRow } from './ChatListItem';
import { Spinner } from './Spinner';
import { IconSearch, IconPlus, IconDots, IconArchive, IconChevronRight } from './icons';

type Filter = 'all' | 'unread' | 'favorites' | 'groups';

export function ChatListPanel({ selectedChatId }: { selectedChatId?: string }) {
  const nav = useNavigate();
  const { chats, loading, search, setSearch, fetchChats } = useChatsStore();
  const status = useSessionStore((s) => s.status);
  const [filter, setFilter] = useState<Filter>('all');
  const [archivedCount, setArchivedCount] = useState(0);

  const unreadChats = chats.filter((c) => c.unreadCount > 0).length;
  const groupCount = chats.filter((c) => c.kind === 'group').length;

  const visible = chats.filter((c) => {
    if (filter === 'unread') return c.unreadCount > 0;
    if (filter === 'groups') return c.kind === 'group';
    if (filter === 'favorites') return false;
    return true;
  });

  useEffect(() => {
    fetchChats();
    api
      .get('/chats', { params: { archived: true } })
      .then((r) => setArchivedCount((r.data.chats ?? []).length))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchChats(), 300);
    return () => clearTimeout(t);
  }, [search]);

  const chips: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'unread', label: 'Não lidas', count: unreadChats },
    { key: 'favorites', label: 'Favoritos' },
    { key: 'groups', label: 'Grupos', count: groupCount },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg">
      {/* Cabeçalho iOS */}
      <div className="px-4 pt-3 shrink-0" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <div className="flex items-center gap-4 h-9">
          <button onClick={() => nav('/settings')} className="text-white" title="Configurações">
            <IconDots size={20} />
          </button>
          <div className="flex-1" />
          <button onClick={() => nav('/assistant')} title="Assistente IA" className="text-xl leading-none">
            ✨
          </button>
          <button
            onClick={() => nav('/contacts')}
            className="w-[34px] h-[34px] rounded-full bg-primary text-bg grid place-items-center"
            title="Nova conversa"
          >
            <IconPlus size={22} />
          </button>
        </div>
        <h1 className="text-[30px] font-extrabold text-white mt-1">Conversas</h1>
      </div>

      {status !== 'connected' && (
        <button
          onClick={() => nav('/connect')}
          className="mx-3 mb-1 rounded-lg bg-primaryDark text-white font-semibold py-2 text-sm shrink-0"
        >
          Conectar WhatsApp →
        </button>
      )}

      {/* Busca */}
      <div className="px-3 pt-2 shrink-0">
        <div className="flex items-center gap-2 bg-surface rounded-2xl px-3 h-[38px]">
          <IconSearch size={17} className="text-muted" />
          <input
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-muted"
            placeholder="Pergunte à IA ou pesquise"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Chips */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0 no-scrollbar">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-2xl text-[13.5px] font-semibold ${
                active ? 'bg-primary/20 text-primary' : 'bg-surface text-muted'
              }`}
            >
              {c.label}
              {c.count ? ` ${c.count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {archivedCount > 0 && filter === 'all' && (
          <button
            onClick={() => nav('/soon')}
            className="w-full flex items-center gap-3 px-3 py-3 border-b border-line hover:bg-surface"
          >
            <span className="w-6 grid place-items-center text-muted">
              <IconArchive size={20} />
            </span>
            <span className="flex-1 text-left text-white">Arquivadas</span>
            <span className="text-muted text-sm">{archivedCount}</span>
            <IconChevronRight size={16} className="text-muted" />
          </button>
        )}

        {loading && chats.length === 0 ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-muted px-6 py-16">
            {filter === 'favorites' ? 'Nenhum favorito ainda' : 'Nenhuma conversa'}
          </div>
        ) : (
          visible.map((chat) => (
            <ChatListItemRow
              key={chat.id}
              chat={chat}
              active={chat.id === selectedChatId}
              onClick={() => nav('/chat/' + chat.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
