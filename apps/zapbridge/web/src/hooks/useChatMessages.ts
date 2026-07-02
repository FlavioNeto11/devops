import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { connectSocket } from '../realtime/socket';
import { Message } from '../types';
import { isDevPreview } from '../dev/devPreview';

export interface Presence {
  typing?: boolean;
  recording?: boolean;
  online?: boolean;
  lastSeen?: string | null;
}

function fakeMessages(): Message[] {
  const now = Date.now();
  const mk = (i: number, fromMe: boolean, text: string): Message => ({
    id: 'm' + i,
    chatId: 'dev',
    fromMe,
    senderJid: fromMe ? 'me' : '5511999@s.whatsapp.net',
    type: 'text',
    text,
    status: fromMe ? 'read' : 'delivered',
    timestamp: new Date(now - i * 600000).toISOString(),
    reactions: i === 2 ? [{ jid: 'x', emoji: '👍', fromMe: false }] : [],
  });
  return [
    mk(0, false, 'Perfeito, combinado então! 🙌'),
    mk(1, true, 'Fechado, te aviso quando chegar'),
    mk(2, false, 'Show, qualquer coisa me chama'),
    mk(3, true, 'Pode deixar 👍'),
    mk(4, false, 'Bom dia! Tudo certo pra hoje?'),
  ];
}

export function useChatMessages(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [presence, setPresence] = useState<Presence>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const cursorRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsert = useCallback((m: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((x) => x.id === m.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...m };
        return next;
      }
      return [m, ...prev];
    });
  }, []);

  // Carrega histórico inicial + zera não-lidas.
  useEffect(() => {
    let alive = true;
    setMessages([]);
    setLoading(true);
    setExhausted(false);
    setPresence({});
    setSuggestions([]);
    cursorRef.current = null;

    if (isDevPreview()) {
      setMessages(fakeMessages());
      setLoading(false);
      setExhausted(true);
      return;
    }

    (async () => {
      try {
        await api.get('/chats/' + chatId).catch(() => undefined);
        const { data } = await api.get('/chats/' + chatId + '/messages', { params: { limit: 30 } });
        if (!alive) return;
        setMessages(data.messages ?? []);
        cursorRef.current = data.nextCursor ?? null;
        setExhausted(!data.nextCursor);
      } catch {
        /* silencioso */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chatId]);

  // Tempo real.
  useEffect(() => {
    if (isDevPreview()) return;
    const socket = connectSocket();
    const onReceived = ({ chatId: cid, message }: { chatId: string; message: Message }) => {
      if (cid === chatId) upsert(message);
    };
    const onSent = ({ message }: { message: Message }) => upsert(message);
    const onStatus = ({ messageId, status }: { messageId: string; status: Message['status'] }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)));
    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Message['reactions'] }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    const onPresence = ({ chatId: cid, ...p }: { chatId: string } & Presence) => {
      if (cid === chatId) setPresence(p);
    };
    const onSuggest = ({ chatId: cid, suggestions: s }: { chatId: string; suggestions: string[] }) => {
      if (cid === chatId) setSuggestions(s ?? []);
    };
    socket.on('message.received', onReceived);
    socket.on('message.sent', onSent);
    socket.on('message.status.updated', onStatus);
    socket.on('message.reaction.updated', onReaction);
    socket.on('presence.updated', onPresence);
    socket.on('ai.suggestion.generated', onSuggest);
    return () => {
      socket.off('message.received', onReceived);
      socket.off('message.sent', onSent);
      socket.off('message.status.updated', onStatus);
      socket.off('message.reaction.updated', onReaction);
      socket.off('presence.updated', onPresence);
      socket.off('ai.suggestion.generated', onSuggest);
    };
  }, [chatId, upsert]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || !cursorRef.current || isDevPreview()) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/chats/' + chatId + '/messages', {
        params: { cursor: cursorRef.current, limit: 30 },
      });
      setMessages((prev) => [...prev, ...(data.messages ?? [])]);
      cursorRef.current = data.nextCursor ?? null;
      setExhausted(!data.nextCursor);
    } catch {
      /* silencioso */
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, loadingMore, exhausted]);

  const sendText = useCallback(
    async (text: string, quotedMessageId?: string) => {
      if (isDevPreview()) {
        upsert({
          id: 'local-' + Date.now(),
          chatId,
          fromMe: true,
          senderJid: 'me',
          type: 'text',
          text,
          status: 'sent',
          timestamp: new Date().toISOString(),
        } as Message);
        return;
      }
      try {
        const { data } = await api.post('/chats/' + chatId + '/messages', { text, quotedMessageId });
        if (data?.message) upsert(data.message);
      } catch {
        /* toast futuro */
      }
    },
    [chatId, upsert],
  );

  const sendMedia = useCallback(
    async (file: File | Blob, type: 'image' | 'video' | 'audio' | 'document', name: string) => {
      if (isDevPreview()) return;
      const form = new FormData();
      form.append('type', type);
      form.append('file', file, name);
      try {
        const { data } = await api.post('/chats/' + chatId + '/media', form);
        if (data?.message) upsert(data.message);
      } catch {
        /* toast futuro */
      }
    },
    [chatId, upsert],
  );

  const react = useCallback(
    async (msgId: string, emoji: string) => {
      if (isDevPreview()) return;
      await api.post(`/chats/${chatId}/messages/${msgId}/react`, { emoji }).catch(() => undefined);
    },
    [chatId],
  );

  const notifyTyping = useCallback(() => {
    if (isDevPreview()) return;
    api.post('/chats/' + chatId + '/typing', { state: 'composing' }).catch(() => undefined);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      api.post('/chats/' + chatId + '/typing', { state: 'paused' }).catch(() => undefined);
    }, 2500);
  }, [chatId]);

  return {
    messages,
    loading,
    loadingMore,
    exhausted,
    presence,
    suggestions,
    setSuggestions,
    loadMore,
    sendText,
    sendMedia,
    react,
    notifyTyping,
  };
}
