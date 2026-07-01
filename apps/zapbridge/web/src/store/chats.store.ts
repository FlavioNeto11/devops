import { create } from 'zustand';
import { api, errorMessage } from '../api/client';
import { connectSocket } from '../realtime/socket';
import { ChatListItem, Message } from '../types';

interface ChatsState {
  chats: ChatListItem[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  search: string;
  realtimeBound: boolean;
  setSearch: (s: string) => void;
  fetchChats: () => Promise<void>;
  clearChats: () => void;
  bindRealtime: () => Promise<void>;
  applyIncoming: (chatId: string, message: Message) => void;
  markChatRead: (chatId: string) => void;
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  loading: false,
  syncing: false,
  error: null,
  search: '',
  realtimeBound: false,

  setSearch: (search) => set({ search }),

  clearChats: () => set({ chats: [], loading: false, syncing: false, error: null, realtimeBound: false }),

  markChatRead: (chatId) =>
    set({ chats: get().chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)) }),

  fetchChats: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/chats', { params: { search: get().search || undefined } });
      set({ chats: data.chats, loading: false });
    } catch (e) {
      set({ error: errorMessage(e), loading: false });
    }
  },

  bindRealtime: async () => {
    if (get().realtimeBound) return;
    const socket = connectSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        get().fetchChats();
      }, 1500);
    };
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const onHistorySynced = () => {
      set({ syncing: true });
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => set({ syncing: false }), 3000);
      scheduleRefetch();
    };
    socket.on('chat.updated', scheduleRefetch);
    socket.on('chats.synced', scheduleRefetch);
    socket.on('history.synced', onHistorySynced);
    socket.on('message.received', ({ chatId, message }: { chatId: string; message: Message }) => {
      get().applyIncoming(chatId, message);
    });
    socket.on('connect', () => get().fetchChats());
    socket.on('session.connected', () => get().fetchChats());
    set({ realtimeBound: true });
  },

  applyIncoming: (chatId, message) => {
    const chats = [...get().chats];
    const idx = chats.findIndex((c) => c.id === chatId);
    if (idx >= 0) {
      const chat = { ...chats[idx] };
      chat.lastMessage = { text: message.text, type: message.type, fromMe: message.fromMe, status: message.status };
      chat.lastMessageAt = message.timestamp;
      if (!message.fromMe) chat.unreadCount += 1;
      chats.splice(idx, 1);
      chats.unshift(chat);
      set({ chats });
    } else {
      get().fetchChats();
    }
  },
}));
