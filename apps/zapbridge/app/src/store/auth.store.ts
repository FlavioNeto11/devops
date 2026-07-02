import { create } from 'zustand';
import { api, setToken, clearToken, errorMessage } from '../api/client';
import { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  bootstrapping: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  bootstrapping: true,
  error: null,

  // Revalida o token salvo na inicialização (Splash).
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
      await setToken(data.token);
      set({ user: data.user, loading: false });
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
      await setToken(data.token);
      set({ user: data.user, loading: false });
      return true;
    } catch (e) {
      set({ error: errorMessage(e), loading: false });
      return false;
    }
  },

  logout: async () => {
    await clearToken();
    set({ user: null });
  },
}));
