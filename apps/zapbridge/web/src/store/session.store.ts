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
  setError: (error) => set({ error }),

  fetchStatus: async () => {
    try {
      const { data } = await api.get('/whatsapp/session/status');
      set({ status: data.status, phoneNumber: data.phoneNumber ?? null });
    } catch {
      /* silencioso */
    }
  },

  start: async () => {
    set({ error: null, qr: null, pairingCode: null, status: 'connecting' });
    try {
      await api.post('/whatsapp/session/start');
    } catch (e) {
      set({ error: errorMessage(e), status: 'disconnected' });
    }
  },

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
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  disconnect: async () => {
    try {
      await api.post('/whatsapp/session/disconnect');
      set({ status: 'disconnected', qr: null, phoneNumber: null });
      useChatsStore.getState().clearChats();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  bindRealtime: async () => {
    const socket = connectSocket();
    for (const ev of [
      'session.qr.updated',
      'session.pairing.code',
      'session.connected',
      'session.disconnected',
      'error.connection',
      'session.reconnecting',
    ]) {
      socket.off(ev);
    }
    socket.on('session.reconnecting', () =>
      set({ status: 'connecting', qr: null, pairingCode: null, error: null }),
    );
    socket.on('session.qr.updated', ({ qr }: { qr: string }) => set({ qr, status: 'qr', error: null }));
    socket.on('session.pairing.code', ({ code }: { code: string }) =>
      set({ pairingCode: code, status: 'connecting', error: null }),
    );
    socket.on('session.connected', ({ phoneNumber }: { phoneNumber: string }) =>
      set({ status: 'connected', qr: null, pairingCode: null, phoneNumber }),
    );
    socket.on('session.disconnected', ({ reason }: { reason?: string } = {}) => {
      set({
        status: reason === 'logged_out' ? 'logged_out' : 'disconnected',
        qr: null,
        pairingCode: null,
      });
      useChatsStore.getState().clearChats();
    });
    socket.on('error.connection', ({ message }: { message: string }) => set({ error: message }));

    await get().fetchStatus();
  },
}));
