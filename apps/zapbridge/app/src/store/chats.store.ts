import { create } from 'zustand';
import { api, errorMessage } from '../api/client';
import { connectSocket } from '../realtime/socket';
import { ChatListItem, Message } from '../types';

interface ChatsState {
  chats: ChatListItem[];
  loading: boolean;
  syncing: boolean; // servidor enviando chats.synced (sync inicial)
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

  // Limpa a lista ao deslogar (antes de um novo QR scan).
  clearChats: () => set({ chats: [], loading: false, syncing: false, error: null, realtimeBound: false }),

  // Zera o contador de não lidas de um chat na lista (ao abrir).
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

  // Listeners globais que mantêm a lista de conversas atualizada.
  bindRealtime: async () => {
    if (get().realtimeBound) return;
    const socket = await connectSocket();
    // Debounce: durante o sync de histórico chegam MUITOS eventos; recarrega no
    // máximo a cada 1.5s para não travar a UI.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        get().fetchChats();
      }, 1500);
    };
    // history.synced → mostra "Sincronizando..." (apenas lotes de histórico real).
    // chats.synced → refresh silencioso (fotos, grupos, lids — sem acionar indicador).
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
    // Reconexão do Socket.IO ou do Baileys → lista pode ter gaps, recarrega.
    socket.on('connect', () => get().fetchChats());
    socket.on('session.connected', () => get().fetchChats());
    set({ realtimeBound: true });
  },

  // Atualiza prévia/ordem/não lidas ao receber mensagem nova.
  applyIncoming: (chatId, message) => {
    const chats = [...get().chats];
    const idx = chats.findIndex((c) => c.id === chatId);
    if (idx >= 0) {
      const chat = { ...chats[idx] };
      chat.lastMessage = { text: message.text, type: message.type, fromMe: message.fromMe };
      chat.lastMessageAt = message.timestamp;
      if (!message.fromMe) chat.unreadCount += 1;
      chats.splice(idx, 1);
      chats.unshift(chat);
      set({ chats });
    } else {
      // Conversa nova: recarrega do servidor.
      get().fetchChats();
    }
  },
}));
