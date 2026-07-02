import { create } from 'zustand';
import { api, errorMessage } from '../api/client';
import { connectSocket } from '../realtime/socket';
import { SessionStatus } from '../types';
import { useChatsStore } from './chats.store';

interface SessionState {
  status: SessionStatus;
  qr: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  error: string | null;
  setStatus: (s: SessionStatus) => void;
  setQr: (qr: string | null) => void;
  setPairingCode: (c: string | null) => void;
  setPhone: (p: string | null) => void;
  setError: (e: string | null) => void;
  fetchStatus: () => Promise<void>;
  start: () => Promise<void>;
  startPairing: (phoneNumber: string) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  bindRealtime: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'disconnected',
  qr: null,
  pairingCode: null,
  phoneNumber: null,
  error: null,

  setStatus: (status) => set({ status }),
  setQr: (qr) => set({ qr }),
  setPairingCode: (pairingCode) => set({ pairingCode }),
  setPhone: (phoneNumber) => set({ phoneNumber }),
  setError: (error) => set({ error }),

  fetchStatus: async () => {
    try {
      const { data } = await api.get('/whatsapp/session/status');
      set({ status: data.status, phoneNumber: data.phoneNumber ?? null });
    } catch {
      // silencioso
    }
  },

  start: async () => {
    set({ error: null, qr: null, pairingCode: null, status: 'connecting' });
    try {
      await api.post('/whatsapp/session/start');
    } catch (e: any) {
      set({ error: e?.message ?? 'Falha ao iniciar sessão', status: 'disconnected' });
    }
  },

  // Inicia a sessão via pairing code (alternativa ao QR).
  startPairing: async (phoneNumber: string) => {
    set({ error: null, qr: null, pairingCode: null, status: 'connecting' });
    try {
      const { data } = await api.post('/whatsapp/session/pair', { phoneNumber });
      set({ pairingCode: data.pairingCode });
    } catch (e) {
      set({ error: errorMessage(e), status: 'disconnected' });
    }
  },

  reconnect: async () => {
    try {
      set({ error: null, status: 'connecting' });
      await api.post('/whatsapp/session/reconnect');
    } catch (e: any) {
      set({ error: e?.message ?? 'Falha ao reconectar' });
    }
  },

  disconnect: async () => {
    try {
      await api.post('/whatsapp/session/disconnect');
      set({ status: 'disconnected', qr: null, phoneNumber: null });
      useChatsStore.getState().clearChats();
    } catch (e: any) {
      set({ error: e?.message ?? 'Falha ao desconectar' });
    }
  },

  // Liga os listeners de WebSocket relativos à sessão.
  bindRealtime: async () => {
    const socket = await connectSocket();
    socket.off('session.qr.updated');
    socket.off('session.pairing.code');
    socket.off('session.connected');
    socket.off('session.disconnected');
    socket.off('error.connection');

    socket.off('session.reconnecting');
    socket.on('session.reconnecting', () =>
      set({ status: 'connecting', qr: null, pairingCode: null, error: null }),
    );
    socket.on('session.qr.updated', ({ qr }: { qr: string }) =>
      set({ qr, status: 'qr', error: null }),
    );
    socket.on('session.pairing.code', ({ code }: { code: string }) =>
      set({ pairingCode: code, status: 'connecting', error: null }),
    );
    socket.on('session.connected', ({ phoneNumber }: { phoneNumber: string }) =>
      set({ status: 'connected', qr: null, pairingCode: null, phoneNumber }),
    );
    socket.on('session.disconnected', ({ reason }: { reason?: string } = {}) => {
      // logged_out (aparelho removido pelo celular) é um estado distinto de uma
      // queda transitória: persiste e mostra um aviso próprio na UI.
      set({
        status: reason === 'logged_out' ? 'logged_out' : 'disconnected',
        qr: null,
        pairingCode: null,
      });
      useChatsStore.getState().clearChats();
    });
    socket.on('error.connection', ({ message }: { message: string }) => set({ error: message }));

    // Garante estado inicial coerente.
    await get().fetchStatus();
  },
}));
