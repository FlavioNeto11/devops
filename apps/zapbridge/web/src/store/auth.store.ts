import { create } from 'zustand';
import { api, setToken, clearToken, errorMessage } from '../api/client';
import { disconnectSocket } from '../realtime/socket';
import { useChatsStore } from './chats.store';
import { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  bootstrapping: boolean;
  error: string | null;
  // Marca que a sessão expirou (401 em requisição autenticada). O /login exibe
  // um aviso para o usuário distinguir "sessão caiu" de "primeira visita".
  sessionExpired: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  markSessionExpired: () => void;
  clearSessionExpired: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  bootstrapping: true,
  error: null,
  sessionExpired: false,

  // Revalida o token salvo na inicialização.
  bootstrap: async () => {
    try {
      const { data } = await api.get('/me');
      set({ user: data.user, bootstrapping: false });
    } catch {
      set({ user: null, bootstrapping: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.token);
      set({ user: data.user, loading: false, sessionExpired: false });
      return true;
    } catch (e) {
      set({ error: errorMessage(e), loading: false });
      return false;
    }
  },

  register: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/register', { email, password, displayName });
      setToken(data.token);
      set({ user: data.user, loading: false, sessionExpired: false });
      return true;
    } catch (e) {
      set({ error: errorMessage(e), loading: false });
      return false;
    }
  },

  logout: async () => {
    clearToken();
    // Derruba o socket autenticado com o token antigo e limpa os chats em memória,
    // para que um próximo login não herde o tempo real nem os dados da conta anterior.
    disconnectSocket();
    useChatsStore.getState().clearChats();
    set({ user: null });
  },

  markSessionExpired: () => set({ user: null, sessionExpired: true }),
  clearSessionExpired: () => set({ sessionExpired: false }),
}));
